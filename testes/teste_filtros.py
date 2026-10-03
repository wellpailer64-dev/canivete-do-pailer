"""Aplica cada filtro do menu Filtro (valores padrão) numa foto e mede; confere que mudou a imagem e não deu erro."""
import sys, time, json
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.connect_over_cdp("http://127.0.0.1:9333")
    pg = next(x for c in b.contexts for x in c.pages if "index.html" in x.url)
    erros = []; pg.on("pageerror", lambda e: erros.append(str(e)))
    pg.wait_for_function("typeof ieFKuwahara === 'function'", timeout=60000)
    r = pg.evaluate("""async () => {
        KNV.automacao(true, {padrao: 'primario'}); await KNV.fecharTudo(); KNV.novo('filtros', 900, 1200);
        await KNV.colocar('D:/kanivete_testes/cena/foto.jpg', {nome: 'Foto', x: 0, y: 0, largura: 900});
        const cmds = []; const andar = l => l.forEach(it => { if (Array.isArray(it) && Array.isArray(it[1])) andar(it[1]); else if (Array.isArray(it) && String(it[1]).startsWith('f:') && it[1] !== 'f:cameraRaw' && it[1] !== 'f:dissolver') cmds.push(it[1]); });
        andar(IE_MENUS.find(m => m[0] === 'Filtro')[1]);
        const L = ieAtiva(IE.doc), base = L.c, bx = L.x, by = L.y, out = [];
        const assin = c => { const d = ieCtx(c).getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 997) s = (s * 31 + d[i]) >>> 0; return s; };
        const s0 = assin(base);
        for (const c of cmds) {
            L.c = base; L.x = bx; L.y = by; ieInvalidar(L);
            const t = performance.now(); let erro = null;
            try { await KNV.cmd(c, {}); } catch (e) { erro = String(e).slice(0, 120); }
            out.push([c, Math.round(performance.now() - t), erro, ieAtiva(IE.doc).c && assin(ieAtiva(IE.doc).c) !== s0]);
        }
        KNV.automacao(false); return out; }""")
    lentos = [x for x in r if x[1] > 4000]
    for c, ms, erro, mudou in r:
        if erro or not mudou: print(f"  FALHOU {c}: {erro or 'não mudou a imagem'} ({ms} ms)")
    print(f"{len(r)} filtros; {sum(1 for x in r if not x[2] and x[3])} ok; mais lentos: {sorted(r, key=lambda x: -x[1])[:5]}")
    print("erros JS:", erros[:3] or "nenhum")
