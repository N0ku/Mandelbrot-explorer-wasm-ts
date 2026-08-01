import type { ReactNode } from "react";

// HUD kit — a 1:1 port of the portfolio's Astro components
// (src/components/ui/hud/*.astro), so the explorer and the site that
// showcases it share one visual language. Presentational only: no state,
// no effects, nothing that could run inside the timed render window.

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** Four L-shaped corner marks. Needs a `relative` parent; colour via text-*. */
export function CornerBrackets({
  size = "1.5rem",
  offset = "0px",
  className = "",
}: {
  size?: string;
  offset?: string;
  className?: string;
}) {
  const arm = { width: size, height: size };
  return (
    <div
      className={cx("absolute pointer-events-none", className)}
      style={{ inset: offset }}
      aria-hidden="true"
    >
      <span className="absolute top-0 left-0 border-t border-l border-current" style={arm} />
      <span className="absolute top-0 right-0 border-t border-r border-current" style={arm} />
      <span className="absolute bottom-0 left-0 border-b border-l border-current" style={arm} />
      <span className="absolute bottom-0 right-0 border-b border-r border-current" style={arm} />
    </div>
  );
}

/** Skewed tally marks. Everything is em-based: set font-size to scale it. */
export function Hatch({ count = 8, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={cx("flex gap-[0.4em] leading-none", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="block w-[0.35em] h-[1em] -skew-x-30 bg-current" />
      ))}
    </div>
  );
}

/**
 * The canonical panel. The portfolio fills these with bg-white/2 because they
 * sit on #030303; here they float over a saturated fractal, so the fill has to
 * be opaque enough to read. No backdrop-blur: putImageData runs on the main
 * thread inside the timed window, and blurred layers would tax every paint.
 */
export function Panel({
  className = "",
  bracketSize = "0.75rem",
  scrollable = false,
  children,
  ...rest
}: {
  className?: string;
  bracketSize?: string;
  /** Cap the height on a short viewport and let the CONTENT scroll. The frame
   *  must not be the scroll container: its corner brackets sit 1px outside the
   *  border by design, and that is enough to raise scrollbars on both axes. */
  scrollable?: boolean;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "relative border border-white/10 bg-dark/88 text-white",
        scrollable && "flex flex-col fx-scrollable",
        className
      )}
      {...rest}
    >
      <CornerBrackets size={bracketSize} offset="-1px" className="text-white/25" />
      {scrollable ? <div className="fx-scroll">{children}</div> : children}
    </div>
  );
}

/** Hatch + label + rule, the portfolio's SectionDivider at HUD scale. */
export function PanelHeader({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-grey/50 mb-3">
      <Hatch count={5} className="text-[0.55rem] text-white/70" />
      <span className="font-display text-[0.6rem] uppercase tracking-[0.25em] whitespace-nowrap text-grey/70">
        {label}
      </span>
      <span className="flex-1 h-px bg-white/10" />
      {children}
    </div>
  );
}

/** Square stepper. Disabled is opacity + no pointer events, per the portfolio. */
export function HudButton({
  onClick,
  disabled = false,
  title,
  label,
  className = "",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={cx(
        "grid place-items-center w-11 h-11 shrink-0 border border-white/25 text-white/80",
        "transition-opacity hover:text-white disabled:opacity-30 disabled:pointer-events-none",
        className
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  onClick,
  title,
  className = "",
  children,
  ...rest
}: {
  onClick: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        "font-display text-[0.55rem] uppercase tracking-[0.2em] whitespace-nowrap",
        "text-grey/60 transition-colors hover:text-white",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const BADGE_TONES = {
  cyan: "text-cyan border-cyan/50",
  green: "text-green border-green/50",
  pink: "text-pink border-pink/60",
} as const;

export function Badge({
  tone = "cyan",
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "font-display text-[0.6rem] tracking-[0.2em] px-1.5 py-0.5 border bg-dark/88",
        BADGE_TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

/** A key chip. Invented from the badge idiom — the portfolio has no keyboard UI. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="border border-white/20 px-1 py-px font-mono text-[0.6rem] leading-none text-white/80">
      {children}
    </span>
  );
}

/** One metric line, on the portfolio's .mbw-row grid. */
export function Row({
  label,
  value,
  meta,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="fx-row">
      <span className="fx-row__label">{label}</span>
      <span className="fx-row__right">
        <span className={cx("fx-row__value", accent && "fx-row__value--accent")}>{value}</span>
        {meta ? <span className="fx-row__meta">{meta}</span> : null}
      </span>
    </div>
  );
}
