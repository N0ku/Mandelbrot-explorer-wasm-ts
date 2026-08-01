// Dedicated WASM worker — one full Go/WASM instance per worker.
// v2: tiles are requested as native sub-rectangles (wasmRenderTile) and the
// pixels come back as raw RGBA in a transferred buffer. No PNG, no base64,
// no re-projection — the only copy is the CopyBytesToJS memcpy in Go.

import "../wasm_exec.js";
import type { RenderTileRequest } from "../shared/renderTypes";

let wasmReady = false;

async function initDedicatedWasm(): Promise<void> {
  try {
    const go = new (self as any).Go();
    const result = await WebAssembly.instantiateStreaming(
      fetch(import.meta.env.BASE_URL + "main.wasm"),
      go.importObject
    );
    // go.run starts main() which registers the bindings synchronously before
    // blocking on its channel — do not await it (it resolves on program exit).
    go.run(result.instance);
    wasmReady = true;
    self.postMessage({ type: "ready" });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: `Dedicated WASM initialization failed: ${error}`,
    });
  }
}

self.onmessage = (e: MessageEvent<RenderTileRequest>) => {
  const msg = e.data;
  if (msg.type !== "renderTile") return;
  try {
    if (!wasmReady) throw new Error("Dedicated WASM not ready");
    const { generation, taskId, view, x0, y0, w, h } = msg;
    const pixels = new Uint8ClampedArray(w * h * 4);
    const kernelMs = (self as any).wasmRenderTile(
      pixels,
      view.totalSize,
      x0,
      y0,
      w,
      h,
      view.zoom,
      view.panX,
      view.panY,
      view.maxIter,
      view.isJulia,
      view.juliaRe,
      view.juliaIm
    );
    if (kernelMs < 0) throw new Error("wasmRenderTile rejected the tile parameters");
    self.postMessage(
      { type: "tileDone", generation, taskId, x0, y0, w, h, pixels, kernelMs },
      { transfer: [pixels.buffer] }
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      generation: msg.generation,
      taskId: msg.taskId,
      error: String(error),
    });
  }
};

initDedicatedWasm();

export {};
