package types

// FractalType enum
type FractalType int

const (
	PIXEL FractalType = iota
	ROW
	COLUMN
	GRID
	AUTO
)

// FractalParams holds parameters for fractal generation
type FractalParams struct {
	Size            int
	Zoom            float64
	PanX            float64
	PanY            float64
	MaxIterations   int
	IsJulia         bool
	JuliaRe         float64
	JuliaIm         float64
	UseColorPalette bool
}

// TileResult represents a completed tile with its position and image data
type TileResult struct {
	StartX, StartY int
	Width, Height  int
	Pixels         []interface{} // Using interface{} for color compatibility
}

// TileTask represents a tile processing task like Kotlin's FractalTask
type TileTask struct {
	TileX, TileY       int
	StartX, StartY     int
	TileSize           int
	MaxIterations      int
	Distance           float64
	AdjustedIterations int
} 