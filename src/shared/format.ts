// Number formatting for the explorer's readouts.
//
// The view spans 4/zoom units of the complex plane regardless of `size`, so
// one screen pixel is 4/(size·zoom) units. Every function here derives from
// that single fact. Pure — no React, no DOM.

const SUPERSCRIPT: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** 10⁻¹³ rather than 10^-13 — the readouts have no room for a caret. */
export function superscript(n: number): string {
  return String(n)
    .split("")
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join("");
}

const THIN_SPACE = " ";
const MINUS = "−";

/** Strips a trailing ".0" only — never a significant zero. */
function trimZeros(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/**
 * How much bigger than the default view we are: ×1 · ×60 · ×2.0k · ×1.2M.
 * SI suffixes (k/M/G/T) rather than k/M/B/T — "billion" is 10¹² in French.
 */
export function formatMagnification(zoom: number): string {
  if (!Number.isFinite(zoom) || zoom <= 0) return "×—";
  if (zoom < 1) return "×" + trimZeros(Number(zoom.toPrecision(2)).toString());
  if (zoom < 10) return "×" + trimZeros(zoom.toFixed(1));
  if (zoom < 999.5) return "×" + Math.round(zoom);

  let i = Math.min(4, Math.floor(Math.log10(zoom) / 3));
  let scaled = zoom / Math.pow(1000, i);
  let decimals = scaled < 10 ? 1 : 0;
  scaled = Number(scaled.toFixed(decimals));
  // 999.96k rounds to 1000k — promote rather than print four digits.
  if (scaled >= 1000) {
    i += 1;
    scaled = 1;
    decimals = 1;
  }
  if (i > 4) {
    const e = Math.floor(Math.log10(zoom));
    const mantissa = trimZeros((zoom / Math.pow(10, e)).toFixed(1));
    return `×${mantissa}·10${superscript(e)}`;
  }
  return "×" + scaled.toFixed(decimals) + "kMGT"[i - 1];
}

/**
 * Decimals needed for the coordinate readout to still distinguish adjacent
 * pixels: one world-pixel is 4/(size·zoom), plus one guard digit.
 * The old hard-coded toFixed(4) was only ever correct at zoom 1.
 */
export function coordDecimals(zoom: number, size: number): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(size) || zoom <= 0 || size <= 0) return 4;
  const d = Math.ceil(Math.log10((size * zoom) / 4)) + 1;
  return Math.min(17, Math.max(2, d));
}

/**
 * Decimals for the URL — one more than the display, so a shared link always
 * reproduces the pixel the user was looking at. Floored at 6 so short URLs at
 * low zoom stay byte-identical to what the app wrote before.
 */
export function coordPrecisionForUrl(zoom: number, size: number): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(size) || zoom <= 0 || size <= 0) return 6;
  const d = Math.ceil(Math.log10((size * zoom) / 4)) + 2;
  return Math.min(17, Math.max(6, d));
}

/**
 * A coordinate, grouped in threes after the point (thin spaces) so a
 * 12-decimal value stays readable. Grouping is display-only: pass
 * { group: false, minus: "ascii" } for anything meant to be copied.
 */
export function formatCoord(
  value: number,
  decimals: number,
  opts: { group?: boolean; minus?: "unicode" | "ascii" } = {}
): string {
  const { group = true, minus = "unicode" } = opts;
  if (!Number.isFinite(value)) return "—";
  const s = Math.abs(value).toFixed(Math.min(17, Math.max(0, decimals)));
  const [int, frac] = s.split(".");
  const grouped = group && frac ? frac.replace(/(\d{3})(?=\d)/g, `$1${THIN_SPACE}`) : frac;
  const sign = value < 0 ? (minus === "unicode" ? MINUS : "-") : "";
  return sign + int + (grouped ? "." + grouped : "");
}

export interface ScaleBarSpec {
  /** Length of the bar in complex-plane units — always 1, 2 or 5 × 10ⁿ. */
  units: number;
  /** Its width on screen, in CSS pixels. */
  px: number;
  /** Display label, e.g. "5×10⁻⁷" or "0.002". */
  label: string;
  /** Same value in plain ASCII, for the tooltip. */
  title: string;
}

function formatScaleUnits(m: number, n: number): string {
  if (n >= 0 && n <= 4) {
    const v = m * Math.pow(10, n);
    return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  }
  if (n >= -4 && n < 0) return (m * Math.pow(10, n)).toFixed(-n);
  return `${m}×10${superscript(n)}`;
}

/**
 * A map-style scale bar: pick a round 1/2/5×10ⁿ length whose on-screen width
 * lands nearest `targetPx` on a log scale. The bar breathes as you zoom and
 * snaps to the next round number — the bar moves, the number stays round.
 */
export function niceScaleBar(zoom: number, size: number, targetPx = 140): ScaleBarSpec {
  const worldPerPx = 4 / (size * zoom);
  if (!Number.isFinite(worldPerPx) || worldPerPx <= 0) {
    return { units: 0, px: 0, label: "—", title: "—" };
  }

  const e = Math.floor(Math.log10(targetPx * worldPerPx));
  let best = { m: 1, n: e, px: 0, err: Infinity };
  for (const n of [e - 1, e, e + 1]) {
    for (const m of [1, 2, 5]) {
      const px = (m * Math.pow(10, n)) / worldPerPx;
      const err = Math.abs(Math.log(px / targetPx));
      if (err < best.err) best = { m, n, px, err };
    }
  }

  return {
    units: best.m * Math.pow(10, best.n),
    px: Math.round(best.px),
    label: formatScaleUnits(best.m, best.n),
    title: `${best.m}e${best.n}`,
  };
}
