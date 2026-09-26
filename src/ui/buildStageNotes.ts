import type { ProgressStage } from "./components/index.js";

/*
 * What is happening right now in each stage of building a world, in plain
 * words, for the line under the running stage on the progress screen and the
 * My worlds card. The 3D shape and music are made by Livepeer, the
 * generation service; the object cut-out and the course are prepared here.
 */
const NOTES: Record<string, string> = {
  object: "Getting your object ready",
  shape: "Livepeer is building your 3D world now",
  course: "Ready for its course: open the world to lay it out",
  sound: "Livepeer is making its music",
};

/** The line for the running stage, keyed by the build's stage ids. */
export function buildStageNote(stage: ProgressStage): string | undefined {
  return stage.status === "active" ? NOTES[stage.id] : undefined;
}
