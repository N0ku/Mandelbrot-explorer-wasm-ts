import { forwardRef } from "react";

// The mounted drawing surface. Structure matters:
//   viewport (stationary — anchor space for zoom math)
//   └─ txWrap (CSS translate+scale of the last good frame during gestures)
//      └─ canvas (size×size backing store, painted band by band)
// The transform is driven imperatively (style.transform) so it can be reset
// in the same task as the canvas re-projection — no flash between frames.

interface FractalCanvasProps {
  size: number;
  isDragging: boolean;
  viewportRef: React.RefObject<HTMLDivElement>;
  txWrapRef: React.RefObject<HTMLDivElement>;
}

export const FractalCanvas = forwardRef<HTMLCanvasElement, FractalCanvasProps>(
  function FractalCanvas({ size, isDragging, viewportRef, txWrapRef }, ref) {
    return (
      <div ref={viewportRef} className="relative shrink-0" style={{ width: size, height: size }}>
        <div ref={txWrapRef} style={{ willChange: "transform" }}>
          <canvas
            ref={ref}
            width={size}
            height={size}
            className="block bg-dark select-none touch-none"
            style={{
              width: size,
              height: size,
              cursor: isDragging ? "grabbing" : "grab",
            }}
          />
        </div>
      </div>
    );
  }
);
