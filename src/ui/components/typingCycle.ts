/**
 * The hero headline's typewriter: "Your ___ is a ___." with an everyday
 * object in the first slot and the landscape it becomes at explorer scale in
 * the second. This module is the timing and state machine only; the React
 * side (TypingHeadline.tsx) renders whatever state it is handed.
 */

export interface TypingPair {
  /** Follows "Your". */
  object: string;
  /** Follows "is a", so it must start with a consonant sound. */
  landscape: string;
}

/** What each object becomes when you are a few centimetres tall. Ordered so
 * neighbours contrast: warm then cold, green then built, fire then water. */
export const HEADLINE_PAIRS: readonly TypingPair[] = [
  { object: "sofa", landscape: "mountain range" }, // cushions are peaks, the seams are passes
  { object: "fridge", landscape: "glacier wall" }, // white, sheer, cold to the touch
  { object: "houseplant", landscape: "jungle canopy" }, // leaves overhead, roots underfoot
  { object: "keyboard", landscape: "stepped city" }, // rows of square blocks, streets between
  { object: "teapot", landscape: "volcano island" }, // a round cone with a vent on top
  { object: "sneaker", landscape: "sea cave" }, // one opening, a long dark hollow inside
  { object: "toy plane", landscape: "cliffside runway" }, // a long flat wing ending in a drop
  { object: "bicycle", landscape: "rope bridge" }, // thin spans strung between two wheels
  { object: "desk", landscape: "canyon plateau" }, // a flat top with a gorge beneath it
];

export const TIMING = {
  /** The first pair sits still this long before anything moves. */
  firstHold: 1500,
  hold: 2600,
  /** The word about to go is highlighted, caret blinking after it, this
   * long before deleting starts. */
  caretLead: 400,
  deleteChar: 35,
  /** Empty slot, caret blinking, before the new word starts. */
  gap: 220,
  typeChar: 55,
  /** Each typed character lands up to this much early or late. */
  typeJitter: 18,
  /** The finished word sits with the caret after it before moving on. */
  rest: 400,
  /** Reduced motion: how long each pair stays, and each half of the fade. */
  reducedHold: 4000,
  fade: 450,
} as const;

export type Slot = "object" | "landscape";
export type Phase = "hold" | "caret" | "delete" | "gap" | "type" | "rest" | "fadeOut" | "fadeIn";
/** Always shown: "blink" while it waits, "solid" while characters change,
 * "static" (no blink) under reduced motion. */
export type Caret = "solid" | "blink" | "static";

export interface CycleState {
  /** The pair on screen in "hold", otherwise the pair being written. */
  pair: number;
  object: string;
  landscape: string;
  phase: Phase;
  /** The slot being edited, if any. */
  slot: Slot | null;
  /** True only for the very first hold after page load. */
  first: boolean;
}

/** The pair at `index`; the lists here are never empty. */
export function pairAt(pairs: readonly TypingPair[], index: number): TypingPair {
  const pair = pairs[index];
  if (!pair) throw new Error(`no headline pair ${index}`);
  return pair;
}

export function initialState(pairs: readonly TypingPair[] = HEADLINE_PAIRS): CycleState {
  const start = pairAt(pairs, 0);
  return { pair: 0, object: start.object, landscape: start.landscape, phase: "hold", slot: null, first: true };
}

export function caretOf(state: CycleState, reducedMotion = false): Caret {
  if (reducedMotion) return "static";
  return state.phase === "delete" || state.phase === "type" ? "solid" : "blink";
}

/** Where the caret sits: in the slot being edited, otherwise after the last
 * slot edited, which is the landscape at the end of the sentence. */
export function caretSlot(state: CycleState): Slot {
  return state.slot ?? "landscape";
}

/** The slot whose word is tinted: from just before it is deleted until the
 * new word is fully typed. */
export function highlightOf(state: CycleState): Slot | null {
  switch (state.phase) {
    case "caret": case "delete": case "gap": case "type": return state.slot;
    default: return null;
  }
}

/** Slot text faded out (reduced motion only). */
export function isFaded(state: CycleState): boolean {
  return state.phase === "fadeOut";
}

/** How long a state stays on screen before `step` replaces it. */
export function delayFor(state: CycleState, reducedMotion: boolean, random: () => number = Math.random): number {
  switch (state.phase) {
    case "hold": return reducedMotion ? TIMING.reducedHold : state.first ? TIMING.firstHold : TIMING.hold;
    case "caret": return TIMING.caretLead;
    case "delete": return TIMING.deleteChar;
    case "gap": return TIMING.gap;
    case "type": return Math.round(TIMING.typeChar + (random() * 2 - 1) * TIMING.typeJitter);
    case "rest": return TIMING.rest;
    case "fadeOut": case "fadeIn": return TIMING.fade;
  }
}

/** The state after this one. Deletes and types one character per step. */
export function step(state: CycleState, pairs: readonly TypingPair[] = HEADLINE_PAIRS, reducedMotion = false): CycleState {
  const base = { ...state, first: false };
  const slot = state.slot ?? "object";
  const shown = state[slot];
  const target = pairAt(pairs, state.pair)[slot];
  switch (state.phase) {
    case "hold": {
      const pair = (state.pair + 1) % pairs.length;
      return reducedMotion
        ? { ...base, pair, phase: "fadeOut", slot: null }
        : { ...base, pair, phase: "caret", slot: "object" };
    }
    case "caret":
      return { ...base, phase: "delete" };
    case "delete": {
      const next = shown.slice(0, -1);
      return { ...base, [slot]: next, phase: next ? "delete" : "gap" };
    }
    case "gap":
      return { ...base, [slot]: target.slice(0, 1), phase: target.length > 1 ? "type" : "rest" };
    case "type": {
      const next = target.slice(0, shown.length + 1);
      return { ...base, [slot]: next, phase: next === target ? "rest" : "type" };
    }
    case "rest":
      return slot === "object"
        ? { ...base, phase: "caret", slot: "landscape" }
        : { ...base, phase: "hold", slot: null };
    case "fadeOut":
      return { ...base, ...pairAt(pairs, state.pair), phase: "fadeIn" };
    case "fadeIn":
      return { ...base, phase: "hold" };
  }
}

/** A clean hold on whichever pair is on screen or being written, for when
 * reduced motion is switched on or off mid-word. */
export function settle(state: CycleState, pairs: readonly TypingPair[] = HEADLINE_PAIRS): CycleState {
  if (state.phase === "hold") return state;
  const { object, landscape } = pairAt(pairs, state.pair);
  return { ...state, object, landscape, phase: "hold", slot: null };
}

export interface CycleTimers {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface CycleDriver {
  readonly state: CycleState;
  /** Runs only while active: pass false when the tab is hidden or the
   * headline is off screen. The current state resumes where it stopped. */
  setActive(active: boolean): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}

export function createCycleDriver(options: {
  pairs?: readonly TypingPair[];
  reducedMotion?: boolean;
  onChange: (state: CycleState) => void;
  random?: () => number;
  timers?: CycleTimers;
}): CycleDriver {
  const pairs = options.pairs ?? HEADLINE_PAIRS;
  const random = options.random ?? Math.random;
  const timers: CycleTimers = options.timers ?? {
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  let reduced = options.reducedMotion ?? false;
  let state = initialState(pairs);
  let active = false;
  let handle: unknown = null;

  const cancel = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const schedule = () => {
    handle = timers.setTimeout(() => {
      handle = null;
      state = step(state, pairs, reduced);
      options.onChange(state);
      if (active) schedule();
    }, delayFor(state, reduced, random));
  };

  return {
    get state() { return state; },
    setActive(next) {
      if (next === active) return;
      active = next;
      cancel();
      if (active) schedule();
    },
    setReducedMotion(next) {
      if (next === reduced) return;
      reduced = next;
      const settled = settle(state, pairs);
      if (settled !== state) {
        state = settled;
        options.onChange(state);
      }
      cancel();
      if (active) schedule();
    },
    dispose() {
      active = false;
      cancel();
    },
  };
}
