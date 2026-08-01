import { useCallback } from "react";
import { FractalExplorer } from "../shared/FractalExplorer";

// WebGL2 route — the same explorer, the same host pipeline and the same
// measurement window as the other engines; only the kernel moves, from the CPU
// to a fragment shader. One context renders one whole frame per pass
// (poolSize 1 → bands 1): this engine parallelises inside the draw call, not
// across workers.
const GlApp = () => {
  const createWorker = useCallback(
    () =>
      new Worker(new URL("./workers/glWorker.ts", import.meta.url), {
        type: "module",
      }),
    []
  );

  return <FractalExplorer engineName="WebGL2" createWorker={createWorker} poolSize={1} />;
};

export default GlApp;
