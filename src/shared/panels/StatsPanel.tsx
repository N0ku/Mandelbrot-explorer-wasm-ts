import { GhostButton, Panel, PanelHeader, Row } from "../hud";
import type { EngineStats } from "../../js/hooks/useStats";

// One number matters: how long the last frame took. It gets the size, and
// everything else supports it. The window it measures is the engine's own —
// full-res dispatch to the last putImageData — so what is shown here is the
// same quantity the published benchmark table cites.

const NBSP = " ";

/** One spelling for "no data" across the whole panel. */
function dash(value: number, format: (v: number) => string): string {
  if (!Number.isFinite(value) || value === 0 || value === Number.MAX_VALUE) return "—";
  return format(value);
}

const ms = (v: number) => v.toFixed(2);

export function StatsPanel({
  show,
  stats,
  engineName,
  iterations,
  onReset,
}: {
  show: boolean;
  stats: EngineStats;
  engineName: string;
  iterations: number;
  onReset: () => void;
}) {
  if (!show) return null;

  const hasRun = stats.generationCount > 0;
  const atCeiling = iterations >= 2000;

  return (
    <Panel
      data-hud="stats"
      className="fx-enter-up fx-scrollable pointer-events-auto w-[15rem] lg:w-[17rem] px-4 py-3"
    >
      <PanelHeader label="Statistics">
        {/* The capture driver selects on this exact title — do not localise it. */}
        <GhostButton onClick={onReset} title="Reset Statistics" aria-label="Reset statistics">
          Reset
        </GhostButton>
      </PanelHeader>

      <div className="flex items-baseline gap-2">
        <span className="fx-num text-[2.4rem] leading-none text-white">
          {hasRun ? ms(stats.lastMs) : "—"}
        </span>
        <span className="font-display text-[0.7rem] uppercase tracking-[0.25em] text-grey/60">
          ms
        </span>
      </div>
      <p className="fx-microlabel mt-1.5">Last generation</p>

      <p className="fx-meta mt-2">
        avg {dash(stats.averageMs, ms)}
        {NBSP}· min {dash(stats.bestMs, ms)}
        {NBSP}· max {dash(stats.worstMs, ms)}
      </p>

      <div className="mt-3">
        <Row
          label="Engine"
          value={engineName}
          meta={stats.workers > 0 ? `${stats.workers} worker${stats.workers > 1 ? "s" : ""}` : "—"}
          accent
        />
        <Row
          label="Depth"
          value={iterations.toLocaleString("en-US")}
          meta={atCeiling ? "ceiling reached" : "max · adaptive"}
        />
        <Row
          label="Frames"
          value={dash(stats.generationCount, (v) => String(v))}
          meta={hasRun ? `${ms(stats.totalMs)} ms total` : "—"}
        />
        <Row
          label="Machine"
          value={`${stats.systemInfo.cores} cores`}
          meta={stats.systemInfo.platform}
        />
      </div>
    </Panel>
  );
}
