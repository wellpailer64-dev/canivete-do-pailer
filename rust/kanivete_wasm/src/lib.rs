//! KANIVETE em Rust/WebAssembly — piloto: Camera Raw (LUT 3D trilinear).
//! Sem dependências: memória linear exposta por alloc/dealloc; o JS copia os pixels, chama e copia de volta.
#![allow(clippy::missing_safety_doc)]

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(p: *mut u8, n: usize) {
    drop(Vec::from_raw_parts(p, 0, n));
}

/// Cópia exata de ieCrLut3d (imagem-cameraraw.js): contas em f64 na mesma ordem, arredondamento do Uint8ClampedArray.
/// px: RGBA 8 bits no lugar; lut: N*N*N*3 f32 (índice ((b*N + g)*N + r)*3).
#[no_mangle]
pub unsafe extern "C" fn lut3d_exato(px: *mut u8, npx: usize, lut: *const f32, n: usize) {
    let d = std::slice::from_raw_parts_mut(px, npx * 4);
    let l = std::slice::from_raw_parts(lut, n * n * n * 3);
    let n1 = n - 1;
    let s = n1 as f64 / 255.0;
    let n2 = n * n;
    for p in d.chunks_exact_mut(4) {
        if p[3] == 0 {
            continue;
        }
        let fr = p[0] as f64 * s;
        let fg = p[1] as f64 * s;
        let fb = p[2] as f64 * s;
        let r0 = (fr as usize).min(n1 - 1);
        let g0 = (fg as usize).min(n1 - 1);
        let b0 = (fb as usize).min(n1 - 1);
        let tr = fr - r0 as f64;
        let tg = fg - g0 as f64;
        let tb = fb - b0 as f64;
        let p000 = ((b0 * n2) + g0 * n + r0) * 3;
        let p100 = p000 + 3;
        let p010 = p000 + n * 3;
        let p110 = p010 + 3;
        let p001 = p000 + n2 * 3;
        let p101 = p001 + 3;
        let p011 = p001 + n * 3;
        let p111 = p011 + 3;
        let w000 = (1.0 - tr) * (1.0 - tg) * (1.0 - tb);
        let w100 = tr * (1.0 - tg) * (1.0 - tb);
        let w010 = (1.0 - tr) * tg * (1.0 - tb);
        let w110 = tr * tg * (1.0 - tb);
        let w001 = (1.0 - tr) * (1.0 - tg) * tb;
        let w101 = tr * (1.0 - tg) * tb;
        let w011 = (1.0 - tr) * tg * tb;
        let w111 = tr * tg * tb;
        for c in 0..3 {
            let v = (l[p000 + c] as f64 * w000
                + l[p100 + c] as f64 * w100
                + l[p010 + c] as f64 * w010
                + l[p110 + c] as f64 * w110
                + l[p001 + c] as f64 * w001
                + l[p101 + c] as f64 * w101
                + l[p011 + c] as f64 * w011
                + l[p111 + c] as f64 * w111)
                * 255.0
                + 0.5;
            p[c] = v.clamp(0.0, 255.0).round_ties_even() as u8;
        }
    }
}

/// Versão rápida: f32 + SIMD 128 bits (um vetor por canto do cubo: R,G,B,sobra). Pode diferir 1 nível em raros pixels.
/// A LUT precisa ter 1 f32 de folga no fim (o vetor do último canto lê 4 valores).
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn lut3d_simd(px: *mut u8, npx: usize, lut: *const f32, n: usize) {
    use core::arch::wasm32::*;
    let d = std::slice::from_raw_parts_mut(px, npx * 4);
    let n1 = n - 1;
    let s = n1 as f32 / 255.0;
    let n2 = n * n;
    let half = f32x4_splat(0.5);
    let k255 = f32x4_splat(255.0);
    let zero = f32x4_splat(0.0);
    for p in d.chunks_exact_mut(4) {
        if p[3] == 0 {
            continue;
        }
        let fr = p[0] as f32 * s;
        let fg = p[1] as f32 * s;
        let fb = p[2] as f32 * s;
        let r0 = (fr as usize).min(n1 - 1);
        let g0 = (fg as usize).min(n1 - 1);
        let b0 = (fb as usize).min(n1 - 1);
        let tr = fr - r0 as f32;
        let tg = fg - g0 as f32;
        let tb = fb - b0 as f32;
        let p000 = ((b0 * n2) + g0 * n + r0) * 3;
        let ld = |o: usize| v128_load(lut.add(o) as *const v128);
        let (ur, ug, ub) = (1.0 - tr, 1.0 - tg, 1.0 - tb);
        // interpola em r, depois em g, depois em b (mesmo resultado matemático da soma de 8 pesos)
        let mix = |a: v128, b: v128, t: f32| f32x4_add(a, f32x4_mul(f32x4_sub(b, a), f32x4_splat(t)));
        let c00 = mix(ld(p000), ld(p000 + 3), tr);
        let c10 = mix(ld(p000 + n * 3), ld(p000 + n * 3 + 3), tr);
        let c01 = mix(ld(p000 + n2 * 3), ld(p000 + n2 * 3 + 3), tr);
        let c11 = mix(ld(p000 + n2 * 3 + n * 3), ld(p000 + n2 * 3 + n * 3 + 3), tr);
        let _ = (ur, ug, ub);
        let c0 = mix(c00, c10, tg);
        let c1 = mix(c01, c11, tg);
        let o = mix(c0, c1, tb);
        let v = f32x4_max(zero, f32x4_min(k255, f32x4_add(f32x4_mul(o, k255), half)));
        let i = i32x4_trunc_sat_f32x4(f32x4_nearest(v));
        p[0] = i32x4_extract_lane::<0>(i) as u8;
        p[1] = i32x4_extract_lane::<1>(i) as u8;
        p[2] = i32x4_extract_lane::<2>(i) as u8;
    }
}

/// Versão rápida: f32 + SIMD 128 bits (um vetor por canto do cubo: R,G,B,sobra). Pode diferir 1 nível em raros pixels.
/// A LUT precisa ter 1 f32 de folga no fim (o vetor do último canto lê 4 valores).
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn lut3d_simd_b(px: *mut u8, npx: usize, lut: *const f32, n: usize) {
    use core::arch::wasm32::*;
    let d = std::slice::from_raw_parts_mut(px, npx * 4);
    let n1 = n - 1;
    let s = n1 as f32 / 255.0;
    let n2 = n * n;
    let half = f32x4_splat(0.5);
    let k255 = f32x4_splat(255.0);
    let zero = f32x4_splat(0.0);
    for p in d.chunks_exact_mut(4) {
        if p[3] == 0 {
            continue;
        }
        let fr = p[0] as f32 * s;
        let fg = p[1] as f32 * s;
        let fb = p[2] as f32 * s;
        let r0 = (fr as usize).min(n1 - 1);
        let g0 = (fg as usize).min(n1 - 1);
        let b0 = (fb as usize).min(n1 - 1);
        let tr = fr - r0 as f32;
        let tg = fg - g0 as f32;
        let tb = fb - b0 as f32;
        let p000 = ((b0 * n2) + g0 * n + r0) * 3;
        let ld = |o: usize| v128_load(lut.add(o) as *const v128);
        let (ur, ug, ub) = (1.0 - tr, 1.0 - tg, 1.0 - tb);
        // interpola em r, depois em g, depois em b (mesmo resultado matemático da soma de 8 pesos)
        let mix = |a: v128, b: v128, t: f32| f32x4_add(a, f32x4_mul(f32x4_sub(b, a), f32x4_splat(t)));
        let c00 = mix(ld(p000), ld(p000 + 3), tr);
        let c10 = mix(ld(p000 + n * 3), ld(p000 + n * 3 + 3), tr);
        let c01 = mix(ld(p000 + n2 * 3), ld(p000 + n2 * 3 + 3), tr);
        let c11 = mix(ld(p000 + n2 * 3 + n * 3), ld(p000 + n2 * 3 + n * 3 + 3), tr);
        let _ = (ur, ug, ub);
        let c0 = mix(c00, c10, tg);
        let c1 = mix(c01, c11, tg);
        let o = mix(c0, c1, tb);
        let v = f32x4_max(zero, f32x4_min(k255, f32x4_add(f32x4_mul(o, k255), half)));
        let i = i32x4_trunc_sat_f32x4(v);
        p[0] = i32x4_extract_lane::<0>(i) as u8;
        p[1] = i32x4_extract_lane::<1>(i) as u8;
        p[2] = i32x4_extract_lane::<2>(i) as u8;
    }
}

/// Versão rápida: f32 + SIMD 128 bits (um vetor por canto do cubo: R,G,B,sobra). Pode diferir 1 nível em raros pixels.
/// A LUT precisa ter 1 f32 de folga no fim (o vetor do último canto lê 4 valores).
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub unsafe extern "C" fn lut3d_simd_c(px: *mut u8, npx: usize, lut: *const f32, n: usize) {
    use core::arch::wasm32::*;
    let d = std::slice::from_raw_parts_mut(px, npx * 4);
    let n1 = n - 1;
    let s = n1 as f32 / 255.0;
    let n2 = n * n;
    let half = f32x4_splat(0.5);
    let k255 = f32x4_splat(255.0);
    let zero = f32x4_splat(0.0);
    for p in d.chunks_exact_mut(4) {
        if p[3] == 0 {
            continue;
        }
        let fr = p[0] as f32 * s;
        let fg = p[1] as f32 * s;
        let fb = p[2] as f32 * s;
        let r0 = (fr as usize).min(n1 - 1);
        let g0 = (fg as usize).min(n1 - 1);
        let b0 = (fb as usize).min(n1 - 1);
        let tr = fr - r0 as f32;
        let tg = fg - g0 as f32;
        let tb = fb - b0 as f32;
        let p000 = ((b0 * n2) + g0 * n + r0) * 3;
        let ld = |o: usize| v128_load(lut.add(o) as *const v128);
        let (ur, ug, ub) = (1.0 - tr, 1.0 - tg, 1.0 - tb);
        // interpola em r, depois em g, depois em b (mesmo resultado matemático da soma de 8 pesos)
        let mix = |a: v128, b: v128, t: f32| f32x4_add(a, f32x4_mul(f32x4_sub(b, a), f32x4_splat(t)));
        let c00 = mix(ld(p000), ld(p000 + 3), tr);
        let c10 = mix(ld(p000 + n * 3), ld(p000 + n * 3 + 3), tr);
        let c01 = mix(ld(p000 + n2 * 3), ld(p000 + n2 * 3 + 3), tr);
        let c11 = mix(ld(p000 + n2 * 3 + n * 3), ld(p000 + n2 * 3 + n * 3 + 3), tr);
        let _ = (ur, ug, ub);
        let c0 = mix(c00, c10, tg);
        let c1 = mix(c01, c11, tg);
        let o = mix(c0, c1, tb);
        let v = f32x4_max(zero, f32x4_min(k255, f32x4_add(f32x4_mul(o, k255), half)));
        let i = i32x4_trunc_sat_f32x4(f32x4_nearest(v));
        let _ = i; p[0] = tr as u8;
    }
}

// ───────────── Máximo/Mínimo (van Herk/Gil-Werman, O(1) por pixel, borda replicada) e Mediana (Huang) ─────────────
#[inline(always)]
fn pick(a: f32, b: f32, max: bool) -> f32 {
    if max { if b > a { b } else { a } } else if b < a { b } else { a }
}

/// src, dst: w*h f32. buf: área de trabalho de (max(w,h)+2r) * 3 f32 (linhas) — para a passada vertical usa-se tmp (w*h f32)
/// e g/h com (h+2r)*w f32 cada (gh: 2*(h+2r)*w f32).
#[no_mangle]
pub unsafe extern "C" fn minmax_f32(src: *const f32, dst: *mut f32, tmp: *mut f32, gh: *mut f32, w: usize, h: usize, r: usize, max: u32) {
    let max = max != 0;
    let s = std::slice::from_raw_parts(src, w * h);
    let t = std::slice::from_raw_parts_mut(tmp, w * h);
    let d = std::slice::from_raw_parts_mut(dst, w * h);
    let k = 2 * r + 1;
    // horizontal: por linha, bloco de k sobre a linha estendida (m = w + 2r)
    let m = w + 2 * r;
    let g_all = std::slice::from_raw_parts_mut(gh, 2 * (h + 2 * r).max(1) * w);
    {
        let (g, hh) = g_all.split_at_mut(((h + 2 * r) * w).max(m));
        let (g, hh) = (&mut g[..m.max(1)], &mut hh[..m.max(1)]);
        // g,h precisam de m posições: gh tem pelo menos 2*(h+2r)*w >= 2*m? garantido pelo chamador (ver JS)
        for y in 0..h {
            let row = &s[y * w..(y + 1) * w];
            let ext = |i: usize| -> f32 { let j = if i < r { 0 } else if i - r >= w { w - 1 } else { i - r }; row[j] };
            for i in 0..m {
                let v = ext(i);
                g[i] = if i % k == 0 { v } else { pick(g[i - 1], v, max) };
            }
            for i in (0..m).rev() {
                let v = ext(i);
                hh[i] = if i == m - 1 || (i + 1) % k == 0 { v } else { pick(hh[i + 1], v, max) };
            }
            for x in 0..w {
                t[y * w + x] = pick(hh[x], g[x + k - 1], max);
            }
        }
    }
    // vertical: operações por linha inteira (acesso contíguo)
    let mv = h + 2 * r;
    let (g, hh) = g_all.split_at_mut(mv * w);
    let rowt = |i: usize| -> usize { let j = if i < r { 0 } else if i - r >= h { h - 1 } else { i - r }; j * w };
    for i in 0..mv {
        let o = rowt(i);
        if i % k == 0 {
            g[i * w..(i + 1) * w].copy_from_slice(&t[o..o + w]);
        } else {
            for x in 0..w { g[i * w + x] = pick(g[(i - 1) * w + x], t[o + x], max); }
        }
    }
    for i in (0..mv).rev() {
        let o = rowt(i);
        if i == mv - 1 || (i + 1) % k == 0 {
            hh[i * w..(i + 1) * w].copy_from_slice(&t[o..o + w]);
        } else {
            for x in 0..w { hh[i * w + x] = pick(hh[(i + 1) * w + x], t[o + x], max); }
        }
    }
    for y in 0..h {
        for x in 0..w { d[y * w + x] = pick(hh[y * w + x], g[(y + k - 1) * w + x], max); }
    }
}

/// Mediana quadrada (Huang, histograma corrido) em 8 bits, borda replicada. src/dst: w*h u8.
#[no_mangle]
pub unsafe extern "C" fn mediana_u8(src: *const u8, dst: *mut u8, w: usize, h: usize, r: usize) {
    let s = std::slice::from_raw_parts(src, w * h);
    let d = std::slice::from_raw_parts_mut(dst, w * h);
    let meio = (((2 * r + 1) * (2 * r + 1)) as i32 - 1) / 2;
    let cl = |v: isize, n: usize| -> usize { if v < 0 { 0 } else if v as usize >= n { n - 1 } else { v as usize } };
    let ri = r as isize;
    let mut hist = [0i32; 256];
    for y in 0..h {
        hist.fill(0);
        for dy in -ri..=ri {
            let yy = cl(y as isize + dy, h) * w;
            for dx in -ri..=ri { hist[s[yy + cl(dx, w)] as usize] += 1; }
        }
        let mut m = 0usize;
        let mut menor = 0i32;
        while menor + hist[m] <= meio { menor += hist[m]; m += 1; }
        for x in 0..w {
            d[y * w + x] = m as u8;
            if x == w - 1 { break; }
            let xs = cl(x as isize - ri, w);
            let xe = cl(x as isize + ri + 1, w);
            for dy in -ri..=ri {
                let yy = cl(y as isize + dy, h) * w;
                let sai = s[yy + xs] as usize;
                let entra = s[yy + xe] as usize;
                hist[sai] -= 1; if sai < m { menor -= 1; }
                hist[entra] += 1; if entra < m { menor += 1; }
            }
            while menor > meio { m -= 1; menor -= hist[m]; }
            while menor + hist[m] <= meio { menor += hist[m]; m += 1; }
        }
    }
}
