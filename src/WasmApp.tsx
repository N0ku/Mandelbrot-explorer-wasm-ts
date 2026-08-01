import { useEffect, useState, useRef, useCallback } from "react";
import "./wasm_exec.js"; // Import the wasm_exec.js file for Go-Wasm compatibility
import "./wasmTypes.d.ts"; // Import the TypeScript declarations for WebAssembly

// Import existing components from js folder
import { StatsPanel } from "./js/components/StatsPanel";
import { ControlsPanel } from "./js/components/ControlsPanel";
import { NavigationControls } from "./js/components/NavigationControls";
import { FractalImage } from "./js/components/FractalImage";
import { InfoBar } from "./js/components/InfoBar";
import { DownloadButton } from "./js/components/DownloadButton";

// Import existing hooks
import { useZoomPan } from "./js/hooks/useZoomPan";
import { useHistory } from "./js/hooks/useHistory";
import { useInteractionState } from "./js/hooks/useInteractionState";
import { useStats } from "./js/hooks/useStats";
import { useMultiWasmWorkerPool } from "./hooks/useMultiWasmWorkerPool";

// WASM Worker management
let wasmWorker: Worker | null = null;
let taskIdCounter = 0;
const pendingTasks = new Map<
  number,
  {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }
>();

// Initialize WASM Worker for better performance (off main thread)
function initWasmWorker(): void {
  if (wasmWorker) return;

  try {
    wasmWorker = new Worker(
      new URL("./workers/wasmWorker.ts", import.meta.url),
      {
        type: "module",
      }
    );

    wasmWorker.onmessage = (e) => {
      const { taskId, success, result, error } = e.data;

      if (taskId && pendingTasks.has(taskId)) {
        const { resolve, reject } = pendingTasks.get(taskId)!;
        pendingTasks.delete(taskId);

        if (success) {
          resolve(result);
        } else {
          reject(new Error(error || "WASM worker error"));
        }
      } else if (error) {
        console.error("WASM Worker error:", error);
      }
    };

    wasmWorker.onerror = (error) => {
      console.error("WASM Worker error:", error);
    };

    console.log("WASM Worker initialized successfully");
  } catch (error) {
    console.error("Failed to initialize WASM Worker:", error);
    wasmWorker = null;
  }
}

// Enhanced fractal generation functions using workers
function generateMandelbrotFractal(
  fractalType: string = "auto",
  size: number = 1000,
  zoom: number = 1.0,
  panX: number = 0.0,
  panY: number = 0.0,
  maxIterations: number = 1000,
  isJulia: boolean = false,
  juliaRe: number = 0.355,
  juliaIm: number = 0.355
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Fallback to direct WASM call if worker not available
    if (!wasmWorker) {
      try {
        const result = window.wasmGenerateMandelbrot(
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
        resolve(result);
      } catch (error) {
        reject(error);
      }
      return;
    }

    // Use worker for better performance
    const taskId = ++taskIdCounter;
    pendingTasks.set(taskId, { resolve, reject });

    wasmWorker.postMessage({
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
  });
}

function generateJuliaFractal(
  fractalType: string = "auto",
  size: number = 1000,
  zoom: number = 1.0,
  panX: number = 0.0,
  panY: number = 0.0,
  maxIterations: number = 1000,
  juliaRe: number = 0.355,
  juliaIm: number = 0.355
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Fallback to direct WASM call if worker not available
    if (!wasmWorker) {
      try {
        const result = window.wasmGenerateJulia(
          fractalType,
          size,
          zoom,
          panX,
          panY,
          maxIterations,
          juliaRe,
          juliaIm
        );
        resolve(result);
      } catch (error) {
        reject(error);
      }
      return;
    }

    // Use worker for better performance
    const taskId = ++taskIdCounter;
    pendingTasks.set(taskId, { resolve, reject });

    wasmWorker.postMessage({
      taskId,
      fractalType,
      size,
      zoom,
      panX,
      panY,
      maxIterations,
      isJulia: true,
      juliaRe,
      juliaIm,
    });
  });
}

const WasmApp = () => {
  const params = new URLSearchParams(window.location.search);
  const initialPanX = parseFloat(params.get("x") ?? "0");
  const initialPanY = parseFloat(params.get("y") ?? "0");
  const initialZoom = parseFloat(params.get("zoom") ?? "1");
  const initialMode = params.get("mode") as
    | "pixel"
    | "row"
    | "grid"
    | "column"
    | "auto";

  const initialIsJulia = params.get("julia") === "true";
  const initialJuliaRe = parseFloat(params.get("juliaRe") ?? "0.355");
  const initialJuliaIm = parseFloat(params.get("juliaIm") ?? "0.355");
  const initialSize = parseInt(params.get("size") ?? "1000");

  const [fractalType, setFractalType] = useState<
    "pixel" | "row" | "grid" | "column" | "auto"
  >(
    initialMode &&
      ["pixel", "row", "grid", "column", "auto"].includes(initialMode)
      ? initialMode
      : "auto"
  );

  // WASM state
  const [isWasmLoaded, setIsWasmLoaded] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [size, setSize] = useState<number>(initialSize);
  const [maxIterations] = useState<number>(1000);
  const [isJulia, setIsJulia] = useState(initialIsJulia);
  const [juliaRe, setJuliaRe] = useState<number>(initialJuliaRe);
  const [juliaIm, setJuliaIm] = useState<number>(initialJuliaIm);
  const [showStats, setShowStats] = useState(true);

  const imageContainerRef = useRef<HTMLDivElement>(null);
  const iterations = useRef(0);

  // Setup custom hooks from existing codebase
  const { isInteracting, startInteraction, endInteraction } =
    useInteractionState();

  const { stats, startGeneration, endGeneration, resetStats } = useStats();

  // Multi-WASM worker pool for true parallel processing
  const {
    isReady: multiWasmReady,
    numWorkers,
    generateMultiWasmFractal,
  } = useMultiWasmWorkerPool();

  const {
    zoom,
    panX,
    panY,
    mousePosition,
    dragOffset,
    isDraggingRef,
    zoomAtPoint,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    moveInDirection,
    setState,
  } = useZoomPan({
    size,
    onInteractionStart: startInteraction,
    onInteractionEnd: endInteraction,
    initialZoom: !isNaN(initialZoom) ? initialZoom : 1.0,
    initialPanX: !isNaN(initialPanX) ? initialPanX : 0,
    initialPanY: !isNaN(initialPanY) ? initialPanY : 0,
  });

  const { saveState, goBack, goForward, canGoBack, canGoForward } =
    useHistory();

  // useEffect hook to load WebAssembly when the component mounts
  useEffect(() => {
    async function loadWasm(): Promise<void> {
      try {
        const goWasm = new window.Go();
        const result = await WebAssembly.instantiateStreaming(
          fetch("main.wasm"),
          goWasm.importObject
        );
        goWasm.run(result.instance);
        setIsWasmLoaded(true);
        console.log("WebAssembly loaded successfully");

        // Initialize WASM Worker for better performance
        initWasmWorker();
      } catch (error) {
        console.error("Failed to load WebAssembly:", error);
      }
    }

    loadWasm();
  }, []);

  // Generate fractal when parameters change
  const generateFractal = useCallback(async () => {
    if (!isWasmLoaded || isGenerating) return;

    setIsGenerating(true);
    startGeneration(maxIterations, multiWasmReady ? numWorkers : 1);

    console.log("Generating fractal...", {
      fractalType,
      size,
      zoom,
      panX,
      panY,
      maxIterations,
      isJulia,
      juliaRe,
      juliaIm,
      multiWorkerMode: multiWasmReady,
      numWorkers: multiWasmReady ? numWorkers : 1,
    });

    try {
      let result: string;

      // Use multi-WASM workers if available for better performance
      if (multiWasmReady && size >= 500) {
        console.log(
          `Using Multi-WASM Workers (${numWorkers} workers) for better performance!`
        );
        result = await generateMultiWasmFractal(
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
      } else {
        // Fallback to single WASM instance
        console.log("Using single WASM instance (fallback)");
        if (isJulia) {
          result = await generateJuliaFractal(
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
          result = await generateMandelbrotFractal(
            fractalType,
            size,
            zoom,
            panX,
            panY,
            maxIterations,
            false,
            juliaRe,
            juliaIm
          );
        }
      }

      console.log(
        "Generated fractal result:",
        result.substring(0, 100) + "..."
      ); // Log first 100 chars of result
      setImageUrl(result);
      iterations.current = maxIterations;
      console.log("Fractal generated successfully");
    } catch (error) {
      console.error("Error generating fractal:", error);
    }

    endGeneration(fractalType);
    setIsGenerating(false);
  }, [
    isWasmLoaded,
    fractalType,
    size,
    zoom,
    panX,
    panY,
    maxIterations,
    isJulia,
    juliaRe,
    juliaIm,
    multiWasmReady,
    numWorkers,
    generateMultiWasmFractal,
  ]);

  // Generate fractal only when core parameters change (not on every state update)
  useEffect(() => {
    if (!isWasmLoaded || isInteracting) return;

    console.log("Parameters changed, scheduling fractal generation...");

    // Generate after interaction ends with a small delay
    const timeout = setTimeout(() => {
      generateFractal();
    }, 150);

    return () => clearTimeout(timeout);
  }, [
    isWasmLoaded,
    fractalType,
    size,
    zoom,
    panX,
    panY,
    maxIterations,
    isJulia,
    juliaRe,
    juliaIm,
    isInteracting,
  ]);

  // Save state for history
  useEffect(() => {
    saveState({ zoom, panX, panY });
  }, [zoom, panX, panY, saveState]);

  // Synchronize parameters with URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("x", panX.toFixed(6));
    params.set("y", panY.toFixed(6));
    params.set("zoom", zoom.toFixed(6));
    params.set("mode", fractalType);
    params.set("iter", (iterations.current || 0).toString());
    params.set("size", size.toString());
    params.set("julia", isJulia.toString());
    params.set("juliaRe", juliaRe.toFixed(6));
    params.set("juliaIm", juliaIm.toFixed(6));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, [panX, panY, zoom, fractalType, size, isJulia, juliaRe, juliaIm]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+":
          zoomAtPoint(1.2, mousePosition.x, mousePosition.y);
          break;
        case "-":
          zoomAtPoint(0.8, mousePosition.x, mousePosition.y);
          break;
        case "s":
          setShowStats((prev) => !prev);
          break;
        case "ArrowUp":
          moveInDirection("up");
          break;
        case "ArrowDown":
          moveInDirection("down");
          break;
        case "ArrowLeft":
          moveInDirection("left");
          break;
        case "ArrowRight":
          moveInDirection("right");
          break;
        case "b": {
          const prevState = goBack();
          if (prevState) setState(prevState);
          break;
        }
        case "n": {
          const nextState = goForward();
          if (nextState) setState(nextState);
          break;
        }
        case "j":
          setIsJulia(!isJulia);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    mousePosition,
    zoomAtPoint,
    moveInDirection,
    goBack,
    goForward,
    setState,
    isJulia,
  ]);

  // Handle wheel events
  const handleImageContainerWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    handleWheel(e, imageContainerRef);
  };

  // Handle mouse move events
  const handleImageContainerMouseMove = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    handleMouseMove(e, imageContainerRef, size);
  };

  // Handle navigation
  const handleGoBack = () => {
    const prevState = goBack();
    if (prevState) setState(prevState);
  };

  const handleGoForward = () => {
    const nextState = goForward();
    if (nextState) setState(nextState);
  };

  // Handle download
  const handleDownload = useCallback(() => {
    if (!imageUrl) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `fractal-${
      isJulia ? "julia" : "mandelbrot"
    }-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageUrl, isJulia]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      <div
        ref={imageContainerRef}
        className="w-full h-full flex items-center justify-center"
        onWheel={handleImageContainerWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleImageContainerMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <FractalImage
          imageUrl={imageUrl}
          isDragging={isDraggingRef.current}
          dragOffset={dragOffset}
          isInteracting={isInteracting}
          size={size}
        />

        {(isGenerating || !isWasmLoaded) && (
          <div className="fixed bottom-6 right-6 flex items-center bg-black/80 text-white p-3 rounded-lg border border-purple-500 shadow-lg">
            <div className="animate-spin h-6 w-6 mr-3 rounded-full border-2 border-t-transparent border-purple-500"></div>
            <div className="text-xs">
              <div>{!isWasmLoaded ? "Loading WASM..." : "Generating..."}</div>
              <div>Zoom: {zoom.toFixed(2)}x</div>
              <div>X: {panX.toFixed(4)}</div>
              <div>Y: {panY.toFixed(4)}</div>
            </div>
          </div>
        )}

        {/* Debug info */}
        {imageUrl && (
          <div className="fixed top-20 left-4 bg-green-900/50 text-green-300 p-2 rounded text-xs">
            Image loaded: {imageUrl.substring(0, 50)}...
          </div>
        )}
      </div>

      {/* WASM Status indicator */}
      <div className="fixed top-4 left-4 z-50">
        {isWasmLoaded ? (
          <div className="flex items-center px-3 py-2 bg-green-900/50 border border-green-500 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            <span className="text-green-300 text-sm font-medium">
              {multiWasmReady
                ? `Multi-WASM Ready (${numWorkers} workers)`
                : "WASM Ready (single)"}
            </span>
          </div>
        ) : (
          <div className="flex items-center px-3 py-2 bg-yellow-900/50 border border-yellow-500 rounded-lg">
            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
            <span className="text-yellow-300 text-sm font-medium">
              Loading WASM...
            </span>
          </div>
        )}
      </div>
      <ControlsPanel
        fractalType={fractalType}
        setFractalType={setFractalType}
        zoom={zoom}
        size={size}
        setSize={setSize}
        mousePosition={mousePosition}
        zoomAtPoint={zoomAtPoint}
        showStats={showStats}
        setShowStats={setShowStats}
        isJulia={isJulia}
        setIsJulia={setIsJulia}
        juliaRe={juliaRe}
        setJuliaRe={setJuliaRe}
        juliaIm={juliaIm}
        setJuliaIm={setJuliaIm}
        iterations={iterations.current}
      />

      {/* Navigation and controls */}
      <div className="fixed left-1/2 top-6 transform -translate-x-1/2 flex gap-4">
        <NavigationControls
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
        />
        <DownloadButton
          onDownload={handleDownload}
          disabled={!imageUrl || isGenerating}
        />
      </div>

      <StatsPanel
        show={showStats}
        stats={stats}
        panX={panX}
        panY={panY}
        zoom={zoom}
        onReset={resetStats}
      />

      <InfoBar
        zoom={zoom}
        size={size}
        panX={panX}
        panY={panY}
        isInteracting={isInteracting}
      />
    </main>
  );
};

export default WasmApp;
