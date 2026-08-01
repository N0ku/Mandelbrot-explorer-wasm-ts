// Worker protocol shared by both engines (Go/WASM pool and the TS worker).
// Pixels always travel as raw RGBA in a transferred ArrayBuffer — zero copy.

export interface FractalView {
  /** Side of the full square frame, in pixels. */
  totalSize: number;
  zoom: number;
  panX: number;
  panY: number;
  maxIter: number;
  isJulia: boolean;
  juliaRe: number;
  juliaIm: number;
}

/** main → worker: render the sub-rectangle [x0,x0+w)×[y0,y0+h) of the frame. */
export interface RenderTileRequest {
  type: "renderTile";
  generation: number;
  taskId: number;
  view: FractalView;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** worker → main: the tile's pixels, transferred (postMessage transfer list). */
export interface TileDone {
  type: "tileDone";
  generation: number;
  taskId: number;
  x0: number;
  y0: number;
  w: number;
  h: number;
  pixels: Uint8ClampedArray;
  /** Kernel-only time as measured inside the worker (informative). */
  kernelMs: number;
}

export interface WorkerReady {
  type: "ready";
}

export interface WorkerError {
  type: "error";
  generation?: number;
  taskId?: number;
  error: string;
}

export type EngineMessage = TileDone | WorkerReady | WorkerError;
