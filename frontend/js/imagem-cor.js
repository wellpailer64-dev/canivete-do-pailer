// =========================================================
// Editor de Imagem — cor para gráfica (CMYK) e o botão Início (casinha), como no Photoshop.
// O app trabalha em sRGB; o CMYK entra pelo perfil ICC (Functions/cor_icc.py, os mesmos perfis do Vetor):
//   Exibir > Prova de cores (Ctrl+Y): a vista mostra como a peça sai impressa no perfil (tabela 64³ sRGB → CMYK → sRGB
//   calculada uma vez no Python e aplicada só na tela — os pixels do documento não mudam);
//   Exibir > Alerta de gama (Shift+Ctrl+Y): o que a impressão não alcança (ΔE > 6) fica cinza;
//   Exibir > Configurar prova...: FOGRA39 (padrão), FOGRA29, GRACoL, SWOP;
//   Exportar como: Cor = CMYK (JPG/TIFF/PDF/PSD com o perfil embutido); seletor de cores com C/M/Y/K e aviso de gama.
// Casinha (canto esquerdo, abaixo da marca): mostra a tela inicial com os Recentes SEM fechar nada; clicar num documento
// aberto (ou na aba, ou Esc) volta para a edição.
// =========================================================

IE.prova = { on: false, gama: false, perfil: iePref('provaPerfil', 'FOGRA39') || 'FOGRA39', lut: null, gamaArr: null, carregado: null };
const IE_PERFIS_PROVA = [['FOGRA39', 'Coated FOGRA39 (couché, padrão)'], ['FOGRA29', 'Uncoated FOGRA29 (offset/sulfite)'], ['GRACOL', 'Coated GRACoL 2006'], ['SWOP', 'U.S. Web Coated (SWOP) v2']];

const ieB64Bytes = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

async function ieProvaCarregar(perfil = IE.prova.perfil) {
    const P = IE.prova;
    if (P.carregado === perfil && P.lut) return true;
    const r = await ieApi()?.ie_cor_lut(perfil);
    if (!r || !r.success) { ieToast(ieT('Não deu para carregar o perfil de prova')); return false; }
    P.lut = ieB64Bytes(r.lut); P.gamaArr = ieB64Bytes(r.gama); P.carregado = perfil;
    if (r.simples) ieToast(ieT('Perfil CMYK não encontrado nesta máquina: prova aproximada'));
    return true;
}

// índice na tabela 64³ (6 bits por canal)
const ieProvaIdx = (r, g, b) => ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
function ieGamaFora(rgb) { const P = IE.prova; return !!(P.gamaArr && P.gamaArr[ieProvaIdx(rgb[0], rgb[1], rgb[2])]); }

// aplica a prova num retângulo da tela (px do canvas)
function ieProvaAplicar(x0, y0, w, h) {
    const P = IE.prova;
    if (!(P.on || P.gama) || !P.lut) return;
    const c = ieEl('ie-canvas');
    if (!c) return;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    w = Math.min(c.width - x0, Math.ceil(w)); h = Math.min(c.height - y0, Math.ceil(h));
    if (w <= 0 || h <= 0) return;
    const k = ieCtx(c), im = k.getImageData(x0, y0, w, h), d = im.data, L = P.lut, G = P.gama ? P.gamaArr : null, cor = P.on;
    for (let i = 0; i < d.length; i += 4) {
        const j = ((d[i] >> 2) << 12) | ((d[i + 1] >> 2) << 6) | (d[i + 2] >> 2);
        if (G && G[j]) { d[i] = d[i + 1] = d[i + 2] = 128; continue; }   // fora da gama: cinza, como no Photoshop
        if (cor) { const q = j * 3; d[i] = L[q]; d[i + 1] = L[q + 1]; d[i + 2] = L[q + 2]; }
    }
    k.putImageData(im, x0, y0);
}

(function () {
    const vista = ieDesenharVista;
    ieDesenharVista = function () {
        vista.apply(this, arguments);
        const doc = IE.doc, P = IE.prova;
        if (!doc || !(P.on || P.gama) || !P.lut) return;
        const dpr = window.devicePixelRatio || 1;
        ieProvaAplicar(doc.px * dpr, doc.py * dpr, doc.w * doc.zoom * dpr, doc.h * doc.zoom * dpr);
    };
    const parcial = ieDesenharVistaParcial;
    ieDesenharVistaParcial = function (doc, R) {
        parcial.apply(this, arguments);
        const P = IE.prova;
        if (!doc || !(P.on || P.gama) || !P.lut) return;
        const dpr = window.devicePixelRatio || 1, s = doc.zoom * dpr, dx = Math.round(doc.px * dpr), dy = Math.round(doc.py * dpr);
        ieProvaAplicar(dx + (R.x - 2) * s, dy + (R.y - 2) * s, (R.w + 4) * s, (R.h + 4) * s);
    };
    // barra de status: qual prova está ligada
    const st = ieStatusRender;
    ieStatusRender = function () {
        st.apply(this, arguments);
        const box = ieEl('ie-status');
        if (!box) return;
        let b = box.querySelector('#ie-st-prova');
        if (!b) { b = document.createElement('span'); b.id = 'ie-st-prova'; b.className = 'ie-st-prova'; b.title = ieT('Exibir > Prova de cores (Ctrl+Y) / Alerta de gama (Shift+Ctrl+Y)'); box.insertBefore(b, box.querySelector('#ie-st-dica')); }
        const P = IE.prova;
        b.hidden = !(P.on || P.gama);
        b.textContent = `${P.on ? ieT('Prova') : ''}${P.on && P.gama ? ' + ' : ''}${P.gama ? ieT('Gama') : ''}: CMYK ${P.perfil}`;
    };
})();

async function ieProvaAlternar(qual) {
    const P = IE.prova;
    const liga = !P[qual];
    if (liga && !(await ieProvaCarregar())) return;
    P[qual] = liga;
    IE._vistaEst = null;
    ieDesenharVista(); ieDesenharSobre(); ieStatusRender();
    ieToast(`${ieT(qual === 'on' ? 'Prova de cores' : 'Alerta de gama')}: ${ieT(liga ? 'ligada' : 'desligada')} (CMYK ${P.perfil})`);
}

Object.assign(IE_CMDS, {
    prova: () => ieProvaAlternar('on'),
    alertaGama: () => ieProvaAlternar('gama'),
    configurarProva: async () => {
        const v = await ieDialogo({ titulo: 'Configurar prova', campos: [
            { id: 'perfil', rotulo: 'Perfil CMYK', tipo: 'select', valor: IE.prova.perfil, opcoes: IE_PERFIS_PROVA },
            { id: 'on', rotulo: 'Ligar a prova de cores', tipo: 'check', valor: true }] });
        if (!v) return;
        IE.prova.perfil = v.perfil; iePrefGravar('provaPerfil', v.perfil);
        if (!(await ieProvaCarregar(v.perfil))) return;
        IE.prova.on = !!v.on;
        IE._vistaEst = null; ieDesenharVista(); ieDesenharSobre(); ieStatusRender();
    },
    home: () => ieInicioMostrar(true),
});
IE_ATALHOS['Ctrl+Y'] = 'prova';            // como no Photoshop (refazer continua em Shift+Ctrl+Z)
IE_ATALHOS['Shift+Ctrl+Y'] = 'alertaGama';

// Exportar como: + Cor (RGB ou CMYK para gráfica)
ieExportarDialogo = async function () {
    const doc = IE.doc, api = ieApi();
    if (!doc || !api) return;
    const v = await ieDialogo({
        titulo: 'Exportar como', ok: 'Exportar',
        campos: [{ id: 'fmt', rotulo: 'Formato', tipo: 'select', valor: IE.ultFmt || 'png', opcoes: [['png', 'PNG'], ['jpg', 'JPEG'], ['webp', 'WebP'], ['tif', 'TIFF'], ['pdf', 'PDF'], ['psd', 'PSD (achatado)']] },
            { id: 'cor', rotulo: 'Cor', tipo: 'select', valor: IE.ultCor || 'rgb', opcoes: [['rgb', 'RGB (telas, redes sociais)'], ...IE_PERFIS_PROVA.map(([k, n]) => [k, `CMYK ${n}`])] },
            { id: 'q', rotulo: 'Qualidade (JPEG/WebP/PDF)', min: 1, max: 100, valor: IE.ultQ || 92 },
            { id: 'esc', rotulo: 'Escala (%)', tipo: 'numero', min: 1, max: 400, valor: 100 },
            { tipo: 'nota', rotulo: 'CMYK: JPEG, TIFF, PDF ou PSD com o perfil embutido (para gráfica). PNG e WebP são só RGB.' }],
    });
    if (!v) return;
    IE.ultFmt = v.fmt; IE.ultQ = v.q; IE.ultCor = v.cor;
    const cmyk = v.cor !== 'rgb' ? v.cor : null;
    if (cmyk && (v.fmt === 'png' || v.fmt === 'webp')) { ieToast(ieT('PNG e WebP não têm CMYK: escolha JPEG, TIFF, PDF ou PSD')); return; }
    if (!cmyk && v.fmt === 'psd') { ieToast(ieT('Para PSD em RGB com camadas, use Salvar como (Shift+Ctrl+S)')); return; }
    const pasta = doc.path ? doc.path.replace(/[\\/][^\\/]*$/, '') : '';
    const r = await api.ie_dialogo_salvar(doc.nome, v.fmt, pasta);
    if (!r || !r.success) return;
    ieCarregando(`${ieT('Exportando')}${cmyk ? ' (CMYK ' + cmyk + ')' : ''}...`, 30);
    try {
        ieCompor(doc, ieRDoc(doc));
        let c = doc.comp;
        if (v.esc && v.esc !== 100) c = ieTransformarPlano({ c, x: 0, y: 0 }, [v.esc / 100, 0, 0, v.esc / 100, 0, 0]).c;
        const ini = await api.ie_salvar_inicio(null);
        await ieEnviar(ini.url, 'composto.png', c);
        const e = await api.ie_exportar({ sessao: ini.sessao, composto: 'composto.png', destino: r.path, qualidade: v.q, dpi: doc.dpi, cmyk });
        if (e && e.success) ieToast(`${ieT('Exportado')}: ${ieNomeArq(r.path)}${cmyk ? ' · CMYK ' + cmyk : ''}`);
        else ieToast(`${ieT('Não exportou')}: ${(e && e.error) || ''}`);
    } finally { ieCarregando(false); }
};

// seletor de cores: + C/M/Y/K (pelo perfil da prova) e aviso de fora da gama
(function () {
    const orig = ieSeletorCor;
    ieSeletorCor = function (ancora, inicial, aoMudar) {
        let atualizar = null;
        orig(ancora, inicial, hex => { aoMudar(hex); if (atualizar) atualizar(hex); });
        const pop = ieEl('ie-pop'), lado = pop && pop.querySelector('.ie-cp-lado');
        if (!lado) return;
        const box = document.createElement('div');
        box.className = 'ie-cp-cmyk';
        box.innerHTML = ['C', 'M', 'Y', 'K'].map((n, i) => `<label>${n} <input type="number" class="ie-cp-k" data-k="${i}" min="0" max="100" step="1"><i>%</i></label>`).join('')
            + `<small class="ie-cp-gama" hidden title="${ieT('A impressão não alcança esta cor: ela sai mais apagada')}">⚠ ${ieT('fora da gama CMYK')}</small>`;
        lado.insertBefore(box, lado.querySelector('.ie-cp-ok'));
        const api = ieApi();
        let t = null;
        atualizar = hex => {
            clearTimeout(t);
            t = setTimeout(async () => {
                const rgb = ieHexRgb(hex), r = await api?.ie_cor_converter([rgb], 'rgb_cmyk', IE.prova.perfil);
                const v = r && r.cores && r.cores[0];
                if (v) box.querySelectorAll('.ie-cp-k').forEach(i => { if (document.activeElement !== i) i.value = Math.round(v[+i.dataset.k]); });
                if (!IE.prova.gamaArr) await ieProvaCarregar();
                box.querySelector('.ie-cp-gama').hidden = !ieGamaFora(rgb);
            }, 60);
        };
        box.querySelectorAll('.ie-cp-k').forEach(i => {
            i.addEventListener('keydown', ev => ev.stopPropagation());
            i.addEventListener('input', async () => {
                const v = [...box.querySelectorAll('.ie-cp-k')].map(x => ieClamp(+x.value || 0, 0, 100));
                const r = await api?.ie_cor_converter([v], 'cmyk_rgb', IE.prova.perfil), c = r && r.cores && r.cores[0];
                if (!c) return;
                const hx = pop.querySelector('.ie-cp-hex');
                hx.value = ieRgbHex(c[0], c[1], c[2]).slice(1);
                hx.dispatchEvent(new Event('input'));
            });
        });
        atualizar(inicial);
    };
})();

// ─────────────────────────── Início (casinha) ───────────────────────────
// a tela inicial por cima da edição, sem fechar nada; documentos abertos aparecem para continuar
function ieInicioMostrar(on) {
    IE.inicio = !!on && !!IE.docs.length;
    if (on && !IE.docs.length) IE.inicio = false;
    ieAbasRender();
}
(function () {
    const mostrar = ieMostrarDoc;
    ieMostrarDoc = function () { IE.inicio = false; return mostrar.apply(this, arguments); };
    const abas = ieAbasRender;
    ieAbasRender = function () {
        abas.apply(this, arguments);
        const ini = ieEl('ie-inicio');
        if (ini && IE.inicio && IE.doc) { ini.hidden = false; ieRecentesRender?.(); }
        const btn = ieEl('ie-btn-home');
        if (btn) btn.classList.toggle('on', !!(ini && !ini.hidden));
        // "continuar" para cada documento aberto (só com a tela inicial por cima da edição)
        let box = ieEl('ie-inicio-abertos');
        if (!box && ini) {
            box = document.createElement('div'); box.id = 'ie-inicio-abertos'; box.className = 'ie-inicio-abertos';
            ini.querySelector('.ie-inicio-box')?.insertBefore(box, ieEl('ie-recentes'));
            box.addEventListener('click', ev => { const b = ev.target.closest('[data-doc]'); if (b) ieMostrarDoc(IE.docs.find(d => d.id === +b.dataset.doc)); });
        }
        if (box) box.innerHTML = IE.inicio && IE.docs.length ? `<div class="ie-recentes-tit">${ieT('Abertos')}</div><div class="ie-inicio-abertos-lista">`
            + IE.docs.map(d => `<button class="ie-btn" data-doc="${d.id}">${ieIco('chev')} ${ieT('Continuar')}: ${ieEsc(d.nome)}${d.sujo ? ' •' : ''}</button>`).join('') + '</div>' : '';
    };
})();
document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && IE.inicio && IE.doc && !ev.target.closest('input, textarea')) { ev.preventDefault(); ieMostrarDoc(IE.doc); }
}, true);
