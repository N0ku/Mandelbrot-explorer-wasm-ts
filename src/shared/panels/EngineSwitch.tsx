import { Panel } from "../hud";

// Engine switch — the same view, another engine, one click. The query string
// rides along, so the frame on screen is the frame you get back.
//
// Plain anchors, not a client-side route change: each App module reads
// ?workers= and ?simd= once at module scope, so a soft navigation would carry
// the previous engine's pool size across. A full load also hands the incoming
// engine a cold start, which is what the benchmark protocol assumes anyway.

const ENGINES = [
  { path: "/", label: "Rust" },
  { path: "/go", label: "Go" },
  { path: "/js", label: "TS" },
  { path: "/gl", label: "GL" },
];

export function EngineSwitch({ current }: { current: string }) {
  const search = typeof window === "undefined" ? "" : window.location.search;
  // "/" and "/simd" are the same engine — the alias has to light up the same
  // button, or arriving from an older link looks like no engine is selected.
  const isActive = (path: string) =>
    path === "/" ? current === "/" || current === "/simd" : current === path;

  return (
    <Panel className="fx-enter-right pointer-events-auto flex items-center gap-1 px-2 py-1.5">
      <span className="fx-microlabel pr-1 text-grey/45">Engine</span>
      {ENGINES.map((e) => {
        const active = isActive(e.path);
        return (
          <a
            key={e.path}
            href={`${e.path}${search}`}
            aria-current={active ? "page" : undefined}
            title={active ? `${e.label} — current engine` : `Replay this view on ${e.label}`}
            className={`font-display text-[0.58rem] uppercase tracking-[0.18em] border px-2 py-1 transition-colors duration-300 ${
              active
                ? "border-cyan/50 text-cyan"
                : "border-white/15 text-grey/60 hover:text-white hover:border-white/35"
            }`}
          >
            {e.label}
          </a>
        );
      })}
    </Panel>
  );
}
