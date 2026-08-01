//! The escape-time kernel in Rust, compiled to WebAssembly twice from this one
//! file: once with `+simd128` and once without. Two binaries from identical
//! source is the whole point — without the scalar control there is no way to
//! tell "vectorised beat scalar" apart from "Rust beat Go".
//!
//! There is no wasm-bindgen here. The entire interface is two exported
//! functions plus the module's linear memory, which is why the artefact weighs
//! tens of kilobytes against Go's 1.9 MB: no runtime, no garbage collector, no
//! JS glue generated on the side.
//!
//! Byte-for-byte compatibility with `go/fractal/kernel.go` is deliberate: the
//! same palette, and the same *truncating* float→u8 conversion Go performs, so
//! the two engines must produce identical images. Any drift is a bug.

use std::mem;

// ── The exported memory interface ───────────────────────────────────────────
// JS allocates once per tile size, writes nothing, and reads the pixels back
// out of linear memory after each render. The buffer is leaked on purpose: it
// lives as long as the worker does.

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(len);
    let p = v.as_mut_ptr();
    mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

// ── Palette ─────────────────────────────────────────────────────────────────
// hue = i/256 (wrapping), saturation = 1, brightness = i/(i+8) — the formula
// inherited from the original Kotlin project, still unchanged. Cached per
// max_iter; a wasm instance is single-threaded, so a plain static is safe.

static mut PALETTE: Option<(u32, Vec<u8>)> = None;

fn build_palette(max_iter: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity(max_iter as usize * 3);
    for i in 0..max_iter {
        let h = (i as f64 / 256.0) % 1.0;
        let b = i as f64 / (i as f64 + 8.0);
        // With saturation == 1 the HSB conversion collapses: c == b, m == 0.
        let x = b * (1.0 - ((h * 6.0) % 2.0 - 1.0).abs());
        let (r, g, bl) = match (h * 6.0) as i32 {
            0 => (b, x, 0.0),
            1 => (x, b, 0.0),
            2 => (0.0, b, x),
            3 => (0.0, x, b),
            4 => (x, 0.0, b),
            _ => (b, 0.0, x),
        };
        // `as u8` truncates toward zero, exactly like Go's uint8(...) — this
        // is what keeps the two engines bit-identical rather than ±1 apart.
        out.push((r * 255.0) as u8);
        out.push((g * 255.0) as u8);
        out.push((bl * 255.0) as u8);
    }
    out
}

fn palette_for(max_iter: u32) -> &'static [u8] {
    unsafe {
        let stale = match &*std::ptr::addr_of!(PALETTE) {
            Some((cached, _)) => *cached != max_iter,
            None => true,
        };
        if stale {
            PALETTE = Some((max_iter, build_palette(max_iter)));
        }
        match &*std::ptr::addr_of!(PALETTE) {
            Some((_, p)) => p.as_slice(),
            None => unreachable!(),
        }
    }
}

// ── The kernel ──────────────────────────────────────────────────────────────

/// Scalar escape-time loop — the reference, and the whole kernel when the
/// crate is built without `simd128`.
#[inline(always)]
fn escape(c_re: f64, c_im: f64, mut x: f64, mut y: f64, max_iter: u32) -> u32 {
    let mut iterations = 0u32;
    let mut x2 = x * x;
    let mut y2 = y * y;
    while x2 + y2 < 4.0 && iterations < max_iter {
        y = 2.0 * x * y + c_im;
        x = x2 - y2 + c_re;
        x2 = x * x;
        y2 = y * y;
        iterations += 1;
    }
    iterations
}

/// Vectorised escape-time loop — two pixels per instruction.
///
/// A v128 register holds 128 bits, so exactly two f64 lanes: the ceiling here
/// is ×2, not ×4. The hard part is *divergence*: neighbouring pixels escape at
/// different iterations, and a vector cannot branch per lane. So the loop runs
/// while ANY lane is still inside (`v128_any_true`), and every update is
/// masked with `v128_bitselect` — a lane that has escaped keeps its last x, y
/// and stops incrementing its counter, while the other lane carries on.
///
/// The cost of that trick: a pair costs as much as its slowest lane. It pays
/// off because neighbouring pixels are usually alike — which is exactly why
/// the pair is taken along a row, not across one.
#[cfg(target_feature = "simd128")]
#[inline(always)]
fn escape_pair(c_re: [f64; 2], c_im: [f64; 2], z: [[f64; 2]; 2], max_iter: u32) -> [u32; 2] {
    use std::arch::wasm32::*;
    {
        let c_re = f64x2(c_re[0], c_re[1]);
        let c_im = f64x2(c_im[0], c_im[1]);
        let mut x = f64x2(z[0][0], z[0][1]);
        let mut y = f64x2(z[1][0], z[1][1]);
        let mut x2 = f64x2_mul(x, x);
        let mut y2 = f64x2_mul(y, y);

        let four = f64x2_splat(4.0);
        let two = f64x2_splat(2.0);
        let one = f64x2_splat(1.0);
        let mut n = f64x2_splat(0.0);

        for _ in 0..max_iter {
            // Which lanes are still inside? An all-ones mask per lane.
            let active = f64x2_lt(f64x2_add(x2, y2), four);
            if !v128_any_true(active) {
                break;
            }
            // Count only the lanes still running: 1.0 where active, 0.0 where not.
            n = f64x2_add(n, v128_and(one, active));

            // Both lanes compute the update; bitselect then throws away the
            // result for lanes that had already escaped.
            let ny = f64x2_add(f64x2_mul(two, f64x2_mul(x, y)), c_im);
            let nx = f64x2_add(f64x2_sub(x2, y2), c_re);
            x = v128_bitselect(nx, x, active);
            y = v128_bitselect(ny, y, active);

            x2 = f64x2_mul(x, x);
            y2 = f64x2_mul(y, y);
        }

        [
            f64x2_extract_lane::<0>(n) as u32,
            f64x2_extract_lane::<1>(n) as u32,
        ]
    }
}

/// Renders the sub-rectangle [x0,x0+w)×[y0,y0+h) of a total_size² frame into
/// the buffer at `ptr` as tightly packed RGBA rows. Same contract, same
/// coordinate convention and same output as Go's RenderRect.
#[no_mangle]
pub unsafe extern "C" fn render_rect(
    ptr: *mut u8,
    len: usize,
    total_size: u32,
    x0: u32,
    y0: u32,
    w: u32,
    h: u32,
    zoom: f64,
    pan_x: f64,
    pan_y: f64,
    max_iter: u32,
    is_julia: u32,
    julia_re: f64,
    julia_im: f64,
) -> i32 {
    if len != (w as usize) * (h as usize) * 4 {
        return -1;
    }
    let buf = std::slice::from_raw_parts_mut(ptr, len);
    let palette = palette_for(max_iter);

    let scale = 4.0 / (total_size as f64 * zoom);
    let center = total_size as f64 * 0.5;
    let julia = is_julia != 0;

    let mut idx = 0usize;
    for row in y0..y0 + h {
        let im = (row as f64 - center) * scale + pan_y;

        let mut col = x0;
        #[cfg(target_feature = "simd128")]
        {
            // Two pixels at a time along the row; the odd tail falls through
            // to the scalar loop below.
            while col + 1 < x0 + w {
                let re0 = (col as f64 - center) * scale + pan_x;
                let re1 = (col as f64 + 1.0 - center) * scale + pan_x;
                let counts = if julia {
                    escape_pair(
                        [julia_re, julia_re],
                        [julia_im, julia_im],
                        [[re0, re1], [im, im]],
                        max_iter,
                    )
                } else {
                    escape_pair([re0, re1], [im, im], [[0.0, 0.0], [0.0, 0.0]], max_iter)
                };
                for &n in counts.iter() {
                    write_pixel(buf, &mut idx, n, max_iter, palette);
                }
                col += 2;
            }
        }

        while col < x0 + w {
            let re = (col as f64 - center) * scale + pan_x;
            let n = if julia {
                escape(julia_re, julia_im, re, im, max_iter)
            } else {
                escape(re, im, 0.0, 0.0, max_iter)
            };
            write_pixel(buf, &mut idx, n, max_iter, palette);
            col += 1;
        }
    }
    0
}

#[inline(always)]
fn write_pixel(buf: &mut [u8], idx: &mut usize, n: u32, max_iter: u32, palette: &[u8]) {
    let i = *idx;
    if n < max_iter {
        let p = (n as usize) * 3;
        buf[i] = palette[p];
        buf[i + 1] = palette[p + 1];
        buf[i + 2] = palette[p + 2];
    } else {
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
    }
    buf[i + 3] = 255;
    *idx = i + 4;
}
