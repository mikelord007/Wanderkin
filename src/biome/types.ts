/** Shared, data-only boundary between geometry, rendering and adventure UI.
 * Model output never supplies placements, URLs, shaders or executable code. */
import type { AdventureTemplateId as SharedTemplateId, MovementConfig, SceneBiomeId, SceneManifest, Vec3 } from "@shared/index.js";
import type { LoadedSceneAsset } from "../scene/runtime.js";

/** Same unions as the saved-world schema in `shared/manifest.ts`. */
export type BiomeId = SceneBiomeId;
export type AdventureTemplateId = SharedTemplateId;
export type EffectsQuality = "standard" | "reduced";
export type BiomePropKind = "palm" | "shrub" | "rock" | "wood" | "cactus" | "dry-plant" | "windsock";

export interface BiomeDefinition {
  id: BiomeId;
  name: string;
  palette: { sand: string; vegetation: string; rock: string; wood: string; accent: string; water: string };
  lighting: { sun: string; sky: string; ground: string; intensity: number; ambient: number; direction: Vec3 };
  sky: { zenith: string; horizon: string; fogNear: number; fogFar: number };
  surface: { color: string; blend: number; upwardNormalMin: number; patchCoverage: number };
  props: { kinds: readonly BiomePropKind[]; density: number; scaleRange: readonly [number, number] };
  wind: { direction: readonly [number, number]; strength: number };
  /**
   * `rain` asks geometry to bake a ground height field into the layout
   * (`BiomeLayout.ground`) so the renderer's rain can splash on real
   * surfaces; the art's `atmosphere.rain` styles it. Omitted = no rain.
   */
  ambient: { effect: "none" | "motes" | "dust"; water: boolean; rain?: boolean };
  mission: { portalTitle: string; beaconTitle: string; fragmentName: string; collectibleColor: string };
  budget: { props: number; patches: number; particles: number; drawCalls: number };
}

/** All positions are normalized WORLD coordinates. Position is the support
 * surface, not an authored capsule centre. Scale is in world units. */
export interface BiomePropPlacement {
  id: string;
  kind: BiomePropKind;
  position: Vec3;
  normal: Vec3;
  scale: number;
  yaw: number;
  radius: number;
}

export interface BiomeSurfacePatch {
  position: Vec3;
  normal: Vec3;
  radius: number;
}

export interface BiomeExclusion {
  start: Vec3;
  end: Vec3;
  radius: number;
  reason: "spawn" | "route" | "objective" | "checkpoint" | "clearance";
}

export interface BiomeLayout {
  biomeId: BiomeId;
  seed: string;
  props: readonly BiomePropPlacement[];
  patches: readonly BiomeSurfacePatch[];
  exclusions: readonly BiomeExclusion[];
  bounds: { min: Vec3; max: Vec3 };
  /** Optional surrounding ring, below ALL playable support surfaces. */
  water: { center: Vec3; innerRadius: number; outerRadius: number } | null;
  /** Topmost-surface heights for rain splashes; only when `ambient.rain`. */
  ground?: BiomeGroundHeights | null;
  diagnostics: readonly string[];
}

/**
 * A coarse grid of the highest collision surface under each cell centre,
 * sampled once per layout by vertical rays over the same collision grid
 * geometry uses (never per drop). Row-major, `x` fastest. `NaN` = nothing
 * below (open sky). `edge` = 1 where a neighbour differs by more than a
 * step, so a splash there could float beside a ledge.
 */
export interface BiomeGroundHeights {
  origin: readonly [number, number];
  cell: number;
  cols: number;
  rows: number;
  heights: Float32Array;
  edge: Uint8Array;
  /** Runtime character height (world units): the scale rain is sized in. */
  unit: number;
}

export interface BiomePreparationInput {
  manifest: SceneManifest;
  assets: ReadonlyMap<string, LoadedSceneAsset>;
  /** Actual runtime config, already miniature; never scale it again. */
  movement: MovementConfig;
  definition: BiomeDefinition;
  seed: string;
  quality: EffectsQuality;
}

export interface AdventurePreparationInput extends BiomePreparationInput {
  template: AdventureTemplateId;
}

export interface AdventurePreparationResult {
  /** New in-memory draft; source assets/provenance remain intact. Never saved
   * or published automatically. Authored spawn convention remains intact. */
  manifest: SceneManifest;
  diagnostics: readonly string[];
  fallbackUsed: boolean;
}

/** What `prepareAdventure` takes. Layout never depends on the look:
 * `definition`/`quality` may only flavour text and colours. `movement` is the
 * runtime config; geometry derives the authored one itself (idempotently). */
export type AdventureRequest = Omit<AdventurePreparationInput, "definition" | "quality"> &
  Partial<Pick<AdventurePreparationInput, "definition" | "quality">>;

export type AdventureFailureReason = "no-playable-layout" | "geometry-unavailable";

/** Integration swaps worlds only on `ok: true`; on `ok: false` the untouched
 * source comes back and the current world stays playable. */
export type AdventureOutcome =
  | (AdventurePreparationResult & { ok: true })
  | {
      ok: false;
      /** Player-safe summary; details are in `diagnostics`. */
      reason: AdventureFailureReason;
      manifest: SceneManifest;
      diagnostics: readonly string[];
      fallbackUsed: false;
    };
