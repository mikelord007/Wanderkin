import { migrateSceneManifest } from "@shared/index.js";
import lostColorsFixture from "../../shared/fixtures/lost-colors.json";
import { SAMPLE_LEVELS } from "../scene/samples.js";

/** Offline-ready flagship adventure over the existing bundled Rodin GLB. */
const fixture = migrateSceneManifest(lostColorsFixture);
const rodinCourse = SAMPLE_LEVELS.find((sample) => sample.levelId === "sample-rodin-room-corner");
if (!rodinCourse) throw new Error("The bundled Rodin course is unavailable.");

export const LOST_COLORS_SAMPLE = {
  ...fixture,
  // The fixture owns mission placements. Reuse the original course's proven
  // helper steps so its elevated blue fragment is reachable by the capsule.
  entities: rodinCourse.entities,
  checkpoints: rodinCourse.checkpoints,
};

/** The same geometry as Lost Colors, configured for relaxed destination play. */
export const EXPLORE_SAMPLE = {
  ...LOST_COLORS_SAMPLE,
  levelId: "sample-explore-rodin",
  name: "Teacup Island Wander",
  experience: {
    ...LOST_COLORS_SAMPLE.experience,
    mode: {
      kind: "explore" as const,
      destinations: rodinCourse.checkpoints.map((checkpoint, index) => ({
        id: `destination-${index + 1}`,
        position: checkpoint.position,
        label: ["Cloud path", "Sunlit shore", "Teacup lookout"][index] ?? `Destination ${index + 1}`,
      })),
      optionalCollectibleIds: LOST_COLORS_SAMPLE.experience.collectibles.map((fragment) => fragment.id),
    },
    finishPortal: LOST_COLORS_SAMPLE.experience.finishPortal
      ? { ...LOST_COLORS_SAMPLE.experience.finishPortal, activation: "always" as const }
      : null,
    initialColorRestoration: 1,
  },
};
