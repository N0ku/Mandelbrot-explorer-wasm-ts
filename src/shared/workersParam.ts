// ?workers=1..6 — the "one instance each" knob that makes the pooled engines
// comparable to the single-worker TypeScript route. Read once at module scope
// on purpose: it is a benchmark switch, not live state.
//
// Shared by every worker-pool engine (Go/WASM and Rust) so the parsing, the
// default and the clamp can never drift apart between routes.
export function readWorkersParam(): {
  poolSize: number;
  urlExtras?: Record<string, string>;
} {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("workers");
  const parsed = raw === null ? NaN : parseInt(raw, 10);
  const fallback = Math.min(navigator.hardwareConcurrency || 4, 6);
  const poolSize = Number.isNaN(parsed) ? fallback : Math.min(6, Math.max(1, parsed));
  // Echo it back into the URL only when it was asked for explicitly, so a
  // shared link keeps the pool size it was measured with.
  return { poolSize, urlExtras: raw !== null ? { workers: String(poolSize) } : undefined };
}
