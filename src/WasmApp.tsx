import { useCallback } from "react";
import { FractalExplorer } from "./shared/FractalExplorer";

// Go/WASM route — a pool of full WASM instances, one per Web Worker.
// Pool size: min(cores, 6), overridable with ?workers=1..6 — the honest
// "one instance each" comparison against the single-worker TS route.
const params = new URLSearchParams(window.location.search);
const rawWorkers = params.get("workers");
const parsedWorkers = rawWorkers === null ? NaN : parseInt(rawWorkers, 10);
const defaultWorkers = Math.min(navigator.hardwareConcurrency || 4, 6);
const poolSize = Number.isNaN(parsedWorkers)
  ? defaultWorkers
  : Math.min(6, Math.max(1, parsedWorkers));
const urlExtras = rawWorkers !== null ? { workers: String(poolSize) } : undefined;

const WasmApp = () => {
  const createWorker = useCallback(
    () =>
      new Worker(new URL("./workers/dedicatedWasmWorker.ts", import.meta.url), {
        type: "module",
      }),
    []
  );

  return (
    <FractalExplorer
      engineName="Go · WASM"
      createWorker={createWorker}
      poolSize={poolSize}
      urlExtras={urlExtras}
    />
  );
};

export default WasmApp;
