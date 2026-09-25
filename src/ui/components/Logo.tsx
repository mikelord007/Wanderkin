import type { CSSProperties } from "react";
import { BRAND_NAME } from "../../brand.js";

/**
 * The Wanderkin mark: a sewing button the size of a planet, and the tiny
 * explorer standing on top of it. The explorer wears the in-game beanie and
 * suit, and has an arm up as if they've just spotted something. One picture of
 * the whole product: an everyday object becomes a world, and you are very small
 * on it.
 *
 * Three drawings share one set of coordinates:
 * - `full`: the pine tile with shading, stitching, and a tilted, waving figure.
 * - The small optical cut, used automatically below 24px: bigger holes, no
 *   stitching or arm, a larger and simpler figure. At 16px the full drawing's
 *   holes are half a pixel wide and the arm blurs away. This is the favicon.
 * - `mono`: one colour, `currentColor`, no tile. For photos, a dark HUD, or
 *   anywhere the tile would fight the backdrop.
 *
 * `public/brand/wanderkin-mark.svg`, `wanderkin-favicon.svg` and the boot
 * screen in `index.html` are copies of these drawings. `Logo.test.ts` checks
 * they have not drifted.
 */
export type LogoTone = "full" | "mono";

/** Below this rendered size the mark switches to the small optical cut. */
export const LOGO_SMALL_BELOW = 24;

/** Brand colours as drawn by the mark. They match the `--mh-*` tokens. */
export const MARK_COLORS = {
  pine: "#1d3a2e",
  plaster: "#f2efe5",
  dish: "#e2dac6",
  marigold: "#e8a33d",
  beanie: "#3f9f92",
  beanieBand: "#2b7a70",
} as const;

/** A circle as one path segment, so it can join an even-odd compound path. */
function ring(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

/** The button: centre, radius, dished centre, and hole spacing, per cut. */
const BUTTON = {
  full: { cx: 22, cy: 30.5, r: 16, dish: 12, hole: 3.7, holeR: 1.95 },
  small: { cx: 22, cy: 31, r: 15.5, dish: 0, hole: 4.6, holeR: 2.6 },
} as const;

type Point = [number, number];

/** Top-left, top-right, bottom-left, bottom-right. */
function holes(b: (typeof BUTTON)[keyof typeof BUTTON]): [Point, Point, Point, Point] {
  return [
    [b.cx - b.hole, b.cy - b.hole],
    [b.cx + b.hole, b.cy - b.hole],
    [b.cx - b.hole, b.cy + b.hole],
    [b.cx + b.hole, b.cy + b.hole],
  ];
}

/**
 * Where the explorer stands: just past the top of the button, square to its
 * curve the way you stand on a planet. The lean leaves room for a big button.
 */
const STANCE = {
  full: `rotate(20 ${BUTTON.full.cx} ${BUTTON.full.cy}) translate(${BUTTON.full.cx} ${BUTTON.full.cy - BUTTON.full.r}) scale(.92)`,
  small: `rotate(18 ${BUTTON.small.cx} ${BUTTON.small.cy}) translate(${BUTTON.small.cx} ${BUTTON.small.cy - BUTTON.small.r}) scale(1.1)`,
} as const;

/*
 * The explorer, drawn feet-first at the origin with up as -y, about 15 units
 * tall. Chunky on purpose: nothing thinner than a unit and a half, so it stays a
 * figure rather than a smudge at 36px.
 */
const LEGS = "M-2.2-3.6h1.8v2.7a.9.9 0 0 1-1.8 0ZM.4-3.6h1.8v2.7a.9.9 0 0 1-1.8 0Z";
const TORSO = { x: -2.6, y: -8.6, width: 5.2, height: 5.8, rx: 2.2 };
const SMALL_BODY = { x: -2.6, y: -8.6, width: 5.2, height: 8.6, rx: 2.2 };
const ARM = "M1.8-7.4 4.4-10.6";
const HEAD = { cx: 0, cy: -11.1, r: 2.6 };
const BEANIE = "M-2.8-11.2a2.8 2.8 0 0 1 5.6 0Z";
const BEANIE_BAND = { x: -3, y: -11.7, width: 6, height: 1.2, rx: 0.6 };
const POMPOM = { cx: 0, cy: -14.2, r: 0.9 };
/** Mono only: the face below the beanie, cut short so a sliver of gap reads as the brim. */
const MONO_FACE = "M-2.55-10.6A2.6 2.6 0 1 0 2.55-10.6Z";

function FullMark() {
  const b = BUTTON.full;
  const [tl, tr, bl, br] = holes(b);
  return (
    <>
      <rect x="0" y="0" width="48" height="48" rx="12" fill={MARK_COLORS.pine} />
      <circle cx={b.cx} cy={b.cy} r={b.r} fill={MARK_COLORS.plaster} />
      <circle cx={b.cx} cy={b.cy} r={b.dish} fill={MARK_COLORS.dish} />
      {holes(b).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={b.holeR} fill={MARK_COLORS.pine} />
      ))}
      <path
        d={`M${tl[0]} ${tl[1]} ${br[0]} ${br[1]}M${tr[0]} ${tr[1]} ${bl[0]} ${bl[1]}`}
        stroke={MARK_COLORS.marigold}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <g transform={STANCE.full}>
        <path d={LEGS} fill={MARK_COLORS.marigold} />
        <rect {...TORSO} fill={MARK_COLORS.marigold} />
        <path d={ARM} stroke={MARK_COLORS.marigold} strokeWidth="1.6" strokeLinecap="round" />
        <circle {...HEAD} fill={MARK_COLORS.plaster} />
        <path d={BEANIE} fill={MARK_COLORS.beanie} />
        <rect {...BEANIE_BAND} fill={MARK_COLORS.beanieBand} />
        <circle {...POMPOM} fill={MARK_COLORS.beanie} />
      </g>
    </>
  );
}

function SmallMark() {
  const b = BUTTON.small;
  return (
    <>
      <rect x="0" y="0" width="48" height="48" rx="11" fill={MARK_COLORS.pine} />
      <circle cx={b.cx} cy={b.cy} r={b.r} fill={MARK_COLORS.plaster} />
      {holes(b).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={b.holeR} fill={MARK_COLORS.pine} />
      ))}
      <g transform={STANCE.small}>
        <rect {...SMALL_BODY} fill={MARK_COLORS.marigold} />
        <circle {...HEAD} fill={MARK_COLORS.plaster} />
        <path d={BEANIE} fill={MARK_COLORS.beanie} />
      </g>
    </>
  );
}

function MonoMark({ small }: { small: boolean }) {
  const b = small ? BUTTON.small : BUTTON.full;
  // Even-odd does the carving: the disc, then (full cut only) a thin groove
  // where the dish meets the rim, then the four holes.
  const groove = small ? "" : ring(b.cx, b.cy, b.dish + 0.5) + ring(b.cx, b.cy, b.dish - 0.5);
  const disc = ring(b.cx, b.cy, b.r) + groove + holes(b).map(([x, y]) => ring(x, y, b.holeR)).join("");
  return (
    <g fill="currentColor">
      <path d={disc} fillRule="evenodd" />
      <g transform={small ? STANCE.small : STANCE.full}>
        {small ? <rect {...SMALL_BODY} /> : (
          <>
            <path d={LEGS} />
            <rect {...TORSO} />
            <path d={ARM} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle {...POMPOM} />
          </>
        )}
        <path d={BEANIE} />
        <path d={MONO_FACE} />
      </g>
    </g>
  );
}

export function LogoMark({ size = 36, tone = "full", title }: {
  size?: number;
  tone?: LogoTone;
  /** Give the mark an accessible name when it stands alone as a link or button. */
  title?: string;
}) {
  const small = size < LOGO_SMALL_BELOW;
  return (
    <svg
      className="mh-logo__mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {tone === "mono" ? <MonoMark small={small} /> : small ? <SmallMark /> : <FullMark />}
    </svg>
  );
}

/**
 * The name as drawn in the wordmark. The one liberty taken with the typeface:
 * the dot on the "i" is a small marigold button, the same one the explorer
 * stands on. Screen readers get the plain name; the drawn letters are hidden
 * from them so nothing spells out a dotless i.
 */
function Wordmark() {
  const i = BRAND_NAME.lastIndexOf("i");
  if (i < 0) return <span className="mh-logo__word">{BRAND_NAME}</span>;
  return (
    <span className="mh-logo__word">
      <span className="mh-logo__name">{BRAND_NAME}</span>
      <span className="mh-logo__drawn" aria-hidden="true">
        {BRAND_NAME.slice(0, i)}
        <span className="mh-logo__i">ı<span className="mh-logo__tittle" /></span>
        {BRAND_NAME.slice(i + 1)}
      </span>
    </span>
  );
}

/**
 * Mark plus wordmark. The wordmark is live text rather than outlines so it
 * inherits the page's display face and never blurs.
 */
export function Logo({ size = 36, tone = "full", as: Tag = "span", style }: {
  size?: number;
  tone?: LogoTone;
  as?: "span" | "div";
  style?: CSSProperties;
}) {
  return (
    <Tag className="mh-logo" style={style}>
      <LogoMark size={size} tone={tone} />
      <Wordmark />
    </Tag>
  );
}
