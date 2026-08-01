// Rust engine worker — loads one of two wasm binaries built from the very
// same source: mandel-simd.wasm (compiled with +simd128, two pixels per
// instruction) or mandel-scalar.wasm (the control). Which one is chosen by the
// worker's `name`, set at construction in SimdApp.
//
// The interface is deliberately raw — no wasm-bindgen, just two exports and
// the module's linear memory — which is why each binary weighs under 20 KB
// against Go's 1.9 MB.

import type { RenderTileRequest } from "../../shared/renderTypes";

interface MandelExports {
  memory: WebAssembly.Memory;
  alloc: (len: number) => number;
  dealloc: (ptr: number, len: number) => void;
  render_rect: (
    ptr: number,
    len: number,
    totalSize: number,
    x0: number,
    y0: number,
    w: number,
    h: number,
    zoom: number,
    panX: number,
    panY: number,
    maxIter: number,
    isJulia: number,
    juliaRe: number,
    juliaIm: number
  ) => number;
}

const variant = self.name === "scalar" ? "scalar" : "simd";
const binary = `mandel-${variant}.wasm`;

let wasm: MandelExports | null = null;
let bufPtr = 0;
let bufLen = 0;

async function init(): Promise<void> {
  try {
    const url = import.meta.env.BASE_URL + binary;
    let instance: WebAssembly.Instance;
    try {
      ({ instance } = await WebAssembly.instantiateStreaming(fetch(url), {}));
    } catch {
      // instantiateStreaming refuses anything not served as application/wasm;
      // fall back rather than dying on a mis-configured host.
      const bytes = await fetch(url).then((r) => r.arrayBuffer());
      ({ instance } = await WebAssembly.instantiate(bytes, {}));
    }
    wasm = instance.exports as unknown as MandelExports;
    self.postMessage({ type: "ready" });
  } catch (error) {
    self.postMessage({ type: "error", error: `Rust wasm initialization failed: ${error}` });
  }
}

self.onmessage = (e: MessageEvent<RenderTileRequest>) => {
  const msg = e.data;
  if (msg.type !== "renderTile") return;
  try {
    if (!wasm) throw new Error("Rust engine not ready");
    const { generation, taskId, view, x0, y0, w, h } = msg;
    const len = w * h * 4;

    if (len !== bufLen) {
      if (bufPtr) wasm.dealloc(bufPtr, bufLen);
      bufPtr = wasm.alloc(len);
      bufLen = len;
    }

    const t0 = performance.now();
    const rc = wasm.render_rect(
      bufPtr,
      len,
      view.totalSize,
      x0,
      y0,
      w,
      h,
      view.zoom,
      view.panX,
      view.panY,
      view.maxIter,
      view.isJulia ? 1 : 0,
      view.juliaRe,
      view.juliaIm
    );
    if (rc !== 0) throw new Error("render_rect rejected the tile parameters");

    // One memcpy out of linear memory — the same single copy Go pays with
    // CopyBytesToJS. The view has to be rebuilt every call: a memory.grow
    // detaches any older one, and the transfer below detaches this buffer.
    const pixels = new Uint8ClampedArray(wasm.memory.buffer, bufPtr, len).slice();
    const kernelMs = performance.now() - t0;

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

init();

export {};
