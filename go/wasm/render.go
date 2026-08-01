package wasm

import (
	"syscall/js"
	"time"

	"fractal-generator/fractal"
)

// Scratch buffer reused across calls (grown on demand) — one allocation for
// the life of the instance, not one per tile. Safe: single-threaded runtime.
var scratch []byte

// RenderTileWasm renders a sub-rectangle of the full frame straight into a
// JS Uint8ClampedArray — raw RGBA, no PNG, no base64. The only copy in the
// whole pipeline is the final CopyBytesToJS memcpy.
//
// JS signature:
//
//	wasmRenderTile(dst, totalSize, x0, y0, w, h,
//	               zoom, panX, panY, maxIter,
//	               isJulia, juliaRe, juliaIm) -> kernelMs (float, -1 on error)
//
// dst must be a Uint8ClampedArray of exactly w*h*4 bytes.
func RenderTileWasm(this js.Value, p []js.Value) interface{} {
	if len(p) != 13 {
		return js.ValueOf(-1.0)
	}

	dst := p[0]
	totalSize := p[1].Int()
	x0, y0 := p[2].Int(), p[3].Int()
	w, h := p[4].Int(), p[5].Int()

	v := fractal.View{
		TotalSize: totalSize,
		Zoom:      p[6].Float(),
		PanX:      p[7].Float(),
		PanY:      p[8].Float(),
		MaxIter:   p[9].Int(),
		IsJulia:   p[10].Bool(),
		JuliaRe:   p[11].Float(),
		JuliaIm:   p[12].Float(),
	}

	need := w * h * 4
	if w <= 0 || h <= 0 || totalSize <= 0 || v.MaxIter <= 0 || dst.Length() != need {
		return js.ValueOf(-1.0)
	}

	if cap(scratch) < need {
		scratch = make([]byte, need)
	}
	buf := scratch[:need]

	start := time.Now()
	fractal.RenderRect(buf, v, x0, y0, w, h)
	kernelMs := float64(time.Since(start).Microseconds()) / 1000.0

	js.CopyBytesToJS(dst, buf)
	return js.ValueOf(kernelMs)
}
