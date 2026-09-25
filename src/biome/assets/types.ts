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

export interface AssetFamily {
  role: AssetRole;
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
  /** Height as a fraction of the primary's drawn height. */
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
}

export interface BiomeArt {
  id: BiomeId;
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
