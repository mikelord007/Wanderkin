import { SCENE_BIOME_IDS, type SceneBiomeId, type SceneManifest } from "@shared/index.js";

/*
 * The player-facing catalog of world looks (biomes): a name, one short line
 * and a swatch for each. Data only, with no render code, so the Create flow's
 * biome step, the in-game panel and the dashboard all name a look the same
 * way without loading any of the 3D definitions.
 */

/** A look's tile art: a tiny landscape (sky fading to horizon over ground, with
 * one glint of its collectible colour), hand-copied from the palettes in
 * `src/biome/definitions/*.ts`. */
export interface LookSwatch { zenith: string; horizon: string; ground: string; glint: string }

export interface LookEntry {
  value: SceneBiomeId;
  label: string;
  description: string;
  /** Null for Original, which is the photographed place itself. */
  swatch: LookSwatch | null;
}

/** Keyed by every biome id, so a new id fails to compile until it is named
 * here; the tile order itself follows {@link SCENE_BIOME_IDS}. */
export const LOOK_LABELS: Record<SceneBiomeId, LookEntry> = {
  original: { value: "original", label: "Original", description: "Just the place in your photo", swatch: null },
  tropical: { value: "tropical", label: "Tropical Island", description: "Sand, palms and sea", swatch: { zenith: "#4fb4f5", horizon: "#d9f3ff", ground: "#f0d59a", glint: "#ffb347" } },
  desert: { value: "desert", label: "Desert", description: "Dunes, cacti and dust", swatch: { zenith: "#3f97e0", horizon: "#f4e2c4", ground: "#e6c089", glint: "#ff7a3d" } },
  alpine: { value: "alpine", label: "Snowy Alpine", description: "Snow, pines, cold light", swatch: { zenith: "#6fa8dc", horizon: "#e8f1f8", ground: "#f2f6fa", glint: "#ffb020" } },
  autumn: { value: "autumn", label: "Autumn Forest", description: "Russet leaves, low sun", swatch: { zenith: "#86a9c9", horizon: "#f0e2c8", ground: "#b3864f", glint: "#3fc9d6" } },
  ember: { value: "ember", label: "Volcanic Ember", description: "Ash, glow and dusk", swatch: { zenith: "#4a4a6e", horizon: "#e7a37a", ground: "#6a5650", glint: "#62d8ff" } },
  monsoon: { value: "monsoon", label: "Monsoon Marsh", description: "Rain, reeds and puddles", swatch: { zenith: "#6d7f8c", horizon: "#b9c6cb", ground: "#6a6a5c", glint: "#ffc23a" } },
};

/** Every look, in the shared biome order ("Original" is always first). */
export const LOOK_OPTIONS: readonly LookEntry[] = SCENE_BIOME_IDS.map((id) => LOOK_LABELS[id]);

/** What a world with no saved biome shows: older saves and the bundled
 * samples were always shown in Original unless the player switched in play. */
export const FALLBACK_BIOME: SceneBiomeId = "original";

export function isSceneBiomeId(value: unknown): value is SceneBiomeId {
  return typeof value === "string" && (SCENE_BIOME_IDS as readonly string[]).includes(value);
}

/** The look a world is played in: the one saved with it, or the fallback. */
export function manifestBiomeId(manifest: Pick<SceneManifest, "biome">): SceneBiomeId {
  return manifest.biome && isSceneBiomeId(manifest.biome.id) ? manifest.biome.id : FALLBACK_BIOME;
}

export function lookName(id: SceneBiomeId): string {
  return LOOK_LABELS[id].label;
}

/** "a Desert world", "an Original world". */
export function withArticle(label: string): string {
  return `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;
}
