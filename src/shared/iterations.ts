// Adaptive iteration depth — the single formula used by BOTH engines, so a
// given URL renders the exact same workload on / and /js (benchmark parity).
export function computeIterations(zoom: number): number {
  return Math.min(2000, Math.max(100, Math.floor(1000 * Math.pow(zoom, 0.3))));
}
