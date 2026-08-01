# Mandelbrot Explorer — Go/WebAssembly vs TypeScript

A Mandelbrot and Julia explorer built to answer one question honestly: **is
WebAssembly compiled from Go actually faster than plain TypeScript?**

The same escape-time kernel is written twice — once in Go, once as a
line-for-line TypeScript transcription — and each engine lives on its own route.
The whole view (position, zoom, strategy, Julia constant) is encoded in the
query string, so the exact same frame can be replayed on both engines and timed.

| Route | Engine |
|---|---|
| `/` | Go compiled to WebAssembly, 6 Web Workers, one full WASM instance each |
| `/js` | Pure TypeScript, one Web Worker |

Copy the query string from one route to the other and you are comparing the same
frame, pixel for pixel.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

`public/main.wasm` is committed, so **you do not need Go installed** to run the
explorer. To rebuild it:

```bash
pnpm build:wasm     # cd go && GOOS=js GOARCH=wasm go build -o ../public/main.wasm
```

Keyboard: `+`/`-` zoom · arrows pan · `s` stats panel · `b`/`n` history ·
`j` Julia · `r` reset.

## The kernel, twice

Go — `go/fractal/generator.go`:

```go
iterations := 0
x2, y2 := x*x, y*y

for x2+y2 < 4 && iterations < fg.Params.MaxIterations {
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

Three multiplications per iteration on both sides (`x2`/`y2` are reused), the
same IEEE-754 doubles, the same escape radius. The comparison isolates the
runtime, not the algorithm. The same function serves Mandelbrot *and* Julia —
only the initialisation of `(c, z)` is flipped.

## What the numbers say

Measured 2026-07-30, Chromium 131 headless, 12 logical cores. 1000×1000 frames,
strategy `auto`, 6 WASM workers. Each value is the average of 10 consecutive
generations at identical parameters, after 3 warm-up runs. The clock is the
app's own (`useStats`, `performance.now`): from trigger to final canvas,
identical on both paths.

| Scene | Go · WASM ×6 | TypeScript |
|---|---|---|
| The whole set, zoom 1, 1000 iterations | **277.6 ms** | 424.2 ms |
| Off-centre edge, zoom 1, 1000 iterations | **249.8 ms** | 424.2 ms |
| Julia (−0.4 + 0.6i), zoom 1, 1000 iterations | **83.3 ms** | 146.4 ms |
| Deep zoom (2044×) — *not comparable, see below* | 164.7 ms | 374.2 ms |
| **400×400 — below the pool threshold, one instance each** | 107.6 ms | **81.6 ms** |

The last row is the interesting one. At 400×400 the app falls back to a single
WASM instance (the pool only kicks in at ≥ 500 px), and the same Go kernel
**loses** to TypeScript. Nothing changed in the arithmetic — what changed is
that parallelism is no longer hiding the boundary.

### The boundary is the real cost

Go hands each frame back as a PNG re-encoded to base64, inside a JS string:

```go
img := generator.GenerateFractal(fractalType)
base64Image := utils.ImageToBase64(img)          // png.Encode + base64
return js.ValueOf("data:image/png;base64," + base64Image)
```

TypeScript hands back the raw buffer, transferred with zero copy:

```ts
self.postMessage({ result }, { transfer: [result.buffer] })
// …straight into ctx.putImageData(imageData, 0, 0)
```

For one 400×400 frame: **31 084 base64 characters** crossing as a string on the
Go side, against **640 000 bytes transferred at zero cost** on the TypeScript
side. The Go engine can win the computation and still lose the frame.

### Honest caveat

The two engines do not choose their iteration depth the same way. The WASM path
is frozen at 1000 iterations (`src/WasmApp.tsx`); the TypeScript path is
adaptive, `min(2000, max(100, floor(1000 × zoom^0.3)))`
(`src/js/hooks/useFractalImage.ts`). **They only coincide at zoom = 1** — which
is the zoom of every comparable row above. The deep-zoom row is published as-is
and marked not comparable: TypeScript does twice the iterations there.

Also note the UI's "Iterations Parameter" field displays the value *before*
clamping, so it can read 9845 where the engine actually runs 2000.

## Parallelism: the trap and the answer

Under `GOOS=js GOARCH=wasm` **the Go runtime is single-threaded**. The `row`
strategy spawns one goroutine per row — 1000 goroutines for a 1000 px frame —
and buys exactly nothing in throughput.

The answer had to be architectural: **six complete WASM instances, one per Web
Worker**, each with its own linear memory. There is no `SharedArrayBuffer` here
(the dev server sets no COOP/COEP headers), so the instances are fully isolated.
Since the Go binding only knows how to render a full square, a *tile* is
requested by re-projecting it as a zoomed, re-centred full frame
(`src/workers/dedicatedWasmWorker.ts`), then composited onto a canvas.

## Generation strategies

The UI exposes five, so you can watch the cost model change: `pixel` (sequential),
`row`, `column`, `grid` (tiled, centre-outwards), and `auto`. On the TypeScript
side `row`/`column`/`grid` are cooperative rather than parallel — the only real
concurrency there is the worker itself.

## Known limits & next steps

- **The float64 wall.** Around zoom 1e12–1e13 doubles run out of mantissa and the
  image breaks into flat blocks. There is no guard. Next step: perturbation
  theory with a reference orbit, or arbitrary-precision arithmetic.
- **No smooth colouring.** The palette indexes the integer iteration count, so
  banding is visible. `n + 1 − log₂(log|z|)` is three lines on each side, but the
  kernel would have to return `|z|²` as well.
- **A mutex that serializes.** In the Go `grid` strategy the mutex wraps the whole
  tile computation rather than the pixel write, so the workers serialize.
  Invisible single-threaded, costly anywhere else.
- **2.9 MB × 6.** Every worker loads its own copy of the full Go runtime. TinyGo,
  or a hand-written kernel with no runtime, would bring that down to tens of KB.
- **`SharedArrayBuffer`.** With COOP/COEP headers a single shared memory would
  replace the six instances, and tiles could be written straight into the final
  buffer.
- **Ship raw RGBA.** The obvious win: return the bytes from linear memory instead
  of a base64 PNG, and delete the boundary this project spent its time measuring.

## Stack

Go 1.21 (stdlib only, `syscall/js`) · TypeScript · React 18 · Vite 6 ·
Tailwind CSS v4 · Web Workers.

The project started life from the [wasm-react](https://github.com/akshays-repo/wasm-react)
template, which supplied the initial Go + React + `wasm_exec.js` wiring.

## Licence

MIT — see [LICENSE](./LICENSE).
