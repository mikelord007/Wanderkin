/**
 * The grappling hook's HUD: a reticle at screen centre and a one-time hint.
 *
 * The reticle's state is written straight to its `data-state` by the stage's
 * frame loop, so aiming never re-renders React: a faint `dot` in normal play,
 * and while the hook button is held the full reticle — `locked` over an
 * anchor, `far` over a surface out of range, `open` over nothing, `busy`
 * while the hook is out. Its own stylesheet keeps it apart from `hud.css`.
 */

import type { RefObject } from "react";
import "./grapple.css";

export const GRAPPLE_HINT_COPY = {
  title: "Hold right-click to aim,",
  body: "release to hook (or hold F)",
} as const;

/** Shown under the reticle while aiming at a surface beyond the hook's reach. */
export const GRAPPLE_OUT_OF_RANGE_COPY = "Too far";

/** Session key for the hint, beside the world intros' `objectquest:intro:*`. */
export const GRAPPLE_HINT_KEY = "objectquest:intro:grapple-hook";

interface HintStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function sessionStore(): HintStore | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * True the first time it is asked in a browser session, false after. The
 * hint is marked seen as soon as it is shown, so a reload does not repeat it.
 */
export function claimGrappleHint(store: HintStore | null = sessionStore()): boolean {
  if (!store) return false;
  try {
    if (store.getItem(GRAPPLE_HINT_KEY) === "seen") return false;
    store.setItem(GRAPPLE_HINT_KEY, "seen");
    return true;
  } catch {
    return false;
  }
}

export function GrappleReticle({ reticleRef }: { reticleRef: RefObject<HTMLDivElement> }) {
  return (
    <div className="oq-grapple-reticle" ref={reticleRef} data-state="hidden" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32">
        {/* Each mark is drawn twice, a dark plum under a light top, so it
            holds contrast on bright sky and dark furniture alike. */}
        <g className="oq-grapple-reticle__open">
          <circle cx="16" cy="16" r="6.5" className="oq-grapple-reticle__under" />
          <circle cx="16" cy="16" r="6.5" className="oq-grapple-reticle__over" />
        </g>
        <g className="oq-grapple-reticle__locked">
          <path d="M16 3.5 L16 9 M28.5 16 L23 16 M16 28.5 L16 23 M3.5 16 L9 16" className="oq-grapple-reticle__under" />
          <path d="M16 3.5 L16 9 M28.5 16 L23 16 M16 28.5 L16 23 M3.5 16 L9 16" className="oq-grapple-reticle__over" />
          <path d="M16 11.5 L20.5 16 L16 20.5 L11.5 16 Z" className="oq-grapple-reticle__gem" />
        </g>
        <circle cx="16" cy="16" r="1.6" className="oq-grapple-reticle__dot" />
      </svg>
      <span className="oq-grapple-reticle__range">{GRAPPLE_OUT_OF_RANGE_COPY}</span>
    </div>
  );
}

export function GrappleHint() {
  return (
    <div className="oq-grapple-hint" role="status">
      {/* A mouse with its right button lit: "hold right-click". */}
      <span className="oq-grapple-hint__key" aria-hidden="true">
        <svg viewBox="0 0 16 20" width="14" height="18">
          <rect x="1.5" y="1.5" width="13" height="17" rx="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 1.5 V8" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8.8 2.3 A6 6 0 0 1 13.7 8 H8.8 Z" fill="currentColor" />
        </svg>
      </span>
      <strong>{GRAPPLE_HINT_COPY.title}</strong>
      <span>{GRAPPLE_HINT_COPY.body}</span>
    </div>
  );
}
