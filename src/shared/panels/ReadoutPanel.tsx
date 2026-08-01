import { useCallback, useState } from "react";
import { GhostButton, HudButton, Panel, PanelHeader } from "../hud";
import { ScaleBar } from "../hud/ScaleBar";
import { coordDecimals, formatCoord, formatMagnification } from "../format";

// Where the view is, in terms a human can act on: how far down we've zoomed
// (a round scale bar, plus the magnification factor) and exactly where we are
// (coordinates carrying as many decimals as the zoom actually resolves).
//
// Note on Im: the kernel maps row-down to Im-up, so the image is a vertical
// mirror of the conventional depiction. The sign shown here is the sign in the
// URL — "fixing" it would break every shared link.

export function ReadoutPanel({
  zoom,
  size,
  panX,
  panY,
  onZoom,
}: {
  zoom: number;
  size: number;
  panX: number;
  panY: number;
  onZoom: (factor: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const decimals = coordDecimals(zoom, size);

  const copyLink = useCallback(() => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  const coord = (v: number) => ({
    display: formatCoord(v, decimals),
    plain: formatCoord(v, decimals, { group: false, minus: "ascii" }),
  });
  const re = coord(panX);
  const im = coord(panY);

  return (
    <Panel
      data-hud="readout"
      className="fx-enter-up pointer-events-auto w-60 lg:w-68 px-4 py-3"
    >
      <PanelHeader label="Scale" />

      <ScaleBar zoom={zoom} size={size} />
      <p className="fx-meta mt-1">Δ Re · complex plane</p>

      <div className="my-3 h-px bg-white/10" />

      <p className="fx-microlabel mb-1.5">Magnification</p>
      <div className="flex items-center justify-between gap-3">
        <span className="fx-num text-[1.15rem] text-white">{formatMagnification(zoom)}</span>
        <div className="flex items-center gap-2">
          {/* Anchored at the frame centre, unlike the old buttons which used a
              mouse position the panels never update. */}
          <HudButton
            onClick={() => onZoom(0.8)}
            title="Zoom out (−)"
            label="Zoom out"
            className="w-8 h-8 text-base"
          >
            −
          </HudButton>
          <HudButton
            onClick={() => onZoom(1.25)}
            title="Zoom in (+)"
            label="Zoom in"
            className="w-8 h-8 text-base"
          >
            +
          </HudButton>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <span className="fx-row__label w-6 shrink-0">Re</span>
          <span
            className="fx-num text-[0.68rem] text-grey/85 truncate"
            title={re.plain}
          >
            {re.display}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="fx-row__label w-6 shrink-0">Im</span>
          <span
            className="fx-num text-[0.68rem] text-grey/85 truncate"
            title={im.plain}
          >
            {im.display}
          </span>
        </div>
      </div>

      <div className="my-3 h-px bg-white/10" />

      <div className="flex items-center justify-between gap-3">
        <span className="fx-meta">
          {size} × {size} px
        </span>
        <GhostButton onClick={copyLink} title="Copy a link to this exact view">
          {copied ? "Copied" : "Copy link"}
        </GhostButton>
      </div>
    </Panel>
  );
}
