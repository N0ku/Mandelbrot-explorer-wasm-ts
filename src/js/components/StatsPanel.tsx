import { motion } from "framer-motion";
import type { EngineStats } from "../hooks/useStats";

// v2 — one honest window: dispatch → last putImageData, measured by the
// engine. Workers used are displayed (6 wasm instances vs 1 TS worker is part
// of the story, not something to hide). The per-strategy counters are gone
// with the strategies themselves.

interface StatsPanelProps {
  show: boolean;
  stats: EngineStats;
  panX: number;
  panY: number;
  zoom: number;
  onReset: () => void;
}

export function StatsPanel({ show, stats, panX, panY, zoom, onReset }: StatsPanelProps) {
  if (!show) return null;

  const formatTime = (time: number) => {
    if (time === Number.MAX_VALUE) return "N/A";
    return `${time.toFixed(2)} ms`;
  };

  return (
    <motion.div
      className="absolute bottom-4 left-4 p-4 bg-black bg-opacity-90 rounded-lg text-white max-w-lg shadow-lg border border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-bold">Performance Statistics</h2>
        <button
          onClick={onReset}
          className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
          title="Reset Statistics"
        >
          Reset
        </button>
      </div>

      {/* System Info */}
      <div className="mb-3 p-2 bg-gray-800 rounded">
        <h3 className="text-sm font-bold mb-1">System Info</h3>
        <div className="text-xs space-y-1">
          <div>
            CPU Cores: <span className="font-mono">{stats.systemInfo.cores}</span>
          </div>
          <div>
            Workers Used:{" "}
            <span className="font-mono">{stats.workers > 0 ? stats.workers : "—"}</span>
          </div>
          <div>
            Platform: <span className="font-mono">{stats.systemInfo.platform}</span>
          </div>
        </div>
      </div>

      {/* Current Position */}
      <div className="mb-3 p-2 bg-gray-800 rounded">
        <h3 className="text-sm font-bold mb-1">Current Position</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            X: <span className="font-mono">{panX.toFixed(4)}</span>
          </div>
          <div>
            Y: <span className="font-mono">{panY.toFixed(4)}</span>
          </div>
          <div>
            Zoom: <span className="font-mono">{zoom.toFixed(2)}x</span>
          </div>
        </div>
      </div>

      {/* Performance Metrics — window: dispatch → last putImageData */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Last Generation:</span>
            <span className="font-mono text-green-400">{formatTime(stats.lastMs)}</span>
          </div>
          <div className="flex justify-between">
            <span>Average Time:</span>
            <span className="font-mono">{formatTime(stats.averageMs)}</span>
          </div>
          <div className="flex justify-between">
            <span>Best Time:</span>
            <span className="font-mono text-green-400">{formatTime(stats.bestMs)}</span>
          </div>
          <div className="flex justify-between">
            <span>Worst Time:</span>
            <span className="font-mono text-red-400">{formatTime(stats.worstMs)}</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Total Time:</span>
            <span className="font-mono">{formatTime(stats.totalMs)}</span>
          </div>
          <div className="flex justify-between">
            <span>Generations:</span>
            <span className="font-mono">{stats.generationCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Iterations:</span>
            <span className="font-mono">{stats.totalIterations.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
