import { useEffect, useRef, useState } from "react";
import { HudButton, Kbd, Panel } from "../hud";

// Navigation and shortcuts, on one rail at the bottom edge — the top of the
// frame stays clear for the fractal.
//
// Careful with the arrows: the rail's ← → are HISTORY, while the keyboard's
// arrows PAN. The buttons therefore carry their B/N keys, and the pan hint
// spells out "move view".

const HINTS: { k: string; label: string }[] = [
  { k: "B/N", label: "History" },
  { k: "D", label: "Image" },
  { k: "R", label: "Reset view" },
  { k: "S", label: "Stats" },
  { k: "J", label: "Julia" },
  { k: "+/−", label: "Zoom" },
  { k: "↑↓←→", label: "Move view" },
];

const DownloadGlyph = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <Kbd>{k}</Kbd>
      <span className="font-display text-[0.55rem] uppercase tracking-[0.2em] text-grey/55">
        {label}
      </span>
    </span>
  );
}

export function HudRail({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onDownload,
  ready,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onDownload: () => void;
  ready: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHelpOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setHelpOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [helpOpen]);

  return (
    <div ref={wrapRef} className="relative">
      {helpOpen && (
        <Panel className="pointer-events-auto absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex flex-col gap-2 px-4 py-3">
          {HINTS.map((h) => (
            <Hint key={h.k} {...h} />
          ))}
          <span className="fx-meta mt-1">Drag to pan · scroll to zoom at the cursor</span>
        </Panel>
      )}

      <Panel
        data-hud="rail"
        className="fx-enter-up pointer-events-auto flex items-center gap-2 px-3 py-2"
      >
        <div className="flex flex-col items-center gap-1">
          <HudButton
            onClick={onGoBack}
            disabled={!canGoBack}
            title="Previous view (B)"
            label="Previous view"
          >
            <span className="text-lg leading-none">←</span>
          </HudButton>
          <Kbd>B</Kbd>
        </div>
        <div className="flex flex-col items-center gap-1">
          <HudButton
            onClick={onGoForward}
            disabled={!canGoForward}
            title="Next view (N)"
            label="Next view"
          >
            <span className="text-lg leading-none">→</span>
          </HudButton>
          <Kbd>N</Kbd>
        </div>

        <span className="w-px h-11 bg-white/12 mx-1" aria-hidden="true" />

        <div className="flex flex-col items-center gap-1">
          <HudButton
            onClick={onDownload}
            disabled={!ready}
            title="Download the image (D)"
            label="Download the image"
          >
            <DownloadGlyph />
          </HudButton>
          <Kbd>D</Kbd>
        </div>

        {/* The hints only fit alongside the side panels from 1280px up; below
            that the rail stays compact and they move into the popover. */}
        <span className="hidden xl:block w-px h-11 bg-white/12 mx-1" aria-hidden="true" />

        <div className="hidden xl:flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[26rem] pl-1">
          {HINTS.map((h) => (
            <Hint key={h.k} {...h} />
          ))}
        </div>

        <HudButton
          onClick={() => setHelpOpen((v) => !v)}
          title="Keyboard shortcuts"
          label="Keyboard shortcuts"
          className="xl:hidden"
        >
          ?
        </HudButton>
      </Panel>
    </div>
  );
}
