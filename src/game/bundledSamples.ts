import { migrateSceneManifest } from "@shared/index.js";
import lostColorsFixture from "../../shared/fixtures/lost-colors.json";

/** Offline-ready flagship adventure over the existing bundled Rodin GLB. */
export const LOST_COLORS_SAMPLE = migrateSceneManifest(lostColorsFixture);
