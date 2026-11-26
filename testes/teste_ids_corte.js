// Verifica identidades de clipe nas operações reais, sem abrir o aplicativo.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const s = fs.readFileSync('frontend/js/editor.js', 'utf8');
const trecho = (a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));
const ctx = {
    VE: { ready: true, clips: [], sel: -1 }, VE_EPS: 1e-6, VE_SOBRA: 1e-4,
    veEnd: c => c.st + c.e - c.s, veSrcAt: (c, t) => c.s + t - c.st,
    veSemTin: c => c, veSemTout: c => c, veConflita: () => true,
    veClamp: t => t, veSnapFrame: t => t, veFrame: () => 1 / 30, veLocked: () => false,
    veLkMapa: () => c => c, vePushHistory: () => {}, veLegRipple: () => {},
    veRelayout: () => {}, veAfterEdit: () => {}, veToast: () => {}
};
vm.createContext(ctx);
vm.runInContext(trecho('function veLkSobra(', 'function veSeparar('), ctx);
vm.runInContext(trecho('function vePlaceClip(', 'const veCopiaClipe'), ctx);
vm.runInContext(trecho('function veRippleRemove(', '// D / Delete:'), ctx);
const original = () => ({ tr: 0, st: 0, s: 0, e: 10, _mcpId: 'original' });
ctx.VE.clips = [original()];
ctx.veRippleRemove(3, 5);
assert.strictEqual(ctx.VE.clips[0]._mcpId, 'original');
assert.strictEqual(ctx.VE.clips[1]._mcpId, undefined);
ctx.VE.clips = [original()];
ctx.veRippleRemove(0, 2);
assert.strictEqual(ctx.VE.clips[0]._mcpId, 'original');
ctx.VE.clips = [original()];
ctx.vePlaceClip({ tr: 0, st: 3, s: 0, e: 2, _mcpId: 'novo' });
assert.strictEqual(ctx.VE.clips[0]._mcpId, 'original');
assert.strictEqual(ctx.VE.clips[1]._mcpId, undefined);
assert.strictEqual(ctx.VE.clips[2]._mcpId, 'novo');
ctx.VE.clips = [original()];
ctx.vePlaceClip({ tr: 0, st: 0, s: 0, e: 2, _mcpId: 'novo' });
assert.strictEqual(ctx.VE.clips[0]._mcpId, 'original');
console.log('Identidades em cortes e sobrescritas: OK');
