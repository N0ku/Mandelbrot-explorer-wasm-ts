// TypeScript engine worker — v2 speaks the same renderTile protocol as the
// WASM pool, but the kernel underneath is untouched (ts-strategies.ts). It
// renders full frames only (the TS pool has a single worker, bands = 1).

import { generateFractalTS } from "../lib/ts-strategies";
import type { RenderTileRequest } from "../../shared/renderTypes";

self.onmessage = async (e: MessageEvent<RenderTileRequest>) => {
  const msg = e.data;
  if (msg.type !== "renderTile") return;
  try {
    const { generation, taskId, view, x0, y0, w, h } = msg;
    if (x0 !== 0 || y0 !== 0 || w !== view.totalSize || h !== view.totalSize) {
      throw new Error("TS engine renders full frames only (bands must be 1)");
    }
    const t0 = performance.now();
    const pixels = await generateFractalTS("auto", {
      size: view.totalSize,
      zoom: view.zoom,
      center: { x: view.panX, y: view.panY },
      maxIter: view.maxIter,
      isJulia: view.isJulia,
      juliaRe: view.juliaRe,
      juliaIm: view.juliaIm,
    });
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

self.postMessage({ type: "ready" });
