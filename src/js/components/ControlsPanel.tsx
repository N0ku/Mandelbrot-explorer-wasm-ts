import React from "react";
import { motion } from "framer-motion";

// v2 — the strategy selector is gone: scheduling strategies never changed a
// pixel, parallelism lives in the worker pool now. Iterations are the actual
// depth used by the engines (shared adaptive formula, or an ?iter= override).

interface ControlsPanelProps {
  zoom: number;
  size: number;
  setSize: (size: number) => void;
  mousePosition: { x: number; y: number };
  zoomAtPoint: (factor: number, x?: number, y?: number) => void;
  showStats: boolean;
  setShowStats: React.Dispatch<React.SetStateAction<boolean>>;
  isJulia: boolean;
  setIsJulia: React.Dispatch<React.SetStateAction<boolean>>;
  juliaRe: number;
  setJuliaRe: React.Dispatch<React.SetStateAction<number>>;
  juliaIm: number;
  setJuliaIm: React.Dispatch<React.SetStateAction<number>>;
  iterations: number;
}

export function ControlsPanel({
  zoom,
  size,
  setSize,
  mousePosition,
  zoomAtPoint,
  showStats,
  setShowStats,
  isJulia,
  setIsJulia,
  juliaRe,
  setJuliaRe,
  juliaIm,
  setJuliaIm,
  iterations,
}: ControlsPanelProps) {
  return (
    <motion.div
      className="absolute top-4 right-4 p-4 bg-black bg-opacity-80 rounded-lg text-white shadow-lg border border-gray-700"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-bold">Controls</h2>
        <button
          className="text-white hover:text-gray-300"
          onClick={() => setShowStats(!showStats)}
        >
          {showStats ? "Hide Stats" : "Display Stats"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="iterations" className="block text-sm mb-1">
            Iterations:
          </label>
          <input
            type="number"
            id="iterations"
            value={iterations}
            readOnly
            className="w-full p-1 bg-gray-800 rounded text-sm"
          />
        </div>

        <div>
          <label htmlFor="zoom" className="block text-sm mb-1">
            Zoom: {zoom.toFixed(2)}x
          </label>
          <div className="flex">
            <button
              onClick={() => zoomAtPoint(0.8, mousePosition.x, mousePosition.y)}
              className="px-2 bg-gray-700 rounded-l"
            >
              -
            </button>
            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={Math.min(10, Math.max(0.1, zoom))}
              onChange={(e) => {
                const newZoom = parseFloat(e.target.value);
                const factor = newZoom / zoom;
                zoomAtPoint(factor, mousePosition.x, mousePosition.y);
              }}
              className="w-full"
            />
            <button
              onClick={() => zoomAtPoint(1.2, mousePosition.x, mousePosition.y)}
              className="px-2 bg-gray-700 rounded-r"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="isJulia" className="block text-sm mb-1">
            Julia Mode:
          </label>
          <input
            type="checkbox"
            id="isJulia"
            checked={isJulia}
            onChange={(e) => setIsJulia(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="isJulia">Enable Julia</label>
        </div>

        <div className="mt-2">
          <label htmlFor="imageSize" className="block text-sm mb-1">
            Image Size: {size}×{size} px
          </label>
          <select
            id="imageSize"
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            className="w-full p-1 bg-gray-800 rounded text-sm"
          >
            <option value="500">500×500 (Small)</option>
            <option value="800">800×800 (Medium)</option>
            <option value="1000">1000×1000 (Large)</option>
            <option value="1500">1500×1500 (XL)</option>
            <option value="2000">2000×2000 (XXL)</option>
          </select>
        </div>

        {isJulia && (
          <div className="col-span-2 grid grid-cols-2 gap-3 mt-2">
            <div>
              <label htmlFor="juliaRe" className="block text-sm mb-1">
                Julia Re:
              </label>
              <input
                type="number"
                id="juliaRe"
                value={juliaRe}
                onChange={(e) => setJuliaRe(parseFloat(e.target.value))}
                step="0.01"
                className="w-full p-1 bg-gray-800 rounded text-sm"
              />
            </div>
            <div>
              <label htmlFor="juliaIm" className="block text-sm mb-1">
                Julia Im:
              </label>
              <input
                type="number"
                id="juliaIm"
                value={juliaIm}
                onChange={(e) => setJuliaIm(parseFloat(e.target.value))}
                step="0.01"
                className="w-full p-1 bg-gray-800 rounded text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-xs text-gray-400">
        <p>Drag to pan, scroll (or pinch) to zoom at the cursor.</p>
        <p>
          Keys: R (reset), + / - (zoom), S (stats), B (back), N (next), J
          (julia)
        </p>
      </div>
    </motion.div>
  );
}
