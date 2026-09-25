import type { CSSProperties } from "react";

/*
 * Scenery: the few hand-drawn pieces the interface uses to tell its one story,
 * that the familiar world becomes enormous when you are tiny. All decorative
 * (aria-hidden), all plain SVG strokes and fills: no filters, no gradients, no
 * ids, so they cost nothing to paint and can be used many times on a page.
 */

/**
 * The portal arch: the hero's lit rim, stood upright as a doorway. Glow is
 * three stacked strokes (wide and faint, medium, bright core) instead of a
 * blur filter.
 */
export function PortalArch({ className = "", style }: { className?: string; style?: CSSProperties }) {
  const d = "M14 158V62a36 36 0 0 1 72 0v96";
  return (
    <svg className={`wk-arch ${className}`} style={style} viewBox="0 0 100 160" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax meet">
      <path d="M14 158V62a36 36 0 0 1 72 0v96Z" fill="#8b6cff" fillOpacity=".09" />
      <path d={d} fill="none" stroke="#8b6cff" strokeOpacity=".16" strokeWidth="16" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#b79cff" strokeOpacity=".45" strokeWidth="6" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#f4eeff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The tiny explorer, as in the logo and the game: teal beanie, marigold suit,
 * one arm up. `shadow` lays a long low-sun shadow across the floor, which is
 * what makes a small figure read as small in a big place.
 */
export function TinyExplorer({ className = "", style, shadow = true, wave = true }: {
  className?: string; style?: CSSProperties; shadow?: boolean; wave?: boolean;
}) {
  return (
    <svg className={`wk-explorer ${className}`} style={style} viewBox="-12 -16 44 18" aria-hidden="true" focusable="false">
      {shadow ? <path d="M-1.6 0h3.2l28 1.6c.9 0 .9.4 0 .4H-1.6Z" fill="#05010f" fillOpacity=".55" /> : null}
      <path d="M-2.2-3.6h1.8v2.7a.9.9 0 0 1-1.8 0ZM.4-3.6h1.8v2.7a.9.9 0 0 1-1.8 0Z" fill="#f2b24d" />
      <rect x="-2.6" y="-8.6" width="5.2" height="5.8" rx="2.2" fill="#f2b24d" />
      {wave ? <path d="M1.8-7.4 4.4-10.6" stroke="#f2b24d" strokeWidth="1.6" strokeLinecap="round" /> : null}
      <circle cx="0" cy="-11.1" r="2.6" fill="#f4eeff" />
      <path d="M-2.8-11.2a2.8 2.8 0 0 1 5.6 0Z" fill="#3f9f92" />
      <rect x="-3" y="-11.7" width="6" height="1.2" rx="0.6" fill="#2b7a70" />
      <circle cx="0" cy="-14.2" r="0.9" fill="#3f9f92" />
    </svg>
  );
}

/**
 * A giant four-hole sewing button, the logo's planet at room scale: it bleeds
 * off the edge of a section so it reads as far too big to fit.
 */
export function GiantButton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  const holes: [number, number][] = [[84, 84], [116, 84], [84, 116], [116, 116]];
  return (
    <svg className={`wk-giant-button ${className}`} style={style} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r="98" fill="#8b6cff" fillOpacity=".14" />
      <circle cx="100" cy="100" r="92" fill="#1f1142" />
      <circle cx="100" cy="100" r="92" fill="none" stroke="#c9b8ff" strokeOpacity=".5" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="#05010f" strokeOpacity=".5" strokeWidth="6" />
      <circle cx="100" cy="100" r="67" fill="none" stroke="#c9b8ff" strokeOpacity=".18" strokeWidth="1.2" />
      <path d="M84 84 116 116M116 84 84 116" stroke="#f2b24d" strokeOpacity=".8" strokeWidth="4" strokeLinecap="round" />
      {holes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="8" fill="#0c0419" />)}
    </svg>
  );
}
