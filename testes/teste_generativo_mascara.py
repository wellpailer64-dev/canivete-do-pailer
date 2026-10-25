"""Regressão da máscara generativa no app 9333; provedor sintético, sem carregar IA."""
import json
from playwright.sync_api import sync_playwright

ENSAIO = r"""async () => {
    const api = ieApi(), originais = [api.ie_gerar, ieGeradorPronto, ieCanvasDeArquivo];
    let rodada = 0;
    const resultados = [];
    const exigir = (ok, nome) => { if (!ok) throw new Error(nome); };
    try {
        ieGeradorPronto = async () => true;
        api.ie_gerar = async () => ({success: true, path: 'sintetico', semente: ++rodada});
        ieCanvasDeArquivo = async () => {
            const c = ieCanvas(160, 120), x = ieCtx(c);
            for (let y = 0; y < 120; y += 4) for (let z = 0; z < 160; z += 4) {
                x.fillStyle = `rgb(${(z * 3 + rodada * 29) % 256},${(y * 5) % 256},180)`;
                x.fillRect(z, y, 4, 4);
            }
            return c;
        };
        const compor = d => { ieCompor(d, ieRDoc(d)); return ieCtx(d.comp).getImageData(0, 0, d.w, d.h).data.slice(); };
        for (const tipo of ['retangulo', 'elipse', 'vazado', 'suave', 'deslocado', 'borda']) {
            KNV.novo('Teste máscara ' + tipo, tipo === 'deslocado' ? 480 : 160, tipo === 'deslocado' ? 360 : 120, 'branco');
            const d = IE.doc, a = ieCanvas(d.w, d.h), ax = ieCtx(a);
            ax.fillStyle = '#fff';
            if (tipo === 'elipse') { ax.beginPath(); ax.ellipse(80, 60, 32, 24, 0, 0, Math.PI * 2); ax.fill(); }
            else if (tipo === 'borda') ax.fillRect(0, 0, 60, 45);
            else if (tipo === 'deslocado') ax.fillRect(330, 230, 60, 40);
            else ax.fillRect(40, 30, 80, 60);
            if (tipo === 'vazado') ax.clearRect(65, 48, 30, 24);
            if (tipo === 'suave') { ax.clearRect(0, 0, 160, 120); const g = ax.createRadialGradient(80, 60, 8, 80, 60, 32); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); ax.fillStyle = g; ax.fillRect(48, 28, 64, 64); }
            ieSelDefinir(d, a);
            ieHist('Seleção de teste');
            const mascara = ieCtx(a).getImageData(0, 0, d.w, d.h).data.slice(), antes = compor(d);
            const conferir = nome => {
                const L = ieAtiva(d), tela = ieCanvas(d.w, d.h);
                ieCtx(tela).drawImage(L.c, L.x, L.y);
                const alfa = ieCtx(tela).getImageData(0, 0, d.w, d.h).data, depois = compor(d);
                let vazou = 0, mudou = 0, preenchidos = 0;
                for (let i = 0; i < mascara.length; i += 4) {
                    if (!mascara[i + 3]) {
                        if (alfa[i + 3]) vazou++;
                        for (let k = 0; k < 4; k++) if (antes[i + k] !== depois[i + k]) mudou++;
                    } else if (alfa[i + 3]) preenchidos++;
                    exigir(alfa[i + 3] <= mascara[i + 3], nome + ': alfa ultrapassou seleção');
                }
                exigir(!vazou && !mudou && preenchidos > 0, nome + ': fora alterado ou geração vazia: ' + JSON.stringify({vazou, mudou, preenchidos}));
                exigir(ieCtx(a).getImageData(0, 0, d.w, d.h).data.every((v, i) => v === mascara[i]), nome + ': seleção alterada');
                resultados.push({nome, vazou, mudou, preenchidos});
                return Array.from(depois);
            };
            await KNV.preenchimentoGenerativo('teste');
            if (tipo === 'deslocado') exigir(ieAtiva(d).generativo.R.x > 0 && ieAtiva(d).generativo.R.y > 0, 'recorte de contexto sem deslocamento');
            conferir(tipo + ': preenchimento');
            await KNV.variacaoGenerativa();
            const segunda = conferir(tipo + ': outra variação');
            ieGenVariacao(d, ieAtiva(d), 0);
            conferir(tipo + ': voltar à primeira');
            ieDesfazer();
            exigir(ieAtiva(d).generativo.atual === 1, 'desfazer variação');
            ieRefazer();
            exigir(ieAtiva(d).generativo.atual === 0, 'refazer variação');
            conferir(tipo + ': refazer');
            const primeira = compor(d);
            exigir(segunda.some((v, i) => v !== primeira[i]), 'variações idênticas');
        }
        const d = IE.doc;
        await KNV.expansaoGenerativa({formato: 'margem', margem: 20});
        const L = ieAtiva(d), G = L.generativo;
        exigir(G.alfa && d.w === 224 && d.h === 168, 'expansão: dimensões ou alfa');
        const dados = ieCtx(L.c).getImageData(0, 0, d.w, d.h).data;
        exigir(dados[3] === 255 && dados[((d.h - 1) * d.w + d.w - 1) * 4 + 3] === 255, 'expansão: cantos transparentes');
        exigir(dados[(84 * d.w + 112) * 4 + 3] === 0, 'expansão: miolo coberto');
        resultados.push({nome: 'expansão: costura e cantos preservados'});
        const n = G.variacoes.length, tela = L.c, historico = d.hist.i;
        api.ie_gerar = async () => ({success: false, error: 'falha sintética do gerador'});
        let erro = '';
        try { await KNV.variacaoGenerativa(); } catch (e) { erro = e.message; }
        exigir(erro === 'o gerador não conseguiu criar outra variação', 'falha do gerador confundida com camada inválida');
        exigir(G.variacoes.length === n && L.c === tela && d.hist.i === historico, 'falha alterou a camada ou o histórico');
        KNV.novo('Teste camada sem geração', 32, 32, 'branco');
        erro = '';
        try { await KNV.variacaoGenerativa(); } catch (e) { erro = e.message; }
        exigir(erro === 'a camada ativa não é generativa', 'camada comum aceita variação');
        resultados.push({nome: 'falha do gerador preserva camada e histórico; mensagens distintas'});
        return resultados;
    } finally { [api.ie_gerar, ieGeradorPronto, ieCanvasDeArquivo] = originais; }
}"""

with sync_playwright() as p:
    navegador = p.chromium.connect_over_cdp('http://127.0.0.1:9333')
    pagina = next(pg for c in navegador.contexts for pg in c.pages if 'index.html' in pg.url)
    pagina.set_default_timeout(90000)
    resultado = pagina.evaluate(ENSAIO)
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
    print('PASSOU: máscaras, variações, histórico e expansão (provedor sintético).')
