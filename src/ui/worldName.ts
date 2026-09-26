import { STYLE_DEFINITIONS } from "@shared/index.js";
import { lookName } from "../biome/lookCatalog.js";
import type { CreationRecord } from "./creationFlow.js";

/** What scene preparation calls a world it has no name for. */
export const UNNAMED_LEVEL = "Imported level";

const PLACEHOLDER_TITLES = new Set([UNNAMED_LEVEL, "Untitled world"]);
const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

/** "Forest region, surrounded by trees" → "Forest Region";
 * "A lot of green clouds above." → "A Lot of Green Clouds". */
function atmosphereName(atmosphere: string): string | null {
  const phrase = atmosphere.split(/[,.;:!?\n]/)[0] ?? "";
  const words = phrase.replace(/[^\p{L}\p{N}' -]/gu, "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return null;
  return words
    .map((word, index) => (index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ")
    .slice(0, 40);
}

/**
 * The name a world made in Create is shown, prepared and saved under: its own
 * title if it has one, else the first words of its atmosphere, else its
 * locked biome ("Monsoon Marsh world"), else its look ("Cartoon world").
 * Never the scene's "Imported level". (Worlds no longer get a generated
 * story, so there is no quest title to wait for.)
 */
export function creationWorldName(creation: CreationRecord): string {
  const own = creation.title?.trim();
  if (own && !PLACEHOLDER_TITLES.has(own)) return own;
  return atmosphereName(creation.selection.atmosphere)
    ?? (creation.selection.biome ? `${lookName(creation.selection.biome)} world` : `${STYLE_DEFINITIONS[creation.selection.style].label} world`);
}
