package fractal

import (
	"image/color"

	colorUtils "fractal-generator/color"
)

// View describes a full frame of TotalSize×TotalSize pixels over the complex
// plane. A sub-rectangle of that frame can be rendered independently with
// RenderRect — tiles are addressed in global pixel coordinates, so no
// re-projection is ever needed on the JS side.
type View struct {
	TotalSize        int
	Zoom, PanX, PanY float64
	MaxIter          int
	IsJulia          bool
	JuliaRe, JuliaIm float64
}

// Palette cache — each wasm instance is single-threaded, so a plain
// package-level cache is safe. Rebuilt only when MaxIter changes.
var (
	cachedIter    int
	cachedPalette []color.RGBA
)

func paletteFor(maxIter int) []color.RGBA {
	if cachedPalette == nil || cachedIter != maxIter {
		cachedPalette = colorUtils.GenerateColorPalette(maxIter)
		cachedIter = maxIter
	}
	return cachedPalette
}

// RenderRect renders the sub-rectangle [x0,x0+w)×[y0,y0+h) of the frame
// described by v into buf as tightly packed RGBA rows (len(buf) == w*h*4).
//
// The same escape-time loop serves Mandelbrot and Julia — only the
// initialisation of (c, z) is flipped. scale/center are hoisted out of the
// loops and pixels are written straight into the byte buffer.
func RenderRect(buf []byte, v View, x0, y0, w, h int) {
	scale := 4.0 / (float64(v.TotalSize) * v.Zoom)
	center := float64(v.TotalSize) * 0.5
	maxIter := v.MaxIter
	palette := paletteFor(maxIter)

	idx := 0
	for row := y0; row < y0+h; row++ {
		im := (float64(row)-center)*scale + v.PanY
		for col := x0; col < x0+w; col++ {
			re := (float64(col)-center)*scale + v.PanX

			var cRe, cIm, x, y float64
			if v.IsJulia {
				cRe, cIm = v.JuliaRe, v.JuliaIm
				x, y = re, im
			} else {
				cRe, cIm = re, im
				x, y = 0, 0
			}

			iterations := 0
			x2, y2 := x*x, y*y
			for x2+y2 < 4 && iterations < maxIter {
				y = 2*x*y + cIm
				x = x2 - y2 + cRe
				x2, y2 = x*x, y*y
				iterations++
			}

			if iterations < maxIter {
				c := palette[iterations]
				buf[idx] = c.R
				buf[idx+1] = c.G
				buf[idx+2] = c.B
			} else {
				buf[idx] = 0
				buf[idx+1] = 0
				buf[idx+2] = 0
			}
			buf[idx+3] = 255
			idx += 4
		}
	}
}
