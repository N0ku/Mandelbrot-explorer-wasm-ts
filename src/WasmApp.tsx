import { useCallback } from "react";
import { FractalExplorer } from "./shared/FractalExplorer";
import { readWorkersParam } from "./shared/workersParam";

// Go/WASM route — a pool of full WASM instances, one per Web Worker.
// Pool size: min(cores, 6), overridable with ?workers=1..6 — the honest
// "one instance each" comparison against the single-worker TS route.
const { poolSize, urlExtras } = readWorkersParam();

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
