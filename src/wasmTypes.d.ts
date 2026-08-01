/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  export interface Window {
    Go: any;
    wasmGenerateMandelbrot: (
      fractalType: string,
      size: number,
      zoom: number,
      panX: number,
      panY: number,
      maxIterations: number,
      isJulia?: boolean,
      juliaRe?: number,
      juliaIm?: number
    ) => string;
    wasmGenerateJulia: (
      fractalType: string,
      size: number,
      zoom: number,
      panX: number,
      panY: number,
      maxIterations: number,
      juliaRe: number,
      juliaIm: number
    ) => string;
  }
}
export {};
