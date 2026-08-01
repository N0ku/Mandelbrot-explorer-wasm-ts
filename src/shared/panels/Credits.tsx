import { Panel } from "../hud";

// The four of us, in the HUD itself rather than only in the README — this app
// is the artefact people actually visit. Handles link out to GitHub; no
// avatars, so nothing is fetched from a third-party origin (which also keeps
// the page clean under cross-origin isolation).

const TEAM = ["N0ku", "Loule95450", "Jerance", "HugoTres93"];
const REPO = "https://github.com/N0ku/Mandelbrot-explorer-wasm-ts";

export function Credits() {
  return (
    <Panel className="fx-enter-right pointer-events-auto flex items-center gap-1.5 px-2 py-1.5">
      <a
        href={REPO}
        target="_blank"
        rel="noopener"
        title="Source on GitHub"
        className="fx-microlabel text-grey/45 transition-colors duration-300 hover:text-cyan"
      >
        Source&nbsp;↗
      </a>
      <span className="w-px h-3 bg-white/15" aria-hidden="true" />
      {TEAM.map((handle, i) => (
        <span key={handle} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-grey/25 text-[0.6rem]" aria-hidden="true">·</span>}
          <a
            href={`https://github.com/${handle}`}
            target="_blank"
            rel="noopener"
            title={`${handle} on GitHub`}
            className="fx-num text-[0.6rem] text-grey/55 transition-colors duration-300 hover:text-white"
          >
            {handle}
          </a>
        </span>
      ))}
    </Panel>
  );
}
