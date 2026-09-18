/**
 * Public surface of the game runtime (`src/game`).
 *
 * The product UI needs only `GameView` and the snapshot types. Everything
 * else exported here is for QA tooling and for the scene-preparation
 * worker, which needs the same movement limits the controller enforces in
 * order to validate that a generated course is actually traversable.
 */

export { GameView } from "./GameView.js";
export type { GameSnapshot, GameViewProps, GameLoadStage } from "./types.js";

// Diagnostics (development builds install these on window.__objectquest).
export { DIAGNOSTICS_GLOBAL } from "./diagnostics.js";
export type { GameDiagnostics, GameDiagnosticsApi } from "./diagnostics.js";

// Headless simulation, for course validation and tests. Running the real
// controller is the only honest way to prove a route is traversable.
export { GameSimulation, NEUTRAL_INPUT } from "./core/simulation.js";
export type { SimulationInput, SimulationEvent, SimulationOptions } from "./core/simulation.js";

export { probeMantle } from "./core/mantle.js";
export type { MantleContext, MantleTarget, MantleProbeResult, MantleRejection } from "./core/mantle.js";

export { buildSceneCollision, helperLocalSoup } from "./core/sceneCollision.js";
export type { AssetGeometryMap, EntityCollision, SceneCollision } from "./core/sceneCollision.js";

export { initRapier } from "./core/physicsWorld.js";
export type { PhysicsScene, PlayLimits, RapierModule } from "./core/physicsWorld.js";

export type { TriangleSoup, Bounds } from "./core/soup.js";
export { boxSoup, rampSoup, transformSoup, soupBounds, triangleCount } from "./core/soup.js";

// Asset loading. Temporary: the shared loader belongs to `src/scene`.
export { loadSceneAsset, clearSceneAssetCache, isSceneAssetCached } from "./assets/loadSceneAsset.js";
export type { LoadedSceneAsset, AssetLoadProgress } from "./assets/loadSceneAsset.js";
