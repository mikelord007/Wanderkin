import type { ReactNode } from "react";
import { Icon } from "../components/index.js";

/** A world with no picture yet: a blank print on the lavender stage, saying so
 * plainly, so the tile never pretends to show something it doesn't have. */
export function NoPicture() {
  return <div className="wk-no-picture" aria-hidden="true">
    <span className="wk-print"><Icon name="photo" /></span>
    <span className="wk-no-picture__label">No picture yet</span>
  </div>;
}

export type TileStatus = "ready" | "draft" | "pending" | "failed" | "building";

/** One world in the library: a 16:9 picture with a status badge on it, then
 * its name and details, then one primary action and quiet secondary ones.
 * Worlds still being built use the same tile, with a progress strip laid over
 * the foot of the picture (`overlay`) and, optionally, a title that opens
 * the world's progress (`onOpen`), which makes the whole card clickable. */
export function WorldTile({ status, badge, title, image = null, meta, notice, actions, overlay, onOpen, openLabel, children }: {
  status: TileStatus; badge: string; title: string; image?: string | null;
  meta?: string; notice?: ReactNode; actions?: ReactNode; overlay?: ReactNode;
  onOpen?: () => void; openLabel?: string; children?: ReactNode;
}) {
  return <article className={`wk-tile${onOpen ? " wk-tile--openable" : ""}`} data-status={status}>
    <div className="wk-tile__image">
      {image ? <img src={image} alt="" loading="lazy" /> : <NoPicture />}
      <p className="wk-tile__badge">{badge}</p>
      {overlay}
    </div>
    <div className="wk-tile__info">
      <h3>{onOpen
        ? <button type="button" className="wk-tile__open" onClick={onOpen} {...(openLabel ? { "aria-label": `${title}: ${openLabel}` } : {})}>{title}</button>
        : title}</h3>
      {meta ? <p className="wk-tile__meta">{meta}</p> : null}
      {notice}
      {actions ? <div className="wk-tile__actions">{actions}</div> : null}
      {children}
    </div>
  </article>;
}
