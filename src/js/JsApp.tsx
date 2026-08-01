import React, { useCallback, useEffect, useRef, useState } from "react";
import { StatsPanel } from "./components/StatsPanel";
import { ControlsPanel } from "./components/ControlsPanel";
import { NavigationControls } from "./components/NavigationControls";
import { FractalImage } from "./components/FractalImage";
import { InfoBar } from "./components/InfoBar";
import { useFractalImage } from "./hooks/useFractalImage";
import { useZoomPan } from "./hooks/useZoomPan";
import { useHistory } from "./hooks/useHistory";
import { useInteractionState } from "./hooks/useInteractionState";
import { useStats } from "./hooks/useStats";
import { DownloadButton } from "./components/DownloadButton";

export default function JsApp() {
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
  const [showStats, setShowStats] = useState(true);
  const [size, setSize] = useState(initialSize);

  const [isJulia, setIsJulia] = useState(initialIsJulia);
  const [juliaRe, setJuliaRe] = useState(initialJuliaRe);
  const [juliaIm, setJuliaIm] = useState(initialJuliaIm);

  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Setup custom hooks
  const { isInteracting, startInteraction, endInteraction } =
    useInteractionState();

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
    initialZoom: !isNaN(initialZoom) ? initialZoom : undefined,
    initialPanX: !isNaN(initialPanX) ? initialPanX : undefined,
    initialPanY: !isNaN(initialPanY) ? initialPanY : undefined,
  });

  const { stats, startGeneration, endGeneration, resetStats } = useStats();

  const { loading, imageUrl, downloadImage, iterations } = useFractalImage({
    size,
    zoom,
    panX,
    panY,
    mode: "ts",
    fractalType,
    isJulia,
    juliaRe,
    juliaIm,
    onStatsStart: startGeneration,
    onStatsEnd: endGeneration,
  });

  const { saveState, goBack, goForward, canGoBack, canGoForward } =
    useHistory();

  // Combined useEffect for all image-related operations
  useEffect(() => {
    console.log("Image effect triggered");

    // 1. Save state for history
    saveState({ zoom, panX, panY });
  }, [zoom, panX, panY, saveState]);

  // Keep keyboard navigation as a separate useEffect since it's unrelated
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
  ]);

  const handleImageContainerWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    handleWheel(e, imageContainerRef);
  };

  const handleImageContainerMouseMove = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    handleMouseMove(e, imageContainerRef, size);
  };

  const handleGoBack = () => {
    const prevState = goBack();
    if (prevState) setState(prevState);
  };

  const handleGoForward = () => {
    const nextState = goForward();
    if (nextState) setState(nextState);
  };

  const handleDownload = useCallback(() => {
    downloadImage();
  }, [downloadImage]);

  // Synchronise les stats dans l'URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("x", panX.toFixed(6));
    params.set("y", panY.toFixed(6));
    params.set("zoom", zoom.toFixed(6));
    params.set("mode", fractalType);
    params.set("iter", (iterations?.current || 0).toString());
    params.set("size", size.toString());
    params.set("julia", isJulia.toString());
    params.set("juliaRe", juliaRe.toFixed(6));
    params.set("juliaIm", juliaIm.toFixed(6));
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, [
    panX,
    panY,
    zoom,
    fractalType,
    iterations,
    size,
    isJulia,
    juliaRe,
    juliaIm,
  ]);

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

        {loading && (
          <div className="fixed bottom-6 right-6 flex items-center bg-black/80 text-white p-3 rounded-lg border border-purple-500 shadow-lg">
            <div className="animate-spin h-6 w-6 mr-3 rounded-full border-2 border-t-transparent border-purple-500"></div>
            <div className="text-xs">
              <div>Zoom: {zoom.toFixed(2)}x</div>
              <div>X: {panX.toFixed(4)}</div>
              <div>Y: {panY.toFixed(4)}</div>
            </div>
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
        iterations={iterations?.current || 0}
      />

      {/* Add download button near navigation controls */}
      <div className="fixed left-50 top-6 transform -translate-x-1/2 flex flex-row gap-4">
        <NavigationControls
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
        />
        <DownloadButton onDownload={handleDownload} disabled={loading} />
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
}
