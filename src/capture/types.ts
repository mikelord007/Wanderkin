import type { GameplayHighlight } from "./recorder.js";
import type { WorldScreenshot } from "./screenshot.js";

export interface CompletedRunMedia {
  screenshot: WorldScreenshot | null;
  highlight: GameplayHighlight | null;
  screenshotError: string | null;
  recordingError: string | null;
  recordingSupported: boolean;
}
