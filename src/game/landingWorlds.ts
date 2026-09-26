import { migrateSceneManifest, type HydratedSceneManifest } from "@shared/index.js";
import desk from "./landingWorlds/desk.json";
import plane from "./landingWorlds/plane.json";
import shoe from "./landingWorlds/shoe.json";
import car from "./landingWorlds/car.json";

/**
 * The four worlds on the public landing, made by the owner in the app and
 * bundled as static samples on 2026-09-27: each GLB and soundtrack is a
 * byte-identical copy under `public/samples/<slug>/`, and each manifest keeps
 * the world's own look and decoration seed. No source photos, workflow jobs
 * or account ids were carried over (built by
 * `nimbalyst-local/design/shots/landing-samples/build-bundle.py`).
 */
export const LANDING_WORLDS: readonly HydratedSceneManifest[] = [desk, plane, shoe, car].map((manifest) => migrateSceneManifest(manifest));
