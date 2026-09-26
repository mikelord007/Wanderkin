import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../game/render/useReducedMotion.js";
import { useInView } from "./useInView.js";
import {
  caretOf, createCycleDriver, HEADLINE_PAIRS, initialState, isFaded, pairAt, slotSizers,
  type CycleDriver, type CycleState, type Slot, type TypingPair,
} from "./typingCycle.js";

interface TypingHeadlineProps {
  id?: string;
  className?: string;
  pairs?: readonly TypingPair[];
  /** A quiet accent underline under the object slot. */
  underlineObject?: boolean;
}

/** The sentence a screen reader and a search engine get, whatever is typing. */
export function headlineLabel(pairs: readonly TypingPair[] = HEADLINE_PAIRS): string {
  const { object, landscape } = pairAt(pairs, 0);
  return `Your ${object} is a ${landscape}.`;
}

/**
 * "Your ___ is a ___." with both blanks retyped in turn. The heading's name is
 * fixed (visually hidden text); the typing is aria-hidden, so nothing
 * flickers or announces. Each slot stacks every word it can hold, invisibly,
 * so the lines keep one width and never rewrap. Pauses off screen and in a
 * background tab; under reduced motion the pairs fade instead of typing.
 */
export function TypingHeadline({ id, className, pairs = HEADLINE_PAIRS, underlineObject = false }: TypingHeadlineProps) {
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

  const sizers = slotSizers(pairs);
  const caret = caretOf(state);
  const faded = isFaded(state);
  const slot = (name: Slot, suffix = "") => (
    <span className={`wk-typing__slot wk-typing__slot--${name}`}>
      {sizers[name].map((word) => <span key={word} className="wk-typing__sizer">{word}{suffix}</span>)}
      <span className="wk-typing__live" data-faded={faded || undefined}>
        <span className="wk-typing__word" data-caret={state.slot === name && caret !== "none" ? caret : undefined}>{state[name]}</span>{suffix}
      </span>
    </span>
  );

  return (
    <h1 id={id} ref={ref} className={["wk-typing", underlineObject ? "wk-typing--underline" : "", className ?? ""].filter(Boolean).join(" ")}>
      <span className="oq-kit-sr-only">{headlineLabel(pairs)}</span>
      <span className="wk-typing__lines" aria-hidden="true">
        <span className="wk-typing__line">Your {slot("object")}</span>
        <span className="wk-typing__line">is a {slot("landscape", ".")}</span>
      </span>
    </h1>
  );
}
