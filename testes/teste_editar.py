"""Editar › Atenuar, Colar especial (dentro/fora) e Localizar e substituir texto do Photo Kanivete (app em --agente=9333).

    py -3.13 testes/teste_editar.py

Atenuar: Inverter + 50% = tom do meio; filtro + 0% = original; pincelada na máscara e borracha a 50%; Multiplicação;
deixa de valer depois de outra ação/desfazer; pela janela (KNV.cmd). Colar dentro/fora: camada centrada na seleção,
máscara da seleção (ou invertida), corrente solta, seleção desfeita; sem seleção recusa. Localizar e substituir:
maiúsculas, palavra inteira, trechos de estilo acompanham, e num PSD o texto trocado volta como camada de texto.
Sai com 1 se reprovar.
"""
import json
import os
import shutil
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
erros = []
PASTA = os.path.join(os.environ.get("TEMP") or tempfile.gettempdir(), "canivete_teste_editar")
os.makedirs(PASTA, exist_ok=True)


def conferir(ok, nome, det=""):
    print(("  ok    " if ok else "  FALHOU ") + nome + (f" ({det})" if det else ""))
    if not ok:
        erros.append(nome)


with sync_playwright() as p:
    b = None
    for _ in range(90):
        try:
            b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
            break
        except Exception:
            time.sleep(1)
    pg = b.contexts[0].pages[0]
    pg.wait_for_function("window.KNV && typeof ieAtenuar === 'function'", timeout=90000)
    pg.evaluate("() => { if (typeof abrirFerramenta === 'function') abrirFerramenta('editor-imagem'); }")
    time.sleep(2)
    J = lambda code, *a: pg.evaluate(code, *a)

    # ── Atenuar ──
    r = J("""async () => {
        KNV.automacao(true, {padrao: 'erro'});
        const px = (L, x, y) => Array.from(ieCtx(L.c).getImageData(x - L.x, y - L.y, 1, 1).data);
        const pxm = (L, x, y) => ieCtx(L.m.c).getImageData(x - L.m.x, y - L.m.y, 1, 1).data[3];
        const r = {};
        const camada = (cor) => { const d = IE.doc; const c = ieCanvas(200, 200), x = ieCtx(c); x.fillStyle = cor; x.fillRect(0, 0, 200, 200);
            const L = ieNovaCamada(d, { nome: 'teste', c, x: 50, y: 50, sujoPx: true }); ieInserirAcima(d, L, ieAtiva(d)); ieAtivar(L.id, d); ieTudo(d); ieHist('nova'); return L; };
        KNV.novo('atenuar', 400, 400, 'branco');
        let L = camada('#c86432');                          // (200, 100, 50)
        await ieCmd('aj:inverter');                          // (55, 155, 205)
        await KNV.atenuar(50);
        r.meio = px(L, 150, 150);
        await KNV.cmd('f:gaussiano', { raio: 20 });
        r.borrado = px(L, 52, 52);
        await KNV.atenuar(0);
        r.volta = px(L, 52, 52);
        L = camada('#c86432'); await ieCmd('aj:inverter'); await KNV.atenuar(100, 'multiply');
        r.mult = px(L, 150, 150);                            // antes × depois / 255
        L = camada('#c86432'); await ieCmd('aj:inverter'); KNV.modo('SCREEN');
        try { await KNV.atenuar(50); r.depoisDeOutra = 'atenuou'; } catch (e) { r.depoisDeOutra = 'recusou'; }
        L = camada('#c86432'); await ieCmd('aj:inverter'); ieDesfazer();
        try { await KNV.atenuar(50); r.depoisDeDesfazer = 'atenuou'; } catch (e) { r.depoisDeDesfazer = 'recusou'; }
        // pela janela, como o menu (valores da automação)
        L = camada('#c86432'); await ieCmd('aj:inverter');
        await KNV.cmd('atenuar', { op: 25, modo: 'source-over' });
        r.janela = px(L, 150, 150);
        // borracha a 50%
        L = camada('#c86432');
        Object.assign(IE.op.borracha, { tam: 60, dureza: 100, opac: 100, fluxo: 100, espaco: 10 });
        ieTracoIniciar({ x: 100, y: 150 }, {}, IE.doc, 'borracha'); for (let i = 1; i <= 10; i++) ieTracoPara({ x: 100 + i * 10, y: 150 }); ieTracoFim();
        r.apagado = px(L, 150, 150)[3];
        await KNV.atenuar(50);
        r.borracha = px(L, 150, 150)[3];
        // pincelada na máscara (máscara preta, pinta branco) a 50%
        L = camada('#c86432'); await ieCmd('mascaraOcultar'); IE.doc.mascaraAlvo = true; IE.cor = ['#ffffff', '#000000'];
        Object.assign(IE.op.pincel, { tam: 60, dureza: 100, opac: 100, fluxo: 100, espaco: 10, varTam: 0 });
        ieTracoIniciar({ x: 100, y: 150 }, {}, IE.doc, 'pincel'); for (let i = 1; i <= 10; i++) ieTracoPara({ x: 100 + i * 10, y: 150 }); ieTracoFim();
        r.mascaraPintada = pxm(L, 150, 150);
        await KNV.atenuar(50);
        r.mascara = pxm(L, 150, 150);
        IE.doc.mascaraAlvo = false;
        KNV.automacao(false);
        return r;
    }""")
    m = r["meio"]
    conferir(all(abs(v - 127.5) <= 1.5 for v in m[:3]), "Atenuar 50% depois de Inverter = tom do meio", str(m))
    # antes do desfoque a camada era o cinza do passo anterior: 0% devolve exatamente ela (o desfoque tinha mudado a borda)
    conferir(r["borrado"] != [128, 128, 128, 255] and r["volta"] == [128, 128, 128, 255], "Atenuar 0% depois do desfoque = como estava antes", f"{r['borrado']} → {r['volta']}")
    esp = [round(200 * 55 / 255), round(100 * 155 / 255), round(50 * 205 / 255)]
    conferir(all(abs(a - b) <= 2 for a, b in zip(r["mult"][:3], esp)), "Atenuar em Multiplicação", f"{r['mult'][:3]} × esperado {esp}")
    conferir(r["depoisDeOutra"] == "recusou", "não atenua depois de outra ação")
    conferir(r["depoisDeDesfazer"] == "recusou", "não atenua depois de desfazer")
    j = r["janela"]
    conferir(all(abs(a - b) <= 2 for a, b in zip(j[:3], [round(200 + (55 - 200) * .25), round(100 + (155 - 100) * .25), round(50 + (205 - 50) * .25)])), "Atenuar pela janela (25%)", str(j))
    conferir(r["apagado"] == 0 and abs(r["borracha"] - 128) <= 3, "borracha atenuada a 50% (alfa)", f"{r['apagado']} → {r['borracha']}")
    conferir(r["mascaraPintada"] == 255 and abs(r["mascara"] - 128) <= 3, "pincelada na máscara atenuada a 50%", f"{r['mascaraPintada']} → {r['mascara']}")

    # ── Colar dentro / fora ──
    r = J("""async () => {
        KNV.automacao(true, {padrao: 'erro'});
        const r = {};
        const azul = ieCanvas(200, 200), x = ieCtx(azul); x.fillStyle = '#0044cc'; x.fillRect(0, 0, 200, 200);
        IE.area = { c: azul, x: 0, y: 0 };
        try { IE.areaSeq = (await window.pywebview.api.ve_area_seq())?.seq; } catch (e) { IE.areaSeq = null; }
        KNV.novo('colar', 800, 600, 'branco');
        try { await KNV.colarDentro(); r.semSel = 'colou'; } catch (e) { r.semSel = 'recusou'; }
        KNV.selecionar(300, 200, 120, 80);
        await KNV.colarDentro();
        let L = ieAtiva(IE.doc);
        ieCompor(IE.doc, ieRDoc(IE.doc));
        const cp = (X, Y) => Array.from(ieCtx(IE.doc.comp).getImageData(X, Y, 1, 1).data).slice(0, 3);
        r.dentro = { centro: [L.x + L.c.width / 2, L.y + L.c.height / 2], mascara: !!L.m, solta: !!(L.m && L.m.solta), sel: !!IE.doc.sel,
            noMeio: cp(360, 240), fora: cp(290, 240), longe: cp(100, 100) };
        KNV.novo('colar2', 800, 600, 'branco');
        KNV.selecionar(300, 200, 120, 80);
        await KNV.colarDentro({ fora: true });
        L = ieAtiva(IE.doc);
        ieCompor(IE.doc, ieRDoc(IE.doc));
        r.fora = { noMeio: cp(360, 240), borda: cp(290, 240) };
        KNV.automacao(false);
        return r;
    }""")
    d = r["dentro"]
    conferir(r["semSel"] == "recusou", "Colar dentro sem seleção recusa")
    conferir(d["centro"] == [360, 240] and d["mascara"] and d["solta"] and not d["sel"], "Colar dentro: centrada na seleção, máscara, corrente solta, seleção desfeita", json.dumps(d))
    conferir(d["noMeio"] == [0, 68, 204] and d["fora"] == [255, 255, 255] and d["longe"] == [255, 255, 255], "Colar dentro: só aparece dentro da seleção")
    conferir(r["fora"]["noMeio"] == [255, 255, 255] and r["fora"]["borda"] == [0, 68, 204], "Colar fora: aparece só fora da seleção", json.dumps(r["fora"]))

    # ── Localizar e substituir texto ──
    r = J("""async () => {
        KNV.automacao(true, {padrao: 'erro'});
        KNV.novo('texto', 800, 400, 'branco');
        await KNV.texto('Preço R$ 99 - preço especial', { x: 20, y: 20, tam: 30, cor: '#000000', nome: 'A' });
        await KNV.texto('Promoção do Preço', { x: 20, y: 120, tam: 30, cor: '#000000', nome: 'B' });
        await KNV.texto('Prefeitura', { x: 20, y: 220, tam: 30, cor: '#000000', nome: 'C' });
        const s = n => ieTodas(IE.doc).find(L => L.nome === n).txt.s;
        const r = {};
        r.palavra = await KNV.substituirTexto('Pre', 'X', { palavra: true });
        r.maiusc = await KNV.substituirTexto('preço', 'valor', { maiusc: true });
        r.aposMaiusc = s('A');
        r.todos = await KNV.substituirTexto('PREÇO', 'valor');
        r.final = [s('A'), s('B'), s('C')];
        // trechos: "Ana Lima" com "Lima" em vermelho; trocar "Ana" por "Mariana" mantém o vermelho em "Lima"
        await KNV.texto('Ana Lima', { x: 20, y: 300, tam: 30, cor: '#000000', nome: 'D' });
        const D = ieAtiva(IE.doc); ieTxTrechoAplicar(D.txt, 4, 8, { cor: '#ff0000' });
        await KNV.substituirTexto('Ana', 'Mariana', { todas: false });
        r.trecho = { s: D.txt.s, trechos: D.txt.trechos };
        KNV.automacao(false);
        return r;
    }""")
    conferir(r["palavra"]["trocas"] == 0, "palavra inteira: 'Pre' não pega 'Preço'/'Prefeitura'", json.dumps(r["palavra"]))
    conferir(r["maiusc"]["trocas"] == 1 and r["aposMaiusc"] == "Preço R$ 99 - valor especial", "diferenciar maiúsculas", r["aposMaiusc"])
    conferir(r["todos"]["trocas"] == 2 and r["final"] == ["valor R$ 99 - valor especial", "Promoção do valor", "Prefeitura"], "todas as camadas, sem diferenciar maiúsculas", json.dumps(r["final"], ensure_ascii=False))
    t = r["trecho"]
    conferir(t["s"] == "Mariana Lima" and t["trechos"] and t["trechos"][0]["a"] == 8 and t["trechos"][0]["b"] == 12, "trecho de estilo acompanha a troca", json.dumps(t))

    # PSD: texto do Photoshop trocado continua camada de texto
    from psd_tools import PSDImage
    from PIL import Image
    origem = os.path.join(PASTA, "texto_ps.psd")
    psd = PSDImage.new("RGB", (600, 300), color=(255, 255, 255))
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from Functions import editor_imagem as ei
    ob = ei._nova_pixel(psd, Image.new("RGBA", (300, 60), (0, 0, 0, 255)), "Promo", 40, 60)
    ei._texto_novo(ob, {"s": "Oferta de Julho", "m": [1, 0, 0, 1, 40, 110], "ps": "ArialMT", "tam": 40, "cor": "#000000"})
    psd.save(origem)
    salvo = os.path.join(PASTA, "texto_ps_trocado.psd")
    r = J("""async ([o, s]) => {
        KNV.automacao(true, {padrao: 'primario'});
        await KNV.fecharTudo(); await KNV.abrir(o);
        const r = await KNV.substituirTexto('Julho', 'Agosto');
        const ok = await ieSalvar(false, s);
        KNV.automacao(false);
        return { r, ok };
    }""", [origem.replace("\\", "/"), salvo.replace("\\", "/")])
    lido = {l.name: l for l in PSDImage.open(salvo)}.get("Promo")
    conferir(r["r"]["trocas"] == 1 and lido is not None and lido.kind == "type" and "Oferta de Agosto" in str(lido.text),
             "PSD: texto trocado continua camada de texto", f"{r} → {lido.kind if lido else None} {str(lido.text) if lido else ''}")
    erros_js = J("() => (window._ieErros || []).map(e => String(e).slice(0, 120))")
    conferir(not erros_js, "sem erros de JavaScript", str(erros_js[:3]))
print("RESULTADO:", "REPROVADO" if erros else "PASSOU")
sys.exit(1 if erros else 0)
