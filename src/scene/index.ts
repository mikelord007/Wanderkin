/**
 * Scene preparation: GLB import, geometry inspection, Y-up normalization,
 * collider generation, surface analysis, and conservative course validation.
 *
 * Everything this module produces is `SceneManifest` data plus the geometry
 * behind it. It never depends on a provider job shape, and the game runtime
 * never depends on this pipeline — it reads the manifest.
 *
 * Integration entry points:
 * - {@link loadSceneAsset} / {@link loadAsset} — cached download + decode.
 * - {@link buildManifestCollision} — world-space triangles per entity.
 * - {@link buildManifestScene} — renderable graph with matching transforms.
 * - {@link prepareAsset} — a GLB URL to a playable manifest.
 * - {@link SAMPLE_LEVELS} / {@link getSampleLevel} — bundled playable samples.
 */

export * from "./types.js";
export * from "./transform.js";
export * from "./glb.js";
export * from "./inspect.js";
export * from "./normalize.js";
export * from "./helpers.js";
export * from "./collision.js";
export * from "./spatial.js";
export * from "./surfaces.js";
export * from "./route.js";
export * from "./course.js";
export * from "./loader.js";
export * from "./runtime.js";
export * from "./prepare.js";
export * from "./samples.js";
