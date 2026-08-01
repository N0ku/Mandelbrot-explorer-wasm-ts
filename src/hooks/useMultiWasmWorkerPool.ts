import { useCallback, useEffect, useRef, useState } from "react";

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

interface TileResult {
  taskId: number;
  imageData: string;
  startX: number;
  startY: number;
  tileSize: number;
  elapsedTime: number;
}

interface WasmWorker {
  worker: Worker;
  id: number;
  busy: boolean;
  ready: boolean;
}

export function useMultiWasmWorkerPool() {
  const [isReady, setIsReady] = useState(false);
  const [numWorkers, setNumWorkers] = useState(0);
  const workersRef = useRef<WasmWorker[]>([]);
  const pendingTasksRef = useRef<
    Map<
      number,
      {
        resolve: (result: TileResult) => void;
        reject: (error: Error) => void;
      }
    >
  >(new Map());
  const taskQueueRef = useRef<TileTask[]>([]);
  const taskIdCounterRef = useRef(0);

  // Initialize multi-WASM worker pool
  useEffect(() => {
    const workerCount = Math.min(navigator.hardwareConcurrency || 4, 6); // Max 6 workers for WASM
    let readyWorkers = 0;

    console.log(
      `Initializing Multi-WASM worker pool with ${workerCount} workers...`
    );

    const workers: WasmWorker[] = [];

    for (let i = 0; i < workerCount; i++) {
      try {
        // Create dedicated WASM worker for tile processing
        const worker = new Worker(
          new URL("../workers/dedicatedWasmWorker.ts", import.meta.url),
          { type: "module" }
        );

        const wasmWorker: WasmWorker = {
          worker,
          id: i,
          busy: false,
          ready: false,
        };

        worker.onmessage = (e) => {
          const {
            type,
            taskId,
            imageData,
            startX,
            startY,
            tileSize,
            elapsedTime,
            error,
          } = e.data;

          switch (type) {
            case "ready":
              wasmWorker.ready = true;
              readyWorkers++;
              console.log(
                `Multi-WASM Worker ${i} ready (${readyWorkers}/${workerCount})`
              );

              if (readyWorkers === workerCount) {
                setIsReady(true);
                setNumWorkers(workerCount);
                console.log(
                  "All Multi-WASM workers ready! Performance should now match JavaScript."
                );
              }
              break;

            case "tileComplete":
              wasmWorker.busy = false;

              const pendingTask = pendingTasksRef.current.get(taskId);
              if (pendingTask) {
                pendingTasksRef.current.delete(taskId);
                pendingTask.resolve({
                  taskId,
                  imageData,
                  startX,
                  startY,
                  tileSize,
                  elapsedTime,
                });
              }

              // Process next task in queue
              processNextTask();
              break;

            case "error":
              wasmWorker.busy = false;

              if (taskId) {
                const pendingTask = pendingTasksRef.current.get(taskId);
                if (pendingTask) {
                  pendingTasksRef.current.delete(taskId);
                  pendingTask.reject(
                    new Error(error || "Multi-WASM worker error")
                  );
                }
              }

              console.error(`Multi-WASM Worker ${i} error:`, error);
              processNextTask();
              break;
          }
        };

        worker.onerror = (error) => {
          console.error(`Multi-WASM Worker ${i} error:`, error);
          wasmWorker.busy = false;
        };

        workers.push(wasmWorker);
      } catch (error) {
        console.error(`Failed to create Multi-WASM worker ${i}:`, error);
      }
    }

    workersRef.current = workers;

    return () => {
      // Cleanup workers
      workers.forEach(({ worker }) => {
        worker.terminate();
      });
      workersRef.current = [];
      pendingTasksRef.current.clear();
      setIsReady(false);
      setNumWorkers(0);
    };
  }, []);

  // Process next task in queue
  const processNextTask = useCallback(() => {
    if (taskQueueRef.current.length === 0) return;

    // Find available worker
    const availableWorker = workersRef.current.find((w) => w.ready && !w.busy);
    if (!availableWorker) return;

    const task = taskQueueRef.current.shift();
    if (!task) return;

    availableWorker.busy = true;
    availableWorker.worker.postMessage({
      type: "generateTile",
      ...task,
    });
  }, []);

  // Submit a tile task to the worker pool
  const submitTileTask = useCallback(
    (task: Omit<TileTask, "taskId">): Promise<TileResult> => {
      return new Promise((resolve, reject) => {
        if (!isReady) {
          reject(new Error("Multi-WASM workers not ready"));
          return;
        }

        const taskId = ++taskIdCounterRef.current;
        const fullTask: TileTask = { ...task, taskId };

        pendingTasksRef.current.set(taskId, { resolve, reject });
        taskQueueRef.current.push(fullTask);

        // Try to process immediately
        processNextTask();
      });
    },
    [isReady, processNextTask]
  );

  // Generate fractal using multi-WASM approach
  const generateMultiWasmFractal = useCallback(
    async (
      fractalType: string,
      size: number,
      zoom: number,
      panX: number,
      panY: number,
      maxIterations: number,
      isJulia: boolean = false,
      juliaRe: number = 0.355,
      juliaIm: number = 0.355
    ): Promise<string> => {
      if (!isReady) {
        throw new Error("Multi-WASM workers not ready");
      }

      const numActiveWorkers = workersRef.current.filter((w) => w.ready).length;

      // Optimize tile size based on number of workers (like JavaScript version)
      const optimalTileSize = Math.ceil(
        size / Math.sqrt(numActiveWorkers * 1.5)
      );
      const tilesPerRow = Math.ceil(size / optimalTileSize);

      console.log(
        `Multi-WASM: Generating ${tilesPerRow}x${tilesPerRow} tiles with ${numActiveWorkers} workers`
      );

      // Create tiles sorted by distance from center (same as JavaScript)
      const tiles: Array<{ startX: number; startY: number; distance: number }> =
        [];
      const centerTile = tilesPerRow / 2;

      for (let i = 0; i < tilesPerRow; i++) {
        for (let j = 0; j < tilesPerRow; j++) {
          const startX = i * optimalTileSize;
          const startY = j * optimalTileSize;
          const distance =
            Math.pow(i - centerTile, 2) + Math.pow(j - centerTile, 2);
          tiles.push({ startX, startY, distance });
        }
      }

      // Sort by distance from center (render center first)
      tiles.sort((a, b) => a.distance - b.distance);

      // Submit all tile tasks to workers
      const tilePromises = tiles.map(({ startX, startY }) => {
        // Ensure tiles always cover the full area without gaps
        const actualTileWidth = Math.min(optimalTileSize, size - startX);
        const actualTileHeight = Math.min(optimalTileSize, size - startY);
        const actualTileSize = Math.max(actualTileWidth, actualTileHeight);

        return submitTileTask({
          startX,
          startY,
          tileSize: actualTileSize,
          totalSize: size,
          fractalType,
          zoom,
          panX,
          panY,
          maxIterations,
          isJulia,
          juliaRe,
          juliaIm,
        });
      });

      // Wait for all tiles to complete (parallel processing)
      const results = await Promise.all(tilePromises);

      console.log(`Multi-WASM: All ${results.length} tiles completed`);

      // Composite tiles into final image
      return await compositeTilesOnCanvas(results, size);
    },
    [isReady, submitTileTask]
  );

  // Composite tile results into final image using canvas
  const compositeTilesOnCanvas = useCallback(
    async (results: TileResult[], size: number): Promise<string> => {
      // Create canvas for compositing
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Fill canvas with black background to avoid gaps
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, size, size);

      console.log(`Multi-WASM: Compositing ${results.length} tiles`);

      // Process each tile result synchronously
      const loadPromises = results.map(
        ({ imageData, startX, startY, tileSize }, index) => {
          return new Promise<void>((resolve, reject) => {
            try {
              // Create image from base64 data
              const img = new Image();
              img.onload = () => {
                // Ensure tiles don't go beyond canvas boundaries
                const drawWidth = Math.min(tileSize, size - startX);
                const drawHeight = Math.min(tileSize, size - startY);

                if (drawWidth > 0 && drawHeight > 0) {
                  ctx.drawImage(
                    img,
                    0,
                    0,
                    drawWidth,
                    drawHeight,
                    startX,
                    startY,
                    drawWidth,
                    drawHeight
                  );
                  console.log(
                    `Tile ${index}: Drawn at (${startX}, ${startY}) size=${drawWidth}x${drawHeight}`
                  );
                }
                resolve();
              };
              img.onerror = (error) => {
                console.error(`Failed to load tile ${index}:`, error);
                reject(new Error(`Failed to load tile image ${index}`));
              };
              img.src = imageData;
            } catch (error) {
              console.error(`Error compositing tile ${index}:`, error);
              reject(error);
            }
          });
        }
      );

      // Wait for all tiles to be drawn
      await Promise.all(loadPromises);

      console.log("Multi-WASM: All tiles composited successfully");

      // Convert final canvas to base64
      return canvas.toDataURL("image/png");
    },
    []
  );

  return {
    isReady,
    numWorkers,
    generateMultiWasmFractal,
    submitTileTask,
  };
}
