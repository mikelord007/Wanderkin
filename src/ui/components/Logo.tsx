import type { CSSProperties } from "react";
import { BRAND_NAME } from "../../brand.js";

/**
 * The Wanderkin mark: planetrise over a sewing button.
 *
 * The button is a planet rising on the product's purple: a pale lavender
 * disc with a bright white rim and a violet halo round its upper edge. Its four
 * holes glow, its stitching is marigold thread, and the tiny explorer (the
 * in-game teal beanie and marigold suit, arm up as if they've just spotted
 * something) stands on the lit rim. One picture of the product: an everyday
 * object becomes a world, and you are very small on it.
 *
 * No gradients and no ids: the glow is solid circles stacked from haze to rim,
 * so the drawing renders identically inline, in an <img>, as a favicon, and
 * in the static copies.
 *
 * Three drawings share one set of coordinates:
 * - `full`: the purple tile, the lit rim in three steps, stitching, and the
 *   waving figure. From 24px up.
 * - The small optical cut, used automatically below 24px: a thicker rim,
 *   bigger holes, no stitching or arm, a larger and simpler figure. At 16px the
 *   full drawing's holes are half a pixel wide. This is the favicon.
 * - `mono`: one colour, `currentColor`, no tile. The rim becomes a single arc
 *   held apart from the planet. For light grounds, photos, or anywhere a
 *   single ink is needed.
 *
 * `public/brand/wanderkin-mark.svg`, `wanderkin-favicon.svg`,
 * `wanderkin-mark-mono.svg` and the boot screen in `index.html` are copies of
 * these drawings. `Logo.test.ts` checks they have not drifted.
 */
export type LogoTone = "full" | "mono";

/** Below this rendered size the mark switches to the small optical cut. */
export const LOGO_SMALL_BELOW = 24;

/** Brand colours as drawn by the mark. They match the `--wk-*` tokens: the
 * light product's purple as the tile, and the planet in the page's lavender
 * white, rising with its white rim. */
export const MARK_COLORS = {
  night: "#6a4af6",
  planet: "#e4d9fd",
  violet: "#a58cff",
  rim: "#ffffff",
  hole: "#7b5cfa",
  marigold: "#f2b24d",
  thread: "#e39a2b",
  face: "#ffffff",
  beanie: "#3f9f92",
  beanieBand: "#2b7a70",
} as const;

/** A circle as one path segment, so it can join an even-odd compound path. */
function ring(cx: number, cy: number, r: number): string {
  return `M${+(cx - r).toFixed(2)} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
}

/**
 * The planet and its light, per cut. Each light circle sits a little higher
 * than the one in front of it, so the rim is thickest at the top and thins to
 * nothing at the sides: the shape of light round a planet's limb.
 */
const PLANET = {
  full: { cx: 24, cy: 33.5, r: 13.5, rim: { cy: 31.6, r: 14 }, band: { cy: 31.2, r: 14.9 }, haze: { cy: 31.6, r: 16.2 }, hole: 3.4, holeR: 1.8, holeCy: 33.8 },
  small: { cx: 24, cy: 34, r: 13.8, rim: { cy: 31.4, r: 14.8 }, band: { cy: 30.8, r: 15.8 }, haze: { cy: 0, r: 0 }, hole: 4.4, holeR: 2.4, holeCy: 34.6 },
} as const;

type Point = [number, number];

/** Rounded so float noise never reaches the SVG text. */
const q = (n: number) => +n.toFixed(2);

/** Top-left, top-right, bottom-left, bottom-right. */
function holes(p: (typeof PLANET)[keyof typeof PLANET]): [Point, Point, Point, Point] {
  return [
    [q(p.cx - p.hole), q(p.holeCy - p.hole)],
    [q(p.cx + p.hole), q(p.holeCy - p.hole)],
    [q(p.cx - p.hole), q(p.holeCy + p.hole)],
    [q(p.cx + p.hole), q(p.holeCy + p.hole)],
  ];
}

/** Where the explorer stands: upright, feet just into the top of the lit rim
 * (rim top is 17.6 on the full cut, 16.6 on the small one). */
const STANCE = {
  full: "translate(24 17.8) scale(.9)",
  small: "translate(24 16.8) scale(.98)",
  mono: "translate(24 16.4) scale(.9)",
  monoSmall: "translate(24 15.6) scale(.98)",
} as const;

/** The mono rim: an arc over the top of the planet, clear of its edge. */
const MONO_RIM = {
  full: { r: 16.2, width: 2.2 },
  small: { r: 16.6, width: 3 },
} as const;
function rimArc(cx: number, cy: number, r: number): string {
  const x = r * Math.cos(Math.PI / 6);
  const y = cy - r * Math.sin(Math.PI / 6);
  return `M${q(cx - x)} ${q(y)}A${r} ${r} 0 0 1 ${q(cx + x)} ${q(y)}`;
}

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
  const p = PLANET.full;
  const [tl, tr, bl, br] = holes(p);
  return (
    <>
      <rect x="0" y="0" width="48" height="48" rx="12" fill={MARK_COLORS.night} />
      <circle cx={p.cx} cy={p.haze.cy} r={p.haze.r} fill={MARK_COLORS.violet} fillOpacity=".28" />
      <circle cx={p.cx} cy={p.band.cy} r={p.band.r} fill={MARK_COLORS.violet} />
      <circle cx={p.cx} cy={p.rim.cy} r={p.rim.r} fill={MARK_COLORS.rim} />
      <circle cx={p.cx} cy={p.cy} r={p.r} fill={MARK_COLORS.planet} />
      <path
        d={`M${tl[0]} ${tl[1]} ${br[0]} ${br[1]}M${tr[0]} ${tr[1]} ${bl[0]} ${bl[1]}`}
        stroke={MARK_COLORS.thread}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {holes(p).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={p.holeR} fill={MARK_COLORS.hole} />
      ))}
      <g transform={STANCE.full}>
        <path d={LEGS} fill={MARK_COLORS.marigold} />
        <rect {...TORSO} fill={MARK_COLORS.marigold} />
        <path d={ARM} stroke={MARK_COLORS.marigold} strokeWidth="1.6" strokeLinecap="round" />
        <circle {...HEAD} fill={MARK_COLORS.face} />
        <path d={BEANIE} fill={MARK_COLORS.beanie} />
        <rect {...BEANIE_BAND} fill={MARK_COLORS.beanieBand} />
        <circle {...POMPOM} fill={MARK_COLORS.beanie} />
      </g>
    </>
  );
}

function SmallMark() {
  const p = PLANET.small;
  return (
    <>
      <rect x="0" y="0" width="48" height="48" rx="11" fill={MARK_COLORS.night} />
      <circle cx={p.cx} cy={p.band.cy} r={p.band.r} fill={MARK_COLORS.violet} />
      <circle cx={p.cx} cy={p.rim.cy} r={p.rim.r} fill={MARK_COLORS.rim} />
      <circle cx={p.cx} cy={p.cy} r={p.r} fill={MARK_COLORS.planet} />
      {holes(p).map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={p.holeR} fill={MARK_COLORS.hole} />
      ))}
      <g transform={STANCE.small}>
        <rect {...SMALL_BODY} fill={MARK_COLORS.marigold} />
        <circle {...HEAD} fill={MARK_COLORS.face} />
        <path d={BEANIE} fill={MARK_COLORS.beanie} />
      </g>
    </>
  );
}

function MonoMark({ small }: { small: boolean }) {
  const p = small ? PLANET.small : PLANET.full;
  const rim = small ? MONO_RIM.small : MONO_RIM.full;
  // Even-odd carves the holes out of the planet.
  const disc = ring(p.cx, p.cy, p.r) + holes(p).map(([x, y]) => ring(x, y, p.holeR)).join("");
  return (
    <g fill="currentColor">
      <path d={rimArc(p.cx, p.cy, rim.r)} fill="none" stroke="currentColor" strokeWidth={rim.width} strokeLinecap="round" />
      <path d={disc} fillRule="evenodd" />
      <g transform={small ? STANCE.monoSmall : STANCE.mono}>
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
 * The name as drawn in the wordmark, set in the interface face. The one
 * liberty taken with the typeface: the dot on the "i" is a small marigold
 * button, the same one the explorer's suit is cut from. Screen readers get the
 * plain name; the drawn letters are hidden from them so nothing spells out a
 * dotless i.
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
 * The horizontal lockup: mark plus wordmark. The wordmark is live text rather
 * than outlines so it inherits the page's colour and never blurs.
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
