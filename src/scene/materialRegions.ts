/**
 * Deterministic material-region knowledge for exactly-known bundled sample
 * assets.
 *
 * Every baked generated-mesh asset this project ships is a single combined
 * mesh with a single material, so there is no per-submesh "wood"/"fabric"
 * material to read, and its texture atlas is a scrambled photogrammetry UV
 * pack a mask could not be painted against. Regions are therefore authored as
 * WORLD-SPACE boxes, measured from the asset's own vertex positions after the
 * sample's manifest transform, and checked against what the object visibly is.
 * They are never inferred from the texture or from names in the level data
 * (the Rodin course calls its sofa seat "the desk", which is exactly how an
 * earlier version of this profile came out inverted).
 *
 * Profiles are keyed by the asset's actual decoded content hash
 * (`LoadedSceneAsset.sha256`, computed from the fetched bytes at load time),
 * not by filename, level id, or manifest asset id — a renamed, duplicated, or
 * user-regenerated asset can never accidentally inherit a mapping it was not
 * measured against. Anything not listed here (including the Tripo sample and
 * every user-generated asset) intentionally falls back to `null`, which
 * callers must treat as "no known region split" — i.e. the conservative,
 * texture-preserving, uniformly-lit treatment only.
 */

export type Vec3Tuple = readonly [number, number, number];

/**
 * `neutral` boxes carve regions back out of wood/fabric: objects standing on
 * or next to the furniture (a laptop, bottles, a vase, the sofa's feet) whose
 * material is not known and must keep the plain relit treatment.
 */
export type MaterialRegionKind = "wood" | "fabric" | "neutral";

export interface MaterialRegionBox {
  readonly kind: MaterialRegionKind;
  /** World-space minimum corner, metres. */
  readonly min: Vec3Tuple;
  /** World-space maximum corner, metres. */
  readonly max: Vec3Tuple;
}

export interface MaterialRegionProfile {
  readonly boxes: readonly MaterialRegionBox[];
  /**
   * Half-width, in metres, of the soft edge around every box. Kept small: the
   * boxes follow measured gaps between pieces of furniture, and a wide blend
   * would smear one material across the neighbouring piece.
   */
  readonly edgeSoftness: number;
}

/** Upper bound on boxes per profile; sizes the shader's uniform arrays. */
export const MAX_MATERIAL_REGION_BOXES = 8;

export const MATERIAL_REGION_KIND_CODE: Readonly<Record<MaterialRegionKind, number>> = {
  fabric: 0,
  wood: 1,
  neutral: 2,
};

/**
 * `public/samples/rodin.glb`, "The desk & sofa adventure"
 * (`sample-rodin-room-corner`), placed by its manifest transform (uniform
 * 4.2208 scale, no rotation; world bounds x −4…4, y 0…2.55, z −1.43…1.43).
 *
 * Measured from the mesh's own world-space vertices
 * (nimbalyst-local/playtest-checkpoints/opus-visual-review.md, "F1"):
 *  - The **desk** (laptop desk with a drawer pedestal on its right) occupies
 *    x −4.0…−1.05. Its top is a plane at y ≈ 1.80 (1.62–1.70 at the edge and
 *    underside). The pedestal's side panel stands at x ≈ −1.65.
 *  - A full-height seam at x ≈ −1.0 separates the pedestal from the **sofa**'s
 *    left arm (x −0.95…−0.35, top 1.9). The sofa runs from there to x ≈ 3.8:
 *    seat at y ≈ 1.26–1.29 (the elevated course surface, checkpoints 2 and 3),
 *    backrest to y ≈ 2.5 at z < −1.0, right arm to y ≈ 2.3 at x ≈ 3.0–3.4.
 *  - On the desk top: a laptop (screen to y 2.5 at z ≈ −0.6, keyboard deck
 *    x −3.2…−1.9 reaching z ≈ 0.8), a mouse to its left, and bottles and a
 *    vase at the back rising above the 1.80 top plane.
 *  - The sofa's feet and the thin floor patches under it sit below y ≈ 0.2.
 *
 * Desk → wood up to just above its top plane; sofa → fabric above its feet;
 * the laptop and everything standing on the desk stay neutral. No metal region
 * is authored: none is identifiable on this asset.
 */
const RODIN_SOFA_DESK_PROFILE: MaterialRegionProfile = {
  // Tight: the desk/sofa seam at x ≈ −1.0 is only a few centimetres wide.
  edgeSoftness: 0.01,
  boxes: [
    { kind: "wood", min: [-4.1, -0.05, -1.5], max: [-1.02, 1.835, 1.5] },
    { kind: "fabric", min: [-1.0, 0.22, -1.5], max: [4.1, 2.6, 1.5] },
    // The laptop. Its keyboard deck rises only 1–5 cm above the 1.80–1.82 m
    // desk top, and toward the front the reconstruction fuses it into the
    // desk plane itself, so no height cut separates them: its footprint
    // (x −3.25…−1.9, z −0.85…0.82, measured from the region overlay against
    // the texture) stays neutral from just below the desk top.
    { kind: "neutral", min: [-3.25, 1.78, -0.85], max: [-1.9, 2.6, 0.82] },
    // The mouse and its cable, left of the laptop.
    { kind: "neutral", min: [-3.95, 1.78, -0.55], max: [-3.2, 2.6, 0.05] },
  ],
};

const KNOWN_MATERIAL_PROFILES: Readonly<Record<string, MaterialRegionProfile>> = {
  "c750cb2c1fcd2197f8c373b791703bc90073075e11d08cafb0be4d84012d54b8": RODIN_SOFA_DESK_PROFILE,
};

/**
 * Looks up the authored region profile for an exact known bundled sample by
 * its verified content hash. Returns `null` for everything else, including
 * the Tripo sample and every user-generated asset — those must get the
 * conservative neutral treatment, never a guessed split.
 */
export function getKnownMaterialProfile(
  sha256: string | null | undefined,
): MaterialRegionProfile | null {
  if (!sha256) return null;
  return KNOWN_MATERIAL_PROFILES[sha256] ?? null;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Weight in [0, 1] of a point inside a soft-edged box. Mirrors the per-box weight in the shader's `oqRegionWeights`. */
export function materialRegionBoxWeight(box: MaterialRegionBox, softness: number, point: Vec3Tuple): number {
  let outside = -Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    outside = Math.max(outside, box.min[axis]! - point[axis]!, point[axis]! - box.max[axis]!);
  }
  return 1 - smoothstep(-softness, softness, outside);
}

/**
 * CPU mirror of the shader's region weights: how much of the wood and fabric
 * treatment a world-space point receives. Neutral boxes suppress both.
 */
export function classifyMaterialPoint(
  profile: MaterialRegionProfile,
  point: Vec3Tuple,
): { wood: number; fabric: number } {
  let wood = 0;
  let fabric = 0;
  let neutral = 0;
  for (const box of profile.boxes) {
    const weight = materialRegionBoxWeight(box, profile.edgeSoftness, point);
    if (box.kind === "wood") wood = Math.max(wood, weight);
    else if (box.kind === "fabric") fabric = Math.max(fabric, weight);
    else neutral = Math.max(neutral, weight);
  }
  const keep = 1 - neutral;
  return { wood: wood * keep, fabric: fabric * keep };
}
