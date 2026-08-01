import { useCallback, useState } from "react";

// v2 — one honest window per generation: the caller passes the wall-clock ms
// measured by the engine (dispatch → last putImageData). No toDataURL, no
// image decode, no per-strategy counters. The worker count is displayed, not
// hidden: 6 wasm instances vs 1 TS worker is part of the story.

export interface EngineStats {
  lastMs: number;
  averageMs: number;
  bestMs: number;
  worstMs: number;
  totalMs: number;
  generationCount: number;
  totalIterations: number;
  /** Workers used for the last recorded generation. */
  workers: number;
  systemInfo: { cores: number; platform: string };
}

const initialStats = (): EngineStats => ({
  lastMs: 0,
  averageMs: 0,
  bestMs: Number.MAX_VALUE,
  worstMs: 0,
  totalMs: 0,
  generationCount: 0,
  totalIterations: 0,
  workers: 0,
  systemInfo: {
    cores: navigator.hardwareConcurrency || 4,
    platform: navigator.platform,
  },
});

export function useStats() {
  const [stats, setStats] = useState<EngineStats>(initialStats);

  const recordGeneration = useCallback(
    ({ ms, iterations, workers }: { ms: number; iterations: number; workers: number }) => {
      setStats((prev) => {
        const generationCount = prev.generationCount + 1;
        const totalMs = prev.totalMs + ms;
        return {
          ...prev,
          lastMs: ms,
          totalMs,
          averageMs: totalMs / generationCount,
          bestMs: Math.min(prev.bestMs === Number.MAX_VALUE ? ms : prev.bestMs, ms),
          worstMs: Math.max(prev.worstMs, ms),
          generationCount,
          totalIterations: prev.totalIterations + iterations,
          workers,
        };
      });
    },
    []
  );

  const resetStats = useCallback(() => setStats(initialStats()), []);

  return { stats, recordGeneration, resetStats };
}
