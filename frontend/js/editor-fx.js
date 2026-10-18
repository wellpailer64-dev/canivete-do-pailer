// =========================================================
// Pocket Editor — efeitos (painel "Efeitos" e a parte de efeitos do "Controles de efeito")
// Cada clipe guarda c.fx = [{id, t, on, v: {parâmetro: valor}}], aplicados de cima para baixo no
// tamanho original da mídia, ANTES de escala/posição/rotação/opacidade (como no Premiere).
// Efeito novo: acrescente em VE_FX (parâmetros + draw da prévia) e em _filtros_fx (Functions/video_cutter.py).
// A prévia e a exportação precisam fazer a mesma conta.
// =========================================================

const VE_KEY_PADRAO = '#00b140';   // verde de chroma key (Chroma Key, mais abaixo)

const VE_FX = {
    blur: {
        nome: 'Desfoque gaussiano', cat: 'Desfoque e nitidez', tag: 'Blur',
        animaFF: ['amt'],   // animado vai pela exportação normal (gblur + sendcmd), sem camada desenhada (editor-motion.js)
        params: [{ k: 'amt', nome: 'Desfoque', min: 0, max: 100, step: 0.5, def: 20, un: '%' }],
        neutro: v => !(v.amt > 0),
        // 100% = sigma de 5% do lado menor da mídia; bordas repetidas (não escurecem, igual ao ffmpeg gblur)
        draw(a, v, env) {
            const sp = v.amt * Math.min(env.mw, env.mh) / 2000 * env.q;
            if (sp < 0.05) return a;
            const p = Math.ceil(sp * 3) + 1, { w, h } = env;
            const P = veFxCanvas(2, w + 2 * p, h + 2 * p), x = P.ctx, s = a.cv;
            x.clearRect(0, 0, w + 2 * p, h + 2 * p);
            x.drawImage(s, p, p);
            x.drawImage(s, 0, 0, 1, h, 0, p, p, h);              // esquerda
            x.drawImage(s, w - 1, 0, 1, h, p + w, p, p, h);      // direita
            x.drawImage(s, 0, 0, w, 1, p, 0, w, p);              // cima
            x.drawImage(s, 0, h - 1, w, 1, p, p + h, w, p);      // baixo
            x.drawImage(s, 0, 0, 1, 1, 0, 0, p, p);              // cantos
            x.drawImage(s, w - 1, 0, 1, 1, p + w, 0, p, p);
            x.drawImage(s, 0, h - 1, 1, 1, 0, p + h, p, p);
            x.drawImage(s, w - 1, h - 1, 1, 1, p + w, p + h, p, p);
            const b = veFxOther(a, w, h);
            b.ctx.clearRect(0, 0, w, h);
            b.ctx.filter = `blur(${sp}px)`;
            b.ctx.drawImage(P.cv, -p, -p);
            b.ctx.filter = 'none';
            return b;
        },
    },
    ca: {
        nome: 'Aberração cromática', cat: 'Estilizar', tag: 'Chromatic',
        params: [
            { k: 'r', nome: 'Vermelho', min: -10, max: 10, step: 0.1, def: -2, un: '' },
            { k: 'g', nome: 'Verde', min: -10, max: 10, step: 0.1, def: 0, un: '' },
            { k: 'b', nome: 'Azul', min: -10, max: 10, step: 0.1, def: 2, un: '' },
            { k: 'raio', nome: 'Raio', min: 0, max: 200, step: 1, def: 60, un: '%' },
        ],
        neutro: v => !(v.r || v.g || v.b),
        // como o VR Chromatic Aberrations do Premiere: cada canal ampliado a partir do centro da camada (positivo
        // abre, negativo fecha; 1 = 0,45 %, medido no render). Mesma conta na exportação (_filtros_fx, "ca").
        draw(a, v, env) {
            const { w, h } = env, ss = veFxCaEscalas(v);
            const b = veFxOther(a, w, h), x = b.ctx, T = veFxCanvas(3, w, h), t = T.ctx;
            x.clearRect(0, 0, w, h);
            [['#ff0000', ss[0]], ['#00ff00', ss[1]], ['#0000ff', ss[2]]].forEach(([cor, s]) => {
                const dw = w * s, dh = h * s, dx = (w - dw) / 2, dy = (h - dh) / 2;
                t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, w, h); t.drawImage(a.cv, dx, dy, dw, dh);
                t.globalCompositeOperation = 'multiply'; t.fillStyle = cor; t.fillRect(0, 0, w, h);
                t.globalCompositeOperation = 'destination-in'; t.drawImage(a.cv, dx, dy, dw, dh);
                x.globalCompositeOperation = 'lighter'; x.drawImage(T.cv, 0, 0);
            });
            t.globalCompositeOperation = 'source-over'; x.globalCompositeOperation = 'source-over';
            const R = (v.raio ?? 60) / 100 * Math.min(w, h);
            if (R > 0) {   // queda radial (bordas sem franja): cheio até meio raio, nada no raio — igual à exportação
                t.clearRect(0, 0, w, h); t.drawImage(a.cv, 0, 0);
                const M = veFxCanvas(4, w, h), mx = M.ctx; mx.clearRect(0, 0, w, h); mx.drawImage(b.cv, 0, 0);
                const gr = mx.createRadialGradient(w / 2, h / 2, R / 2, w / 2, h / 2, R);
                gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
                mx.globalCompositeOperation = 'destination-in'; mx.fillStyle = gr; mx.fillRect(0, 0, w, h); mx.globalCompositeOperation = 'source-over';
                x.clearRect(0, 0, w, h); x.drawImage(T.cv, 0, 0); x.drawImage(M.cv, 0, 0);
            }
            return b;
        },
    },
    bc: {
        nome: 'Brilho e contraste', cat: 'Correção de cor', tag: 'Cor',
        params: [
            { k: 'br', nome: 'Brilho', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'ct', nome: 'Contraste', min: -100, max: 100, step: 1, def: 0, un: '' },
        ],
        neutro: v => !v.br && !v.ct,
        draw(a, v, env) {
            const b = veFxOther(a, env.w, env.h);
            b.ctx.clearRect(0, 0, env.w, env.h);
            b.ctx.filter = `brightness(${1 + (v.br || 0) / 100}) contrast(${1 + (v.ct || 0) / 100})`;
            b.ctx.drawImage(a.cv, 0, 0);
            b.ctx.filter = 'none';
            return b;
        },
    },
    // Luz e Cor: editado no painel próprio (editor-lc.js); a parte de cor vai para a exportação como LUT 3D
    lc: {
        nome: 'Luz e Cor', cat: 'Correção de cor', tag: 'Lumetri', painel: 'lc',
        params: [
            { k: 'temp', nome: 'Temperatura', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'tint', nome: 'Matiz', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'exp', nome: 'Exposição', min: -4, max: 4, step: 0.05, def: 0, un: 'EV' },
            { k: 'ct', nome: 'Contraste', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'hi', nome: 'Realces', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'sh', nome: 'Sombras', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'wh', nome: 'Brancos', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'bl', nome: 'Pretos', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'sat', nome: 'Saturação', min: 0, max: 200, step: 1, def: 100, un: '' },
            { k: 'fade', nome: 'Filme desbotado', min: 0, max: 100, step: 1, def: 0, un: '' },
            { k: 'sharp', nome: 'Nitidez', min: 0, max: 100, step: 1, def: 0, un: '' },
            { k: 'vib', nome: 'Vibração', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'vig', nome: 'Quantidade', min: 0, max: 100, step: 1, def: 0, un: '' },
            // rodas de cor: luminância de sombras / meios-tons / realces (a cor fica em v.cw)
            { k: 'ls', nome: 'Sombras (luz)', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'lm', nome: 'Meios-tons (luz)', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'lh', nome: 'Realces (luz)', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'lo', nome: 'Offset (luz)', min: -100, max: 100, step: 1, def: 0, un: '' },
            { k: 'piv', nome: 'Pivô do contraste', min: 5, max: 95, step: 1, def: 50, un: '' },
            { k: 'hue', nome: 'Rotação de matiz', min: -180, max: 180, step: 1, def: 0, un: '°' },
            // Clareza (Clarity do Camera Raw): contraste local nos meios-tons; roda depois da LUT, como a nitidez
            { k: 'clar', nome: 'Clareza', min: -100, max: 100, step: 1, def: 0, un: '' },
        ],
        extra: ['cv', 'cw', 'hc'],
        neutro: v => veLcColorNeutral(v) && !(v.sharp > 0) && !(v.vig > 0) && !v.clar,
        draw: (a, v, env) => veLcDraw(a, v, env),
        exportar: v => {
            const o = { sharp: veLcSharpAmt(v), vig: veLcVigAngle(v), clar: veLcClarAmt(v), clar_s: VE_LC_CLAR_SIGMA };
            if (!veLcColorNeutral(v)) { o.n = veLcLut(v).n; o.lut = veLcLutB64(v); }
            return o;
        },
    },
    key: {
        nome: 'Chroma Key', cat: 'Chaveamento', tag: 'Keylight', soClipe: true,
        params: [
            { k: 'cor', nome: 'Cor da tela', tipo: 'cor', def: VE_KEY_PADRAO },
            { k: 'ganho', nome: 'Ganho da tela', min: 0, max: 200, step: 1, def: 100, un: '%' },
            { k: 'bal', nome: 'Equilíbrio', min: 0, max: 100, step: 1, def: 50, un: '%' },
            { k: 'preto', nome: 'Recorte do preto', min: 0, max: 99, step: 0.5, def: 0, un: '%' },
            { k: 'branco', nome: 'Recorte do branco', min: 1, max: 100, step: 0.5, def: 100, un: '%' },
            { k: 'encolher', nome: 'Encolher / expandir', min: -10, max: 10, step: 1, def: 0, un: 'px' },
            { k: 'suave', nome: 'Suavizar borda', min: 0, max: 20, step: 0.5, def: 0, un: 'px' },
            { k: 'spill', nome: 'Remover reflexo', min: 0, max: 100, step: 1, def: 100, un: '%' },
            // Preservar amarelos: a transparência e o reflexo medem o verde contra o MAIOR entre vermelho e azul
            // (amarelo, laranja e pele têm vermelho ≥ verde: ficam inteiros). Sem ele, o Equilíbrio mistura R e B e
            // um amarelo esverdeado da tela fica meio transparente (a placa "Passei de primeira" ia a marrom).
            { k: 'max', nome: 'Preservar amarelos (máx. de R e B)', tipo: 'bool', def: 0 },
            // Descontaminar: na borda semitransparente (cabelo, desfoque) tira a parte da tela da cor: F = (C − (1−a)·tela)/a
            { k: 'desc', nome: 'Descontaminar bordas', min: 0, max: 100, step: 1, def: 0, un: '%' },
            { k: 'matte', nome: 'Mostrar matte (só na prévia)', tipo: 'bool', def: 0 },
            { k: 'status', nome: 'Mostrar status: cinza = semitransparente (só na prévia)', tipo: 'bool', def: 0 },
        ],
        neutro: () => false,
        draw: (a, v, env) => veKeyDrawGL(a, v, env) || veKeyDraw(a, v, env),
        exportar: v => {
            const k = veKeyCalc(v), e = k.eq, c = 1 - e;
            // coeficientes do colorchannelmixer para o alfa (aa = 0,5 com o alfa de entrada 255 = constante)
            const mix = k.azul ? { ar: 0.5 * e, ag: 0.5 * c, ab: -0.5 } : { ar: 0.5 * e, ag: -0.5, ab: 0.5 * c };
            return { azul: k.azul ? 1 : 0, ...mix, dk: k.dk, ganho: k.ganho, cb: k.cb, cw: k.cw, eq: e,
                     spill: k.spill, choke: k.choke, suave: k.suave, max: k.max ? 1 : 0, desc: k.desc, tela: k.tela };
        },
    },
    crop: {
        nome: 'Cortar', cat: 'Transformar', tag: 'Crop',
        params: [
            { k: 'l', nome: 'Esquerda', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 't', nome: 'Superior', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 'r', nome: 'Direita', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
            { k: 'b', nome: 'Inferior', min: 0, max: 100, step: 0.5, def: 0, un: '%' },
        ],
        neutro: v => !v.l && !v.t && !v.r && !v.b,
        // a área cortada fica transparente: aparece o que estiver na trilha de baixo
        draw(a, v, env) {
            const { w, h } = env, x = a.ctx;
            const px = (f, n) => f > 0 ? Math.max(1, Math.floor(n * f / 100)) : 0;
            const l = px(v.l, w), r = px(v.r, w), t = px(v.t, h), b = px(v.b, h);
            if (l) x.clearRect(0, 0, l, h);
            if (r) x.clearRect(w - r, 0, r, h);
            if (t) x.clearRect(0, 0, w, t);
            if (b) x.clearRect(0, h - b, w, b);
            return a;
        },
    },
    // Luma Key: some o que é escuro (fundo preto de GC, fogo, partículas). Luminância Rec.709 dos valores RGB;
    // abaixo do Limite fica transparente e a Suavidade é a faixa até ficar opaco. A exportação faz a mesma conta.
    luma: {
        nome: 'Luma Key', cat: 'Chaveamento', tag: 'Luminance key', soClipe: true,
        params: [
            { k: 'lim', nome: 'Limite', min: 0, max: 100, step: 0.5, def: 8, un: '%' },
            { k: 'suave', nome: 'Suavidade', min: 0, max: 100, step: 0.5, def: 12, un: '%' },
            { k: 'inv', nome: 'Inverter (some o claro)', tipo: 'bool', def: 0 },
        ],
        neutro: () => false,
        draw(a, v, env) {
            const { w, h } = env, x = a.ctx, lim = v.lim / 100, s = Math.max(1 / 255, v.suave / 100);
            let d;
            try { d = x.getImageData(0, 0, w, h); } catch (e) { return a; }   // quadro sem CORS
            const p = d.data;
            for (let i = 0; i < p.length; i += 4) {
                const y = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
                let k = Math.min(1, Math.max(0, (y - lim) / s));
                if (v.inv) k = 1 - k;
                p[i + 3] = Math.round(p[i + 3] * k);
            }
            x.putImageData(d, 0, 0);
            return a;
        },
    },
    // Cantos arredondados: 100% = metade do lado menor (vira pílula / círculo). Fora da curva fica transparente.
    rounded: {
        nome: 'Cantos arredondados', cat: 'Transformar', tag: 'Rounded',
        params: [{ k: 'raio', nome: 'Arredondamento', min: 0, max: 100, step: 0.5, def: 15, un: '%' }],
        neutro: v => !(v.raio > 0),
        draw(a, v, env) {
            const { w, h } = env, cr = veFxCropRect(env.c, w, h), r = veFxRaio(v, cr.w, cr.h);
            if (r < 0.5) return a;
            const x = a.ctx;
            x.save();
            x.globalCompositeOperation = 'destination-in';
            x.beginPath();
            x.roundRect(cr.x, cr.y, cr.w, cr.h, Math.min(r, cr.w / 2, cr.h / 2));
            x.fill();
            x.restore();
            return a;
        },
    },
    // Sombra projetada (como a do Photoshop): a forma da camada (transparência), na cor escolhida, deslocada no ângulo
    // da luz (135° = luz de cima à esquerda, sombra para baixo à direita) e desfocada. Não mexe nos pixels da mídia:
    // é desenhada junto com a camada (veDesenharItens: shadow* do canvas, que não gira nem escala com ela, como a luz
    // global do Photoshop). Exportação: _sombra_camada em video_cutter.py (mesma conta: desvio = tamanho / 2).
    sombra: {
        nome: 'Sombra projetada', cat: 'Estilizar', tag: 'Drop Shadow', aoDesenhar: true,
        params: [
            { k: 'cor', nome: 'Cor', tipo: 'cor', def: '#000000', gotas: false },
            { k: 'op', nome: 'Opacidade', min: 0, max: 100, step: 1, def: 60, un: '%' },
            { k: 'ang', nome: 'Ângulo', min: 0, max: 360, step: 1, def: 135, un: '°' },
            { k: 'dist', nome: 'Distância', min: 0, max: 500, step: 0.5, def: 12, un: 'px' },
            { k: 'tam', nome: 'Tamanho', min: 0, max: 250, step: 0.5, def: 16, un: 'px' },
        ],
        neutro: v => !(v.op > 0),
        draw: a => a,
    },
    // ── Constante (painel Animação): movimento em loop durante o clipe inteiro. Não mexem nos pixels: somam à
    // Escala/Rotação/Posição na hora de desenhar (veCaAplicar) e viram fórmulas na exportação (_ca_exprs).
    ca_rot: {
        nome: 'Rotação', cat: 'Constante', tag: 'Spin', constante: true, soClipe: true,
        params: [
            { k: 'vel', nome: 'Velocidade (voltas por segundo)', min: 0, max: 5, step: 0.05, def: 0.25, un: 'x' },
            { k: 'esq', nome: 'Girar para a esquerda', tipo: 'bool', def: 0 },
        ],
        neutro: v => !(v.vel > 0),
        draw: a => a,
    },
    ca_wig: {
        nome: 'Tremer', cat: 'Constante', tag: 'Wiggle', constante: true, soClipe: true,
        params: [
            { k: 'area', nome: 'Área de deslocamento', min: 0, max: 400, step: 1, def: 30, un: 'px' },
            { k: 'vel', nome: 'Velocidade (por segundo)', min: 0.2, max: 20, step: 0.1, def: 4, un: 'x' },
            { k: 'int', nome: 'Intensidade (suave → nervoso)', min: 0, max: 100, step: 1, def: 50, un: '%' },
        ],
        neutro: v => !(v.area > 0),
        draw: a => a,
    },
    ca_pul: {
        nome: 'Pulsar', cat: 'Constante', tag: 'Pulse', constante: true, soClipe: true,
        params: [
            { k: 'tam', nome: 'Tamanho do pulso', min: 0, max: 100, step: 0.5, def: 8, un: '%' },
            { k: 'vel', nome: 'Velocidade (pulsos por segundo)', min: 0.1, max: 10, step: 0.05, def: 1.5, un: 'x' },
        ],
        neutro: v => !(v.tam > 0),
        draw: a => a,
    },
    // Básico 3D (Basic 3D do Premiere): gira o quadro no espaço e projeta com perspectiva, dentro do próprio quadro
    b3d: {
        nome: 'Básico 3D', cat: 'Perspectiva', tag: 'Basic 3D',
        params: [
            { k: 'giro', nome: 'Girar (eixo Y)', min: -180, max: 180, step: 0.5, def: 0, un: '°' },
            { k: 'incl', nome: 'Inclinar (eixo X)', min: -180, max: 180, step: 0.5, def: 0, un: '°' },
            { k: 'dist', nome: 'Distância até a imagem', min: -50, max: 200, step: 0.5, def: 0, un: '' },
        ],
        neutro: v => !v.giro && !v.incl && !v.dist,
        draw: (a, v, env) => veB3dDraw(a, v, env),
    },
};

const VE_AFX = {
    // Anti Noise: DeepFilterNet3 (rede neural), roda uma vez por arquivo no fundo (Functions/anti_noise.py). A
    // Quantidade só mistura o som limpo com o original (editor-audio.js: veAudioFonteClipe): muda na hora, tocando.
    // Vale na fonte do clipe, antes dos outros efeitos, em qualquer posição da lista.
    antinoise: {
        nome: 'Anti Noise', cat: 'Áudio · Restauração', tag: 'Remove o ruído de fundo (IA)',
        params: [{ k: 'amt', nome: 'Quantidade', min: 0, max: 100, step: 1, def: 100, un: '%' }],
        neutro: v => !(v.amt > 0),
    },
    denoise: {
        nome: 'Limpeza de ruído', cat: 'Áudio · Restauração', tag: 'Noise cleanup',
        params: [
            { k: 'amt', nome: 'Redução', min: 0, max: 100, step: 1, def: 35, un: '%' },
            { k: 'floor', nome: 'Piso do ruído', min: -75, max: -25, step: 1, def: -50, un: 'dB' },
        ],
        neutro: v => !(v.amt > 0),
    },
    // Hard Limiter (Premiere/Audition): editor-audio.js (VeLimitador) e video_cutter._hard_limiter fazem a mesma conta
    limiter: {
        nome: 'Hard Limiter', cat: 'Áudio · Amplitude e compressão', tag: 'Limitador rígido de picos',
        params: [
            { k: 'ceil', nome: 'Amplitude máxima', min: -30, max: 0, step: 0.1, def: -1, un: 'dB' },   // -1: folga para o AAC do mp4
            { k: 'boost', nome: 'Ganho de entrada', min: -12, max: 30, step: 0.1, def: 0, un: 'dB' },
            { k: 'look', nome: 'Antecipação', min: 0.1, max: 10, step: 0.1, def: 3, un: 'ms' },
            { k: 'rel', nome: 'Soltura', min: 10, max: 1000, step: 1, def: 80, un: 'ms' },
            { k: 'link', nome: 'Vincular canais', tipo: 'bool', def: 1 },
        ],
        neutro: () => false,
    },
    dereverb: {
        nome: 'Secar ambiente', cat: 'Áudio · Restauração', tag: 'Room dryer',
        params: [{ k: 'amt', nome: 'Intensidade', min: 0, max: 100, step: 1, def: 40, un: '%' }],
        neutro: v => !(v.amt > 0),
    },
    reverb: {
        nome: 'Ambiência', cat: 'Áudio · Espaço', tag: 'Reverb',
        params: [
            { k: 'mix', nome: 'Mistura', min: 0, max: 60, step: 1, def: 18, un: '%' },
            { k: 'size', nome: 'Tamanho', min: 0, max: 100, step: 1, def: 45, un: '%' },
        ],
        neutro: v => !(v.mix > 0),
    },
    eq: {
        nome: 'Equalizador gráfico', cat: 'Áudio · EQ', tag: 'EQ',
        params: [
            { k: 'lo', nome: 'Graves', min: -12, max: 12, step: 0.5, def: 0, un: 'dB' },
            { k: 'mid', nome: 'Médios', min: -12, max: 12, step: 0.5, def: 0, un: 'dB' },
            { k: 'hi', nome: 'Agudos', min: -12, max: 12, step: 0.5, def: 0, un: 'dB' },
        ],
        neutro: v => !v.lo && !v.mid && !v.hi,
    },
};

// ── Constante: Rotação / Tremer / Pulsar (u = segundos desde o início do clipe) ──
const VE_CA_2PI = Math.PI * 2;
// −1..1: balanço suave (r = 0) até tremida nervosa (r = 1); a exportação usa a mesma soma de senos (_ca_exprs)
function veCaOnda(u, f, r, fase) {
    const a = VE_CA_2PI * f * u;
    return (1 - r) * Math.sin(a + fase) + r * (0.6 * Math.sin(a * 2.37 + fase * 1.7 + 1.3) + 0.4 * Math.sin(a * 4.11 + fase * 2.3 + 2.9));
}
const veCaAtivas = c => veFxActive(c).filter(f => VE_FX[f.t].constante);
// Propriedades do clipe no instante T com o movimento constante somado (só no desenho: o painel mostra as de base)
function veCaAplicar(c, p, T) {
    const L = veCaAtivas(c);
    if (!L.length) return p;
    const u = Math.max(0, T - c.st), q = { ...p };
    L.forEach(f => {
        const v = veFxValues(f);
        if (f.t === 'ca_rot') q.rot += (v.esq ? -1 : 1) * v.vel * 360 * u;
        else if (f.t === 'ca_pul') q.sc *= 1 + v.tam / 100 * (0.5 - 0.5 * Math.cos(VE_CA_2PI * v.vel * u));
        else if (f.t === 'ca_wig') {
            const r = v.int / 100;
            q.x += v.area * veCaOnda(u, v.vel, r, 0.3);
            q.y += v.area * veCaOnda(u, v.vel, r, 2.1);
        }
    });
    return q;
}
const veCaExport = c => veCaAtivas(c).map(f => ({ t: f.t, v: veFxValues(f) }));

// ── Cantos arredondados: raio em px do quadro w×h (a exportação faz a mesma conta: _filtros_fx) ──
function veFxRaio(v, w, h) { return Math.max(0, Math.min(100, v.raio || 0)) / 100 * Math.min(w, h) / 2; }
function veFxCropRect(c, w, h) {
    const f = ((c && c.fx) || []).find(x => x && x.on !== false && x.t === 'crop');
    if (!f) return { x: 0, y: 0, w, h };
    const v = veFxValues(f);
    const l = Math.max(0, Math.min(99.5, v.l || 0));
    const t = Math.max(0, Math.min(99.5, v.t || 0));
    const r = Math.max(0, Math.min(99.5, v.r || 0));
    const b = Math.max(0, Math.min(99.5, v.b || 0));
    const x = w * l / 100, y = h * t / 100;
    return { x, y, w: Math.max(1, w * (1 - r / 100) - x), h: Math.max(1, h * (1 - b / 100) - y) };
}

// ── Básico 3D ──
// Quadro centrado na origem, girado primeiro em X (inclinar: o topo afasta com ângulo positivo) e depois em Y
// (girar), afastado pela distância e projetado por uma câmera a f = diagonal do quadro. Devolve os 4 cantos na tela
// (sup. esq., sup. dir., inf. esq., inf. dir.) e a profundidade de cada um, ou null se algum ficar atrás da câmera.
// A exportação (_b3d_cantos em Functions/video_cutter.py) usa a mesma conta.
function veB3dCantos(v, w, h, folga = 0) {
    const f = Math.hypot(w, h), gi = (v.giro || 0) * Math.PI / 180, it = (v.incl || 0) * Math.PI / 180;
    const dz = (v.dist || 0) / 100 * f, hw = w / 2 + folga, hh = h / 2 + folga;
    const out = [];
    for (const [x, y] of [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]]) {
        const y1 = y * Math.cos(it), z1 = -y * Math.sin(it);
        const x2 = x * Math.cos(gi) + z1 * Math.sin(gi), z2 = -x * Math.sin(gi) + z1 * Math.cos(gi) + dz;
        const p = f + z2;
        if (p < f * 0.05) return null;
        out.push([w / 2 + x2 * f / p, h / 2 + y1 * f / p, p / f]);
    }
    return out;
}

// Prévia: quadrilátero com textura em WebGL (a divisão por w da GPU dá a perspectiva certa, como o ffmpeg perspective)
const VEB3D = { cv: null, gl: null };
function veB3dGl() {
    if (VEB3D.gl) return VEB3D.gl;
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { premultipliedAlpha: true, alpha: true });
    if (!gl) return null;
    const sh = (tipo, src) => { const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER,
        'attribute vec4 p; attribute vec2 uv; varying vec2 v; void main() { v = uv; gl_Position = p; }'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER,
        'precision mediump float; varying vec2 v; uniform sampler2D t; void main() { gl_FragColor = texture2D(t, v); }'));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(k => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const lp = gl.getAttribLocation(pr, 'p'), lu = gl.getAttribLocation(pr, 'uv');
    gl.enableVertexAttribArray(lp);
    gl.enableVertexAttribArray(lu);
    gl.vertexAttribPointer(lp, 4, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(lu, 2, gl.FLOAT, false, 24, 16);
    VEB3D.cv = cv;
    VEB3D.gl = gl;
    return gl;
}
function veB3dDraw(a, v, env) {
    const { w, h } = env, b = veFxOther(a, w, h);
    b.ctx.clearRect(0, 0, w, h);
    const k = veB3dCantos(v, w, h), gl = k && veB3dGl();
    if (!k || !gl) return b;
    const cv = VEB3D.cv;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.cv); } catch (e) { return a; }   // quadro sem CORS: sem 3D
    const uv = [[0, 0], [1, 0], [0, 1], [1, 1]], d = [];
    k.forEach(([x, y, p], i) => d.push((x / w * 2 - 1) * p, (1 - y / h * 2) * p, 0, p, uv[i][0], uv[i][1]));
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    b.ctx.drawImage(cv, 0, 0);
    return b;
}

// ── Chroma Key (como Keylight / Ultra Key) ──
// Matte por DIFERENÇA DE COR (o núcleo do Keylight e do IBK do Nuke), não por distância de cor: a transparência vem
// de quanto o canal da tela (G ou B) passa dos outros dois, medido em relação à cor da tela. Preserva cabelo, desfoque
// de movimento e semitransparência melhor que "chave por tolerância". Passos (iguais aos do ffmpeg, _filtros_fx):
//   1. bruto = 0,5 + 0,5·(eq·R − G + (1−eq)·B) (tela azul: troca G↔B)   → colorchannelmixer (alfa, 8 bits)
//   2. d = 1 − 2·bruto; alfa = 1 − ganho·d/dk; recorte preto/branco      → lutrgb no alfa
//   3. reflexo: s = max(G − (R·eq + B·(1−eq)), 0); G −= quant·s          → despill
//   4. encolher/expandir (mínimo/máximo 3×3, n vezes) e suavizar (gaussiano) só no alfa → erosion/dilation, gblur
function veKeyCalc(v) {
    const hx = /^#[0-9a-f]{6}$/i.test(v.cor) ? v.cor : VE_KEY_PADRAO;
    const kr = parseInt(hx.slice(1, 3), 16) / 255, kg = parseInt(hx.slice(3, 5), 16) / 255, kb = parseInt(hx.slice(5, 7), 16) / 255;
    const azul = kb > kg, eq = v.bal / 100, max = !!v.max;
    // canal da tela S e os outros dois (o1 pesa eq, o2 pesa 1−eq; com "Preservar amarelos", o maior dos dois)
    const outros = azul ? (max ? Math.max(kr, kg) : eq * kr + (1 - eq) * kg) : (max ? Math.max(kr, kb) : eq * kr + (1 - eq) * kb);
    const dk = Math.max(0.05, (azul ? kb : kg) - outros);
    const cb = Math.min(v.preto, v.branco - 1) / 100, cw = Math.max(v.branco, v.preto + 1) / 100;
    const ganho = v.ganho / 100;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
        const a = 1 - ganho * (1 - 2 * i / 255) / dk;
        lut[i] = Math.round(Math.min(1, Math.max(0, (a - cb) / (cw - cb))) * 255);
    }
    return { azul, eq, dk, cb, cw, ganho, lut, spill: v.spill / 100, choke: Math.round(v.encolher), suave: v.suave,
             max, desc: Math.max(0, Math.min(100, +v.desc || 0)) / 100, tela: [kr, kg, kb] };
}
const VEKEY = { a: null, b: null, m: null, m2: null };
function veKeyCv(k, w, h) {
    if (!VEKEY[k]) { const cv = document.createElement('canvas'); VEKEY[k] = { cv, ctx: cv.getContext('2d', { willReadFrequently: true }) }; }
    const o = VEKEY[k];
    if (o.cv.width !== w || o.cv.height !== h) { o.cv.width = w; o.cv.height = h; }
    return o;
}
// n passes de mínimo (encolher, n > 0) ou máximo (expandir, n < 0) 3×3 no alfa (separável)
function veKeyMorf(al, w, h, n) {
    const tmp = new Uint8ClampedArray(al.length), f = n > 0 ? Math.min : Math.max;
    for (let p = 0; p < Math.abs(n); p++) {
        for (let y = 0; y < h; y++) {
            const o = y * w;
            for (let x = 0; x < w; x++) tmp[o + x] = f(al[o + Math.max(0, x - 1)], al[o + x], al[o + Math.min(w - 1, x + 1)]);
        }
        for (let y = 0; y < h; y++) {
            const a = Math.max(0, y - 1) * w, o = y * w, b = Math.min(h - 1, y + 1) * w;
            for (let x = 0; x < w; x++) al[o + x] = f(tmp[a + x], tmp[o + x], tmp[b + x]);
        }
    }
}
function veKeyDraw(a, v, env) {
    const k = veKeyCalc(v), { w, h } = env;
    const A = veKeyCv('a', w, h);
    A.ctx.clearRect(0, 0, w, h);
    A.ctx.drawImage(a.cv, 0, 0);
    const img = A.ctx.getImageData(0, 0, w, h), d = img.data, n = w * h, al = new Uint8ClampedArray(n);
    const eq = k.eq, ceq = 1 - eq, amt = k.spill, lut = k.lut, mx = k.max, desc = k.desc;
    const T = k.tela.map(x => x * 255);
    // os "outros" canais (contra o da tela): média pelo Equilíbrio ou o maior (Preservar amarelos)
    const outros = (r, g, b) => k.azul ? (mx ? Math.max(r, g) : r * eq + g * ceq) : (mx ? Math.max(r, b) : r * eq + b * ceq);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
        let r = d[j], g = d[j + 1], b = d[j + 2];
        const bruto = 0.5 * outros(r, g, b) - 0.5 * (k.azul ? b : g) + 127.5;
        const src = d[j + 3];
        const ak = lut[Math.max(0, Math.min(255, Math.round(bruto)))];
        al[i] = src === 0 ? 0 : Math.round(ak * src / 255);
        if (desc > 0 && ak < 255) {
            const a = Math.max(ak / 255, 0.08), f = desc * (1 - a) / a;   // C + desc·(F − C), F = (C − (1−a)·T)/a
            r = Math.max(0, Math.min(255, r + f * (r - T[0]))); g = Math.max(0, Math.min(255, g + f * (g - T[1]))); b = Math.max(0, Math.min(255, b + f * (b - T[2])));
            d[j] = r; d[j + 1] = g; d[j + 2] = b;
        }
        if (amt > 0) {
            const s = (k.azul ? b : g) - outros(r, g, b);
            if (s > 0) d[j + (k.azul ? 2 : 1)] = (k.azul ? b : g) - amt * s;
        }
        d[j + 3] = 255;
    }
    const ch = Math.round(k.choke * env.q);
    if (ch) veKeyMorf(al, w, h, ch);
    // máscara (branco com o alfa): serve para suavizar e para "Mostrar matte"
    const M = veKeyCv('m', w, h), mi = M.ctx.createImageData(w, h), md = mi.data;
    for (let i = 0, j = 0; i < n; i++, j += 4) { md[j] = md[j + 1] = md[j + 2] = 255; md[j + 3] = al[i]; }
    M.ctx.putImageData(mi, 0, 0);
    let mask = M.cv;
    if (v.status) {   // status: preto = some, branco = fica, cinza = semitransparente (onde o recorte precisa de ajuste)
        for (let i = 0, j = 0; i < n; i++, j += 4) { md[j + 3] = al[i] < 5 ? 0 : al[i] > 250 ? 255 : 128; }
        M.ctx.putImageData(mi, 0, 0);
    }
    const sp = v.status ? 0 : k.suave * env.q;
    if (sp >= 0.05) {
        const M2 = veKeyCv('m2', w, h);
        M2.ctx.clearRect(0, 0, w, h);
        M2.ctx.filter = `blur(${sp}px)`;
        M2.ctx.drawImage(M.cv, 0, 0);
        M2.ctx.filter = 'none';
        mask = M2.cv;
    }
    const out = veFxOther(a, w, h);
    out.ctx.globalCompositeOperation = 'source-over';
    if (v.matte || v.status) {
        out.ctx.fillStyle = '#000';
        out.ctx.fillRect(0, 0, w, h);
        out.ctx.drawImage(mask, 0, 0);
        return out;
    }
    A.ctx.putImageData(img, 0, 0);   // RGB sem o reflexo, opaco
    out.ctx.clearRect(0, 0, w, h);
    out.ctx.drawImage(A.cv, 0, 0);
    out.ctx.globalCompositeOperation = 'destination-in';
    out.ctx.drawImage(mask, 0, 0);
    out.ctx.globalCompositeOperation = 'source-over';
    return out;
}

// ── Chroma Key na placa de vídeo (WebGL2) ──
// Os mesmos passos e as mesmas contas do veKeyDraw (que fica como reserva sem WebGL2), mas por shader: no processador,
// "Encolher" (veKeyMorf) e a leitura do quadro (getImageData) comiam 3,3 de 4,5 s de play num trecho com chroma key
// (Respeite o seu voto, 2026-10-10). Linhas das texturas = linhas da imagem (0 = topo); só a saída final desvira.
// Suavizar = gaussiano de verdade com sigma = px (como o gblur da exportação; o CSS blur do processador era aproximado).
const VE_KEY_VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const VE_KEY_FS_MATTE = `#version 300 es
precision highp float;
uniform sampler2D src; uniform sampler2D lut; uniform bool azul, mx; uniform float eq, amt, desc; uniform vec3 tela;
out vec4 o;
float outros(vec3 c) {
    float ceq = 1.0 - eq;
    return azul ? (mx ? max(c.r, c.g) : c.r * eq + c.g * ceq) : (mx ? max(c.r, c.b) : c.r * eq + c.b * ceq);
}
void main() {
    vec4 c = texelFetch(src, ivec2(gl_FragCoord.xy), 0) * 255.0;
    float bruto = 0.5 * outros(c.rgb) - 0.5 * (azul ? c.b : c.g) + 127.5;
    float l = texelFetch(lut, ivec2(int(clamp(floor(bruto + 0.5), 0.0, 255.0)), 0), 0).r * 255.0;
    float al = c.a == 0.0 ? 0.0 : floor(l * c.a / 255.0 + 0.5);
    vec3 rgb = c.rgb;
    if (desc > 0.0 && l < 255.0) {
        float a = max(l / 255.0, 0.08);
        rgb = clamp(rgb + desc * (1.0 - a) / a * (rgb - tela * 255.0), 0.0, 255.0);
    }
    if (amt > 0.0) {
        float s = (azul ? rgb.b : rgb.g) - outros(rgb);
        if (s > 0.0) { if (azul) rgb.b -= amt * s; else rgb.g -= amt * s; }
    }
    o = vec4(rgb, al) / 255.0;
}`;
// mínimo (encolher) / máximo (expandir) 3×1 no alfa, na direção dir; as cores passam iguais
const VE_KEY_FS_MORF = `#version 300 es
precision highp float;
uniform sampler2D src; uniform ivec2 dir; uniform bool minimo; uniform ivec2 tam;
out vec4 o;
void main() {
    ivec2 q = ivec2(gl_FragCoord.xy);
    vec4 c = texelFetch(src, q, 0);
    float a = texelFetch(src, clamp(q - dir, ivec2(0), tam - 1), 0).a, b = texelFetch(src, clamp(q + dir, ivec2(0), tam - 1), 0).a;
    o = vec4(c.rgb, minimo ? min(c.a, min(a, b)) : max(c.a, max(a, b)));
}`;
// gaussiano separável só no alfa (as bordas repetem o último pixel)
const VE_KEY_FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D src; uniform ivec2 dir; uniform float sig; uniform int R; uniform ivec2 tam;
out vec4 o;
void main() {
    ivec2 q = ivec2(gl_FragCoord.xy);
    vec4 c = texelFetch(src, q, 0);
    float s = 0.0, wt = 0.0;
    for (int i = -R; i <= R; i++) {
        float g = exp(-float(i * i) / (2.0 * sig * sig));
        s += g * texelFetch(src, clamp(q + dir * i, ivec2(0), tam - 1), 0).a; wt += g;
    }
    o = vec4(c.rgb, s / wt);
}`;
// saída no canvas (desvira: linha 0 da textura = topo da imagem); matte = branco no preto
const VE_KEY_FS_OUT = `#version 300 es
precision highp float;
uniform sampler2D src; uniform bool matte, status; uniform ivec2 tam;
out vec4 o;
void main() {
    ivec2 q = ivec2(gl_FragCoord.xy); q.y = tam.y - 1 - q.y;
    vec4 c = texelFetch(src, q, 0);
    float s = c.a < 0.02 ? 0.0 : c.a > 0.98 ? 1.0 : 0.5;
    o = status ? vec4(vec3(s), 1.0) : matte ? vec4(vec3(c.a), 1.0) : c;
}`;
const VEKEYGL = { gl: null, falhou: false };
function veKeyGl() {
    if (VEKEYGL.gl || VEKEYGL.falhou) return VEKEYGL.gl;
    try {
        const cv = document.createElement('canvas');
        const gl = cv.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: true });
        if (!gl) throw new Error('sem WebGL2');
        const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
        const vs = sh(gl.VERTEX_SHADER, VE_KEY_VS);
        const prog = (fs, nomes) => {
            const pr = gl.createProgram();
            gl.attachShader(pr, vs); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
            gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
            const u = {}; nomes.forEach(n => { u[n] = gl.getUniformLocation(pr, n); });
            return { pr, u };
        };
        const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        Object.assign(VEKEYGL, {
            cv, gl, w: 0, h: 0, lutKey: '',
            P: { matte: prog(VE_KEY_FS_MATTE, ['src', 'lut', 'azul', 'mx', 'eq', 'amt', 'desc', 'tela']), morf: prog(VE_KEY_FS_MORF, ['src', 'dir', 'minimo', 'tam']),
                 blur: prog(VE_KEY_FS_BLUR, ['src', 'dir', 'sig', 'R', 'tam']), out: prog(VE_KEY_FS_OUT, ['src', 'matte', 'status', 'tam']) },
            src: tex(), lut: tex(), T: [tex(), tex()], F: [gl.createFramebuffer(), gl.createFramebuffer()],
        });
        return gl;
    } catch (e) {
        console.warn('[chroma key] sem placa (WebGL2), fica no processador:', e && e.message);
        VEKEYGL.falhou = true;
        return null;
    }
}
// null = não deu na placa (o chamador usa veKeyDraw no processador)
function veKeyDrawGL(a, v, env) {
    if (VEKEY.forcarCPU) return null;
    const gl = veKeyGl();
    if (!gl) return null;
    const G = VEKEYGL, k = veKeyCalc(v), { w, h } = env;
    try {
        if (G.w !== w || G.h !== h) {
            G.cv.width = w; G.cv.height = h; G.w = w; G.h = h;
            G.T.forEach((t, i) => {
                gl.bindTexture(gl.TEXTURE_2D, t);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, G.F[i]);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
            });
        }
        gl.viewport(0, 0, w, h);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);   // cores "retas", como o getImageData do processador
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, G.src);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, a.cv);
        const lk = Array.from(k.lut).join(',');
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, G.lut);
        if (G.lutKey !== lk) {
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, k.lut);
            G.lutKey = lk;
        }
        let atual = 0;
        const passo = (prog, ler, ajustar) => {   // desenha numa das texturas T (a outra é a leitura)
            gl.bindFramebuffer(gl.FRAMEBUFFER, G.F[atual]);
            gl.useProgram(prog.pr);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, ler);
            gl.uniform1i(prog.u.src, 0);
            ajustar(prog.u);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            const feito = G.T[atual];
            atual = 1 - atual;
            return feito;
        };
        // 1) matte + reflexo
        let t = passo(G.P.matte, G.src, u => { gl.uniform1i(u.lut, 1); gl.uniform1i(u.azul, k.azul ? 1 : 0); gl.uniform1f(u.eq, k.eq); gl.uniform1f(u.amt, k.spill);
            gl.uniform1i(u.mx, k.max ? 1 : 0); gl.uniform1f(u.desc, k.desc); gl.uniform3f(u.tela, ...k.tela); });
        // 2) encolher / expandir: n vezes, horizontal e vertical
        const ch = Math.round(k.choke * env.q);
        for (let i = 0; i < Math.abs(ch); i++) {
            for (const dir of [[1, 0], [0, 1]]) {
                t = passo(G.P.morf, t, u => { gl.uniform2i(u.dir, dir[0], dir[1]); gl.uniform1i(u.minimo, ch > 0 ? 1 : 0); gl.uniform2i(u.tam, w, h); });
            }
        }
        // 3) suavizar a borda
        const sp = v.status ? 0 : k.suave * env.q;
        if (sp >= 0.05) {
            const R = Math.min(64, Math.ceil(sp * 3));
            for (const dir of [[1, 0], [0, 1]]) {
                t = passo(G.P.blur, t, u => { gl.uniform2i(u.dir, dir[0], dir[1]); gl.uniform1f(u.sig, sp); gl.uniform1i(u.R, R); gl.uniform2i(u.tam, w, h); });
            }
        }
        // 4) no canvas da placa e de lá para o canvas do efeito
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(G.P.out.pr);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(G.P.out.u.src, 0);
        gl.uniform1i(G.P.out.u.matte, v.matte ? 1 : 0);
        gl.uniform1i(G.P.out.u.status, v.status ? 1 : 0);
        gl.uniform2i(G.P.out.u.tam, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const out = veFxOther(a, w, h);
        out.ctx.globalCompositeOperation = 'source-over';
        out.ctx.clearRect(0, 0, w, h);
        out.ctx.drawImage(G.cv, 0, 0);
        return out;
    } catch (e) {
        console.warn('[chroma key] erro na placa, volta ao processador:', e && e.message);
        VEKEYGL.falhou = true;
        return null;
    }
}

const VEFX = { pool: [], collapsed: new Set(), key: '', drag: null };

// Canvases reaproveitados (0 e 1 alternam entre os passos; 2 = área com borda do desfoque)
function veFxCanvas(n, w, h) {
    while (VEFX.pool.length <= n) {
        const cv = document.createElement('canvas');
        VEFX.pool.push({ cv, ctx: cv.getContext('2d', { willReadFrequently: false }) });
    }
    const o = VEFX.pool[n];
    if (o.cv.width !== w || o.cv.height !== h) { o.cv.width = w; o.cv.height = h; }
    return o;
}
// escalas dos canais da aberração cromática, normalizadas pela menor (nenhum canal encolhe: sem borda vazia)
function veFxCaEscalas(v) { const s = ['r', 'g', 'b'].map(k => 1 + (+v[k] || 0) * 0.0045), mn = Math.min(...s); return s.map(x => x / mn); }
function veFxOther(a, w, h) { return veFxCanvas(a === VEFX.pool[0] ? 1 : 0, w, h); }

// c (opcional): os parâmetros animados do clipe (quadros-chave 'fx.<id>.<parâmetro>', editor-motion.js) no instante T
function veFxValues(f, c, T) {
    const d = VE_FX[f.t], v = {};
    d.params.forEach(p => {
        if (p.tipo === 'cor') v[p.k] = f.v && /^#[0-9a-f]{6}$/i.test(f.v[p.k]) ? f.v[p.k] : p.def;
        else v[p.k] = f.v && isFinite(f.v[p.k]) ? +f.v[p.k] : p.def;
        if (c && c.k && p.tipo !== 'cor' && p.tipo !== 'bool') {
            const ks = c.k[`fx.${f.id}.${p.k}`];
            if (ks && ks.length) v[p.k] = veKfValue(ks, veSrcAt(c, T == null ? VE.playhead : T));
        }
    });
    (d.extra || []).forEach(k => { v[k] = f.v && f.v[k] != null ? f.v[k] : {}; });
    return v;
}

function veAfxValues(f) {
    const d = VE_AFX[f.t], v = {};
    d.params.forEach(p => {
        if (p.tipo === 'bool') v[p.k] = f.v && f.v[p.k] ? 1 : 0;
        else v[p.k] = f.v && isFinite(f.v[p.k]) ? +f.v[p.k] : p.def;
    });
    return v;
}

// Efeitos que mudam a imagem (ligados, conhecidos e fora do valor neutro)
function veFxActive(c, T) {
    return ((c && c.fx) || []).filter(f => f.on !== false && VE_FX[f.t] && !VE_FX[f.t].neutro(veFxValues(f, c, T)));
}
function veHasFx(c) { return !!(c && c.fx && c.fx.length); }
function veAfxActive(c) {
    return ((c && c.afx) || []).filter(f => f.on !== false && VE_AFX[f.t] && !VE_AFX[f.t].neutro(veAfxValues(f)));
}
function veHasAfx(c) { return !!(c && c.afx && c.afx.length); }

// ── Modos de mesclagem (Controles de efeito → Opacidade, como no Premiere): c.bm ──
// [id, nome, operação do canvas na prévia]. A exportação (_BLEND_FF em video_cutter.py) usa o blend do ffmpeg com
// a transparência da camada como máscara — a mesma conta do canvas: (1 − α)·fundo + α·mistura(fundo, camada).
// Só os modos que a prévia e a exportação fazem iguais.
const VE_BM = [
    ['normal', 'Normal', 'source-over'],
    ['darken', 'Escurecer', 'darken', 1],
    ['multiply', 'Multiplicação', 'multiply'],
    ['colorburn', 'Superexposição de cores', 'color-burn'],
    ['lighten', 'Clarear', 'lighten', 1],
    ['screen', 'Tela', 'screen'],
    ['colordodge', 'Subexposição de cores', 'color-dodge'],
    ['add', 'Subexposição linear (Adicionar)', 'lighter'],
    ['overlay', 'Sobrepor', 'overlay', 1],
    ['softlight', 'Luz suave', 'soft-light'],
    ['hardlight', 'Luz direta', 'hard-light'],
    ['difference', 'Diferença', 'difference', 1],
    ['exclusion', 'Exclusão', 'exclusion'],
];   // o 4º campo marca o começo de um grupo (linha no menu)
const VE_BM_MAPA = Object.fromEntries(VE_BM.map(b => [b[0], b]));
const veBmAtivo = c => !!(c && c.bm && c.bm !== 'normal' && VE_BM_MAPA[c.bm]);
const veBmGco = c => (veBmAtivo(c) ? VE_BM_MAPA[c.bm][2] : null);

// Clipe de vídeo "puro": ocupa o quadro todo, sem efeitos (vai direto na base da exportação)
function veIsPlain(c) { return veIsDefaultProps(c) && !veFxActive(c).length && !veBmAtivo(c) && !(typeof veMoTem === 'function' && veMoTem(c)); }
// vídeo com transparência (.mov ProRes 4444/PNG, WebM com alfa): não cobre o que está embaixo
function veTemAlfa(c) { const m = veMediaOf(c); return !!(m && m.info && m.info.alfa); }

// Prévia: aplica os efeitos na mídia e devolve o que desenhar no lugar dela.
// alvo = pixels do monitor por pixel da mídia: os efeitos rodam só na resolução em que a mídia aparece
// (em degraus de 1/8, para não recriar os canvases a cada quadro de uma escala animada)
function veFxRender(c, src, sz, alvo, T) {
    const fx = veFxActive(c, T).filter(f => !VE_FX[f.t].constante && !VE_FX[f.t].ovt && !VE_FX[f.t].aoDesenhar);
    if (!fx.length) return src;
    fx.sort((x, y) => (x.t === 'onda') - (y.t === 'onda'));   // Ondulação por último, como na exportação (_filtro_onda)
    let q = Math.min(1, 1920 / Math.max(sz.w, sz.h));
    if (alvo > 0) q = Math.min(q, Math.max(0.125, Math.ceil(alvo * 8) / 8));
    const w = Math.max(1, Math.round(sz.w * q)), h = Math.max(1, Math.round(sz.h * q));
    let a = veFxCanvas(0, w, h);
    a.ctx.clearRect(0, 0, w, h);
    a.ctx.drawImage(src, 0, 0, w, h);
    const env = { c, w, h, q, mw: sz.w, mh: sz.h, T: T == null ? VE.playhead : T };
    // efeitos que vazam da camada (brilho, contorno, desfoques do motion: margem(v, env) em px da mídia): o canvas
    // cresce em volta antes deles; quem desenha usa cv._mais (px da mídia de cada lado)
    let mais = 0;
    fx.forEach(f => {
        const d = VE_FX[f.t], v = veFxValues(f, c, T), m = d.margem ? Math.ceil(Math.max(0, d.margem(v, env)) * q) : 0;
        if (m > 0) {
            const g = veFxOther(a, env.w + 2 * m, env.h + 2 * m);
            g.ctx.setTransform(1, 0, 0, 1, 0, 0);
            g.ctx.clearRect(0, 0, g.cv.width, g.cv.height);
            g.ctx.drawImage(a.cv, m, m);
            a = g; env.w += 2 * m; env.h += 2 * m; mais += m;
        }
        a = d.draw(a, v, env);
    });
    a.cv._mais = mais / q;
    return a.cv;
}

// Sombra projetada ativa do clipe: {cor, op, ang, dist, tam} ou null (desenhada com a camada)
function veSombraDe(c, T) {
    const f = veFxActive(c, T).find(f => f.t === 'sombra');
    return f ? veFxValues(f, c, T) : null;
}
// Liga o shadow* do canvas para a próxima camada. k = pixels do canvas por pixel do quadro (o shadow* não segue a
// transformação do contexto). Desvio do desfoque = tamanho / 2 (shadowBlur = 2 × desvio, pela especificação).
function veSombraAplicar(ctx, s, k) {
    if (!s) return;
    const a = s.ang * Math.PI / 180;
    ctx.shadowColor = veTxRGBA(s.cor, s.op / 100);
    ctx.shadowBlur = s.tam * k;
    ctx.shadowOffsetX = -Math.cos(a) * s.dist * k;
    ctx.shadowOffsetY = Math.sin(a) * s.dist * k;
}

// Para a exportação: [{t, v}] só dos efeitos ativos
function veFxExport(c) {
    return veFxActive(c).filter(f => !VE_FX[f.t].constante && !VE_FX[f.t].ovt).map(f => {
        const d = VE_FX[f.t], v = veFxValues(f);
        return { id: f.id, t: f.t, v: d.exportar ? d.exportar(v) : v };
    });
}

// Parâmetros de efeito animados que a exportação faz sozinha (animaFF): [{id, t, p: {param: [[t, v, interp, bezier]]}}]
// com o tempo contado do início da camada (video_cutter._fx_animados)
function veFxKfExport(c) {
    const out = [];
    ((c && c.fx) || []).forEach(f => {
        const d = VE_FX[f.t];
        if (f.on === false || !d || !d.animaFF) return;
        const p = {};
        d.animaFF.forEach(k => {
            const ks = c.k && c.k[`fx.${f.id}.${k}`];
            if (ks && ks.length) p[k] = ks.map(q => [(q.t - c.s) / veVel(c), q.v, q.i || 'lin', veKfCurve(q)]);
        });
        if (Object.keys(p).length) out.push({ id: f.id, t: f.t, v: veFxValues(f), p });
    });
    return out;
}

function veAfxExport(c) {
    // efeitos do Premiere (editor-afx-pr.js): vão com os valores 0..1; o Hard Limiter vira o 'limiter' do Kanivete
    return veAfxActive(c).map(f => ({ t: f.t, v: veAfxValues(f) }))
        .map(f => f.t.startsWith('pr_') && typeof veAprParaKanivete === 'function' ? veAprParaKanivete(f) : f);
}

// ── aplicar / editar ──
function veFxNewId() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Aplicar num clipe que faz parte da seleção (arrastar até ele ou duplo clique na lista) vale para TODOS os
// selecionados, como no Premiere; os que não aceitam o efeito (travados, sem som...) ficam de fora.
// Os Controles de efeito continuam mostrando o clipe principal.
function veFxAlvos(c) {
    const sel = veSelLista();
    return sel.length > 1 && sel.includes(c) ? sel : [c];
}
function veFxMsgVarios(nome, ok, lista) {
    const fora = lista.length - ok.length;
    return `${nome} ${veT('aplicado em')} ${ok.length} ${veT('clipes')}` + (fora ? ` (${fora} ${veT('não aceitam o efeito')})` : '');
}

function veFxAdd(i, t) {
    const c = VE.clips[i];
    if (!c || !VE_FX[t]) return;
    if (VE.info && VE.info.audio_only) { veToast('Efeitos de vídeo precisam de um vídeo ou imagem'); return; }
    const painel = VE_FX[t].painel, lista = veFxAlvos(c);
    const aceita = x => !veLocked(x) && !veIsAudio(x) && !(VE_FX[t].soClipe && veIsAdj(x)) && !(VE_FX[t].soAjuste && !veIsAdj(x));
    if (lista.length === 1) {
        if (veLocked(c)) { veAvisoBloqueio(); return; }
        if (veIsAudio(c)) { veToast('Efeitos de vídeo não se aplicam a um clipe de áudio'); return; }
        if (VE_FX[t].soClipe && veIsAdj(c)) { veToast(`${VE_FX[t].nome} não se aplica a uma camada de ajuste`); return; }
        if (VE_FX[t].soAjuste && !veIsAdj(c)) { veToast(`${VE_FX[t].nome} vai numa camada de ajuste (dá zoom em tudo o que está embaixo)`); return; }
        if (painel && c.fx && c.fx.some(f => f.t === t)) {   // um só por clipe: abre o painel dele
            VE.sel = i;
            vedShow(painel);
            veRefresh();
            return;
        }
    }
    // efeito de painel (um só por clipe): entra só nos que ainda não têm
    const ok = lista.filter(x => aceita(x) && !(painel && x.fx && x.fx.some(f => f.t === t)));
    if (!ok.length) { veToast(`${VE_FX[t].nome}: ${veT('nenhum clipe selecionado aceita o efeito')}`); return; }
    vePushHistory();
    ok.forEach(x => {
        const v = {};
        VE_FX[t].params.forEach(p => { v[p.k] = p.def; });
        x.fx = [...(x.fx || []), { id: veFxNewId(), t, on: true, v }];
    });
    if (lista.length === 1) VE.sel = i;
    vedShow(painel || 'props');
    veRefresh();
    veToast(lista.length > 1 ? veFxMsgVarios(VE_FX[t].nome, ok, lista) : `${VE_FX[t].nome} aplicado em ${veNomeClipe(c)} ${i + 1}`);
}

function veAfxAdd(i, t) {
    const c = VE.clips[i];
    if (!c || !VE_AFX[t]) return;
    const lista = veFxAlvos(c);
    if (lista.length === 1) {
        if (veLocked(c)) { veAvisoBloqueio(); return; }
        if (!veOcupaA(c) || !veTemSom(c)) { veToast('Efeitos de áudio precisam de um clipe com som'); return; }
    }
    const ok = lista.filter(x => !veLocked(x) && veOcupaA(x) && veTemSom(x));
    if (!ok.length) { veToast('Efeitos de áudio precisam de um clipe com som'); return; }
    vePushHistory();
    ok.forEach(x => {
        const v = {};
        VE_AFX[t].params.forEach(p => { v[p.k] = p.def; });
        x.afx = [...(x.afx || []), { id: veFxNewId(), t, on: true, v }];
    });
    if (lista.length === 1) VE.sel = i;
    vedShow('props');
    veRefresh();
    if (veMixAtivo()) veAudioEditou();
    veToast(lista.length > 1 ? veFxMsgVarios(VE_AFX[t].nome, ok, lista) : `${VE_AFX[t].nome} aplicado em ${veNomeClipe(c)} ${i + 1}`);
}

// Troca o efeito `id` do clipe selecionado sem mexer no array antigo (clipes cortados compartilham)
function veFxEdit(id, fn) {
    const c = VE.clips[VE.sel];
    if (!c || !c.fx) return null;
    c.fx = c.fx.map(f => f.id === id ? fn({ ...f, v: { ...f.v } }) : f);
    return c;
}

function veAfxEdit(id, fn) {
    const c = VE.clips[VE.sel];
    if (!c || !c.afx) return null;
    c.afx = c.afx.map(f => f.id === id ? fn({ ...f, v: { ...f.v } }) : f);
    return c;
}

function veFxAction(id, act) {
    const c = VE.clips[VE.sel];
    if (!c || !c.fx) return;
    const j = c.fx.findIndex(f => f.id === id);
    if (j < 0) return;
    if (act === 'open') { const d = VE_FX[c.fx[j].t]; if (d.abrir) d.abrir(c, c.fx[j]); else vedShow(d.painel); return; }
    if (act === 'gotas') { veKeyGotas(id); return; }
    if (act === 'fold') {
        VEFX.collapsed.has(id) ? VEFX.collapsed.delete(id) : VEFX.collapsed.add(id);
        VEFX.key = '';
        veRenderFxControls();
        return;
    }
    vePushHistory();
    if (act === 'on') veFxEdit(id, f => ({ ...f, on: f.on === false }));
    else if (act === 'reset') veFxEdit(id, f => { VE_FX[f.t].params.forEach(p => { f.v[p.k] = p.def; }); (VE_FX[f.t].extra || []).forEach(k => delete f.v[k]); return f; });
    else if (act === 'del') { c.fx = c.fx.filter(f => f.id !== id); if (!c.fx.length) delete c.fx; }
    else if (act === 'up' || act === 'down') {
        const k = act === 'up' ? j - 1 : j + 1;
        if (k < 0 || k >= c.fx.length) return;
        const a = [...c.fx];
        [a[j], a[k]] = [a[k], a[j]];
        c.fx = a;
    }
    veRefresh();
}

function veAfxAction(id, act) {
    const c = VE.clips[VE.sel];
    if (!c || !c.afx) return;
    const j = c.afx.findIndex(f => f.id === id);
    if (j < 0) return;
    if (act === 'fold') {
        VEFX.collapsed.has(id) ? VEFX.collapsed.delete(id) : VEFX.collapsed.add(id);
        VEFX.key = '';
        veRenderFxControls();
        return;
    }
    vePushHistory();
    if (act === 'on') veAfxEdit(id, f => ({ ...f, on: f.on === false }));
    else if (act === 'reset') veAfxEdit(id, f => { VE_AFX[f.t].params.forEach(p => { f.v[p.k] = p.def; }); return f; });
    else if (act === 'del') { c.afx = c.afx.filter(f => f.id !== id); if (!c.afx.length) delete c.afx; }
    else if (act === 'up' || act === 'down') {
        const k = act === 'up' ? j - 1 : j + 1;
        if (k < 0 || k >= c.afx.length) return;
        const a = [...c.afx];
        [a[j], a[k]] = [a[k], a[j]];
        c.afx = a;
    }
    veRefresh();
    if (veMixAtivo()) veAudioEditou();
}

// ── Controles de efeito: lista dos efeitos do clipe selecionado ──
function veFxFmt(p, v) { return String(veRound(v, p.step < 1 ? 1 : 0)); }

function veRenderFxControls() {
    const box = $ve('ve-fxc');
    if (!box) return;
    const c = VE.clips[VE.sel];
    const fx = (c && c.fx) || [], afx = (c && c.afx) || [];
    const kfx = fx.map(f => 'v' + f.id + f.t + (f.on !== false) + VEFX.collapsed.has(f.id)).join(',');
    const kafx = afx.map(f => 'a' + f.id + f.t + (f.on !== false) + VEFX.collapsed.has(f.id)).join(',');
    const key = VE.sel + '|' + kfx + '|' + kafx + '|' + (c && typeof veMoPainelChave === 'function' ? veMoPainelChave(c) : '');
    if (key !== VEFX.key) {
        VEFX.key = key;
        const render = (lista, defs, tipo, titulo) => !lista.length ? '' :
            `<div class="ve-fxc-title">${titulo}</div>` + lista.map((f, j) => {
            const d = defs[f.t];
            if (!d) return '';
            const off = f.on === false;
            const attr = tipo === 'a' ? 'data-afx' : 'data-fx';
            const marca = tipo === 'a' ? 'aud' : 'fx';
            return `<div class="ve-fxe${off ? ' off' : ''}${VEFX.collapsed.has(f.id) ? ' collapsed' : ''}" ${attr}="${f.id}">
                <div class="ve-fxe-head">
                    <button class="ve-fxe-fold" data-fa="fold" title="Recolher/expandir">${VEFX.collapsed.has(f.id) ? '▸' : '▾'}</button>
                    <button class="ve-fxe-on" data-fa="on" title="${off ? 'Ligar' : 'Desligar'} efeito">${marca}</button>
                    <b title="${veT('Clique para selecionar (Ctrl+clique junta outros) · Ctrl+C copia, Ctrl+V cola em outro clipe')}">${d.nome}</b>
                    <button data-fa="up" title="Aplicar antes (subir)" ${j ? '' : 'disabled'}>▲</button>
                    <button data-fa="down" title="Aplicar depois (descer)" ${j < lista.length - 1 ? '' : 'disabled'}>▼</button>
                    <button data-fa="reset" title="Restaurar valores">↺</button>
                    <button data-fa="del" title="Remover efeito">✕</button>
                </div>
                <div class="ve-fxe-body">${d.botao ? `<button class="ve-btn ve-btn-sm ve-fxe-open" data-fa="open">${veT(d.botao)}</button>` : ''}${d.painel ? `
                    <button class="ve-btn ve-btn-sm ve-fxe-open" data-fa="open">Editar no painel ${d.nome}</button>` : d.params.filter(p => !p.oculto).map(p => p.tipo === 'cor' ? `
                    <div class="ve-prop ve-prop-cor">
                        <label>${p.nome}</label>
                        <input type="color" data-fk="${p.k}">
                        ${p.gotas === false ? '' : '<button class="ve-btn ve-btn-sm" data-fa="gotas" title="Conta-gotas: clique na tela verde/azul no monitor">⌖ Conta-gotas</button>'}
                    </div>` : p.tipo === 'bool' ? `
                    <label class="ve-prop-bool"><input type="checkbox" data-fk="${p.k}"> ${p.nome}</label>` : `
                    <div class="ve-prop">
                        <label>${tipo === 'v' && typeof veMoSwHtml === 'function' ? veMoSwHtml(`fx.${f.id}.${p.k}`) : ''}${p.nome}</label>
                        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" data-fk="${p.k}">
                        <span class="ve-prop-num"><input type="${p.vis ? 'text' : 'number'}" ${p.vis ? '' : `min="${p.min}" max="${p.max}" step="${p.step}"`} data-fk="${p.k}"><i>${p.un}</i></span>
                    </div>`).join('')}
                </div></div>`;
        }).join('');
        // camada mãe, fosco de trilha, desfoque de movimento e máscaras (editor-motion.js) vêm antes dos efeitos
        const mo = c && typeof veMoPainelHtml === 'function' ? veMoPainelHtml(c) : '';
        box.innerHTML = mo + render(fx, VE_FX, 'v', 'Efeitos de vídeo') + render(afx, VE_AFX, 'a', 'Efeitos de áudio');
    }
    if (c && typeof veMoPainelValores === 'function') veMoPainelValores(box, c);
    fx.forEach(f => {
        const d = VE_FX[f.t], el = box.querySelector(`[data-fx="${f.id}"]`);
        if (!d || !el) return;
        const v = veFxValues(f, c);
        d.params.forEach(p => el.querySelectorAll(`[data-fk="${p.k}"]`).forEach(inp => {
            if (p.tipo === 'bool') inp.checked = !!v[p.k];
            else if (p.tipo === 'cor') { if (inp.ownerDocument.activeElement !== inp) inp.value = v[p.k]; }
            else if (inp.ownerDocument.activeElement !== inp) inp.value = veFxFmt(p, v[p.k]);
        }));
    });
    afx.forEach(f => {
        const d = VE_AFX[f.t], el = box.querySelector(`[data-afx="${f.id}"]`);
        if (!d || !el) return;
        const v = veAfxValues(f);
        d.params.forEach(p => el.querySelectorAll(`[data-fk="${p.k}"]`).forEach(inp => {
            if (p.tipo === 'bool') inp.checked = !!v[p.k];
            else if (inp.ownerDocument.activeElement !== inp) {
                // efeito do Premiere: o slider anda em 0..1 (o controle dele) e o número mostra Hz/dB/ms
                inp.value = p.vis ? (inp.type === 'range' ? v[p.k] : p.vis(v[p.k])) : veFxFmt(p, v[p.k]);
            }
        }));
    });
    if (typeof veCpSelPintar === 'function') veCpSelPintar();   // efeitos escolhidos para copiar (editor-copiar.js)
}

function veFxSetParam(id, k, val) {
    const c = VE.clips[VE.sel];
    const f = c && c.fx && c.fx.find(x => x.id === id);
    const p = f && VE_FX[f.t] && VE_FX[f.t].params.find(x => x.k === k);
    if (!p) return;
    if (p.tipo === 'cor') { if (!/^#[0-9a-f]{6}$/i.test(val)) return; }
    else if (p.tipo === 'bool') val = val ? 1 : 0;
    else { if (!isFinite(val)) return; val = Math.min(Math.max(val, p.min), p.max); }
    // parâmetro animado (cronômetro ligado): vira/atualiza o quadro-chave na agulha (editor-motion.js)
    if (p.tipo !== 'cor' && p.tipo !== 'bool' && veKfOn(c, `fx.${id}.${k}`)) veApplyProps(c, { [`fx.${id}.${k}`]: val });
    else veFxEdit(id, x => { x.v[k] = val; return x; });
    veRenderFxControls();
    veDrawMonitorSoon();
    if (veHasKf(c)) veDraw();
}

function veAfxSetParam(id, k, val) {
    const c = VE.clips[VE.sel];
    const f = c && c.afx && c.afx.find(x => x.id === id);
    const p = f && VE_AFX[f.t] && VE_AFX[f.t].params.find(x => x.k === k);
    if (!p) return;
    if (p.tipo === 'bool') val = val ? 1 : 0;
    else { if (!isFinite(val)) return; val = Math.min(Math.max(val, p.min), p.max); }
    veAfxEdit(id, x => { x.v[k] = val; return x; });
    veRenderFxControls();
    if (veMixAtivo()) veAudioEditou();
}

// ── painel Efeitos: lista, busca, arrastar até um clipe ──
function veRenderFxList() {
    const q = ($ve('ve-fx-q').value || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
    const cats = {};
    const add = (t, d, tipo) => {
        const alvo = (d.nome + ' ' + d.tag + ' ' + d.cat).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (q && !alvo.includes(q)) return;
        (cats[d.cat] = cats[d.cat] || []).push([t, d, tipo]);
    };
    Object.entries(VE_FX).forEach(([t, d]) => { if (!d.constante && !d.ovt) add(t, d, 'v'); });   // constantes e sobreposição: painel Animação
    Object.entries(VE_AFX).forEach(([t, d]) => add(t, d, 'a'));
    const html = Object.entries(cats).map(([cat, list]) => `<div class="ve-fx-cat">${cat}</div>` +
        list.map(([t, d, tipo]) => `<div class="ve-fx-item" data-${tipo === 'a' ? 'aft' : 'fxt'}="${t}" title="Arraste até um clipe · duplo clique aplica no clipe selecionado"><i>${tipo === 'a' ? 'aud' : 'fx'}</i><span>${d.nome}</span><small>${d.tag}</small></div>`).join('')).join('');
    $ve('ve-fx-list').innerHTML = html || '<div class="ve-clips-empty">Nenhum efeito encontrado.</div>';
}

// Clipe da timeline sob o ponto (-1 se nenhum); doc = documento do ponto (timeline pode estar em janela solta)
function veClipAtClient(x, y, doc) {
    const wrap = $ve('ve-tl-wrap'), r = wrap.getBoundingClientRect();
    if (!VE.ready || wrap.ownerDocument !== doc || !wrap.offsetParent || x < r.left || x > r.right || y < r.top || y > r.bottom) return -1;
    const row = veRowAt(y - r.top);
    if (!row) return -1;
    const i = veClipAtTrack(VE.view + (x - r.left) / VE.pps, veTrackIndex(row), row.kind);
    return i;
}

function veFxInit() {
    veRenderFxList();
    $ve('ve-fx-q').addEventListener('input', veRenderFxList);
    $ve('ve-fx-q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; veRenderFxList(); e.target.blur(); } e.stopPropagation(); });
    const list = $ve('ve-fx-list');
    veCliqueHover(list, '.ve-fx-item');   // tic ao passar o mouse por um efeito
    list.addEventListener('dblclick', e => {
        const it = e.target.closest('[data-fxt],[data-aft]');
        if (!it) return;
        if (VE.sel < 0) { veToast('Selecione um clipe na timeline (ou arraste o efeito até ele)'); return; }
        if (it.dataset.aft) veAfxAdd(VE.sel, it.dataset.aft);
        else veFxAdd(VE.sel, it.dataset.fxt);
    });
    // arrastar o efeito: solta num clipe da timeline ou no Controles de efeito (clipe selecionado)
    list.addEventListener('pointerdown', e => {
        const it = e.target.closest('[data-fxt],[data-aft]');
        if (!it || e.button !== 0) return;
        const win = list.ownerDocument.defaultView, doc = list.ownerDocument;   // painel pode estar em janela solta
        VEFX.drag = { t: it.dataset.aft || it.dataset.fxt, tipo: it.dataset.aft ? 'a' : 'v', x0: e.clientX, y0: e.clientY, on: false, ghost: null };
        const move = ev => {
            const d = VEFX.drag;
            if (!d.on) {
                if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 5) return;
                d.on = true;
                d.ghost = doc.createElement('div');
                d.ghost.className = 've-dghost';
                d.ghost.textContent = (d.tipo === 'a' ? 'aud  ' : 'fx  ') + (d.tipo === 'a' ? VE_AFX[d.t].nome : VE_FX[d.t].nome);
                doc.body.appendChild(d.ghost);
                doc.body.classList.add('ve-fx-dragging');
            }
            d.ghost.style.left = ev.clientX + 12 + 'px';
            d.ghost.style.top = ev.clientY + 10 + 'px';
            const i = veClipAtClient(ev.clientX, ev.clientY, doc);
            $ve('ve-tl-wrap').classList.toggle('fx-drop', i >= 0);
            if (i !== VE.fxHover) { VE.fxHover = i; veDraw(); }
        };
        const up = ev => {
            win.removeEventListener('pointermove', move);
            win.removeEventListener('pointerup', up);
            const d = VEFX.drag;
            VEFX.drag = null;
            VE.fxHover = -1;
            $ve('ve-tl-wrap').classList.remove('fx-drop');
            doc.body.classList.remove('ve-fx-dragging');
            if (!d || !d.on) return;
            d.ghost.remove();
            veDraw();
            const i = veClipAtClient(ev.clientX, ev.clientY, doc);
            const props = doc.elementFromPoint(ev.clientX, ev.clientY)?.closest('#ve-pane-props');
            const aplica = idx => d.tipo === 'a' ? veAfxAdd(idx, d.t) : veFxAdd(idx, d.t);
            if (i >= 0) aplica(i);
            else if (props && VE.sel >= 0) aplica(VE.sel);
            else if (props) veToast('Selecione um clipe na timeline primeiro');
        };
        win.addEventListener('pointermove', move);
        win.addEventListener('pointerup', up);
    });

    // Controles: botões e sliders dos efeitos aplicados (um passo de desfazer por gesto)
    const box = $ve('ve-fxc');
    box.addEventListener('click', e => {
        const b = e.target.closest('[data-fa]');
        if (!b) return;
        const a = b.closest('[data-afx]');
        if (a) veAfxAction(a.dataset.afx, b.dataset.fa);
        else veFxAction(b.closest('[data-fx]').dataset.fx, b.dataset.fa);
    });
    box.addEventListener('input', e => {
        const el = e.target.closest('[data-fk]');
        if (!el) return;
        if (!VE._fxEdit) { vePushHistory(); VE._fxEdit = true; }
        let val = el.type === 'checkbox' ? el.checked : el.type === 'color' ? el.value : parseFloat(String(el.value).replace(',', '.'));
        const a = el.closest('[data-afx]');
        if (a && el.type === 'text') {
            // número na unidade real (efeito do Premiere): volta para 0..1 pela régua; "-inf" = mínimo
            const c = VE.clips[VE.sel], f = c && c.afx && c.afx.find(x => x.id === a.dataset.afx);
            const p = f && VE_AFX[f.t] && VE_AFX[f.t].params.find(x => x.k === el.dataset.fk);
            if (p && p.inv) { if (/^-?(∞|inf)/i.test(String(el.value).trim())) val = 0; else if (isFinite(val)) val = p.inv(val); else return; }
        }
        if (a) veAfxSetParam(a.dataset.afx, el.dataset.fk, val);
        else veFxSetParam(el.closest('[data-fx]').dataset.fx, el.dataset.fk, val);
        if (el.type === 'checkbox') { VE._fxEdit = false; veDrawMonitor(); if (veMixAtivo()) veAudioEditou(); }
    });
    box.addEventListener('change', () => { VE._fxEdit = false; veRenderClips(); veDraw(); if (veMixAtivo()) veAudioEditou(); });
}

// Conta-gotas do Chroma Key: o próximo clique no monitor pega a cor (média 5×5) com o efeito desligado
function veKeyGotas(id) {
    VEFX.gotas = { id, sel: VE.sel };
    $ve('ve-screen').classList.add('ve-gotas');
    veToast('Clique na tela verde/azul no monitor (Esc cancela)');
}
function veKeyGotasFim() {
    VEFX.gotas = null;
    $ve('ve-screen')?.classList.remove('ve-gotas');
}
function veKeyGotasInit() {
    const scr = $ve('ve-screen');
    if (!scr) return;
    scr.addEventListener('pointerdown', e => {
        const g = VEFX.gotas;
        if (!g) return;
        e.stopImmediatePropagation(); e.preventDefault();   // o clique não move a camada nem dá play
        veKeyGotasFim();
        if (e.button !== 0 || VE.sel !== g.sel) return;
        const cv = $ve('ve-canvas'), r = cv.getBoundingClientRect();
        const x = Math.round((e.clientX - r.left) / r.width * cv.width), y = Math.round((e.clientY - r.top) / r.height * cv.height);
        if (x < 0 || y < 0 || x >= cv.width || y >= cv.height) return;
        if (typeof veCacheInvalidate === 'function') veCacheInvalidate();
        veFxEdit(g.id, f => ({ ...f, on: false }));
        veDrawMonitor();
        const px = cv.getContext('2d').getImageData(Math.max(0, x - 2), Math.max(0, y - 2), 5, 5).data;
        veFxEdit(g.id, f => ({ ...f, on: true }));
        let s = [0, 0, 0], n = 0;
        for (let i = 0; i < px.length; i += 4) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n++; }
        const hx = '#' + s.map(c => Math.round(c / n).toString(16).padStart(2, '0')).join('');
        vePushHistory();
        veFxSetParam(g.id, 'cor', hx);
        veRefresh();
        veToast('Cor da tela: ' + hx);
    }, true);
    scr.ownerDocument.addEventListener('keydown', e => { if (e.key === 'Escape' && VEFX.gotas) veKeyGotasFim(); }, true);
}

document.addEventListener('DOMContentLoaded', veFxInit);
document.addEventListener('DOMContentLoaded', veKeyGotasInit);
