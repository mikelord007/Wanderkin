import type { GameModeId, SceneBiomeId, StyleId } from "@shared/index.js";

/**
 * The prompt for a world's own soundtrack. Every world gets the same base:
 * upbeat, bright chiptune in the spirit of classic Game Boy platformers,
 * because plain "instrumental" music tended to come out nostalgic or sad.
 * The object the world is built from, its look, biome and mode only flavour
 * that base. The music capability is also sent `instrumental: true`, but the
 * model has still sung, so the ban is spelled out in words as well.
 */

export const MUSIC_BASE = "Upbeat, bright, bouncy major-key chiptune game music in the spirit of classic Game Boy and retro platformer soundtracks: 8-bit and 16-bit style synths, punchy drums, a playful catchy melody, medium-fast tempo around 120-150 bpm";
export const NEVER_SAD = "Never slow, melancholic, ambient or sad";
export const NO_VOCALS = "instrumental only, no vocals, no singing, no lyrics, no spoken words";
/** Well inside the 4000 characters the jobs route accepts; the player's own
 * words are capped so no prompt grows past this. */
export const MAX_MUSIC_PROMPT_LENGTH = 900;

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
  [/\b(?:(?:air|aero)?planes?|jets?|gliders?|kites?|birds?|balloons?|rockets?|helicopters?|drones?|wings?|feathers?|butterfl(?:y|ies))\b/i, "airy and soaring, with leaping melodies and a feeling of flight"],
  [/\b(?:sofas?|couch(?:es)?|armchairs?|chairs?|beds?|pillows?|cushions?|blankets?|quilts?|mugs?|cups?|teacups?|teapots?|kettles?|fireplaces?|slippers?|rugs?)\b/i, "cosy and warm but still bouncy, a cheerful at-home romp"],
  [/\b(?:cars?|trucks?|trains?|buses|bus|bikes?|bicycles?|scooters?|skateboards?|tractors?|vans?)\b/i, "zippy and rolling, with a vroom-along rhythm"],
  [/\b(?:boats?|ships?|yachts?|submarines?|fish|shells?|ducks?|sea|ocean|waves?)\b/i, "splashy and bubbly, with a swaying sea-shanty bounce"],
  [/\b(?:plants?|flowers?|trees?|cact(?:us|i)|leaf|leaves|gardens?|forests?|mushrooms?|pots?)\b/i, "fresh and sprouting, a springy garden hop"],
  [/\b(?:robots?|computers?|laptops?|keyboards?|phones?|consoles?|gadgets?|clocks?|watch(?:es)?|cameras?|speakers?)\b/i, "sparkly and techy, with blippy arpeggios"],
  [/\b(?:cakes?|cookies?|cand(?:y|ies)|fruits?|apples?|bananas?|donuts?|sweets?)\b/i, "sweet and sugary, a candy-land skip"],
  [/\b(?:dinosaurs?|dragons?|monsters?|lions?|tigers?|sharks?)\b/i, "bold and adventurous, but always friendly"],
  [/\b(?:books?|desks?|pencils?|pens?|notebooks?|lamps?|globes?)\b/i, "clever and curious, a brainy puzzle-level bounce"],
  [/\b(?:teddy|teddies|bears?|dolls?|toys?|plush(?:ies)?|puppets?|blocks?)\b/i, "playful and cuddly, a toybox parade"],
];

const DEFAULT_MOOD = "cheerful and curious, a sunny first-level feel";

const MODE_FEEL: Readonly<Record<GameModeId, string>> = {
  explore: "an easy-going, happy skip for wandering around",
  collect: "a hoppy treasure-hunt bounce",
  race: "fast, driving race energy near 150 bpm",
};

/** The look's chiptune voicing; none of them slows the base down. */
const STYLE_PALETTE: Readonly<Record<StyleId, string>> = {
  cartoon: "bright square-wave lead and bubbly arpeggios",
  "hand-painted": "warm pulse-wave lead with a plucky chiptune bassline",
  watercolor: "sparkly triangle-wave lead with shimmering arpeggios",
};

const BIOME_FEEL: Readonly<Record<SceneBiomeId, string>> = {
  original: "",
  tropical: "a sunny island flavour with steel-drum-like blips",
  desert: "a hot desert-level flavour with snappy hand-drum hits",
  alpine: "a crisp, sparkly snow-level flavour with jingly bells",
  autumn: "a cheerful harvest-festival flavour",
  ember: "a fiery lava-level flavour with extra punch",
  monsoon: "a splashy rain-dance flavour with pitter-patter percussion",
};

/** Words that invite a voice or a sad mood, and prompt tricks, never reach
 * the model. */
const BLOCKED_WORDS = /\b(?:sing\w*|sang|sung|songs?|lyric\w*|vocal\w*|voices?|choirs?|chant\w*|rap|rapping|rapper\w*|singer\w*|humming|whistl\w*|sad\w*|slow\w*|melanchol\w*|nostalgi\w*|mellow\w*|gloom\w*|mournful|somb(?:er|re)|wistful|lonely|lullab\w*|ambient|calm\w*|dream\w*|ignore|instructions?|prompts?)\b\s*,?/gi;

function clean(text: string | undefined, max: number): string {
  const words = (text ?? "")
    .replace(/[\u0000-\u001f<>{}[\]`"\\]/g, " ")
    .replace(BLOCKED_WORDS, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?:\s*[,.;:!?])+/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, "");
  if (words.length <= max) return words;
  const cut = words.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trim();
}

/** The flavour a recognisable object suggests, or null. */
export function objectMood(text: string): string | null {
  return OBJECT_MOODS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function worldMusicPrompt(input: MusicPromptInput): string {
  const object = clean(input.objectDescription, 50);
  const atmosphere = clean(input.atmosphere, 60);
  const setting = object ? `a tiny world built around ${object}${atmosphere ? `, ${atmosphere}` : ""}` : atmosphere ? `a tiny world: ${atmosphere}` : "a tiny object world";
  return [
    MUSIC_BASE,
    `For a family game set in ${setting}`,
    `Flavour: ${objectMood(`${object} ${atmosphere}`) ?? DEFAULT_MOOD}`,
    MODE_FEEL[input.mode],
    input.biome ? BIOME_FEEL[input.biome] : "",
    `Sound: ${STYLE_PALETTE[input.style]}`,
    "A seamless 15-second loop that keeps the energy up, mixed as background music under gameplay",
    NEVER_SAD,
    `Important: ${NO_VOCALS}`,
  ].filter(Boolean).map(capitalise).join(". ") + ".";
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
