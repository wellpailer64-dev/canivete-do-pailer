"""Editar › Preenchimento sensível ao conteúdo do Photo Kanivete (LaMa) — app em --agente=9333.

    py -3.13 testes/teste_conteudo.py

Usa a foto e a máscara de exemplo do LaMa (D:/kanivete_testes/lama: image.jpg, mask.png, output_onnx_fp32.png; baixe
de huggingface.co/Carve/LaMa-ONNX se faltar). Seleção = a pessoa (máscara cortada em >127, o caso que sem a expansão
deixava um fantasma). Confere: camada nova com só a área preenchida e a pessoa sumida (perto da saída de referência do
LaMa), saída na própria camada + Atenuar 0% volta ao original, sem seleção recusa. Sai com 1 se reprovar.
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
P = "D:/kanivete_testes/lama/"
erros = []


def conferir(ok, nome, det=""):
    print(("  ok    " if ok else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not ok:
        erros.append(nome)


def png(url):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1]))).convert("RGB")).astype(float)


im = Image.open(P + "image.jpg").convert("RGB")
W, H = im.size
mk = np.asarray(Image.open(P + "mask.png").convert("L").resize((W, H))) > 127
ref = np.asarray(Image.open(P + "output_onnx_fp32.png").convert("RGB").resize((W, H))).astype(float)
orig = np.asarray(im).astype(float)
buf = io.BytesIO(); Image.fromarray((mk * 255).astype(np.uint8)).save(buf, "PNG")
mascara = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

with sync_playwright() as p:
    b = None
    for _ in range(90):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    pg.wait_for_function("window.KNV && typeof iePreencherConteudo === 'function'", timeout=90000)
    pg.evaluate("() => { if (typeof abrirFerramenta === 'function') abrirFerramenta('editor-imagem'); }")
    time.sleep(2)
    preparar = """async ([foto, masc]) => {
        KNV.automacao(true, {padrao: 'primario'});
        await KNV.fecharTudo(); await KNV.abrir(foto);
        const d = IE.doc, im = new Image(); im.src = masc; await im.decode();
        const c = ieCanvas(d.w, d.h), x = ieCtx(c); x.drawImage(im, 0, 0);
        const dd = x.getImageData(0, 0, d.w, d.h), q = dd.data;
        for (let i = 0; i < q.length; i += 4) { q[i + 3] = q[i]; q[i] = q[i + 1] = q[i + 2] = 255; }
        x.putImageData(dd, 0, 0);
        d.sel = { c, bbox: ieLimites(c) };
        KNV.automacao(false);
        return ieTodas(d).length;
    }"""
    comp = "() => { ieCompor(IE.doc, ieRDoc(IE.doc)); return IE.doc.comp.toDataURL('image/png'); }"

    # 1. camada nova (amostra: a camada da foto)
    n0 = pg.evaluate(preparar, [P + "image.jpg", mascara])
    t = time.time()
    r = pg.evaluate("async () => { KNV.automacao(true, {padrao: 'erro'}); await KNV.preencherConteudo({ saida: 'nova' }); KNV.automacao(false); const L = ieAtiva(IE.doc); return { n: ieTodas(IE.doc).length, nome: L.nome, x: L.x, y: L.y, w: L.c.width, h: L.c.height }; }")
    ms = time.time() - t
    a = png(pg.evaluate(comp))
    d_area = np.abs(a - ref)[mk].mean()
    d_fora = np.abs(a - orig)[~mk & (np.abs(np.arange(H)[:, None] - 0) >= 0)].mean()
    conferir(r["n"] == n0 + 1, "camada nova criada", f"{r} em {ms:.1f} s")
    conferir(d_area < 14, "a pessoa sumiu (perto da saída de referência do LaMa)", f"diferença na área {d_area:.1f}")
    longe = np.zeros_like(mk); longe[:60, :] = True
    conferir(np.abs(a - orig)[longe].mean() < 0.5, "fora da área nada muda", f"{np.abs(a - orig)[longe].mean():.2f}")
    Image.fromarray(np.concatenate([orig, a], 1).astype(np.uint8)).resize((W, H // 2)).save(P + "teste_conteudo.jpg")

    # 2. na própria camada + Atenuar 0%
    pg.evaluate(preparar, [P + "image.jpg", mascara])
    pg.evaluate("async () => { KNV.automacao(true, {padrao: 'erro'}); await KNV.preencherConteudo({ saida: 'atual', amostra: 'atual' }); KNV.automacao(false); }")
    a2 = png(pg.evaluate(comp))
    conferir(np.abs(a2 - ref)[mk].mean() < 14, "na própria camada: a pessoa sumiu", f"{np.abs(a2 - ref)[mk].mean():.1f}")
    pg.evaluate("async () => { await KNV.atenuar(0); }")
    a3 = png(pg.evaluate(comp))
    conferir(np.abs(a3 - orig).mean() < 0.6, "Atenuar 0% depois do preenchimento volta ao original", f"{np.abs(a3 - orig).mean():.2f}")

    # 3. sem seleção
    r = pg.evaluate("async () => { ieSelNada(); try { await KNV.preencherConteudo(); return 'fez'; } catch (e) { return 'recusou'; } }")
    conferir(r == "recusou", "sem seleção recusa")
    err = pg.evaluate("() => (window._ieErros || []).length")
    conferir(not err, "sem erros de JavaScript")
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
