import { useState, useCallback, useRef } from "react";

export interface ZoomPanState {
  zoom: number;
  panX: number;
  panY: number;
}

interface UseZoomPanProps {
  size: number;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  initialZoom?: number;
  initialPanX?: number;
  initialPanY?: number;
}

export function useZoomPan({
  onInteractionStart,
  onInteractionEnd,
  initialZoom = 250.0,
  initialPanX = 0.0,
  initialPanY = 0.0,
}: UseZoomPanProps) {
  const [zoom, setZoom] = useState(initialZoom);
  const [panX, setPanX] = useState(initialPanX);
  const [panY, setPanY] = useState(initialPanY);
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const isDraggingRef = useRef(false);
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const lastPanRef = useRef({ x: 0, y: 0 });

  const zoomAtPoint = useCallback(
    (zoomFactor: number, pointX: number = 0.5, pointY: number = 0.5) => {
      onInteractionStart();

      const worldX = ((pointX - 0.5) * 4) / zoom + panX;
      const worldY = ((pointY - 0.5) * 4) / zoom + panY;

      const newZoom = zoom * zoomFactor;

      const newPanX = worldX - ((pointX - 0.5) * 4) / newZoom;
      const newPanY = worldY - ((pointY - 0.5) * 4) / newZoom;

      setZoom(newZoom);
      setPanX(newPanX);
      setPanY(newPanY);

      onInteractionEnd();
    },
    [zoom, panX, panY, onInteractionStart, onInteractionEnd]
  );

  const handleWheel = useCallback(
    (
      e: React.WheelEvent<HTMLDivElement>,
      containerRef: React.RefObject<HTMLDivElement | null>
    ) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = (e.clientX - rect.left) / rect.width;
      const mouseY = (e.clientY - rect.top) / rect.height;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

      zoomAtPoint(zoomFactor, mouseX, mouseY);
    },
    [zoomAtPoint]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onInteractionStart();
      isDraggingRef.current = true;
      lastPositionRef.current = { x: e.clientX, y: e.clientY };
      lastPanRef.current = { x: panX, y: panY };
      setDragOffset({ x: 0, y: 0 });
    },
    [onInteractionStart, panX, panY]
  );

  const handleMouseMove = useCallback(
    (
      e: React.MouseEvent,
      containerRef: React.RefObject<HTMLDivElement | null>,
      size: number
    ) => {
      if (!isDraggingRef.current) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          const mouseX = (e.clientX - rect.left) / rect.width;
          const mouseY = (e.clientY - rect.top) / rect.height;
          setMousePosition({ x: mouseX, y: mouseY });
        }
      }

      if (!isDraggingRef.current) return;

      onInteractionStart();

      const deltaXPixels = e.clientX - lastPositionRef.current.x;
      const deltaYPixels = e.clientY - lastPositionRef.current.y;

      setDragOffset({
        x: deltaXPixels,
        y: deltaYPixels,
      });

      // for the multiplacation get
      const deltaX = (deltaXPixels / size / zoom) * 4;
      const deltaY = (deltaYPixels / size / zoom) * 4;

      setPanX(lastPanRef.current.x - deltaX);
      setPanY(lastPanRef.current.y - deltaY);
    },
    [zoom, onInteractionStart]
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setDragOffset({ x: 0, y: 0 });
    onInteractionEnd();
  }, [onInteractionEnd]);

  const moveInDirection = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const moveFactor = 0.05 / zoom;
      onInteractionStart();

      switch (direction) {
        case "up":
          setPanY((prev) => prev - moveFactor);
          break;
        case "down":
          setPanY((prev) => prev + moveFactor);
          break;
        case "left":
          setPanX((prev) => prev - moveFactor);
          break;
        case "right":
          setPanX((prev) => prev + moveFactor);
          break;
      }

      onInteractionEnd();
    },
    [zoom, onInteractionStart, onInteractionEnd]
  );

  return {
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
    getState: useCallback(() => ({ zoom, panX, panY }), [zoom, panX, panY]),
    setState: useCallback((state: ZoomPanState) => {
      setZoom(state.zoom);
      setPanX(state.panX);
      setPanY(state.panY);
    }, []),
  };
}
