// Dedicated WASM Worker - Each worker loads its own WASM instance
// This enables true parallel processing like the JavaScript version

import "../wasm_exec.js";

interface TileTask {
  taskId: number;
  startX: number;
  startY: number;
  tileSize: number;
  totalSize: number;
  fractalType: string;
  zoom: number;
  panX: number;
  panY: number;
  maxIterations: number;
  isJulia: boolean;
  juliaRe: number;
  juliaIm: number;
}

let goWasm: any = null;
let wasmReady = false;

// Initialize dedicated WASM instance for this worker
async function initDedicatedWasm(): Promise<void> {
  try {
    console.log("Dedicated WASM Worker: Initializing...");

    if (typeof (self as any).Go === "undefined") {
      throw new Error("Go WASM runtime not available");
    }

    goWasm = new (self as any).Go();
    const result = await WebAssembly.instantiateStreaming(
      fetch("/main.wasm"),
      goWasm.importObject
    );

    // Run the Go WASM module in this worker
    goWasm.run(result.instance);
    wasmReady = true;

    console.log("Dedicated WASM Worker: Instance loaded successfully");

    // Notify main thread that this worker is ready
    self.postMessage({ type: "ready" });
  } catch (error) {
    console.error("Dedicated WASM Worker: Failed to load WASM:", error);
    self.postMessage({
      type: "error",
      error: `Dedicated WASM initialization failed: ${error}`,
    });
  }
}

// Process a tile using the dedicated WASM instance
function processTileWithDedicatedWasm(task: TileTask): string {
  if (!wasmReady) {
    throw new Error("Dedicated WASM not ready");
  }

  if (
    typeof (self as any).wasmGenerateMandelbrot !== "function" ||
    typeof (self as any).wasmGenerateJulia !== "function"
  ) {
    throw new Error("WASM fractal functions not available");
  }

  // FIXED: Calculate the correct pan coordinates for this tile
  // We need to adjust the pan to focus on the specific region this tile represents

  // Use the total size passed from the task
  const totalSize = task.totalSize || 1000;

  // Calculate the scale for the global fractal
  const globalScale = 4.0 / (totalSize * task.zoom);

  // Calculate the center of this tile in the global coordinate system
  const tileCenterX = task.startX + task.tileSize / 2;
  const tileCenterY = task.startY + task.tileSize / 2;

  // Convert tile center to complex plane coordinates
  const complexX = (tileCenterX - totalSize / 2) * globalScale + task.panX;
  const complexY = (tileCenterY - totalSize / 2) * globalScale + task.panY;

  // Calculate the zoom level needed to make this tile fit the full image
  const tileZoom = task.zoom * (totalSize / task.tileSize);

  console.log(
    `Worker: Processing tile at (${task.startX}, ${task.startY}) size=${
      task.tileSize
    }, zoom=${tileZoom.toFixed(2)}, center=(${complexX.toFixed(
      6
    )}, ${complexY.toFixed(6)})`
  );

  // Generate fractal for this tile using dedicated WASM
  if (task.isJulia) {
    return (self as any).wasmGenerateJulia(
      task.fractalType,
      task.tileSize,
      tileZoom,
      complexX,
      complexY,
      task.maxIterations,
      task.juliaRe,
      task.juliaIm
    );
  } else {
    return (self as any).wasmGenerateMandelbrot(
      task.fractalType,
      task.tileSize,
      tileZoom,
      complexX,
      complexY,
      task.maxIterations,
      task.isJulia,
      task.juliaRe,
      task.juliaIm
    );
  }
}

// Handle messages from main thread
self.onmessage = (e) => {
  const { type, ...data } = e.data;

  try {
    switch (type) {
      case "generateTile": {
        if (!wasmReady) {
          self.postMessage({
            type: "error",
            taskId: data.taskId,
            error: "Dedicated WASM not ready yet",
          });
          return;
        }

        const startTime = performance.now();
        const imageData = processTileWithDedicatedWasm(data as TileTask);
        const elapsedTime = performance.now() - startTime;

        self.postMessage({
          type: "tileComplete",
          taskId: data.taskId,
          imageData,
          startX: data.startX,
          startY: data.startY,
          tileSize: data.tileSize,
          elapsedTime,
        });
        break;
      }

      default:
        console.warn(`Dedicated WASM Worker: Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error("Dedicated WASM Worker: Error processing task:", error);
    self.postMessage({
      type: "error",
      taskId: data.taskId,
      error: String(error),
    });
  }
};

// Handle worker errors
self.addEventListener("error", (e) => {
  console.error("Dedicated WASM Worker: Global error:", e.message);
  self.postMessage({ type: "error", error: `Worker error: ${e.message}` });
});

// Initialize dedicated WASM when worker starts
initDedicatedWasm();

export {};
