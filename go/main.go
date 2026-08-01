package main

import (
	"syscall/js"

	"fractal-generator/wasm"
)

func main() {
	done := make(chan struct{}, 0)
	
	// Register WebAssembly functions
	js.Global().Set("wasmGenerateMandelbrot", js.FuncOf(wasm.GenerateMandelbrotWasm))
	js.Global().Set("wasmGenerateJulia", js.FuncOf(wasm.GenerateJuliaWasm))
	
	println("Go WASM fractal generator with distinct generation strategies ready!")
	
	<-done
}

