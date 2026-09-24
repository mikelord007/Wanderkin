import { migrateSceneManifest } from "@shared/index.js";
import lostColorsFixture from "../../shared/fixtures/lost-colors.json";
import { LOST_COLORS_BUNDLED_MEDIA } from "../audio/bundledMedia.js";

/** Offline-ready flagship adventure over the existing bundled Rodin GLB. */
export const LOST_COLORS_SAMPLE = {
  ...migrateSceneManifest(lostColorsFixture),
  media: LOST_COLORS_BUNDLED_MEDIA,
};
