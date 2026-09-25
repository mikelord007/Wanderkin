/**
 * The shipped v1 props expressed as {@link BiomeArt}: one variant per kind,
 * no dressing, the same sink and surface alignment as before. It proves the
 * framework draws the existing biomes unchanged, and it is the fallback for
 * a biome that has not been given its own art yet.
 */
import type { BiomeDefinition, BiomePropKind } from "../../types.js";
import {
  createPropGeometry,
  PROP_UNIT_RADIUS,
  SHADOW_CASTING_KINDS,
  type InstancedPropKind,
} from "../../render/propGeometry.js";
import { unitMeshFromGeometry } from "../meshKit.js";
import type { AssetFamily, BiomeArt, BiomeTones, CompositionPreset, ToneRamp, WeightedPreset } from "../types.js";

const LEGACY_KINDS: readonly InstancedPropKind[] = ["palm", "shrub", "rock", "wood", "cactus", "dry-plant"];

function ramp(hex: string): ToneRamp {
  return { dark: hex, base: hex, light: hex };
}

export function legacyArt(definition: BiomeDefinition): BiomeArt {
  const { palette } = definition;
  const tones: BiomeTones = {
    foliage: ramp(palette.vegetation),
    foliageAlt: ramp(palette.vegetation),
    trunk: ramp(palette.wood),
    rock: ramp(palette.rock),
    soil: ramp(palette.sand),
    dry: ramp(palette.sand),
    cactus: ramp(palette.vegetation),
    accent: ramp(palette.accent),
    stoneTop: ramp(palette.sand),
    stoneSide: ramp(palette.rock),
    stoneRecess: ramp(palette.rock),
  };
  const families: Record<string, AssetFamily> = {};
  const compositions: Partial<Record<BiomePropKind, WeightedPreset[]>> = {};
  for (const kind of LEGACY_KINDS) {
    const build = () => {
      const geometry = createPropGeometry(kind, palette);
      const mesh = unitMeshFromGeometry(geometry);
      geometry.dispose();
      return mesh;
    };
    families[kind] = {
      role: "hero",
      category: kind === "palm" ? "tree" : kind === "shrub" || kind === "dry-plant" ? "bush" : kind === "wood" ? "marker" : kind === "rock" ? "rock" : "cactus",
      shading: "faceted",
      castShadow: SHADOW_CASTING_KINDS.has(kind),
      unitRadius: PROP_UNIT_RADIUS[kind],
      triangleBudget: 700,
      variants: [build],
      // v1 sank every prop by 2% of its height and tilted rocks 80% of the way
      // to the surface normal; plants and posts grew straight up.
      embed: [0.02, 0.02],
      alignToNormal: kind === "rock" ? 0.8 : 0,
    };
    const preset: CompositionPreset = { id: `legacy-${kind}`, primary: kind, members: [] };
    compositions[kind] = [{ preset, weight: 1 }];
  }
  return {
    id: definition.id,
    tones,
    families,
    compositions,
    wall: {
      strata: [1, 1],
      stepping: 0,
      rounding: 0,
      notches: [0, 0],
      top: ramp(palette.sand),
      side: ramp(palette.wood),
      recess: palette.wood,
      rim: palette.sand,
    },
    ground: { contactColor: "#000000", contactOpacity: 0, contactScale: 0 },
    variation: { toneJitter: 0, hueJitterDeg: 0 },
    budgets: {
      triangles: { standard: 1_000_000, reduced: 1_000_000 },
      membersPerCluster: { standard: 1, reduced: 1 },
    },
  };
}
