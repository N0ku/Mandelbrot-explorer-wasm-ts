package main

import (
	"syscall/js"

	"fractal-generator/wasm"
)

func main() {
	done := make(chan struct{})

	// Single binding: sub-rectangle rendering into a JS buffer, raw RGBA.
	js.Global().Set("wasmRenderTile", js.FuncOf(wasm.RenderTileWasm))

	<-done
}
