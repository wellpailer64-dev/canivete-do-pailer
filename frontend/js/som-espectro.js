// =========================================================
// Sound Kanivete — vista de espectro, reparo espectral e separar voz/instrumental (Functions/sk_espectro.py).
// ▤ no transporte (ou E) troca a forma de onda pelo espectrograma (faixas mais altas); a imagem é do trecho visível,
// pedida ao Python depois que a vista para. Ctrl+arrastar num clipe marca uma área (tempo × frequência) e o painel
// Clipe oferece Preencher (troca pela vizinhança: tosse, bipe, celular) ou Atenuar — gera arquivo novo, como Limpar.
// =========================================================
SK.verEsp = false; SK.esp = {}; SK.rect = null;
const SK_ESP_FMIN = 40, SK_ESP_FMAX = 22050;
const skEspArea = y => [y + 18, y + SK_H - 4];
const skEspY = (y, hz) => { const [t, b] = skEspArea(y); return b - (b - t) * Math.log(Math.max(SK_ESP_FMIN, hz) / SK_ESP_FMIN) / Math.log(SK_ESP_FMAX / SK_ESP_FMIN); };
const skEspHz = (y, py) => { const [t, b] = skEspArea(y); return SK_ESP_FMIN * Math.pow(SK_ESP_FMAX / SK_ESP_FMIN, Math.max(0, Math.min(1, (b - py) / (b - t)))); };

function skVerEspectro(ligar = !SK.verEsp) {
    SK.verEsp = ligar; SK_H = ligar ? 170 : 84; if (!ligar) SK.rect = null;
    skUi(); skDesenhar();
}
function skDesenharEsp(x, c, cx, cw, y, W) {   // true = desenhou (no lugar da forma de onda)
    const a = Math.max(0, -cx), b = Math.min(cw, W - cx); if (b <= a) return true;
    const fa = c.de + a / SK.z, fb = c.de + b / SK.z, e = SK.esp[c.arq];
    if (!e || Math.abs(e.fa - fa) * SK.z > 2 || Math.abs(e.fb - fb) * SK.z > 2) skPedirEsp(c.arq, fa, fb, Math.round(b - a));
    const [t, bo] = skEspArea(y);
    x.save(); x.beginPath(); x.rect(cx + 1, t, cw - 2, bo - t); x.clip();
    if (e && e.img) x.drawImage(e.img, cx + (e.fa - c.de) * SK.z, t, (e.fb - e.fa) * SK.z, bo - t);
    const r = SK.rect;
    if (r && r.id === c.id) {
        const rx = cx + (r.t0 - c.de) * SK.z, rw = (r.t1 - r.t0) * SK.z, ry = skEspY(y, r.f1), rh = skEspY(y, r.f0) - ry;
        x.fillStyle = '#ffd16633'; x.fillRect(rx, ry, rw, rh); x.strokeStyle = '#ffd166'; x.lineWidth = 1.5; x.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    }
    x.restore();
    return true;
}
function skPedirEsp(arq, fa, fb, cols) {   // depois que a vista parar (250 ms); a imagem velha fica enquanto isso
    clearTimeout(SK.espTimer[arq]);
    SK.espTimer[arq] = setTimeout(async () => {
        const r = await skApi().sk_espectro(arq, fa, fb, Math.max(16, Math.min(4096, cols)), 256);
        if (!r || !r.success) return;
        const img = new Image();
        img.onload = () => { SK.esp[arq] = { fa, fb, img }; skDesenhar(); };
        img.src = r.url;
    }, 250);
}
SK.espTimer = {};
async function skReparar(id, { t0, t1, f0, f1, modo = 'preencher', db = -30 } = {}) {
    const [c] = skClipe(id || SK.sel); if (!c) throw new Error('escolha um clipe');
    const r = SK.rect && SK.rect.id === c.id ? SK.rect : null;
    const op = { t0: t0 ?? r?.t0, t1: t1 ?? r?.t1, f0: f0 ?? r?.f0, f1: f1 ?? r?.f1, modo, db };
    if (op.t0 == null) throw new Error('marque a área com Ctrl+arrastar no espectro');
    const saida = await skEfeito(c.id, 'reparar', op);
    SK.rect = null; delete SK.esp[c.arq];
    return saida;
}
async function skSeparar(id) {   // a gravação vira a voz; o instrumental entra numa faixa nova logo abaixo, alinhado
    const [c, f] = skClipe(id || SK.sel); if (!c) throw new Error('escolha um clipe');
    const arq = c.arq;
    const r = await skTarefa(() => skApi().sk_processar(arq, 'separar', {}));
    await skCarregarPicos(r.saida); await skCarregarPicos(r.instrumental);
    skAntes();
    const fi = { id: skId('f'), nome: 'Instrumental', vol: 1, mudo: false, solo: false, cor: SK_CORES[(SK.proj.faixas.length + 1) % SK_CORES.length], clipes: [] };
    for (const g of SK.proj.faixas) for (const x of g.clipes) if (x.arq === arq) {
        fi.clipes.push({ ...JSON.parse(JSON.stringify(x)), id: skId('c'), arq: r.instrumental, nome: r.instrumental.split(/[\\/]/).pop(), orig: undefined, efeitos: undefined });
        x.orig = x.orig || arq; x.arq = r.saida; x.efeitos = [...(x.efeitos || []), 'separar'];
    }
    SK.proj.faixas.splice(SK.proj.faixas.indexOf(f) + 1, 0, fi);
    skMudou('separar'); skToast('Voz e instrumental separados');
    return { voz: r.saida, instrumental: r.instrumental, faixa: fi.id };
}
Object.assign(window.SKN, {
    espectro: (ligar = true) => skVerEspectro(ligar),
    areaEspectral: (id, t0, t1, f0, f1) => { SK.rect = { id, t0, t1, f0, f1 }; skUi(); skDesenhar(); return SK.rect; },
    reparar: (id, op) => skReparar(id, op || {}),
    separar: id => skSeparar(id),
});
