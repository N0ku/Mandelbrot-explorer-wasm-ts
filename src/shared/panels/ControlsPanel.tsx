import { GhostButton, Panel, PanelHeader } from "../hud";

// Configuration only — navigation lives in the rail, measurement in the stats
// panel, position in the readout. The zoom slider is gone: it clamped its
// thumb at ×10 while applying a *relative* factor, so a single drag at deep
// zoom threw the whole navigation away.

const SIZES = [500, 800, 1000, 1500, 2000];

export function ControlsPanel({
  size,
  setSize,
  iterations,
  isJulia,
  setIsJulia,
  juliaRe,
  setJuliaRe,
  juliaIm,
  setJuliaIm,
  showStats,
  setShowStats,
}: {
  size: number;
  setSize: (size: number) => void;
  iterations: number;
  isJulia: boolean;
  setIsJulia: React.Dispatch<React.SetStateAction<boolean>>;
  juliaRe: number;
  setJuliaRe: React.Dispatch<React.SetStateAction<number>>;
  juliaIm: number;
  setJuliaIm: React.Dispatch<React.SetStateAction<number>>;
  showStats: boolean;
  setShowStats: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  // A ?size= value off the preset list would otherwise render a blank control.
  const options = SIZES.includes(size) ? SIZES : [...SIZES, size].sort((a, b) => a - b);

  return (
    <Panel
      data-hud="controls"
      scrollable
      className="fx-enter-right pointer-events-auto w-60 lg:w-68 px-4 py-3"
    >
      <PanelHeader label="Controls">
        <GhostButton
          onClick={() => setShowStats((v) => !v)}
          title="Toggle statistics (S)"
          className="flex items-center gap-1.5"
        >
          Stats
          <span
            className={`block w-1.25 h-1.25 ${showStats ? "bg-cyan" : "bg-white/25"}`}
            aria-hidden="true"
          />
        </GhostButton>
      </PanelHeader>

      <p className="fx-microlabel mb-2">Resolution</p>
      <div role="radiogroup" aria-label="Resolution" className="flex">
        {options.map((s, i) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={s === size}
            onClick={() => setSize(s)}
            className={`flex-1 h-8 border font-display text-[0.6rem] tracking-[0.12em] transition-colors ${
              i > 0 ? "-ml-px" : ""
            } ${
              s === size
                ? "relative border-cyan/60 text-cyan bg-cyan/10"
                : "border-white/15 text-grey/60 hover:text-white hover:border-white/30"
            }`}
          >
            {s >= 1000 && s % 1000 === 0 ? `${s / 1000}k` : s}
          </button>
        ))}
      </div>
      <p className="fx-meta mt-1.5">{(size * size).toLocaleString("en-US")} pixels</p>

      <div className="my-3 h-px bg-white/10" />

      <div className="flex items-baseline justify-between gap-3">
        <span className="fx-microlabel">Iterations</span>
        <span className="fx-num text-[0.95rem] text-white">
          {iterations.toLocaleString("en-US")}
        </span>
      </div>
      <p className="fx-meta mt-1">max · adaptive to zoom</p>

      <div className="my-3 h-px bg-white/10" />

      <button
        type="button"
        role="switch"
        aria-checked={isJulia}
        onClick={() => setIsJulia((v) => !v)}
        className="group flex items-center gap-2.5"
      >
        <span
          className={`grid place-items-center w-3.5 h-3.5 shrink-0 border transition-colors ${
            isJulia ? "border-cyan bg-cyan/20" : "border-white/30 group-hover:border-white/60"
          }`}
        >
          {isJulia && <span className="block w-1.5 h-1.5 bg-cyan" />}
        </span>
        <span className="fx-microlabel transition-colors group-hover:text-white">Julia set</span>
      </button>

      {isJulia && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="fx-row__label">Re</span>
            <input
              type="number"
              step="0.01"
              className="fx-input"
              defaultValue={juliaRe}
              /* Clearing the field used to send NaN into the kernel, which
                 painted a black frame with no way back except a reload. */
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) setJuliaRe(v);
              }}
            />
          </label>
          <label className="block">
            <span className="fx-row__label">Im</span>
            <input
              type="number"
              step="0.01"
              className="fx-input"
              defaultValue={juliaIm}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) setJuliaIm(v);
              }}
            />
          </label>
        </div>
      )}
    </Panel>
  );
}
