/**
 * Deterministic material-region knowledge for exactly-known bundled sample
 * assets.
 *
 * Every generated-mesh asset shipped or produced by this project's pipeline
 * (verified against every `.glb` in `public/samples/` and `storage/assets/`,
 * see `nimbalyst-local/playtest-checkpoints/material-lighting-refinement.md`)
 * is a single combined mesh with a single baked material — there is no
 * per-submesh "wood"/"fabric"/"metal" material to read, and no UV layout a
 * region could be authored against (the baked texture atlas is an
 * unpredictable photogrammetry UV-chart pack, not a spatially organised
 * painting). Region boundaries here are therefore never inferred from the
 * texture or from a visual guess: they are the already-measured, already
 * documented WORLD-SPACE furniture bounding boxes recorded in
 * `src/scene/samples.ts` (produced by `src/scene/tools/analyze-sample.ts`
 * from the real geometry, independent of this file).
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

export interface MaterialRegionProfile {
  /**
   * World-space X coordinate of the boundary between the two furniture
   * pieces in the combined mesh. At/above this value the surface is treated
   * as the "hard" region (wood); below it, the "soft" region (fabric).
   */
  readonly dividerWorldX: number;
  /** Half-width, in world metres, of the smooth blend across the boundary. */
  readonly blendWidth: number;
}

/**
 * `public/samples/rodin.glb`, "The desk & sofa adventure"
 * (`sample-rodin-room-corner`).
 *
 * The desk's standable top surface is measured at world x -0.06...3.18, z
 * -0.37...1.07 (`RODIN_DESK_Y` in `src/scene/samples.ts`). The sofa occupies
 * the rest of the same combined mesh on the -X side of that boundary: the
 * level's spawn and its first checkpoint both sit at x=-4.02, documented as
 * "beside the sofa end". A single-room-corner reconstruction has its two
 * furniture pieces meeting at, not overlapping across, that corner, so a
 * world-space X divider at the desk's own documented near edge is a safe,
 * non-semantic split of the one mesh — not a guess about mesh content.
 *
 * No measured evidence of a distinct metal region exists on this asset (no
 * documented bounding box, no separate material). None is applied here;
 * see the material-lighting-refinement checkpoint for that limitation.
 */
const RODIN_SOFA_DESK_PROFILE: MaterialRegionProfile = {
  dividerWorldX: -0.06,
  blendWidth: 0.4,
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
