import { useCallback, useEffect, useReducer, useRef, useState } from "react";

export interface ZoomPanState {
  zoom: number;
  panX: number;
  panY: number;
}

// v2 — pointer events + native wheel, gesture-based.
// The view lives in a ref (updated synchronously, mirrored to renders with a
// forced re-render) so callers can read a fresh state right after a change —
// commit() at gesture end never sees a stale view.
//
// Screen ↔ world mapping (must stay consistent with the kernels and the CSS
// transform in FractalExplorer): world = ((p − 0.5)·4)/zoom + pan, i.e. the
// frame spans 4/zoom world units and one world unit is size·zoom/4 px.

interface UseZoomPanProps {
  size: number;
  initialZoom?: number;
  initialPanX?: number;
  initialPanY?: number;
  /** Stationary element the fractal frame occupies — the zoom-anchor space. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Element receiving wheel events (native listener, passive: false). */
  wheelTargetRef: React.RefObject<HTMLElement | null>;
  /** Called once per settled gesture: drag end, wheel idle, coalesced keys. */
  onGestureEnd: () => void;
}

export function useZoomPan({
  size,
  initialZoom = 1,
  initialPanX = 0,
  initialPanY = 0,
  anchorRef,
  wheelTargetRef,
  onGestureEnd,
}: UseZoomPanProps) {
  const viewRef = useRef<ZoomPanState>({
    zoom: initialZoom,
    panX: initialPanX,
    panY: initialPanY,
  });
  const [, force] = useReducer((c: number) => c + 1, 0);
  const [isDragging, setIsDragging] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });

  const sizeRef = useRef(size);
  sizeRef.current = size;
  const onGestureEndRef = useRef(onGestureEnd);
  onGestureEndRef.current = onGestureEnd;

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    zoom: number;
  } | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  const setView = useCallback((next: ZoomPanState) => {
    viewRef.current = { ...next };
    force();
  }, []);

  /** Debounced gesture end — each call pushes the settle further out. */
  const scheduleSettle = useCallback((delay = 120) => {
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      onGestureEndRef.current();
    }, delay);
  }, []);

  const zoomAtPoint = useCallback((factor: number, px = 0.5, py = 0.5) => {
    const v = viewRef.current;
    const worldX = ((px - 0.5) * 4) / v.zoom + v.panX;
    const worldY = ((py - 0.5) * 4) / v.zoom + v.panY;
    const zoom = v.zoom * factor;
    viewRef.current = {
      zoom,
      panX: worldX - ((px - 0.5) * 4) / zoom,
      panY: worldY - ((py - 0.5) * 4) / zoom,
    };
    force();
  }, []);

  const moveInDirection = useCallback((dir: "up" | "down" | "left" | "right") => {
    const v = viewRef.current;
    const step = 0.05 / v.zoom;
    viewRef.current = {
      ...v,
      panX: v.panX + (dir === "left" ? -step : dir === "right" ? step : 0),
      panY: v.panY + (dir === "up" ? -step : dir === "down" ? step : 0),
    };
    force();
  }, []);

  const anchorFraction = useCallback(
    (clientX: number, clientY: number) => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return { x: 0.5, y: 0.5 };
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
      };
    },
    [anchorRef]
  );

  // Wheel must be a NATIVE non-passive listener: React registers wheel
  // passively, so preventDefault from a React handler is ignored.
  useEffect(() => {
    const el = wheelTargetRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x, y } = anchorFraction(e.clientX, e.clientY);
      // Trackpad pinch arrives as wheel+ctrlKey — steeper response curve.
      const factor =
        e.ctrlKey || e.metaKey ? Math.exp(-e.deltaY * 0.01) : Math.pow(1.0015, -e.deltaY);
      zoomAtPoint(factor, x, y);
      scheduleSettle(120);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [anchorFraction, zoomAtPoint, scheduleSettle, wheelTargetRef]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const v = viewRef.current;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: v.panX,
      panY: v.panY,
      zoom: v.zoom,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) {
        setMousePosition(anchorFraction(e.clientX, e.clientY));
        return;
      }
      if (e.pointerId !== d.pointerId) return;
      const perPx = 4 / (sizeRef.current * d.zoom);
      viewRef.current = {
        zoom: d.zoom,
        panX: d.panX - (e.clientX - d.startX) * perPx,
        panY: d.panY - (e.clientY - d.startY) * perPx,
      };
      force();
    },
    [anchorFraction]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    onGestureEndRef.current();
  }, []);

  return {
    view: viewRef.current,
    viewRef,
    isDragging,
    mousePosition,
    zoomAtPoint,
    moveInDirection,
    setView,
    scheduleSettle,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
