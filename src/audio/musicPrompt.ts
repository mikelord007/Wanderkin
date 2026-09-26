import type { GameModeId, SceneBiomeId, StyleId } from "@shared/index.js";

/**
 * The prompt for a world's own soundtrack: quiet instrumental background
 * music shaped by the object the world is built from, its look, biome and
 * mode. The music capability is also sent `instrumental: true`, but the model
 * has still sung, so the ban is spelled out in words as well.
 */

export const NO_VOCALS = "instrumental only, no vocals, no singing, no lyrics, no spoken words";

export interface MusicPromptInput {
  style: StyleId;
  mode: GameModeId;
  /** The player's own atmosphere words (untrusted). */
  atmosphere: string;
  /** What the world is built from, e.g. "a toy plane" (untrusted), when known. */
  objectDescription?: string;
  biome?: SceneBiomeId;
}

/** First match wins, so flight beats the generic toy mood for a toy plane. */
const OBJECT_MOODS: readonly [RegExp, string][] = [
  [/\b(?:(?:air|aero)?planes?|jets?|gliders?|kites?|birds?|balloons?|rockets?|helicopters?|drones?|wings?|feathers?|butterfl(?:y|ies))\b/i, "light, airy and soaring, with gently lifting melodies and a feeling of flight"],
  [/\b(?:sofas?|couch(?:es)?|armchairs?|chairs?|beds?|pillows?|cushions?|blankets?|quilts?|mugs?|cups?|teacups?|teapots?|kettles?|fireplaces?|slippers?|rugs?)\b/i, "cosy and warm, soft and homely, like a quiet afternoon at home"],
  [/\b(?:cars?|trucks?|trains?|buses|bus|bikes?|bicycles?|scooters?|skateboards?|tractors?|vans?)\b/i, "bouncy and upbeat, with a playful rolling rhythm"],
  [/\b(?:boats?|ships?|yachts?|submarines?|fish|shells?|ducks?|sea|ocean|waves?)\b/i, "gently flowing and watery, with a calm lapping rhythm"],
  [/\b(?:plants?|flowers?|trees?|cact(?:us|i)|leaf|leaves|gardens?|forests?|mushrooms?|pots?)\b/i, "fresh and green, with a light pastoral feel"],
  [/\b(?:robots?|computers?|laptops?|keyboards?|phones?|consoles?|gadgets?|clocks?|watch(?:es)?|cameras?|speakers?)\b/i, "curious and sparkly, with soft light electronic plucks"],
  [/\b(?:cakes?|cookies?|cand(?:y|ies)|fruits?|apples?|bananas?|donuts?|sweets?)\b/i, "sweet and bouncy, cheerful and light"],
  [/\b(?:dinosaurs?|dragons?|monsters?|lions?|tigers?|sharks?)\b/i, "adventurous and bold, but always friendly"],
  [/\b(?:books?|desks?|pencils?|pens?|notebooks?|lamps?|globes?)\b/i, "thoughtful and calm, full of quiet wonder"],
  [/\b(?:teddy|teddies|bears?|dolls?|toys?|plush(?:ies)?|puppets?|blocks?)\b/i, "playful and gentle, with a lullaby-like toybox feel"],
];

const DEFAULT_MOOD = "friendly and curious, gently whimsical";

const MODE_FEEL: Readonly<Record<GameModeId, string>> = {
  explore: "unhurried, relaxed tempo for wandering",
  collect: "light, curious bounce for a treasure hunt",
  race: "lively, driving tempo that stays bright and never harsh",
};

const STYLE_PALETTE: Readonly<Record<StyleId, string>> = {
  cartoon: "bright marimba, pizzicato strings and soft glockenspiel",
  "hand-painted": "acoustic guitar, warm strings and wooden flute",
  watercolor: "felt piano, airy woodwinds and soft pads",
};

const BIOME_FEEL: Readonly<Record<SceneBiomeId, string>> = {
  original: "",
  tropical: "a sunny island lilt with soft hand percussion",
  desert: "warm, open and spacious, a gentle desert shimmer",
  alpine: "crisp and clear, a fresh mountain-air sparkle",
  autumn: "mellow and golden, a gentle autumn glow",
  ember: "warm and glowing, a low cosy hum of embers",
  monsoon: "soft and misty, a calm rainy-day patter",
};

/** Words that invite a voice, and prompt tricks, never reach the model. */
const BLOCKED_WORDS = /\b(?:sing\w*|sang|sung|songs?|lyric\w*|vocal\w*|voices?|choirs?|chant\w*|rap|rapping|rapper\w*|singer\w*|humming|whistl\w*|ignore|instructions?|prompts?)\b/gi;

function clean(text: string | undefined, max: number): string {
  const words = (text ?? "")
    .replace(/[\u0000-\u001f<>{}[\]`"\\]/g, " ")
    .replace(BLOCKED_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.,;:!?]+$/, "");
  if (words.length <= max) return words;
  const cut = words.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trim();
}

/** The mood a recognisable object suggests, or null. */
export function objectMood(text: string): string | null {
  return OBJECT_MOODS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function worldMusicPrompt(input: MusicPromptInput): string {
  const object = clean(input.objectDescription, 80);
  const atmosphere = clean(input.atmosphere, 120);
  const setting = object ? `a tiny world built around ${object}${atmosphere ? `, ${atmosphere}` : ""}` : atmosphere ? `a tiny world: ${atmosphere}` : "a tiny object world";
  return [
    `Instrumental background music for a gentle family game set in ${setting}`,
    `Mood: ${objectMood(`${object} ${atmosphere}`) ?? DEFAULT_MOOD}`,
    MODE_FEEL[input.mode],
    input.biome ? BIOME_FEEL[input.biome] : "",
    `Instruments: ${STYLE_PALETTE[input.style]}`,
    "A soft, loopable background bed: steady and low-key under gameplay, no big climaxes, clean seamless loop",
    `Important: ${NO_VOCALS}`,
  ].filter(Boolean).map(capitalise).join(". ") + ".";
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
