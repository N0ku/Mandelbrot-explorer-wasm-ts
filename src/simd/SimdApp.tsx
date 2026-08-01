import { useCallback } from "react";
import { FractalExplorer } from "../shared/FractalExplorer";
import { readWorkersParam } from "../shared/workersParam";

// Rust route — the same pool shape as the Go engine (one wasm instance per
// worker), so the two are directly comparable.
//
// ?simd=0 swaps in the scalar binary, compiled from the very same source
// without +simd128. That control is the point: a win on this route could
// otherwise mean "Rust beats Go" just as easily as "vectorised beats scalar",
// and there would be no way to tell which.
const params = new URLSearchParams(window.location.search);
const scalar = params.get("simd") === "0";
const { poolSize, urlExtras } = readWorkersParam();
const extras = scalar ? { ...(urlExtras ?? {}), simd: "0" } : urlExtras;

const SimdApp = () => {
  // The worker reads self.name to pick its binary. Both the URL and the
  // options object have to be static literals for Vite to find and bundle the
  // worker at all — hence two spelled-out call sites rather than one with a
  // computed name.
  const createWorker = useCallback(
    () =>
      scalar
        ? new Worker(new URL("./workers/simdWorker.ts", import.meta.url), {
            type: "module",
            name: "scalar",
          })
        : new Worker(new URL("./workers/simdWorker.ts", import.meta.url), {
            type: "module",
            name: "simd",
          }),
    []
  );

  return (
    <FractalExplorer
      engineName={scalar ? "Rust · scalar" : "Rust · SIMD"}
      createWorker={createWorker}
      poolSize={poolSize}
      urlExtras={extras}
    />
  );
};

export default SimdApp;
