/**
 * Renderer-only art direction for a biome. The gameplay/placement boundary
 * (`BiomeDefinition` in `../types.ts`) never sees any of this: geometry
 * reserves footprints, and art only decides what is drawn inside them.
 *
 * Adding a biome means supplying one {@link BiomeArt}: tone ramps, asset
 * families with variants, cluster presets per placement kind, and the wall
 * and ground styles. Composition, batching and rendering stay unchanged.
 * See `nimbalyst-local/ENVIRONMENT_ARCHITECTURE.md` for the rules.
 */
import type { BiomeId, BiomePropKind } from "../types.js";

/** Three tones of one material family, ordered by luminance. sRGB hex. */
export interface ToneRamp {
  dark: string;
  base: string;
  light: string;
}

/** Tone ramps every biome provides; biomes may add their own names. */
export type CoreToneName =
  | "foliage"
  | "foliageAlt"
  | "trunk"
  | "rock"
  | "soil"
  | "dry"
  | "cactus"
  | "accent"
  | "stoneTop"
  | "stoneSide"
  | "stoneRecess";

export type BiomeTones = { readonly [K in CoreToneName]: ToneRamp } & { readonly [name: string]: ToneRamp };

/**
 * A finished, CPU-only asset variant. Exactly one unit tall (base on y = 0;
 * rock-like assets may sink a little below), indexed, with per-vertex
 * normals, linear-space vertex colours and wind weights (`sway`, 0 at the
 * root). Never uploaded to the GPU directly: the batcher copies it.
 */
export interface UnitMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  readonly sway: Float32Array;
  readonly index: Uint32Array;
  /** Largest horizontal distance of any vertex from the y axis. */
  readonly radius: number;
  readonly minY: number;
  readonly maxY: number;
  readonly triangles: number;
}

export type AssetShading = "faceted" | "smooth";
export type AssetRole = "hero" | "supporting" | "micro";

/** Deterministic: the same tones always give the same mesh. */
export type VariantBuilder = (tones: BiomeTones) => UnitMesh;

/** Spec categories whose minimum variant counts the guardrail tests enforce. */
export type AssetCategory = "tree" | "bush" | "rock" | "cactus" | "grass" | "dressing" | "marker";

export interface AssetFamily {
  role: AssetRole;
  category: AssetCategory;
  shading: AssetShading;
  /** Casts into the sun's shadow map (standard quality only). Micro never does. */
  castShadow: boolean;
  /** Horizontal extent per unit height every variant must stay within. */
  unitRadius: number;
  /** Per-variant triangle ceiling, enforced by tests. */
  triangleBudget: number;
  variants: readonly VariantBuilder[];
  /** Rarity per variant (defaults to equal). */
  weights?: readonly number[];
  /** Largest random lean from vertical, radians. */
  leanMax?: number;
  /** May be mirrored across its local X axis. */
  mirror?: boolean;
  /** Sink below the support plane, as a fraction of height [min, max]. */
  embed?: readonly [number, number];
  /** 0 = grows straight up, 1 = lies fully along the surface normal. */
  alignToNormal?: number;
}

/** A group of secondary or micro members around the primary. */
export interface CompositionMember {
  family: string;
  /** Inclusive range of how many to try to place. */
  count: readonly [number, number];
  /** Distance from the cluster axis as a fraction of the footprint radius. */
  ring: readonly [number, number];
  /**
   * Size as a fraction of the primary's drawn height: the member's height
   * for upright assets, its largest dimension for `fit: "size"` dressing.
   */
  height: readonly [number, number];
  /** Probability the whole group appears (default 1). */
  chance?: number;
}

export interface CompositionPreset {
  id: string;
  primary: string;
  /** Offset of the primary from the axis, fraction of the radius (asymmetric groves). */
  primaryOffset?: number;
  members: readonly CompositionMember[];
}

export interface WeightedPreset {
  preset: CompositionPreset;
  weight: number;
}

/** Visual shell rules for non-floor box helpers (steps, bridges, walls). */
export interface WallStyle {
  /** Horizontal strata on the sides, inclusive range. */
  strata: readonly [number, number];
  /** 0..1 how much strata step in and out (within the shell tolerance). */
  stepping: number;
  /** 0..1 corner rounding (wind-worn). */
  rounding: number;
  /** Shallow erosion notches per side, inclusive range. */
  notches: readonly [number, number];
  /**
   * Thin vertical joints per stratum around the whole perimeter, staggered
   * between strata (plank ends, block joints), inclusive range. Default [2, 4].
   */
  joints?: readonly [number, number];
  /**
   * 0–1 darkness of the thin seam line at the foot of every stratum and of
   * the joints (toward `recess`). Default 0.7. Seams keep strata legible in
   * furniture shade, where tone bands alone flatten.
   */
  seam?: number;
  /**
   * Target course (stratum) height in world units. When set, a structure
   * gets about `height / courseHeight` courses (at least `strata[0]`, at
   * most 12), so tall steps and platforms get proportionally more courses
   * instead of a few huge ones. Unset: `strata` decides alone, as before.
   */
  courseHeight?: number;
  /** Tones: `top` is the walkable face, `rim` the collision edge highlight. */
  top: ToneRamp;
  side: ToneRamp;
  recess: string;
  rim: string;
}

export interface GroundStyle {
  /** Contact shadow tint (multiplied), sRGB hex. */
  contactColor: string;
  /** 0..1 strength at the centre. */
  contactOpacity: number;
  /** Disc radius as a fraction of the cluster footprint. */
  contactScale: number;
  /** Optional soil/sand patch colour under clusters. */
  patchColor?: string;
  /** Share (0–1) of soil patches drawn as cracked, dried earth (default 0). */
  cracks?: number;
  /**
   * Emissive tint of the crack lines (e.g. lava glow), sRGB hex. Same draw,
   * unlit colour; only meaningful with `cracks` > 0.
   */
  crackGlow?: string;
  /**
   * Tints of the translucent support patches from geometry (one draw). When
   * unset, the framework default applies (sand, plus vegetation on Tropical).
   */
  patches?: GroundPatchStyle;
}

export interface GroundPatchStyle {
  /** Weighted patch tints, sRGB hex; one is picked per patch. */
  tints: readonly { color: string; weight: number }[];
  /**
   * Leaf litter: 1–3 fleck colours scattered over the patch as small leaves
   * (e.g. fallen autumn leaves, pine needles). Omit for plain drifts.
   */
  litter?: readonly string[];
}

/** Water surface styles for the geometry-approved water ring. */
export type WaterStyle = "liquid" | "frozen" | "lava";
/** Particle presets; each replaces the look of the definition's ambient effect. */
export type ParticlePreset = "snow" | "embers";

/**
 * Renderer-only atmosphere choices. Both only restyle what the definition
 * already enables (`ambient.water`, `ambient.effect`): they never add a draw.
 */
export interface AtmosphereStyle {
  /** Default "liquid" (rippled, translucent). "frozen" is flat, pale, still; "lava" glows. */
  water?: WaterStyle;
  /** Restyles the ambient particles (count and budget unchanged). */
  particles?: ParticlePreset;
  /**
   * Particle colour (hex), replacing the look's own (snow #fbfdff, embers
   * #ff8a3a, dust = `palette.sand`, motes #fff6d8). Unset keeps that colour.
   * Tone rules apply: saturation ≤ 0.78, lightness 0.10–0.88, ≥ 30° from the
   * collectible hue.
   */
  particleTint?: string;
  /**
   * Falling rain with ground splashes around the camera (one streak draw and
   * one splash draw). Needs `ambient.rain` in the definition, which makes
   * geometry bake the ground heights the splashes land on.
   */
  rain?: RainStyle;
}

/** Renderer-only rain (see `render/rain.ts`). */
export interface RainStyle {
  /** 0–1 share of the maximum drop count (2,000 at standard quality). */
  intensity: number;
  /**
   * 0–1 wet sheen: lowers the roughness of the props and the ground
   * patches, so leaves, rocks and puddles catch soft highlights. Default 0.
   */
  wetness?: number;
  /** Streak and splash colour (hex). Default a pale blue-grey. */
  tint?: string;
}

/**
 * Per-biome lighting adjustments on top of the definition's own
 * `lighting`/`sky` (sun colour = warmth, direction, intensity, ambient,
 * fog distances), applied by `SceneLighting` in themed looks only. Every
 * field is optional and clamped by `resolveBiomeLighting` (assets/lighting.ts);
 * omitted fields keep the framework defaults.
 */
export interface LightingAdjust {
  /** Share of `lighting.ambient` kept as flat ambient light, 0.3–1 (default 0.62). */
  ambientKeep?: number;
  /** Share of `lighting.ambient` added to the sky/ground hemisphere fill, 0–1 (default 0.45). */
  hemisphereShare?: number;
  /** Sun elevation clamp in degrees, within 15–65 (default [24, 52]). */
  sunElevation?: readonly [number, number];
  /** Multiplier on the definition's fog near/far distances, 0.6–1.6 (default 1). */
  fogScale?: number;
  /** Multiplier on the ground contact decal opacity, 0–1.5 (default 1). */
  contactStrength?: number;
}

export interface BiomeArt {
  id: BiomeId;
  /** Optional lighting adjustments (see {@link LightingAdjust}). */
  lighting?: LightingAdjust;
  /** Optional water/particle styles (see {@link AtmosphereStyle}). */
  atmosphere?: AtmosphereStyle;
  tones: BiomeTones;
  families: Readonly<Record<string, AssetFamily>>;
  /** Cluster presets per geometry placement kind. Missing kind = not drawn. */
  compositions: Partial<Readonly<Record<BiomePropKind, readonly WeightedPreset[]>>>;
  wall: WallStyle;
  ground: GroundStyle;
  variation: {
    /** Per-instance lightness jitter, ± (0..0.1). */
    toneJitter: number;
    /** Per-instance hue jitter, ± degrees. */
    hueJitterDeg: number;
  };
  budgets: {
    triangles: { standard: number; reduced: number };
    /** Members per cluster including the primary. */
    membersPerCluster: { standard: number; reduced: number };
  };
}
