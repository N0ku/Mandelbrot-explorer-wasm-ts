// Web Worker for Go WebAssembly fractal generation
// This allows WASM calls to run off the main thread for better performance

// Import WASM helpers
import "../wasm_exec.js";

// Global Go instance
let goWasm: any = null;
let wasmReady = false;

// Initialize WASM when worker starts
async function initWasm(): Promise<void> {
  try {
    if (typeof (self as any).Go === "undefined") {
      throw new Error("Go WASM runtime not available");
    }

    goWasm = new (self as any).Go();
    const result = await WebAssembly.instantiateStreaming(
      fetch("/main.wasm"),
      goWasm.importObject
    );

    // Run the Go WASM module
    goWasm.run(result.instance);
    wasmReady = true;

    console.log("WASM Worker: WebAssembly loaded successfully");
  } catch (error) {
    console.error("WASM Worker: Failed to load WebAssembly:", error);
    throw error;
  }
}

// Initialize WASM on worker startup
initWasm().catch((error) => {
  self.postMessage({ error: `WASM initialization failed: ${error.message}` });
});

// Handle messages from main thread
self.onmessage = async (e) => {
  try {
    if (!wasmReady) {
      self.postMessage({ error: "WASM not ready yet" });
      return;
    }

    const {
      taskId,
      fractalType,
      size,
      zoom,
      panX,
      panY,
      maxIterations,
      isJulia,
      juliaRe,
      juliaIm,
    } = e.data;

    console.log("WASM Worker: Generating fractal...", {
      taskId,
      fractalType,
      size,
      zoom,
      panX,
      panY,
      maxIterations,
      isJulia,
      juliaRe,
      juliaIm,
    });

    let result: string;

    // Use the appropriate WASM function based on fractal type
    if (isJulia) {
      if (typeof (self as any).wasmGenerateJulia !== "function") {
        throw new Error("wasmGenerateJulia function not available");
      }

      result = (self as any).wasmGenerateJulia(
        fractalType,
        size,
        zoom,
        panX,
        panY,
        maxIterations,
        juliaRe,
        juliaIm
      );
    } else {
      if (typeof (self as any).wasmGenerateMandelbrot !== "function") {
        throw new Error("wasmGenerateMandelbrot function not available");
      }

      result = (self as any).wasmGenerateMandelbrot(
        fractalType,
        size,
        zoom,
        panX,
        panY,
        maxIterations,
        isJulia,
        juliaRe,
        juliaIm
      );
    }

    console.log("WASM Worker: Fractal generated successfully");

    // Send result back to main thread
    self.postMessage({
      taskId,
      success: true,
      result,
    });
  } catch (error) {
    console.error("WASM Worker: Error generating fractal:", error);
    self.postMessage({
      taskId: e.data.taskId,
      error: String(error),
    });
  }
};

// Handle worker errors
self.addEventListener("error", (e) => {
  console.error("WASM Worker: Global error:", e.message, e.filename, e.lineno);
  self.postMessage({ error: `Worker error: ${e.message}` });
});

export {}; // Make this a module
