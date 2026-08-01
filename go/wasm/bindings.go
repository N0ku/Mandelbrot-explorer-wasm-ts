package wasm

import (
	"syscall/js"
	"time"

	"fractal-generator/fractal"
	"fractal-generator/types"
	"fractal-generator/utils"
)

// GenerateMandelbrotWasm - WebAssembly function for Mandelbrot generation
func GenerateMandelbrotWasm(this js.Value, p []js.Value) interface{} {
	start := time.Now()
	
	// Parse parameters
	fractalTypeStr := p[0].String()
	size := p[1].Int()
	zoom := p[2].Float()
	panX := p[3].Float()
	panY := p[4].Float()
	maxIterations := p[5].Int()
	
	// Optional parameters with defaults
	isJulia := false
	juliaRe := 0.355
	juliaIm := 0.355
	
	if len(p) > 6 {
		isJulia = p[6].Bool()
	}
	if len(p) > 7 {
		juliaRe = p[7].Float()
	}
	if len(p) > 8 {
		juliaIm = p[8].Float()
	}
	
	// Convert fractal type
	var fractalType types.FractalType
	switch fractalTypeStr {
	case "pixel":
		fractalType = types.PIXEL
	case "row":
		fractalType = types.ROW
	case "column":
		fractalType = types.COLUMN
	case "grid":
		fractalType = types.GRID
	default:
		fractalType = types.AUTO
	}
	
	// Create generator
	generator := fractal.NewFractalGenerator()
	generator.Params = types.FractalParams{
		Size:            size,
		Zoom:            zoom,
		PanX:            panX,
		PanY:            panY,
		MaxIterations:   maxIterations,
		IsJulia:         isJulia,
		JuliaRe:         juliaRe,
		JuliaIm:         juliaIm,
		UseColorPalette: true,
	}
	
	// Generate fractal
	img := generator.GenerateFractal(fractalType)
	base64Image := utils.ImageToBase64(img)
	
	elapsed := time.Since(start)
	println("Go WASM", fractalTypeStr, "generation time:", elapsed.Milliseconds(), "ms")
	
	// Return as data URL
	return js.ValueOf("data:image/png;base64," + base64Image)
}

// GenerateJuliaWasm - WebAssembly function for Julia set generation
func GenerateJuliaWasm(this js.Value, p []js.Value) interface{} {
	start := time.Now()
	
	// Parse parameters
	fractalTypeStr := p[0].String()
	size := p[1].Int()
	zoom := p[2].Float()
	panX := p[3].Float()
	panY := p[4].Float()
	maxIterations := p[5].Int()
	juliaRe := p[6].Float()
	juliaIm := p[7].Float()
	
	// Convert fractal type
	var fractalType types.FractalType
	switch fractalTypeStr {
	case "pixel":
		fractalType = types.PIXEL
	case "row":
		fractalType = types.ROW
	case "column":
		fractalType = types.COLUMN
	case "grid":
		fractalType = types.GRID
	default:
		fractalType = types.AUTO
	}
	
	// Create generator
	generator := fractal.NewFractalGenerator()
	generator.Params = types.FractalParams{
		Size:            size,
		Zoom:            zoom,
		PanX:            panX,
		PanY:            panY,
		MaxIterations:   maxIterations,
		IsJulia:         true,
		JuliaRe:         juliaRe,
		JuliaIm:         juliaIm,
		UseColorPalette: true,
	}
	
	// Generate fractal
	img := generator.GenerateFractal(fractalType)
	base64Image := utils.ImageToBase64(img)
	
	elapsed := time.Since(start)
	println("Go WASM Julia", fractalTypeStr, "generation time:", elapsed.Milliseconds(), "ms")
	
	// Return as data URL
	return js.ValueOf("data:image/png;base64," + base64Image)
} 