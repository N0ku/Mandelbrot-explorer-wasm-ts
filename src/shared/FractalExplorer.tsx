import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StatsPanel } from "./panels/StatsPanel";
import { ControlsPanel } from "./panels/ControlsPanel";
import { ReadoutPanel } from "./panels/ReadoutPanel";
import { HudRail } from "./panels/HudRail";
import { Badge, Panel } from "./hud";
import { useZoomPan } from "../js/hooks/useZoomPan";
import { useHistory } from "../js/hooks/useHistory";
import { useStats } from "../js/hooks/useStats";
import { useFractalEngine } from "./useFractalEngine";
import { FractalCanvas } from "./FractalCanvas";
import { computeIterations } from "./iterations";
import { coordPrecisionForUrl } from "./format";
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

/**
 * How many bands of the current pass have been painted. Exposed on `window`
 * so the screenshot tooling can catch a frame while it is still streaming;
 * incrementing an integer costs nothing in the measured window.
 */
const tileCounter = { painted: 0 };
(window as unknown as { __fxTiles: typeof tileCounter }).__fxTiles = tileCounter;

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
  const downloadRef = useRef<() => void>(() => {});

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
    //    The paint callback stays a bare canvas write: it runs on the main
    //    thread INSIDE the measured window, so no React state, no layout, no
    //    logging here. The tile counter is a single integer increment, which
    //    the capture tooling polls to photograph a frame mid-stream.
    setIsGenerating(true);
    tileCounter.painted = 0;
    const ms = await engine.render(target, {
      bands: poolSize === 1 ? 1 : poolSize * 2,
      paint: (t) => {
        ctx.putImageData(new ImageData(t.pixels, t.w, t.h), t.x0, t.y0);
        tileCounter.painted++;
      },
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
    // Precision has to follow the zoom: a fixed 6 decimals stopped resolving
    // one pixel around zoom 4000, so shared links silently landed elsewhere.
    const decimals = coordPrecisionForUrl(v.zoom, c.size);
    p.set("x", v.panX.toFixed(decimals));
    p.set("y", v.panY.toFixed(decimals));
    // String() prints the shortest representation that round-trips exactly.
    p.set("zoom", String(v.zoom));
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

  // Keyboard — v1 bindings plus `r` (reset, promised by the UI all along),
  // `j` on both routes and `d` for the download.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      // The help text has always advertised R S B N J in caps, but the switch
      // only ever matched lowercase — every shortcut died under Caps Lock.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (key) {
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
        case "d":
          downloadRef.current();
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

  // Zoom from the readout's steppers — anchored at the frame centre, because
  // the panels live outside the pointer surface and never refresh
  // `mousePosition`, so anchoring there jumped to a stale, invisible point.
  const zoomFromUI = useCallback(
    (factor: number) => {
      zoomPan.zoomAtPoint(factor, 0.5, 0.5);
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
  downloadRef.current = handleDownload;

  // The tab title is what tells a viewer which engine is running in a screen
  // recording.
  useEffect(() => {
    document.title = `${engineName} · Mandelbrot`;
  }, [engineName]);

  const displayIter = iterOverrideRef.current ?? computeIterations(view.zoom);
  const busy = isGenerating || !engine.isReady;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-dark">
      <div
        ref={containerRef}
        data-fractal-surface
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
      </div>

      {/* Render indicator: a hairline sweeping the top edge. It replaces the
          floating spinner box, which collided with the readout — this has no
          footprint at all, and it animates stroke-dashoffset only, so it costs
          the compositor nothing while putImageData runs on the main thread. */}
      {busy && (
        <svg
          className="fixed top-0 inset-x-0 z-50 h-px w-full pointer-events-none"
          viewBox="0 0 100 1"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path className="fx-scan-base" d="M0 .5 H100" vectorEffect="non-scaling-stroke" />
          <path
            className="fx-scan-pulse"
            d="M0 .5 H100"
            pathLength={100}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? "Rendering" : "Ready"}
      </span>

      {/* Status — stacked, so the engine badge and the live-preview flag can
          never cover each other the way they used to. */}
      <div
        data-hud="status"
        className="fixed top-5 left-5 z-40 flex flex-col items-start gap-2 pointer-events-none"
      >
        <Panel className="fx-enter-right flex items-center gap-2.5 px-3 py-1.5">
          <span
            className={`fx-dot ${
              !engine.isReady ? "fx-dot--loading" : isGenerating ? "fx-dot--busy" : ""
            }`}
            aria-hidden="true"
          />
          <span className="font-display text-[0.6rem] uppercase tracking-[0.22em] text-white/85">
            {engineName}
          </span>
          <span className="w-px h-3 bg-white/15" aria-hidden="true" />
          <span className="fx-num text-[0.62rem] text-grey/60">
            {poolSize} {poolSize > 1 ? "workers" : "worker"}
          </span>
        </Panel>
        {zoomPan.isDragging && <Badge tone="pink">Live</Badge>}
      </div>

      {/* Below md the four corners stop fitting around a square canvas: the
          configuration panels step aside and the readout stacks over the rail. */}
      <div className="hidden hud:block fixed top-5 right-5 z-30 pointer-events-none">
        <ControlsPanel
          size={size}
          setSize={setSize}
          iterations={displayIter}
          isJulia={isJulia}
          setIsJulia={setIsJulia}
          juliaRe={juliaRe}
          setJuliaRe={setJuliaRe}
          juliaIm={juliaIm}
          setJuliaIm={setJuliaIm}
          showStats={showStats}
          setShowStats={setShowStats}
        />
      </div>

      <div className="hidden hud:block fixed bottom-5 left-5 z-30 pointer-events-none">
        <StatsPanel
          show={showStats}
          stats={stats}
          engineName={engineName}
          iterations={displayIter}
          onReset={resetStats}
        />
      </div>

      <div className="fixed z-30 pointer-events-none bottom-[7rem] left-1/2 -translate-x-1/2 hud:bottom-5 hud:left-auto hud:right-5 hud:translate-x-0">
        <ReadoutPanel
          zoom={view.zoom}
          size={size}
          panX={view.panX}
          panY={view.panY}
          onZoom={zoomFromUI}
        />
      </div>

      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <HudRail
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onDownload={handleDownload}
          ready={engine.isReady}
        />
      </div>
    </main>
  );
}
