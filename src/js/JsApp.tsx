import { useCallback } from "react";
import { FractalExplorer } from "../shared/FractalExplorer";

// TypeScript route — the same explorer, same host pipeline, same measurement
// window as the WASM route; the only difference is the engine: one TS worker.
const JsApp = () => {
  const createWorker = useCallback(
    () =>
      new Worker(new URL("./workers/mandelbrotWorker.ts", import.meta.url), {
        type: "module",
      }),
    []
  );

  return (
    <FractalExplorer engineName="TypeScript" createWorker={createWorker} poolSize={1} />
  );
};

export default JsApp;
