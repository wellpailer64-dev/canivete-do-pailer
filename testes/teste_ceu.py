"""Editar › Substituição de céu do Photo Kanivete (SkySeg) — app em --agente=9333.

    py -3.13 testes/teste_ceu.py [--ia]

Fotos de teste em D:/kanivete_testes/ceu (carro.jpg: céu com nuvens e árvores; janela.jpg: céu cercado de parede).
Confere: grupo "Substituição de céu" com Iluminação + Céu; o céu velho vira o novo, o carro e a estrada ficam; a foto
sem céu achável recusa, e com a seleção do céu funciona; no PSD o céu volta objeto inteligente com máscara e a
iluminação preenchimento de cor em modo Cor. --ia também gera um céu com a IA local (~40 s). Sai com 1 se reprovar.
"""
import base64
import io
import os
import sys
import time

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "D:/kanivete_testes/ceu/"
erros = []


def conferir(ok, nome, det=""):
    print(("  ok    " if ok else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not ok:
        erros.append(nome)


def png(url):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB")).astype(float)


# céu de teste: degradê laranja → rosa (inconfundível com o azul da foto)
ceu = np.zeros((600, 1200, 3), np.uint8)
for y in range(600):
    t = y / 599
    ceu[y] = (int(250 - 30 * t), int(140 + 40 * t), int(60 + 120 * t))
Image.fromarray(ceu).save(P + "ceu_teste.jpg", quality=95)
foto = np.asarray(Image.open(P + "carro.jpg").convert("RGB")).astype(float)
H, W = foto.shape[:2]

with sync_playwright() as p:
    b = None
    for _ in range(90):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    pg.wait_for_function("window.KNV && typeof ieSubstituirCeu === 'function'", timeout=90000)
    pg.evaluate("() => { if (typeof abrirFerramenta === 'function') abrirFerramenta('editor-imagem'); }")
    time.sleep(2)
    comp = "() => { ieCompor(IE.doc, ieRDoc(IE.doc)); return IE.doc.comp.toDataURL('image/png'); }"

    # 1. carro + céu de arquivo
    t = time.time()
    r = pg.evaluate("""async ([foto, ceu]) => {
        KNV.automacao(true, {padrao: 'primario'});
        await KNV.fecharTudo(); await KNV.abrir(foto);
        await KNV.substituirCeu({ ceu: 'arquivo', caminho: ceu });
        KNV.automacao(false);
        const G = IE.doc.camadas.find(L => L.tipo === 'grupo');
        return G ? { nome: G.nome, filhos: G.filhos.map(L => [L.nome, L.tipo, L.bm, Math.round(L.op * 100), !!L.m]) } : null;
    }""", [P + "carro.jpg", P + "ceu_teste.jpg"])
    print("  ", f"{time.time() - t:.1f} s", r)
    conferir(r and r["nome"] == "Substituição de céu" and [f[0] for f in r["filhos"]] == ["Iluminação do primeiro plano", "Céu"]
             and r["filhos"][1][1] == "inteligente" and r["filhos"][1][4] and r["filhos"][0][2] == "COLOR" and r["filhos"][0][4],
             "grupo com Iluminação (Cor, máscara) e Céu (objeto inteligente, máscara)")
    a = png(pg.evaluate(comp))
    topo = a[int(H * 0.02):int(H * 0.12), int(W * 0.6):int(W * 0.95)].reshape(-1, 3).mean(0)
    conferir(topo[0] > topo[2] + 60, "o céu azul virou o céu novo (laranja)", f"RGB no alto {topo.round()} (antes {foto[int(H * 0.02):int(H * 0.12), int(W * 0.6):int(W * 0.95)].reshape(-1, 3).mean(0).round()})")
    estrada = (slice(int(H * 0.85), int(H * 0.97)), slice(int(W * 0.05), int(W * 0.5)))
    d_estrada = np.abs(a[estrada] - foto[estrada]).mean()
    conferir(d_estrada < 25, "a estrada continua (só a luz do céu, leve)", f"diferença {d_estrada:.1f}")
    carro = (slice(int(H * 0.47), int(H * 0.55)), slice(int(W * 0.25), int(W * 0.6)))
    conferir(a[carro].mean() > 120 and np.abs(a[carro] - foto[carro]).mean() < 40, "o carro continua no lugar", f"diferença {np.abs(a[carro] - foto[carro]).mean():.1f}")
    Image.fromarray(np.concatenate([foto, a], 1).astype(np.uint8)).resize((W, H // 2)).save(P + "teste_ceu.jpg")

    # 2. PSD
    psd = os.path.join(os.environ.get("TEMP", "D:/kanivete_testes/tmp"), "teste_ceu.psd").replace("\\", "/")
    ok = pg.evaluate("async (s) => { KNV.automacao(true, {padrao: 'primario'}); const ok = await ieSalvar(false, s); KNV.automacao(false); return ok; }", psd)
    from psd_tools import PSDImage
    g = [l for l in PSDImage.open(psd) if l.is_group()]
    filhos = [(l.name, l.kind, str(l.blend_mode).split(".")[-1], l.has_mask()) for l in g[0]] if g else []
    conferir(ok and g and g[0].name == "Substituição de céu" and ("Céu", "smartobject", "NORMAL", True) in filhos
             and any(f[0] == "Iluminação do primeiro plano" and f[1] == "solidcolorfill" and f[2] == "COLOR" and f[3] for f in filhos),
             "PSD: grupo com céu objeto inteligente + iluminação em Cor, com máscaras", str(filhos))

    # 3. sem céu achável e com seleção
    r = pg.evaluate("""async ([foto, ceu]) => {
        KNV.automacao(true, {padrao: 'primario'});
        await KNV.fecharTudo(); await KNV.abrir(foto);
        let sem; try { await KNV.substituirCeu({ ceu: 'arquivo', caminho: ceu }); sem = 'fez'; } catch (e) { sem = 'recusou'; }
        KNV.selecionar(250, 150, 300, 250, { elipse: true });
        let com; try { await KNV.substituirCeu({ ceu: 'arquivo', caminho: ceu }); com = 'fez'; } catch (e) { com = 'recusou: ' + e.message; }
        KNV.automacao(false);
        return { sem, com };
    }""", [P + "janela.jpg", P + "ceu_teste.jpg"])
    conferir(r["sem"] == "recusou", "foto sem céu achável recusa (pede a seleção)")
    conferir(r["com"] == "fez", "com a seleção do céu, substitui", r["com"])

    if "--ia" in sys.argv:
        r = pg.evaluate("""async (foto) => { KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); await KNV.abrir(foto);
            try { await KNV.substituirCeu({ ceu: 'por' }); return 'fez'; } catch (e) { return e.message; } finally { KNV.automacao(false); } }""", P + "carro.jpg")
        conferir(r == "fez", "céu gerado pela IA (pôr do sol)", r)
    err = pg.evaluate("() => (window._ieErros || []).length")
    conferir(not err, "sem erros de JavaScript")
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
