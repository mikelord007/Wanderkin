import type { CSSProperties } from "react";
import { BRAND_NAME } from "../../brand.js";

/**
 * The Mousehold mark: a mousehole arch cut into a skirting board, with a
 * landscape inside it instead of darkness. One glyph for the whole promise —
 * a small doorway in something ordinary, and a whole country on the far side.
 *
 * Authored as vectors so it stays crisp from a 16px favicon to a print sheet.
 * `tone="mono"` reduces it to the arch silhouette in `currentColor`, for a
 * photo, a dark HUD, or anywhere the two-colour tile would fight the backdrop.
 */
export type LogoTone = "full" | "mono";

/** Arch geometry, shared by both tones so they stay the same silhouette. */
const ARCH = "M13 48V27a11 11 0 0 1 22 0v21Z";
/** The sun, drawn clockwise so `evenodd` knocks it out of the mono silhouette. */
const SUN = "M30 21.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z";

export function LogoMark({ size = 36, tone = "full", title }: {
  size?: number;
  tone?: LogoTone;
  /** Give the mark an accessible name when it stands alone as a link or button. */
  title?: string;
}) {
  const shared = {
    className: "mh-logo__mark",
    width: size,
    height: size,
    viewBox: "0 0 48 48",
    role: title ? ("img" as const) : undefined,
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
    focusable: "false" as const,
  };

  if (tone === "mono") {
    return (
      <svg {...shared}>
        <path d={`${ARCH}${SUN}`} fill="currentColor" fillRule="evenodd" />
      </svg>
    );
  }

  return (
    <svg {...shared}>
      <defs>
        <clipPath id="mh-logo-arch">
          <path d={ARCH} />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="48" height="48" rx="12" fill="var(--mh-pine, #1d3a2e)" />
      <g clipPath="url(#mh-logo-arch)">
        <rect x="13" y="15" width="22" height="33" fill="var(--mh-plaster, #f2efe5)" />
        <circle cx="30" cy="25" r="3.4" fill="var(--mh-marigold, #e8a33d)" />
        <ellipse cx="17" cy="48" rx="14" ry="12" fill="var(--mh-fern, #56997a)" />
        <ellipse cx="37" cy="47" rx="12" ry="9" fill="var(--mh-ivy, #2e6b4f)" />
      </g>
    </svg>
  );
}

/**
 * Mark plus wordmark. The wordmark is live text rather than outlines so it
 * inherits the page's display face, stays selectable, and never blurs.
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
      <span className="mh-logo__word">{BRAND_NAME}</span>
    </Tag>
  );
}
