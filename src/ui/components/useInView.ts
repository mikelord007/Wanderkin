import { useEffect, useState, type RefObject } from "react";

export interface ViewState {
  /** Has been near the viewport at least once: safe to load what it shows. */
  seen: boolean;
  /** Near the viewport now and the tab is visible: worth animating or rendering. */
  active: boolean;
}

export const OFFSCREEN: ViewState = { seen: false, active: false };

/** The next view state. `seen` is sticky, so a loaded model or image stays
 * loaded after the user scrolls past; `active` follows the viewport and the
 * tab, so nothing animates or renders offscreen or in a background tab. */
export function nextViewState(prev: ViewState, intersecting: boolean, documentHidden: boolean): ViewState {
  const seen = prev.seen || intersecting;
  const active = intersecting && !documentHidden;
  return seen === prev.seen && active === prev.active ? prev : { seen, active };
}

/**
 * Tracks whether an element is near the viewport (grown by `rootMargin`) and
 * whether the page is visible. Without IntersectionObserver the element is
 * treated as always on screen.
 */
export function useInView(ref: RefObject<Element | null>, rootMargin = "0px"): ViewState {
  const [state, setState] = useState<ViewState>(OFFSCREEN);
  useEffect(() => {
    const element = ref.current;
    let intersecting = false;
    const update = () => setState((prev) => nextViewState(prev, intersecting, document.hidden));
    const onVisibility = () => update();
    document.addEventListener("visibilitychange", onVisibility);
    let observer: IntersectionObserver | null = null;
    if (!element || typeof IntersectionObserver === "undefined") {
      intersecting = true;
      update();
    } else {
      observer = new IntersectionObserver((entries) => {
        intersecting = entries.some((entry) => entry.isIntersecting);
        update();
      }, { rootMargin });
      observer.observe(element);
    }
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ref, rootMargin]);
  return state;
}
