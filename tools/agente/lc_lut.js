// Calcula a LUT do Luz e Cor fora do app, com a MESMA conta (frontend/js/editor-lc.js, veLcBuildLut).
// Uso (processo que fica aberto): uma linha JSON por pedido, {"v": {...valores do efeito lc...}, "n": 33};
// responde 4 bytes (tamanho, little-endian) + a LUT em float32 (r varia mais rápido, depois g, depois b).
// Quem usa: tools/agente/cor_auto.py.
const fs = require('fs'), vm = require('vm'), path = require('path'), readline = require('readline');
const ctx = { console, Math, Float32Array, Float64Array, Uint16Array, Uint8Array, Map, Set, JSON, window: {},
    document: new Proxy({}, { get: () => () => null }) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'js', 'editor-lc.js'), 'utf8'), ctx);
const build = vm.runInContext('veLcBuildLut', ctx);
const PADRAO = { temp: 0, tint: 0, exp: 0, ct: 0, hi: 0, sh: 0, wh: 0, bl: 0, sat: 100, fade: 0, vib: 0, piv: 50, hue: 0 };
readline.createInterface({ input: process.stdin }).on('line', l => {
    if (!l.trim()) return;
    const q = JSON.parse(l), lut = build({ ...PADRAO, ...q.v }, q.n || 33);
    const cab = Buffer.alloc(4); cab.writeUInt32LE(lut.length);
    process.stdout.write(Buffer.concat([cab, Buffer.from(lut.buffer, lut.byteOffset, lut.byteLength)]));
});
