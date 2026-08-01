import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StatsPanel } from "../js/components/StatsPanel";
import { ControlsPanel } from "../js/components/ControlsPanel";
import { NavigationControls } from "../js/components/NavigationControls";
import { InfoBar } from "../js/components/InfoBar";
import { DownloadButton } from "../js/components/DownloadButton";
import { useZoomPan } from "../js/hooks/useZoomPan";
import { useHistory } from "../js/hooks/useHistory";
import { useStats } from "../js/hooks/useStats";
import { useFractalEngine } from "./useFractalEngine";
import { FractalCanvas } from "./FractalCanvas";
import { computeIterations } from "./iterations";
import type { FractalView } from "./renderTypes";

// The whole explorer, shared verbatim by both routes — same host pipeline,
// same interaction, same measurement window. Only the worker factory (and the
// pool size) differ, so what the benchmark compares is the engine, nothing
// else.
//
// A settled gesture triggers one frame:
//   1. bake     — the pixels on screen are re-projected to the new view and
//                 the CSS transform is reset in the same task (no jump);
//   2. preview  — size/4, iter/4, one band, painted scaled-up (never timed);
//   3. full res — bands streamed to the canvas as they land; the engine's
//                 clock (dispatch → last putImageData) feeds the stats.
// Generation tokens make the last request always win.

interface FractalExplorerProps {
  engineName: string;
  createWorker: () => Worker;
  poolSize: number;
  /** Extra query params to preserve in the URL (e.g. an explicit ?workers=). */
  urlExtras?: Record<string, string>;
}

function readInitialParams() {
  const p = new URLSearchParams(window.location.search);
  const num = (k: string) => {
    const v = parseFloat(p.get(k) ?? "");
    return Number.isNaN(v) ? null : v;
  };
  const rawSize = parseInt(p.get("size") ?? "1000", 10);
  const rawIter = parseInt(p.get("iter") ?? "", 10);
  return {
    x: num("x") ?? 0,
    y: num("y") ?? 0,
    zoom: num("zoom") ?? 1,
    size: Number.isNaN(rawSize) ? 1000 : Math.min(2000, Math.max(100, rawSize)),
    isJulia: p.get("julia") === "true",
    juliaRe: num("juliaRe") ?? 0.355,
    juliaIm: num("juliaIm") ?? 0.355,
    // `iter` is an explicit override (benchmarks); cleared on the next zoom.
    iter: Number.isNaN(rawIter) || rawIter <= 0 ? null : Math.min(20000, Math.max(10, rawIter)),
  };
}

interface PaintedView {
  zoom: number;
  panX: number;
  panY: number;
  size: number;
  isJulia: boolean;
  juliaRe: number;
  juliaIm: number;
}

export function FractalExplorer({ engineName, createWorker, poolSize, urlExtras }: FractalExplorerProps) {
  const [initial] = useState(readInitialParams);
  const [size, setSize] = useState(initial.size);
  const [isJulia, setIsJulia] = useState(initial.isJulia);
  const [juliaRe, setJuliaRe] = useState(initial.juliaRe);
  const [juliaIm, setJuliaIm] = useState(initial.juliaIm);
  const [showStats, setShowStats] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const txWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bakeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const lastPaintedRef = useRef<PaintedView | null>(null);
  const iterOverrideRef = useRef<number | null>(initial.iter);
  const lastCommittedZoomRef = useRef(initial.zoom);
  const frameSeqRef = useRef(0);
  const didInitRef = useRef(false);
  const commitRef = useRef<() => void>(() => {});

  const engine = useFractalEngine({ createWorker, poolSize });
  const { stats, recordGeneration, resetStats } = useStats();
  const { saveState, goBack, goForward, canGoBack, canGoForward } = useHistory();

  const zoomPan = useZoomPan({
    size,
    initialZoom: initial.zoom,
    initialPanX: initial.x,
    initialPanY: initial.y,
    anchorRef: viewportRef,
    wheelTargetRef: containerRef,
    onGestureEnd: () => commitRef.current(),
  });
  const { view, viewRef } = zoomPan;

  const contentRef = useRef({ size, isJulia, juliaRe, juliaIm });
  contentRef.current = { size, isJulia, juliaRe, juliaIm };

  // Live feedback while a gesture is in flight: the last painted frame is
  // warped (translate+scale) to match the current view. Derivation matches
  // the kernels: one world unit = size·zoom/4 px, transform-origin center.
  useLayoutEffect(() => {
    const el = txWrapRef.current;
    if (!el) return;
    const lp = lastPaintedRef.current;
    if (!lp || lp.size !== size) {
      el.style.transform = "none";
      return;
    }
    const s = view.zoom / lp.zoom;
    const perWorld = (size * view.zoom) / 4;
    const tx = (lp.panX - view.panX) * perWorld;
    const ty = (lp.panY - view.panY) * perWorld;
    el.style.transform =
      s === 1 && tx === 0 && ty === 0 ? "none" : `translate(${tx}px, ${ty}px) scale(${s})`;
  }, [view.zoom, view.panX, view.panY, size]);

  const runFrame = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !engine.isReady) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const v = viewRef.current;
    const c = contentRef.current;
    const maxIter = iterOverrideRef.current ?? computeIterations(v.zoom);
    const target: FractalView = {
      totalSize: c.size,
      zoom: v.zoom,
      panX: v.panX,
      panY: v.panY,
      maxIter,
      isJulia: c.isJulia,
      juliaRe: c.juliaRe,
      juliaIm: c.juliaIm,
    };
    const my = ++frameSeqRef.current;

    // 1) Bake: re-project the on-screen pixels to the new view so the CSS
    //    transform can drop to identity in this very task — no flash.
    const lp = lastPaintedRef.current;
    const sameContent =
      lp &&
      lp.size === c.size &&
      lp.isJulia === c.isJulia &&
      lp.juliaRe === c.juliaRe &&
      lp.juliaIm === c.juliaIm;
    const moved = lp && (lp.zoom !== v.zoom || lp.panX !== v.panX || lp.panY !== v.panY);
    if (sameContent && moved) {
      const s = v.zoom / lp.zoom;
      const perWorld = (c.size * v.zoom) / 4;
      const tx = (lp.panX - v.panX) * perWorld;
      const ty = (lp.panY - v.panY) * perWorld;
      let bake = bakeCanvasRef.current;
      if (!bake) bake = bakeCanvasRef.current = document.createElement("canvas");
      if (bake.width !== c.size || bake.height !== c.size) {
        bake.width = c.size;
        bake.height = c.size;
      }
      const bctx = bake.getContext("2d");
      if (bctx) {
        bctx.clearRect(0, 0, c.size, c.size);
        bctx.drawImage(canvas, 0, 0);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, c.size, c.size);
        // p → s·p + (size/2)(1−s) + t : scale about the centre, then shift.
        ctx.setTransform(s, 0, 0, s, tx + (c.size / 2) * (1 - s), ty + (c.size / 2) * (1 - s));
        ctx.drawImage(bake, 0, 0);
        ctx.restore();
      }
    }
    lastPaintedRef.current = { zoom: v.zoom, panX: v.panX, panY: v.panY, ...c };
    if (txWrapRef.current) txWrapRef.current.style.transform = "none";

    // 2) Preview pass — quarter resolution, quarter depth, painted scaled-up.
    //    Runs to completion BEFORE the timed pass on both engines, so it is
    //    excluded from the measurement symmetrically.
    const pSize = Math.ceil(c.size / 4);
    const pView: FractalView = {
      ...target,
      totalSize: pSize,
      maxIter: Math.max(64, Math.floor(maxIter / 4)),
    };
    let pc = previewCanvasRef.current;
    if (!pc) pc = previewCanvasRef.current = document.createElement("canvas");
    if (pc.width !== pSize || pc.height !== pSize) {
      pc.width = pSize;
      pc.height = pSize;
    }
    const pctx = pc.getContext("2d");
    if (pctx) {
      const pms = await engine.render(pView, {
        bands: 1,
        paint: (t) => pctx.putImageData(new ImageData(t.pixels, t.w, t.h), t.x0, t.y0),
      });
      if (pms === null || my !== frameSeqRef.current) return;
      ctx.drawImage(pc, 0, 0, pSize, pSize, 0, 0, c.size, c.size);
    }

    // 3) Full-resolution pass — streamed bands, timed by the engine.
    setIsGenerating(true);
    const ms = await engine.render(target, {
      bands: poolSize === 1 ? 1 : poolSize * 2,
      paint: (t) => ctx.putImageData(new ImageData(t.pixels, t.w, t.h), t.x0, t.y0),
    });
    if (my === frameSeqRef.current) setIsGenerating(false);
    if (ms === null || my !== frameSeqRef.current) return;
    recordGeneration({ ms, iterations: maxIter, workers: poolSize });
    console.log(
      `${target.isJulia ? "julia" : "mandelbrot"} ${c.size}px rendered in ${ms.toFixed(2)}ms — ` +
        `${poolSize} worker${poolSize > 1 ? "s" : ""}, ${maxIter} iterations`
    );
  }, [engine.isReady, engine.render, poolSize, recordGeneration, viewRef]);

  const writeUrl = useCallback(() => {
    const v = viewRef.current;
    const c = contentRef.current;
    const p = new URLSearchParams();
    p.set("x", v.panX.toFixed(6));
    p.set("y", v.panY.toFixed(6));
    p.set("zoom", v.zoom.toFixed(6));
    p.set("iter", String(iterOverrideRef.current ?? computeIterations(v.zoom)));
    p.set("size", String(c.size));
    p.set("julia", String(c.isJulia));
    p.set("juliaRe", c.juliaRe.toFixed(6));
    p.set("juliaIm", c.juliaIm.toFixed(6));
    if (urlExtras) {
      for (const [k, val] of Object.entries(urlExtras)) p.set(k, val);
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [urlExtras, viewRef]);

  // One commit per settled gesture: one history entry, one URL write, one
  // frame. History jumps pass through too (their saveState is skipped by the
  // useHistory guard).
  const commit = useCallback(() => {
    const v = viewRef.current;
    if (v.zoom !== lastCommittedZoomRef.current) {
      iterOverrideRef.current = null;
      lastCommittedZoomRef.current = v.zoom;
    }
    saveState({ zoom: v.zoom, panX: v.panX, panY: v.panY });
    writeUrl();
    void runFrame();
  }, [saveState, writeUrl, runFrame, viewRef]);
  commitRef.current = commit;

  // First frame once the engine is up.
  useEffect(() => {
    if (engine.isReady && !didInitRef.current) {
      didInitRef.current = true;
      commitRef.current();
    }
  }, [engine.isReady]);

  // Content changes (size, Julia params) re-render without a gesture.
  useEffect(() => {
    if (!didInitRef.current) return;
    commitRef.current();
  }, [size, isJulia, juliaRe, juliaIm]);

  // Keyboard — v1 bindings plus `r` (reset, promised by the UI all along)
  // and `j` on both routes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      switch (e.key) {
        case "+":
        case "=":
          zoomPan.zoomAtPoint(1.2, zoomPan.mousePosition.x, zoomPan.mousePosition.y);
          zoomPan.scheduleSettle(150);
          break;
        case "-":
          zoomPan.zoomAtPoint(0.8, zoomPan.mousePosition.x, zoomPan.mousePosition.y);
          zoomPan.scheduleSettle(150);
          break;
        case "s":
          setShowStats((prev) => !prev);
          break;
        case "ArrowUp":
          zoomPan.moveInDirection("up");
          zoomPan.scheduleSettle(80);
          break;
        case "ArrowDown":
          zoomPan.moveInDirection("down");
          zoomPan.scheduleSettle(80);
          break;
        case "ArrowLeft":
          zoomPan.moveInDirection("left");
          zoomPan.scheduleSettle(80);
          break;
        case "ArrowRight":
          zoomPan.moveInDirection("right");
          zoomPan.scheduleSettle(80);
          break;
        case "b": {
          const prev = goBack();
          if (prev) {
            zoomPan.setView(prev);
            commitRef.current();
          }
          break;
        }
        case "n": {
          const next = goForward();
          if (next) {
            zoomPan.setView(next);
            commitRef.current();
          }
          break;
        }
        case "j":
          setIsJulia((prev) => !prev);
          break;
        case "r":
          zoomPan.setView({ zoom: 1, panX: 0, panY: 0 });
          commitRef.current();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomPan.zoomAtPoint, zoomPan.moveInDirection, zoomPan.setView, zoomPan.scheduleSettle, zoomPan.mousePosition, goBack, goForward]);

  const handleGoBack = () => {
    const prev = goBack();
    if (prev) {
      zoomPan.setView(prev);
      commitRef.current();
    }
  };
  const handleGoForward = () => {
    const next = goForward();
    if (next) {
      zoomPan.setView(next);
      commitRef.current();
    }
  };

  // Zoom driven from the controls panel: settle shortly after the last nudge.
  const zoomAtPointUI = useCallback(
    (factor: number, px?: number, py?: number) => {
      zoomPan.zoomAtPoint(factor, px, py);
      zoomPan.scheduleSettle(150);
    },
    [zoomPan.zoomAtPoint, zoomPan.scheduleSettle]
  );

  // Download straight from the mounted canvas — outside any timed path.
  const handleDownload = useCallback(() => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fractal-${isJulia ? "julia" : "mandelbrot"}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [isJulia]);

  const displayIter = iterOverrideRef.current ?? computeIterations(view.zoom);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black">
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center select-none touch-none"
        {...zoomPan.pointerHandlers}
      >
        <FractalCanvas
          ref={canvasRef}
          size={size}
          isDragging={zoomPan.isDragging}
          viewportRef={viewportRef}
          txWrapRef={txWrapRef}
        />

        {(isGenerating || !engine.isReady) && (
          <div className="fixed bottom-6 right-6 flex items-center bg-black/80 text-white p-3 rounded-lg border border-purple-500 shadow-lg pointer-events-none">
            <div className="animate-spin h-6 w-6 mr-3 rounded-full border-2 border-t-transparent border-purple-500"></div>
            <div className="text-xs">
              <div>{!engine.isReady ? `Loading ${engineName}…` : "Rendering…"}</div>
              <div>Zoom: {view.zoom.toFixed(2)}x</div>
              <div>X: {view.panX.toFixed(4)}</div>
              <div>Y: {view.panY.toFixed(4)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Engine status */}
      <div className="fixed top-4 left-4 z-50 pointer-events-none">
        {engine.isReady ? (
          <div className="flex items-center px-3 py-2 bg-green-900/50 border border-green-500 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            <span className="text-green-300 text-sm font-medium">
              {engineName} ready — {poolSize} worker{poolSize > 1 ? "s" : ""}
            </span>
          </div>
        ) : (
          <div className="flex items-center px-3 py-2 bg-yellow-900/50 border border-yellow-500 rounded-lg">
            <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
            <span className="text-yellow-300 text-sm font-medium">Loading {engineName}…</span>
          </div>
        )}
      </div>

      <ControlsPanel
        zoom={view.zoom}
        size={size}
        setSize={setSize}
        mousePosition={zoomPan.mousePosition}
        zoomAtPoint={zoomAtPointUI}
        showStats={showStats}
        setShowStats={setShowStats}
        isJulia={isJulia}
        setIsJulia={setIsJulia}
        juliaRe={juliaRe}
        setJuliaRe={setJuliaRe}
        juliaIm={juliaIm}
        setJuliaIm={setJuliaIm}
        iterations={displayIter}
      />

      <div className="fixed left-1/2 top-6 transform -translate-x-1/2 flex gap-4">
        <NavigationControls
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
        />
        <DownloadButton onDownload={handleDownload} disabled={!engine.isReady} />
      </div>

      <StatsPanel
        show={showStats}
        stats={stats}
        panX={view.panX}
        panY={view.panY}
        zoom={view.zoom}
        onReset={resetStats}
      />

      <InfoBar
        zoom={view.zoom}
        size={size}
        panX={view.panX}
        panY={view.panY}
        isInteracting={zoomPan.isDragging}
      />
    </main>
  );
}
