/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  export interface Window {
    Go: any;
    /**
     * v2 binding — renders the sub-rectangle [x0,x0+w)×[y0,y0+h) of a
     * totalSize² frame straight into dst (raw RGBA via CopyBytesToJS).
     * Returns the kernel time in ms, or -1 on invalid parameters.
     */
    wasmRenderTile: (
      dst: Uint8ClampedArray,
      totalSize: number,
      x0: number,
      y0: number,
      w: number,
      h: number,
      zoom: number,
      panX: number,
      panY: number,
      maxIter: number,
      isJulia: boolean,
      juliaRe: number,
      juliaIm: number
    ) => number;
  }
}
export {};
