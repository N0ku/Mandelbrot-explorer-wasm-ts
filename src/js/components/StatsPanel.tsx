import { motion } from "framer-motion";

interface Stats {
  totalGenerationTime: number;
  averageGenerationTime: number;
  averageTaskTime: number;
  totalIterations: number;
  generationCount: number;
  pixelExecutions: number;
  rowExecutions: number;
  gridExecutions: number;
  columnExecutions: number;
  autoExecutions: number;
  taskCount: number;
  bestTime: number;
  worstTime: number;
  lastGenerationTime: number;
  systemInfo: {
    cores: number;
    userAgent: string;
    platform: string;
  };
}

interface StatsPanelProps {
  show: boolean;
  stats: Stats;
  panX: number;
  panY: number;
  zoom: number;
  onReset: () => void;
}

export function StatsPanel({
  show,
  stats,
  panX,
  panY,
  zoom,
  onReset,
}: StatsPanelProps) {
  if (!show) return null;

  const formatTime = (time: number) => {
    if (time === Number.MAX_VALUE) return "N/A";
    return `${time.toFixed(2)} ms`;
  };

  const getTotalModeExecutions = () => {
    return (
      stats.pixelExecutions +
      stats.rowExecutions +
      stats.gridExecutions +
      stats.columnExecutions +
      stats.autoExecutions
    );
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
            CPU Cores:{" "}
            <span className="font-mono">{stats.systemInfo.cores}</span>
          </div>
          <div>
            Platform:{" "}
            <span className="font-mono">{stats.systemInfo.platform}</span>
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

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Last Generation:</span>
            <span className="font-mono text-green-400">
              {formatTime(stats.lastGenerationTime)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Average Time:</span>
            <span className="font-mono">
              {formatTime(stats.averageGenerationTime)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Best Time:</span>
            <span className="font-mono text-green-400">
              {formatTime(stats.bestTime)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Worst Time:</span>
            <span className="font-mono text-red-400">
              {formatTime(stats.worstTime)}
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Total Time:</span>
            <span className="font-mono">
              {formatTime(stats.totalGenerationTime)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Avg Task Time:</span>
            <span className="font-mono">
              {formatTime(stats.averageTaskTime)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Total Iterations:</span>
            <span className="font-mono">
              {stats.totalIterations.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Generations:</span>
            <span className="font-mono">{stats.generationCount}</span>
          </div>
        </div>
      </div>

      {/* Execution modes */}
      <div className="pt-3 border-t border-gray-700">
        <h3 className="text-sm font-bold mb-2">Executions per Mode</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col items-center p-2 bg-gray-800 rounded">
            <div className="font-bold text-blue-400">Pixel</div>
            <div className="font-mono">{stats.pixelExecutions}</div>
            <div className="text-gray-500 text-xs">
              {getTotalModeExecutions() > 0
                ? `${(
                    (stats.pixelExecutions / getTotalModeExecutions()) *
                    100
                  ).toFixed(1)}%`
                : "0%"}
            </div>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-800 rounded">
            <div className="font-bold text-green-400">Row</div>
            <div className="font-mono">{stats.rowExecutions}</div>
            <div className="text-gray-500 text-xs">
              {getTotalModeExecutions() > 0
                ? `${(
                    (stats.rowExecutions / getTotalModeExecutions()) *
                    100
                  ).toFixed(1)}%`
                : "0%"}
            </div>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-800 rounded">
            <div className="font-bold text-purple-400">Grid</div>
            <div className="font-mono">{stats.gridExecutions}</div>
            <div className="text-gray-500 text-xs">
              {getTotalModeExecutions() > 0
                ? `${(
                    (stats.gridExecutions / getTotalModeExecutions()) *
                    100
                  ).toFixed(1)}%`
                : "0%"}
            </div>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-800 rounded">
            <div className="font-bold text-yellow-400">Column</div>
            <div className="font-mono">{stats.columnExecutions}</div>
            <div className="text-gray-500 text-xs">
              {getTotalModeExecutions() > 0
                ? `${(
                    (stats.columnExecutions / getTotalModeExecutions()) *
                    100
                  ).toFixed(1)}%`
                : "0%"}
            </div>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-800 rounded">
            <div className="font-bold text-orange-400">Auto</div>
            <div className="font-mono">{stats.autoExecutions}</div>
            <div className="text-gray-500 text-xs">
              {getTotalModeExecutions() > 0
                ? `${(
                    (stats.autoExecutions / getTotalModeExecutions()) *
                    100
                  ).toFixed(1)}%`
                : "0%"}
            </div>
          </div>
          <div className="flex flex-col items-center p-2 bg-gray-800 rounded">
            <div className="font-bold text-gray-400">Tasks</div>
            <div className="font-mono">{stats.taskCount}</div>
            <div className="text-gray-500 text-xs">Total</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
