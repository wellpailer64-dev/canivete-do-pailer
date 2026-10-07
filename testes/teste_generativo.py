"""Preenchimento generativo e Expansão generativa do Photo Kanivete (FLUX.2 klein local) — app em --agente=9333.

    py -3.13 testes/teste_generativo.py

Foto: D:/kanivete_testes/ceu/carro.jpg. Cada geração ~40 s (placa de 8 GB). Confere: expansão para story 9:16 (tela
cresce, camada "Expansão generativa", área nova preenchida com conteúdo, miolo original igual); preenchimento com
texto numa elipse do céu (muda só dentro); "Gerar outra" e voltar à variação 1; sem texto = LaMa; sem seleção recusa.
Sai com 1 se reprovar.
"""
import base64
import io
import sys
import time

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
FOTO = "D:/kanivete_testes/ceu/carro.jpg"
SAIDA = "D:/kanivete_testes/generativo/"
erros = []


def conferir(ok, nome, det=""):
    print(("  ok    " if ok else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not ok:
        erros.append(nome)


def png(url):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGBA")).astype(float)


orig = np.asarray(Image.open(FOTO).convert("RGB")).astype(float)
H0, W0 = orig.shape[:2]
with sync_playwright() as p:
    b = None
    for _ in range(90):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    pg.set_default_timeout(600000)
    pg.wait_for_function("window.KNV && typeof ieExpansaoGenerativa === 'function'", timeout=90000)
    pg.evaluate("() => { if (typeof abrirFerramenta === 'function') abrirFerramenta('editor-imagem'); }")
    time.sleep(2)
    comp = "() => { ieCompor(IE.doc, ieRDoc(IE.doc)); return IE.doc.comp.toDataURL('image/png'); }"
    abrir = "async (f) => { KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); await KNV.abrir(f); KNV.automacao(false); }"

    # 1. expansão para story
    pg.evaluate(abrir, FOTO)
    t = time.time()
    r = pg.evaluate("async () => { await KNV.expansaoGenerativa({ formato: 'story' }); const L = ieAtiva(IE.doc); return { w: IE.doc.w, h: IE.doc.h, nome: L.nome, gen: !!L.generativo }; }")
    print(f"   expansão: {time.time() - t:.0f} s", r)
    esperadoH = round(W0 / (9 / 16))
    conferir(r["w"] == W0 and r["h"] == esperadoH and r["gen"] and r["nome"].startswith("Expansão generativa"), "expansão: tela story e camada generativa", str(r))
    a = png(pg.evaluate(comp))
    oy = round((esperadoH - H0) / 2)   # igual ao app (Math.round)
    topo, base = a[: max(1, oy - 30), :, :], a[oy + H0 + 30:, :, :]
    conferir(topo[..., 3].min() == 255 and base[..., 3].min() == 255, "expansão: área nova toda preenchida (sem transparência)")
    # desvio ao longo de cada linha: faixa lisa (a IA copiando a cor de fundo da referência) dá ~0
    lt, lb = topo[..., :3].std(axis=1).mean(), base[..., :3].std(axis=1).mean()
    conferir(lt > 6 and lb > 6, "expansão: área nova com conteúdo (não faixa lisa)", f"desvio por linha topo {lt:.1f}, base {lb:.1f}")
    miolo = a[oy + 60:oy + H0 - 60, 60:W0 - 60, :3]
    d = np.abs(miolo - orig[60:H0 - 60, 60:W0 - 60]).mean()
    conferir(d < 1.0, "expansão: a foto original continua igual no miolo", f"diferença {d:.2f}")
    Image.fromarray(a[..., :3].astype(np.uint8)).resize((W0 // 3, esperadoH // 3)).save(SAIDA + "teste_expansao.jpg")

    # 2. preenchimento com texto numa elipse do céu
    pg.evaluate(abrir, FOTO)
    KNVsel = f"() => KNV.selecionar({int(W0 * 0.55)}, {int(H0 * 0.08)}, {int(W0 * 0.3)}, {int(H0 * 0.18)}, {{ elipse: true }})"
    pg.evaluate(KNVsel)
    t = time.time()
    r = pg.evaluate("async () => { await KNV.preenchimentoGenerativo('a red hot air balloon'); const L = ieAtiva(IE.doc); return { nome: L.nome, n: L.generativo.variacoes.length }; }")
    print(f"   preenchimento: {time.time() - t:.0f} s", r)
    a = png(pg.evaluate(comp))[..., :3]
    x0, y0, w, h = int(W0 * 0.55), int(H0 * 0.08), int(W0 * 0.3), int(H0 * 0.18)
    dentro = a[y0 + h // 4:y0 + 3 * h // 4, x0 + w // 4:x0 + 3 * w // 4]
    od = orig[y0 + h // 4:y0 + 3 * h // 4, x0 + w // 4:x0 + 3 * w // 4]
    conferir(np.abs(dentro - od).mean() > 20, "preenchimento: mudou dentro da seleção", f"{np.abs(dentro - od).mean():.0f}")
    fora = (slice(int(H0 * 0.6), H0), slice(0, W0))
    conferir(np.abs(a[fora] - orig[fora]).mean() < 0.5, "preenchimento: fora da seleção nada muda", f"{np.abs(a[fora] - orig[fora]).mean():.2f}")
    Image.fromarray(a.astype(np.uint8)).resize((W0 // 3, H0 // 3)).save(SAIDA + "teste_balao.jpg")

    # 3. variações
    t = time.time()
    r = pg.evaluate("async () => { await KNV.variacaoGenerativa(); const L = ieAtiva(IE.doc), G = L.generativo; const c2 = G.variacoes[1].c === L.c; ieGenVariacao(IE.doc, L, 0); return { n: G.variacoes.length, atual: G.atual, c2, volta: L.c === G.variacoes[0].c }; }")
    print(f"   outra variação: {time.time() - t:.0f} s", r)
    conferir(r["n"] == 2 and r["c2"] and r["atual"] == 0 and r["volta"], "Gerar outra e voltar à variação 1", str(r))

    # 4. sem texto (LaMa) e sem seleção
    pg.evaluate(abrir, FOTO)
    pg.evaluate(KNVsel)
    r = pg.evaluate("async () => { await KNV.preenchimentoGenerativo(''); return ieAtiva(IE.doc).nome; }")
    conferir(r.startswith("Preenchimento de conteúdo"), "sem texto: tira pelo conteúdo (LaMa)", r)
    r = pg.evaluate("async () => { ieSelNada(); try { await KNV.preenchimentoGenerativo('x'); return 'fez'; } catch (e) { return 'recusou'; } }")
    conferir(r == "recusou", "sem seleção recusa")
    err = pg.evaluate("() => (window._ieErros || []).length")
    conferir(not err, "sem erros de JavaScript")
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
