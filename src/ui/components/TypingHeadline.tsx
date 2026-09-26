import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../game/render/useReducedMotion.js";
import { useInView } from "./useInView.js";
import {
  caretOf, caretSlot, createCycleDriver, HEADLINE_PAIRS, highlightOf, initialState, isFaded, pairAt,
  type CycleDriver, type CycleState, type Slot, type TypingPair,
} from "./typingCycle.js";

interface TypingHeadlineProps {
  id?: string;
  className?: string;
  pairs?: readonly TypingPair[];
}

/** The sentence a screen reader and a search engine get, whatever is typing. */
export function headlineLabel(pairs: readonly TypingPair[] = HEADLINE_PAIRS): string {
  const { object, landscape } = pairAt(pairs, 0);
  return `Your ${object} is a ${landscape}.`;
}

/**
 * "Your ___ is a ___." with both blanks retyped in turn. The heading's name is
 * fixed (visually hidden text); the typing is aria-hidden, so nothing
 * flickers or announces. Each line stays centred: a slot's width follows its
 * word, measured from a hidden copy and eased by CSS, so the line glides as
 * letters come and go. Pauses off screen and in a background tab; under
 * reduced motion the pairs fade instead of typing.
 */
export function TypingHeadline({ id, className, pairs = HEADLINE_PAIRS }: TypingHeadlineProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const view = useInView(ref);
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState<CycleState>(() => initialState(pairs));
  const driver = useRef<CycleDriver | null>(null);

  useEffect(() => {
    const created = createCycleDriver({ pairs, reducedMotion, onChange: setState });
    driver.current = created;
    setState(created.state);
    return () => { created.dispose(); driver.current = null; };
    // One driver per pair list; motion and view changes are pushed to it below.
  }, [pairs]);
  useEffect(() => { driver.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);
  useEffect(() => { driver.current?.setActive(view.active); }, [view.active, pairs]);

  // Each slot is as wide as its hidden copy of the word. A ResizeObserver
  // catches both a new letter and a new font size (viewport change).
  useEffect(() => {
    const heading = ref.current;
    if (!heading || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const slot = (entry.target as HTMLElement).parentElement;
        if (slot) slot.style.width = `${(entry.target as HTMLElement).getBoundingClientRect().width}px`;
      }
    });
    heading.querySelectorAll(".wk-typing__measure").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const caret = caretOf(state, reducedMotion);
  const caretAt = caretSlot(state);
  const highlight = highlightOf(state);
  const faded = isFaded(state);
  const slot = (name: Slot) => (
    <>
      <span className={`wk-typing__slot wk-typing__slot--${name}`} data-highlight={highlight === name || undefined}>
        <span className="wk-typing__measure">{state[name]}</span>
        <span className="wk-typing__word" data-faded={faded || undefined}>{state[name]}</span>
      </span>
      {/* Both slots keep a caret cell so the lines never change width when it moves. */}
      <span className="wk-typing__caret" data-caret={caretAt === name ? caret : undefined} />
    </>
  );

  return (
    <h1 id={id} ref={ref} className={["wk-typing", className ?? ""].filter(Boolean).join(" ")}>
      <span className="oq-kit-sr-only">{headlineLabel(pairs)}</span>
      <span className="wk-typing__lines" aria-hidden="true">
        <span className="wk-typing__line">Your {slot("object")}</span>
        <span className="wk-typing__line">is a {slot("landscape")}.</span>
      </span>
    </h1>
  );
}
