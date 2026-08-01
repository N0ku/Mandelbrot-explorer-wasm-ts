import { niceScaleBar } from "../format";

/**
 * A cartographic scale bar: baseline, two end ticks, one mid tick, and the
 * round length it represents in the complex plane. It answers "what am I
 * looking at?" in a way a bare magnification factor never can — and unlike a
 * "the frame spans 4/zoom units" readout, it stays true when the canvas is
 * larger than the viewport, which it is at 1440×900.
 */
export function ScaleBar({
  zoom,
  size,
  targetPx = 140,
  className = "",
}: {
  zoom: number;
  size: number;
  targetPx?: number;
  className?: string;
}) {
  const { px, label, title } = niceScaleBar(zoom, size, targetPx);

  return (
    <div className={className}>
      <div className="fx-scalebar" style={{ width: px }} aria-hidden="true">
        <span className="fx-scalebar__rule" />
        <span className="fx-scalebar__tick fx-scalebar__tick--end" data-side="start" />
        <span className="fx-scalebar__tick fx-scalebar__tick--mid" />
        <span className="fx-scalebar__tick fx-scalebar__tick--end" data-side="end" />
      </div>
      <span className="fx-num mt-1.5 block text-[0.72rem] text-grey/80" title={title}>
        {label}
      </span>
      <span className="sr-only">
        Scale: the bar spans {title} units of the complex plane.
      </span>
    </div>
  );
}
