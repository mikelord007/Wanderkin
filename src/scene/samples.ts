import { SCENE_MANIFEST_SCHEMA_VERSION } from "../../shared/schema-version.js";
import { COORDINATE_CONVENTION } from "../../shared/geometry.js";
import type { Quat, Vec3 } from "../../shared/geometry.js";
import {
  DEFAULT_ASSUMED_EXTENT_METERS,
  type Checkpoint,
  type HelperEntity,
  type PhotoReference,
  type SceneManifest,
} from "../../shared/manifest.js";
import { DEFAULT_MOVEMENT_CONFIG } from "../../shared/movement.js";

/**
 * Hand-authored sample levels for the two bundled GLBs.
 *
 * These are pure manifest data — no furniture-specific runtime code exists
 * anywhere. Every number here was measured from the real geometry with
 * `src/scene/tools/analyze-sample.ts` (asset transforms from `normalizeAsset`,
 * checkpoint positions from actual standable surface patches, helper steps
 * placed on the surface-sampling grid), then checked with the same
 * conservative validator the generic planner uses
 * (`src/scene/tools/verify-samples.ts`).
 *
 * Scale is a documented game-scale choice, not a measurement: each asset's
 * longest horizontal extent is normalized to
 * `DEFAULT_ASSUMED_EXTENT_METERS` (8 m) and the toy capsule is 0.7 m tall.
 * The generated meshes reconstruct furniture only — no floor, walls, or
 * door — so every level adds a neutral game floor, marked `addedBy: "game"`.
 */

/** Both sample courses were authored against this movement tuning. */
const MOVEMENT_CONFIG_ID = DEFAULT_MOVEMENT_CONFIG.id;

/** Authoring timestamp for the bundled samples (stable so manifests diff
 * cleanly across reloads). */
const AUTHORED_AT = "2026-09-18T00:00:00.000Z";

/** Date of the recorded Livepeer generation runs these assets came from.
 * The provenance JSON carries no per-job timestamp, so this is the test date
 * from the comparison report, not an exact job completion time. */
const GENERATED_AT = "2026-09-17T00:00:00.000Z";

const IDENTITY: Quat = [0, 0, 0, 1];

function samplePhotos(orders: readonly number[]): PhotoReference[] {
  return orders.map((order) => ({
    id: `photo-${order}`,
    url: `/samples/photo-${order}.jpg`,
    order,
    label: `Source photo ${order}`,
  }));
}

/** Capsule CENTRE for standing on a surface at `surfaceY`, matching
 * `SpawnPoint.position` / `Checkpoint.position` in shared/manifest.ts. */
function standOn(x: number, surfaceY: number, z: number): Vec3 {
  return [
    x,
    surfaceY +
      DEFAULT_MOVEMENT_CONFIG.characterHalfHeight +
      DEFAULT_MOVEMENT_CONFIG.characterRadius +
      0.02,
    z,
  ];
}

const TRIGGER_RADIUS = 0.4;

function checkpoint(
  order: number,
  surface: Vec3,
  headingRadians: number,
): Checkpoint {
  const position = standOn(surface[0], surface[1], surface[2]);
  return {
    id: `checkpoint-${order + 1}`,
    order,
    position,
    triggerRadius: TRIGGER_RADIUS,
    // Respawning at the checkpoint itself is always safe: it is a surface
    // patch that passed the same clearance test as the spawn.
    safeRespawn: { position, headingRadians },
  };
}

/**
 * Every step footprint is pulled this far inside the surface-sampling cell
 * boundaries it is authored against.
 *
 * A face sitting exactly on a cell boundary is tangent to the neighbouring
 * cell's clearance box, and the conservative clearance test counts touching as
 * blocked — which would make the floor right in front of a step read as having
 * no headroom. Pulling the face inside the cell keeps the step's own surface
 * cells nearly fully covered while leaving its neighbours clear.
 */
const STEP_INSET = 0.05;

/**
 * A solid helper step: top face at `top`, sunk slightly below the floor so it
 * never shows a seam.
 *
 * `minX/maxX/minZ/maxZ` are surface-sampling cell boundaries (the 0.36 m grid
 * the analysis in `surfaces.ts` uses). Two cells deep per step, so the top of
 * each step gets standable patches exactly one cell — 0.36 m — from the next
 * step's, inside the character's 0.6 m mantle reach, and so interior cells
 * have enough neighbours to count as supported.
 */
function step(
  id: string,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  top: number,
): HelperEntity {
  const base = -0.1;
  const minX = bounds.minX + STEP_INSET;
  const maxX = bounds.maxX - STEP_INSET;
  const minZ = bounds.minZ + STEP_INSET;
  const maxZ = bounds.maxZ - STEP_INSET;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const height = top - base;
  return {
    id,
    kind: "box",
    transform: {
      position: [(minX + maxX) / 2, (base + top) / 2, (minZ + maxZ) / 2],
      rotation: IDENTITY,
      scale: [1, 1, 1],
    },
    dimensions: [width, height, depth],
    collider: {
      kind: "box",
      halfExtents: [width / 2, height / 2, depth / 2],
    },
    addedBy: "game",
  };
}

/**
 * Neutral game floor. The generated meshes reconstruct no floor at all, so
 * every level adds one; it is marked `addedBy: "game"` and must never be read
 * as reconstructed room architecture.
 *
 * `centerZ` lets a level extend the floor on one side without moving its other
 * edge — which matters because the surface-sampling grid is anchored to the
 * collision bounds, so shifting the floor's minimum corner would move every
 * authored cell centre in the level.
 */
function gameFloor(
  id: string,
  width: number,
  depth: number,
  centerZ = 0,
): HelperEntity {
  const thickness = 0.4;
  return {
    id,
    kind: "floor",
    transform: {
      position: [0, -thickness / 2, centerZ],
      rotation: IDENTITY,
      scale: [1, 1, 1],
    },
    dimensions: [width, thickness, depth],
    collider: {
      kind: "box",
      halfExtents: [width / 2, thickness / 2, depth / 2],
    },
    addedBy: "game",
  };
}

// ---------------------------------------------------------------------------
// Rodin sample
// ---------------------------------------------------------------------------

/**
 * Measured with `normalizeAsset`: the Rodin mesh is already Y-up (21.6 % of
 * its surface area faces +Y, 1.83× the runner-up axis) and its footprint's
 * principal axis is within 1° of +X, so it needs no rotation — only the
 * uniform 4.2208× scale that makes its 1.8954-unit long side 8 game metres,
 * and a translation putting its lowest vertex on y = 0, centred on the origin.
 */
const RODIN_TRANSFORM = {
  position: [
    -0.0030815902530274553, 1.2904576176620481, 0.003392290225473271,
  ] as Vec3,
  rotation: IDENTITY,
  scale: [
    4.220793966734851, 4.220793966734851, 4.220793966734851,
  ] as Vec3,
};

/** Desk-height surface measured at y ≈ 1.286, spanning x −0.06…3.18,
 * z −0.37…1.07. This is the elevated furniture surface the course climbs. */
const RODIN_DESK_Y = 1.286;

/**
 * Three-step flight on the +Z side of the desk ledge (which ends at z ≈ 1.074).
 *
 * Each step is a third of the climb — a 0.43 m mantle, comfortably inside the
 * 0.3–0.9 m mantle window — and the top step is a landing flush with the desk
 * surface rather than one more mantle. That last detail matters: the desk's
 * front edge slopes out past its top, and a step stopping below the desk
 * height leaves no headroom to stand on directly in front of it.
 */
const RODIN_HELPERS: HelperEntity[] = [
  step(
    "helper-step-rodin-1",
    { minX: 1.56, maxX: 3.0, minZ: 2.694, maxZ: 3.414 },
    RODIN_DESK_Y / 3,
  ),
  step(
    "helper-step-rodin-2",
    { minX: 1.56, maxX: 3.0, minZ: 1.974, maxZ: 2.694 },
    (RODIN_DESK_Y * 2) / 3,
  ),
  step(
    "helper-landing-rodin",
    { minX: 1.56, maxX: 3.0, minZ: 1.254, maxZ: 1.974 },
    RODIN_DESK_Y,
  ),
];

const RODIN_SAMPLE: SceneManifest = {
  schemaVersion: SCENE_MANIFEST_SCHEMA_VERSION,
  levelId: "sample-rodin-room-corner",
  name: "The desk & sofa adventure",
  createdAt: AUTHORED_AT,
  updatedAt: AUTHORED_AT,
  coordinateConvention: COORDINATE_CONVENTION,
  calibration: { assumedExtentMeters: DEFAULT_ASSUMED_EXTENT_METERS },
  assets: [
    {
      id: "rodin-glb",
      url: "/samples/rodin.glb",
      sha256:
        "c750cb2c1fcd2197f8c373b791703bc90073075e11d08cafb0be4d84012d54b8",
      sizeBytes: 4979900,
      provenance: {
        providerId: "livepeer",
        capabilityUsed: "rodin-i3d",
        fallbackFired: null,
        providerJobId: "mjob_5c57ebc49690",
        registeredModel: "fal-ai/hyper3d/rodin/v2.5",
        sourcePhotoOrder: [4, 1, 2, 3, 5],
        generatedAt: GENERATED_AT,
      },
    },
  ],
  photos: samplePhotos([1, 2, 3, 4, 5]),
  entities: [
    {
      id: "rodin-mesh",
      kind: "generated-mesh",
      assetId: "rodin-glb",
      transform: RODIN_TRANSFORM,
      // Triangle mesh, not a bounding box: the player has to be able to stand
      // on the desk and walk around the sofa, not on top of a crate.
      collider: { kind: "triangle-mesh" },
    },
    // Extended 1.44 m on the +Z side only (centre pushed to z = 0.72) to make
    // room for the step flight, without moving the collision bounds' minimum
    // corner that the surface-sampling grid is anchored to.
    gameFloor("helper-floor-rodin", 12, 8.2926720480656635, 0.72),
    ...RODIN_HELPERS,
  ],
  spawn: {
    position: standOn(-4.02, 0, -1.086),
    // Facing +X, along the furniture, toward the first checkpoint.
    headingRadians: Math.PI / 2,
  },
  checkpoints: [
    // Open floor beside the sofa end.
    checkpoint(0, [-4.02, 0, 2.154], 0),
    // Floor at the foot of the helper steps.
    checkpoint(1, [2.46, 0, 3.594], Math.PI),
    // On the desk: the elevated furniture surface, reached by the step flight.
    checkpoint(2, [2.1, RODIN_DESK_Y, 0.354], Math.PI),
    // Across the desk top to its far (−X) end.
    checkpoint(3, [0.3, RODIN_DESK_Y, -0.006], Math.PI / 2),
    // Back down to the floor to finish.
    checkpoint(4, [-1.14, 0, -2.166], -Math.PI / 2),
  ],
  seed: "sample-rodin-v1",
  movementConfigId: MOVEMENT_CONFIG_ID,
  courseValidation: {
    status: "manually-adjusted",
    method: "authored from measured surface patches; verified with conservative-kinematic-v1",
    checkedAt: AUTHORED_AT,
    evidence:
      "Checkpoints and helper steps were placed from the measured standable-surface map of the normalized mesh, then every leg was re-checked with the same conservative walk/jump/mantle validator used by the generic planner (see src/scene/tools/verify-samples.ts).",
    uncertaintyNotes:
      "Validated against a kinematic model of DEFAULT_MOVEMENT_CONFIG with a 0.7 safety factor and swept bounding-box clearance — not against the live Rapier controller, and not yet played through in a browser.",
  },
};

// ---------------------------------------------------------------------------
// Tripo sample
// ---------------------------------------------------------------------------

/**
 * The Tripo mesh is also Y-up, but its furniture runs along Z rather than X:
 * its footprint's principal axis measured 79°, snapped to a +90° yaw, which
 * brings it into the same orientation as the Rodin sample (the ~+90°
 * difference recorded in the comparison report). Uniform scale 7.6995×.
 */
const TRIPO_TRANSFORM = {
  position: [
    -0.03343258964432749, 1.4487997428633006, 0.029043069307186364,
  ] as Vec3,
  rotation: [
    0, 0.7071067811865475, 0, 0.7071067811865476,
  ] as Quat,
  scale: [
    7.699514449683923, 7.699514449683923, 7.699514449683923,
  ] as Vec3,
};

/** Lower elevated surface, measured at y ≈ 1.50 along its −Z edge
 * (x −3.30…−0.42, z ≈ −0.90). */
const TRIPO_LOW_Y = 1.5;
/**
 * The Tripo mesh has a second, higher surface at y ≈ 2.24 (x 0.66…3.54), but
 * the authored course does not use it: the closest standable pair between the
 * two tiers is 0.72 m apart horizontally with a 1.06 m rise, outside both the
 * mantle window (≤ 0.9 m rise, ≤ 0.6 m reach) and the jump envelope. Reaching
 * it would need another helper flight on top of the lower surface. Recorded
 * here as a measured limitation rather than silently pretending it is part of
 * the course; see docs/SCENE.md.
 */
const TRIPO_UNREACHED_UPPER_Y = 2.244;
void TRIPO_UNREACHED_UPPER_Y;

/**
 * Three-step flight on the −Z side of the lower ledge (whose −Z edge sits at
 * z ≈ −0.90), same construction as the Rodin flight: two 0.50 m mantles and a
 * landing flush with the furniture surface.
 *
 * −Z rather than +Z: the Tripo mesh runs much deeper in +Z, and a flight on
 * that side would end under furniture with no headroom to stand in. This was
 * measured, not guessed — every other approach to this tier fails the
 * clearance test.
 */
const TRIPO_HELPERS: HelperEntity[] = [
  step(
    "helper-step-tripo-1",
    { minX: -2.4, maxX: -0.96, minZ: -3.239, maxZ: -2.519 },
    TRIPO_LOW_Y / 3,
  ),
  step(
    "helper-step-tripo-2",
    { minX: -2.4, maxX: -0.96, minZ: -2.519, maxZ: -1.799 },
    (TRIPO_LOW_Y * 2) / 3,
  ),
  step(
    "helper-landing-tripo",
    { minX: -2.4, maxX: -0.96, minZ: -1.799, maxZ: -1.079 },
    TRIPO_LOW_Y,
  ),
];

const TRIPO_SAMPLE: SceneManifest = {
  schemaVersion: SCENE_MANIFEST_SCHEMA_VERSION,
  levelId: "sample-tripo-room-corner",
  name: "A different perspective",
  createdAt: AUTHORED_AT,
  updatedAt: AUTHORED_AT,
  coordinateConvention: COORDINATE_CONVENTION,
  calibration: { assumedExtentMeters: DEFAULT_ASSUMED_EXTENT_METERS },
  assets: [
    {
      id: "tripo-glb",
      url: "/samples/tripo.glb",
      sha256:
        "e473288cd9e4b999aaf01631e228510ab24e114a2707eb718d3e5381c240cb64",
      sizeBytes: 1993644,
      provenance: {
        providerId: "livepeer",
        capabilityUsed: "tripo-mv3d",
        fallbackFired: null,
        providerJobId: "mjob_c91e623855ae",
        registeredModel: "tripo3d/h3.1/multiview-to-3d",
        // Tripo's multiview API takes ordered views, not the full photo set:
        // photo 4 as front and photo 2 as an approximate left view.
        sourcePhotoOrder: [4, 2],
        generatedAt: GENERATED_AT,
      },
    },
  ],
  photos: samplePhotos([2, 4]),
  entities: [
    {
      id: "tripo-mesh",
      kind: "generated-mesh",
      assetId: "tripo-glb",
      transform: TRIPO_TRANSFORM,
      collider: { kind: "triangle-mesh" },
    },
    gameFloor("helper-floor-tripo", 12, 8.637916615979152),
    ...TRIPO_HELPERS,
  ],
  spawn: {
    position: standOn(-1.5, 0, 3.061),
    // Facing −Z, down the length of the room corner.
    headingRadians: Math.PI,
  },
  checkpoints: [
    // Open floor along the +X side.
    checkpoint(0, [3.54, 0, 3.061], Math.PI),
    // Floor at the foot of the helper steps, on the −Z side.
    checkpoint(1, [-1.5, 0, -3.419], 0),
    // Elevated furniture surface, reached by the step flight.
    checkpoint(2, [-1.86, TRIPO_LOW_Y, -0.539], 0),
    // Across that surface to its far (+X) end.
    checkpoint(3, [0.3, 1.52, 0.541], Math.PI / 2),
    // Down to the floor to finish.
    checkpoint(4, [-3.66, 0, -3.059], -Math.PI / 2),
  ],
  seed: "sample-tripo-v1",
  movementConfigId: MOVEMENT_CONFIG_ID,
  courseValidation: {
    status: "manually-adjusted",
    method: "authored from measured surface patches; verified with conservative-kinematic-v1",
    checkedAt: AUTHORED_AT,
    evidence:
      "Checkpoints and helper steps were placed from the measured standable-surface map of the normalized mesh, then every leg was re-checked with the same conservative walk/jump/mantle validator used by the generic planner (see src/scene/tools/verify-samples.ts).",
    uncertaintyNotes:
      "Validated against a kinematic model of DEFAULT_MOVEMENT_CONFIG with a 0.7 safety factor and swept bounding-box clearance — not against the live Rapier controller, and not yet played through in a browser.",
  },
};

/** Bundled sample levels, playable with no Livepeer credentials and no new
 * inference job. */
export const SAMPLE_LEVELS: SceneManifest[] = [
  RODIN_SAMPLE,
  TRIPO_SAMPLE,
];

export type SampleLevelId = (typeof SAMPLE_LEVELS)[number]["levelId"];

/** Look up a bundled sample by its `levelId`. Returns `undefined` for an
 * unknown id rather than throwing, so a stale saved link degrades to the
 * start screen instead of a crash. */
export function getSampleLevel(id: string): SceneManifest | undefined {
  return SAMPLE_LEVELS.find((manifest) => manifest.levelId === id);
}

/** The level offered by "play the sample immediately" on the start screen. */
export const DEFAULT_SAMPLE_LEVEL_ID = RODIN_SAMPLE.levelId;
