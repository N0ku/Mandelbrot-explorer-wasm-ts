package fractal

import (
	"image"
	"image/color"
	"math"
	"runtime"
	"sort"
	"sync"

	colorUtils "fractal-generator/color"
	"fractal-generator/types"
)

// FractalGenerator handles fractal generation with different strategies
type FractalGenerator struct {
	Params types.FractalParams
}

// NewFractalGenerator creates a new fractal generator
func NewFractalGenerator() *FractalGenerator {
	return &FractalGenerator{
		Params: types.FractalParams{
			Size:            1000,
			Zoom:            1.0,
			PanX:            0.0,
			PanY:            0.0,
			MaxIterations:   1000,
			IsJulia:         false,
			JuliaRe:         0.355,
			JuliaIm:         0.355,
			UseColorPalette: true,
		},
	}
}

// CalculateFractal - optimized fractal calculation for a single point
func (fg *FractalGenerator) CalculateFractal(col, row int) int {
	scale := 4.0 / (float64(fg.Params.Size) * fg.Params.Zoom)
	centerX := float64(fg.Params.Size) * 0.5
	centerY := float64(fg.Params.Size) * 0.5
	
	var cRe, cIm, x, y float64
	
	if fg.Params.IsJulia {
		cRe = fg.Params.JuliaRe
		cIm = fg.Params.JuliaIm
		x = (float64(col) - centerX) * scale + fg.Params.PanX
		y = (float64(row) - centerY) * scale + fg.Params.PanY
	} else {
		cRe = (float64(col) - centerX) * scale + fg.Params.PanX
		cIm = (float64(row) - centerY) * scale + fg.Params.PanY
		x = 0.0
		y = 0.0
	}
	
	iterations := 0
	x2, y2 := x*x, y*y
	
	for x2+y2 < 4 && iterations < fg.Params.MaxIterations {
		y = 2*x*y + cIm
		x = x2 - y2 + cRe
		x2, y2 = x*x, y*y
		iterations++
	}
	
	return iterations
}

// CalculateCenterThreshold calculates adaptive threshold based on zoom and Julia mode
func (fg *FractalGenerator) CalculateCenterThreshold(numTiles int) float64 {
	// For smoother visual results, use a larger radius
	centerRadius := math.Max(float64(numTiles)*0.5, 2.0)
	
	// Square the radius since we're comparing with squared distances
	baseThreshold := centerRadius * centerRadius
	
	// Scale based on zoom - but keep it more conservative
	zoomFactor := math.Min(1.0, 1.0/math.Sqrt(fg.Params.Zoom)) * 1.2
	
	// Julia sets need consistent quality
	juliaFactor := 1.0
	if fg.Params.IsJulia {
		juliaFactor = 2.0 // More consistent quality for Julia sets
	}
	
	return baseThreshold * zoomFactor * juliaFactor
}

// generatePixelFractal - single-threaded, sequential (SLOWEST like Kotlin)
func (fg *FractalGenerator) generatePixelFractal() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, fg.Params.Size, fg.Params.Size))
	colorPalette := colorUtils.GenerateColorPalette(fg.Params.MaxIterations)
	black := color.RGBA{0, 0, 0, 255}
	
	// Single-threaded: process entire image in one go (like Kotlin's single task)
	for row := 0; row < fg.Params.Size; row++ {
		for col := 0; col < fg.Params.Size; col++ {
			iterations := fg.CalculateFractal(col, row)
			
			var pixelColor color.RGBA
			if iterations < fg.Params.MaxIterations && fg.Params.UseColorPalette {
				pixelColor = colorPalette[iterations]
			} else {
				pixelColor = black
			}
			
			img.Set(col, row, pixelColor)
		}
	}
	
	return img
}

// generateRowFractal - fine-grained parallelization like Kotlin (one task per row)
func (fg *FractalGenerator) generateRowFractal() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, fg.Params.Size, fg.Params.Size))
	colorPalette := colorUtils.GenerateColorPalette(fg.Params.MaxIterations)
	black := color.RGBA{0, 0, 0, 255}
	
	// Create one goroutine per row (like Kotlin's 1000 tasks for 1000 rows)
	var wg sync.WaitGroup
	
	for row := 0; row < fg.Params.Size; row++ {
		wg.Add(1)
		go func(r int) {
			defer wg.Done()
			// Process entire row in this goroutine
			for col := 0; col < fg.Params.Size; col++ {
				iterations := fg.CalculateFractal(col, r)
				
				var pixelColor color.RGBA
				if iterations < fg.Params.MaxIterations && fg.Params.UseColorPalette {
					pixelColor = colorPalette[iterations]
				} else {
					pixelColor = black
				}
				
				img.Set(col, r, pixelColor)
			}
		}(row)
	}
	
	wg.Wait()
	return img
}

// generateColumnFractal - fine-grained parallelization like Kotlin (one task per column)
func (fg *FractalGenerator) generateColumnFractal() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, fg.Params.Size, fg.Params.Size))
	colorPalette := colorUtils.GenerateColorPalette(fg.Params.MaxIterations)
	black := color.RGBA{0, 0, 0, 255}
	
	// Create one goroutine per column (like Kotlin's column approach)
	var wg sync.WaitGroup
	
	for col := 0; col < fg.Params.Size; col++ {
		wg.Add(1)
		go func(c int) {
			defer wg.Done()
			// Process entire column in this goroutine
			for row := 0; row < fg.Params.Size; row++ {
				iterations := fg.CalculateFractal(c, row)
				
				var pixelColor color.RGBA
				if iterations < fg.Params.MaxIterations && fg.Params.UseColorPalette {
					pixelColor = colorPalette[iterations]
				} else {
					pixelColor = black
				}
				
				img.Set(c, row, pixelColor)
			}
		}(col)
	}
	
	wg.Wait()
	return img
}

// generateGridFractal - simplified and fixed grid generation (no async complications)
func (fg *FractalGenerator) generateGridFractal() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, fg.Params.Size, fg.Params.Size))
	colorPalette := colorUtils.GenerateColorPalette(fg.Params.MaxIterations)
	black := color.RGBA{0, 0, 0, 255}
	
	// Dynamic tile sizing like Kotlin: size / (CPUs + 1)
	numCPUs := runtime.NumCPU()
	tileSize := fg.Params.Size / (numCPUs + 1)
	if tileSize < 32 {
		tileSize = 32
	}
	if tileSize > 128 {
		tileSize = 128
	}
	
	numTilesX := (fg.Params.Size + tileSize - 1) / tileSize
	numTilesY := (fg.Params.Size + tileSize - 1) / tileSize
	
	// Create tiles sorted by distance from center (like Kotlin)
	type TileJob struct {
		tileX, tileY int
		startX, startY int
		distance float64
	}
	
	var tileJobs []TileJob
	centerTileX := float64(numTilesX) / 2.0
	centerTileY := float64(numTilesY) / 2.0
	
	for tileY := 0; tileY < numTilesY; tileY++ {
		for tileX := 0; tileX < numTilesX; tileX++ {
			startX := tileX * tileSize
			startY := tileY * tileSize
			
			// Calculate distance from center
			dx := float64(tileX) - centerTileX
			dy := float64(tileY) - centerTileY
			distance := dx*dx + dy*dy
			
			tileJobs = append(tileJobs, TileJob{
				tileX: tileX,
				tileY: tileY,
				startX: startX,
				startY: startY,
				distance: distance,
			})
		}
	}
	
	// Sort by distance from center (center-out like Kotlin)
	sort.Slice(tileJobs, func(i, j int) bool {
		return tileJobs[i].distance < tileJobs[j].distance
	})
	
	// Process tiles synchronously in order (like Kotlin's approach)
	var wg sync.WaitGroup
	tileChan := make(chan TileJob, len(tileJobs))
	numWorkers := runtime.NumCPU()
	
	// Create a mutex to protect img writes
	var imgMutex sync.Mutex
	
	// Start workers
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for job := range tileChan {
				// Calculate actual tile bounds
				endX := job.startX + tileSize
				endY := job.startY + tileSize
				if endX > fg.Params.Size {
					endX = fg.Params.Size
				}
				if endY > fg.Params.Size {
					endY = fg.Params.Size
				}
				
				// Process each pixel in the tile directly to the image
				imgMutex.Lock()
				for row := job.startY; row < endY; row++ {
					for col := job.startX; col < endX; col++ {
						iterations := fg.CalculateFractal(col, row)
						
						var pixelColor color.RGBA
						if iterations < fg.Params.MaxIterations && fg.Params.UseColorPalette {
							pixelColor = colorPalette[iterations]
						} else {
							pixelColor = black
						}
						
						img.Set(col, row, pixelColor)
					}
				}
				imgMutex.Unlock()
			}
		}()
	}
	
	// Submit all jobs
	go func() {
		defer close(tileChan)
		for _, job := range tileJobs {
			tileChan <- job
		}
	}()
	
	wg.Wait()
	return img
}

// GenerateFractal generates fractal based on type with distinct implementations
func (fg *FractalGenerator) GenerateFractal(fractalType types.FractalType) *image.RGBA {
	switch fractalType {
	case types.PIXEL:
		return fg.generatePixelFractal()
	case types.ROW:
		return fg.generateRowFractal()
	case types.COLUMN:
		return fg.generateColumnFractal()
	case types.GRID:
		return fg.generateGridFractal()
	case types.AUTO:
		// Choose best strategy based on size and CPU count (following Kotlin performance hierarchy)
		numCPUs := runtime.NumCPU()
		if fg.Params.Size <= 200 {
			return fg.generatePixelFractal() // Single-threaded for very small images
		} else if numCPUs >= 4 && fg.Params.Size >= 500 {
			return fg.generateGridFractal() // Grid is fastest for large images with many CPUs
		} else if fg.Params.Size >= 300 {
			return fg.generateRowFractal() // Row for medium to large images
		} else {
			return fg.generateColumnFractal() // Column for smaller images
		}
	default:
		return fg.generatePixelFractal()
	}
} 