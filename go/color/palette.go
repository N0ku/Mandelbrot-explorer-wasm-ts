package color

import (
	"image/color"
	"math"
)

// GenerateColorPalette creates a color palette for the fractal
func GenerateColorPalette(maxIterations int) []color.RGBA {
	colors := make([]color.RGBA, maxIterations)
	
	for i := 0; i < maxIterations; i++ {
		hue := float64(i) / 256.0
		saturation := 1.0
		brightness := float64(i) / (float64(i) + 8.0)
		
		c := hsbToRGBOptimized(hue, saturation, brightness)
		colors[i] = c
	}
	
	return colors
}

// hsbToRGBOptimized - optimized HSB to RGB conversion
func hsbToRGBOptimized(h, s, b float64) color.RGBA {
	h = math.Mod(h, 1.0)
	if h < 0 {
		h += 1.0
	}
	
	c := b * s
	x := c * (1 - math.Abs(math.Mod(h*6, 2) - 1))
	m := b - c
	
	var r, g, bl float64
	
	hi := int(h * 6)
	switch hi {
	case 0:
		r, g, bl = c, x, 0
	case 1:
		r, g, bl = x, c, 0
	case 2:
		r, g, bl = 0, c, x
	case 3:
		r, g, bl = 0, x, c
	case 4:
		r, g, bl = x, 0, c
	default:
		r, g, bl = c, 0, x
	}
	
	return color.RGBA{
		R: uint8((r + m) * 255),
		G: uint8((g + m) * 255),
		B: uint8((bl + m) * 255),
		A: 255,
	}
} 