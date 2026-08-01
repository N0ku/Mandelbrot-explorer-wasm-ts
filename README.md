# Mandelbrot Explorer: Go/WebAssembly vs TypeScript

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![WebAssembly](https://img.shields.io/badge/webassembly-%23654FF0.svg?style=for-the-badge&logo=webassembly&logoColor=white)
![Go](https://img.shields.io/badge/go-%2300ADD8.svg?style=for-the-badge&logo=go&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)

A Mandelbrot and Julia explorer built to answer one question honestly: **is
WebAssembly compiled from Go actually faster than plain TypeScript?**

A project I worked on as part of our Technology Watch Report with my classmates:
[Loule95450](https://github.com/Loule95450),
[Jerance](https://github.com/Jerance) and
[HugoTres93](https://github.com/HugoTres93).

The same escape-time kernel is written twice: once in Go, once as a
line-for-line TypeScript transcription, and each engine lives on its own route.
The whole view (position, zoom, iteration depth, Julia constant) is encoded in
the query string, so the exact same frame can be replayed on both engines and
timed.

| Route | Engine |
|---|---|
| `/` | Go compiled to WebAssembly, up to 6 Web Workers, one full WASM instance each |
| `/js` | Pure TypeScript, one Web Worker |

Copy the query string from one route to the other and you are comparing the
same frame, pixel for pixel — both routes share the same adaptive iteration
formula, `min(2000, max(100, floor(1000 × zoom^0.3)))`.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

`public/main.wasm` is committed, so **you do not need Go installed** to run the
explorer. `pnpm build` rebuilds it as part of the production build; to rebuild
just the binary:

```bash
pnpm build:wasm     # GOOS=js GOARCH=wasm go build -ldflags="-s -w"
```

Mouse: drag to pan, scroll (or trackpad pinch) to zoom at the cursor.
Keyboard: `+`/`-` zoom · arrows pan · `s` stats panel · `b`/`n` history ·
`j` Julia · `r` reset.

## v2: the boundary is flat now

The first version of this project measured something surprising: the Go engine
was losing to TypeScript whenever parallelism wasn't hiding its boundary. Each
frame left Go as a PNG re-encoded to base64 inside a JS string — encoded
twice, decoded ten times per frame. Below the worker-pool threshold, the same
kernel lost 107.6 ms to 81.6 ms.

v2 deletes that boundary instead of hiding it:

- **Sub-rectangle rendering.** One binding, `wasmRenderTile`, renders any
  `[x0,x0+w)×[y0,y0+h)` of the frame straight into a `Uint8ClampedArray`
  supplied by the worker (`go/wasm/render.go`, `go/fractal/kernel.go`). The v1
  trick of re-projecting each tile as a zoomed, re-centred full frame is gone.
- **Raw RGBA, one memcpy.** `js.CopyBytesToJS` is the only copy in the
  pipeline. The worker transfers the buffer to the main thread (zero copy),
  which paints it with `putImageData` on a mounted canvas. No PNG, no base64,
  no compositing.
- **The same host pipeline for both engines.** Both routes run the identical
  explorer component; the only difference is the worker factory (6 WASM
  workers vs 1 TS worker). The TypeScript kernel is untouched from v1.

## The kernel, twice

Go — `go/fractal/kernel.go`:

```go
iterations := 0
x2, y2 := x*x, y*y

for x2+y2 < 4 && iterations < maxIter {
	y = 2*x*y + cIm
	x = x2 - y2 + cRe
	x2, y2 = x*x, y*y
	iterations++
}
```

TypeScript — `src/js/lib/ts-strategies.ts`:

```ts
let iterations = 0;
let x2 = x * x, y2 = y * y;

while (x2 + y2 < 4 && iterations < params.maxIter) {
  y = 2 * x * y + cIm;
  x = x2 - y2 + cRe;
  x2 = x * x; y2 = y * y;
  iterations++;
}
```

Three multiplications per iteration on both sides, the same IEEE-754 doubles,
the same escape radius. The same function serves Mandelbrot *and* Julia — only
the initialisation of `(c, z)` is flipped.

## What the numbers say

Measured 2026-08-01, production build, Chromium 131 headless, 12 logical
cores. 1000×1000 frames, shared iteration formula (every row comparable).
Timed window: full-resolution dispatch to the last `putImageData` — the
preview pass is excluded. Each value is the average of 10 generations of the
same view after 3 discarded warm-ups (WASM tier-up and JIT).

| Scene | Go · WASM ×6 | TypeScript | Ratio |
|---|---|---|---|
| The whole set, zoom 1, 1000 iterations | **123.6 ms** | 476.7 ms | 3.9× |
| Off-centre edge, zoom 1, 1000 iterations | **134.8 ms** | 475.7 ms | 3.5× |
| Julia (−0.4 + 0.6i), zoom 1, 1000 iterations | **15.4 ms** | 132.3 ms | 8.6× |
| Deep zoom (2045×), 2000 iterations both | **86.3 ms** | 404.6 ms | 4.7× |
| **One instance each (`?workers=1`)** | **396.9 ms** | 476.7 ms | 1.2× |

The last row is the one v1 lost. With the PNG/base64 boundary gone, a single
WASM instance beats a single TS worker on the same 1000×1000 frame — the win
no longer depends on parallelism.

### How much to trust these

Absolute timings drift with machine state far more than you would like. An
earlier session the same day, same build, gave **109.4 ms** on the reference
scene instead of 123.6 — 13% apart with no code change. That was checked
rather than assumed: the previous commit was rebuilt and re-measured back to
back and produced 123.1 ms, i.e. the machine had slowed, not the code.

So read the **ratio** column, not the milliseconds. Across both sessions the
whole-set ratio moved 3.6× → 3.9×, and every scene kept its ordering.

Other caveats: a residual memcpy on the Go side (~1 ms for 4 MB) where
TypeScript transfers with zero copy; warm-ups of a different nature (WASM
tier-up vs V8 JIT); one machine.

Reproduce it with `node tools/capture.mjs` (screenshots) or the same protocol
by hand: `pnpm build && pnpm preview`, then re-render the identical view with a
`deltaY: 0` wheel event, discard 3, average 10.

## Progressive rendering

The explorer is built for motion:

1. **During a gesture** the last frame is CSS-transformed (translate + scale),
   so pan and zoom have immediate feedback at zero compute cost.
2. **On settle**, the on-screen pixels are re-projected to the new view, then
   a quarter-resolution preview lands within tens of milliseconds.
3. **Full-resolution bands** stream over it, centre-out, painted the moment
   they arrive — no `Promise.all` barrier anywhere.

A generation token makes the last request always win: a new gesture purges the
queue and stale tiles are dropped on arrival, so ghost tiles are impossible.
History and the URL are written once per gesture, not once per mousemove.

## Parallelism: the trap and the answer

Under `GOOS=js GOARCH=wasm` **the Go runtime is single-threaded**. v1 spawned
one goroutine per row - 1000 goroutines for a 1000 px frame - and bought
exactly nothing in throughput; its `grid` strategy even wrapped whole tiles in
a mutex.

The answer is architectural: **up to six complete WASM instances, one per Web
Worker**, each with its own linear memory (there is no `SharedArrayBuffer`
here — no COOP/COEP headers). Since v2 renders sub-rectangles natively, each
worker computes horizontal bands of the frame, sorted centre-out. `?workers=N`
(1..6) pins the pool size for benchmarking.

## URL parameters

| Param | Meaning |
|---|---|
| `x`, `y`, `zoom` | The view (centre in the complex plane, magnification) |
| `size` | Frame side in pixels (100..2000) |
| `julia`, `juliaRe`, `juliaIm` | Julia mode and its constant |
| `iter` | Explicit iteration override (benchmarks); cleared on the next zoom |
| `workers` | WASM pool size 1..6 (route `/` only) |
| `mode` | v1 strategy selector — accepted and ignored, kept for old URLs |

## Known limits & next steps

- **The float64 wall.** Around zoom 1e12–1e13 doubles run out of mantissa and
  the image breaks into flat blocks. Next step: perturbation theory with a
  reference orbit.
- **No smooth colouring.** The palette indexes the integer iteration count, so
  banding is visible. `n + 1 − log₂(log|z|)` is three lines on each side, but
  the kernel would have to return `|z|²` as well.
- **1.9 MB × 6.** Every worker still loads its own copy of the Go runtime
  (down from 2.9 MB after `-ldflags="-s -w"` and deleting the PNG encoder).
  TinyGo would bring it down to tens of kilobytes.
- **`SharedArrayBuffer`.** With COOP/COEP headers a single shared memory would
  replace the six instances, and bands could be written straight into the
  final buffer.
- **DevicePixelRatio.** The canvas backing store is the logical size, so the
  image is stretched on Retina displays. Rendering at DPR would double the
  workload — and would have to be measured again.

## The interface

The HUD borrows its language from the portfolio the project is showcased in:
square panels, corner brackets, Orbitron micro-labels, tabular figures, cyan
for the accent. Two things it does that a plain fractal viewer usually skips:

- **A scale bar**, not just a magnification factor. It picks a round 1/2/5×10ⁿ
  length of the complex plane and draws it — the bar breathes as you zoom and
  snaps to the next round number. `×2.0k` tells you how far you came;
  `2×10⁻⁴` tells you what you are looking at.
- **Coordinates at the precision the zoom actually resolves.** One screen pixel
  is `4/(size·zoom)` units, so the readout carries `⌈log₁₀(size·zoom/4)⌉ + 1`
  decimals — 4 at zoom 1, 7 at zoom 2 000, 16 at zoom 10¹². A fixed four
  decimals stopped distinguishing adjacent pixels at zoom 40, and the URL
  stopped reproducing a shared view at zoom 4 000; both now follow the zoom.

## Stack

Go 1.24 (stdlib only, `syscall/js`) · TypeScript · React 18 · Vite 5 ·
Tailwind CSS v4 · Web Workers. No animation library — the UI motion is CSS.

The project started life from the [wasm-react](https://github.com/akshays-repo/wasm-react)
template, which supplied the initial Go + React + `wasm_exec.js` wiring.

## Contributors

<a href="https://github.com/N0ku"><img src="https://github.com/N0ku.png" width="60" height="60" alt="N0ku" /></a>
<a href="https://github.com/Loule95450"><img src="https://github.com/Loule95450.png" width="60" height="60" alt="Loule95450" /></a>
<a href="https://github.com/Jerance"><img src="https://github.com/Jerance.png" width="60" height="60" alt="Jerance" /></a>
<a href="https://github.com/HugoTres93"><img src="https://github.com/HugoTres93.png" width="60" height="60" alt="HugoTres93" /></a>

[N0ku](https://github.com/N0ku) ·
[Loule95450](https://github.com/Loule95450) ·
[Jerance](https://github.com/Jerance) ·
[HugoTres93](https://github.com/HugoTres93)

## Licence

MIT — see [LICENSE](./LICENSE).
