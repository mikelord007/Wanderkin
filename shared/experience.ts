import type { Transform, Vec3 } from "./geometry.js";
import {
  LEVEL_EXPERIENCE_SCHEMA_VERSION,
  QUEST_TEXT_SCHEMA_VERSION,
  STYLE_DEFINITION_SCHEMA_VERSION,
} from "./schema-version.js";
import type { StyleId } from "./style.js";

export interface StyleSelection {
  id: StyleId;
  definitionVersion: typeof STYLE_DEFINITION_SCHEMA_VERSION;
  /** Optional user-authored atmosphere; never required to build a level. */
  atmosphere?: string;
  /** Durable approved preview reference, not the original source photo. */
  approvedPreviewAssetId?: string;
}

export interface QuestTextBlock {
  schemaVersion: typeof QUEST_TEXT_SCHEMA_VERSION;
  title: string;
  intro: string;
  objective: string;
  narrationScript: string;
}

export interface ColorFragmentEntity {
  id: string;
  kind: "color-fragment";
  transform: Transform;
  triggerRadius: number;
  color: string;
  order: number;
  /** Fraction of final world color restored when this fragment is collected. */
  restorationAmount: number;
}

export interface FinishPortalEntity {
  id: string;
  kind: "finish-portal";
  transform: Transform;
  triggerRadius: number;
  activation: "always" | "all-required-collectibles" | "all-race-checkpoints";
  inactiveColor: string;
  activeColor: string;
}

export interface ExploreModeData {
  kind: "explore";
  destinations: readonly {
    id: string;
    position: Vec3;
    label: string;
  }[];
  optionalCollectibleIds: readonly string[];
}

export interface CollectModeData {
  kind: "collect";
  requiredCollectibleIds: readonly string[];
  requiredCount: number;
  finishPortalId: string;
  /** Monotonic 0..1 restoration target after each required pickup. */
  restorationSteps: readonly number[];
}

export interface RaceModeData {
  kind: "race";
  countdownSeconds: number;
  orderedCheckpointIds: readonly string[];
  finishPortalId?: string;
  restartPolicy: "full-reset";
  personalBestMilliseconds?: number;
}

export type GameModeData = ExploreModeData | CollectModeData | RaceModeData;
export type GameModeId = GameModeData["kind"];

/** Additive v2 gameplay data. Legacy SceneManifest v1 values omit this block. */
export interface LevelExperience {
  schemaVersion: typeof LEVEL_EXPERIENCE_SCHEMA_VERSION;
  style: StyleSelection;
  mode: GameModeData;
  quest: QuestTextBlock;
  collectibles: ColorFragmentEntity[];
  finishPortal: FinishPortalEntity | null;
  /** Starts at zero; runtime progress is stored separately from authored data. */
  initialColorRestoration: number;
}
