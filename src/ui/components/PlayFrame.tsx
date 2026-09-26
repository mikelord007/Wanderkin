import type { HTMLAttributes, ReactNode } from "react";
import "./kit.css";
export function HUDChip({ children, label, announce = false }: { children: ReactNode; label?: string; announce?: boolean }) {
  return <div className="oq-kit-hud-chip" aria-label={label} role={announce ? "status" : undefined}>{children}</div>;
}
export interface PlayFrameProps extends HTMLAttributes<HTMLDivElement> {
  scene: ReactNode;
  hud?: ReactNode;
  actions?: ReactNode;
  controls?: ReactNode;
  /** Embedded preview only; default shell occupies viewport. */
  embedded?: boolean;
}
export function PlayFrame({ scene, hud, actions, controls, embedded = false, className = "", ...props }: PlayFrameProps) {
  return <div {...props} className={`oq-kit-play-frame ${embedded ? "oq-kit-play-frame--embedded" : ""} ${className}`}>
    <div className="oq-kit-play-frame__scene">{scene}</div>
    <div className="oq-kit-play-frame__top"><div className="oq-kit-play-frame__hud">{hud}</div><div className="oq-kit-row">{actions}</div></div>
    <div className="oq-kit-play-frame__bottom">{controls && <div className="oq-kit-play-frame__controls">{controls}</div>}</div>
  </div>;
}
