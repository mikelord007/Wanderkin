import type { GameModeId, GenerationJob, GenerationRequest, SceneBiomeId, StyleId } from "@shared/index.js";
import { lookName } from "../biome/lookCatalog.js";
import type { ProgressStage } from "./components/index.js";
import { buildWorldExtrasRequests, type CreationAttentionStage, type CreationJobRef, type CreationRecord } from "./creationFlow.js";

/*
 * Worlds being built. Once a creation reaches step 5 it leaves Create and
 * lives in My worlds as a card until it is ready to play. The data is the
 * same durable creation record Create already keeps (creationStorage.ts); the
 * jobs themselves are server-side and survive reloads. This module is pure:
 * it turns records into what a card needs, and computes the build stages with
 * the same labels and rules WorldProgressScreen uses, so a card and the
 * progress screen always say the same thing.
 */

export type PendingWorldState = "building" | "done" | "failed";

export interface PendingWorld {
  id: string;
  title: string;
  style: StyleId;
  mode: GameModeId;
  /** The biome locked at creation; none for creations made before that. */
  biome?: SceneBiomeId;
  state: PendingWorldState;
  /** The source photo: the card's picture while it builds. */
  photoUrl?: string;
  /** The approved style preview: the card's picture once it is ready. */
  previewUrl?: string;
  shapeJobId: string;
  /** The generated 3D asset, once the shape is ready. */
  resultAssetId?: string;
  startedAt: string;
  stages: ProgressStage[];
  /** 0 to 1, for the progress strip. */
  progress: number;
  /** The stage in progress (or the one that failed), for the card's line. */
  currentStage: ProgressStage;
  error?: string;
  /** Which failed job Retry resubmits. */
  retryStage?: CreationAttentionStage;
}

/** The required job states WorldProgressScreen reads; a live job wins over
 * the stored reference when the caller has one. */
interface ShapeView { state: GenerationJob["state"]; uiMessage?: string | undefined }

/** Story and music are optional. (Narration is no longer generated; older
 * records may still carry a narration job, which is ignored here.) */
const OPTIONAL_STAGES = ["story", "music"] as const;
export type ExtraStage = (typeof OPTIONAL_STAGES)[number];

/**
 * A soundtrack that failed only because the app once asked for 60 seconds,
 * more than the provider's 15 (fixed in 9e87271). The provider refused it
 * before anything ran or was charged, so it is not the user's problem: it is
 * treated as never asked for, and asked for again.
 */
function isSupersededExtra(ref: CreationJobRef | undefined): boolean {
  return ref?.state === "failed" && ref.kind === "music" && /duration/i.test(ref.error ?? "");
}

/** The story or music job that really failed, if any. Only this raises the
 * "still safe" alarm; a job never asked for or still running never does. */
export function failedExtraStage(record: CreationRecord | null): ExtraStage | undefined {
  return OPTIONAL_STAGES.find((stage) => record?.jobs[stage]?.state === "failed" && !isSupersededExtra(record.jobs[stage]));
}

/**
 * The story and music requests a build still has to ask for: those never
 * asked for (or turned away before a job existed), a superseded soundtrack,
 * and any stage in `resubmit`. A real failure is never resubmitted unasked.
 */
export function extrasToSubmit(record: CreationRecord, key: (prefix: string) => string, resubmit: readonly ExtraStage[] = []): [ExtraStage, GenerationRequest][] {
  const jobs = { ...record.jobs };
  for (const stage of OPTIONAL_STAGES) if (resubmit.includes(stage) || isSupersededExtra(jobs[stage])) delete jobs[stage];
  return buildWorldExtrasRequests({ ...record, jobs }, key) as [ExtraStage, GenerationRequest][];
}

/** How Retry recovers a failed story or music job. The server only retries a
 * job it marked retryable (otherwise it returns the same failed job), so any
 * other failure is asked for afresh. */
export function extraRetryMode(ref: CreationJobRef | undefined): "retry-job" | "resubmit" {
  return ref && ref.retryable !== false && !isSupersededExtra(ref) ? "retry-job" : "resubmit";
}

/**
 * The four build stages, exactly as WorldProgressScreen shows them. Story
 * and music are optional: a failure there never stops the world.
 */
export function worldBuildStages(record: CreationRecord | null, shape?: ShapeView | null): ProgressStage[] {
  const shapeState = shape?.state ?? record?.jobs.shape?.state;
  const shapeMessage = shape?.uiMessage;
  const optionalFailed = failedExtraStage(record);
  const optionalReady = OPTIONAL_STAGES.every((stage) => record?.jobs[stage]?.state === "ready");
  const optionalStarted = OPTIONAL_STAGES.some((stage) => record?.jobs[stage] && !isSupersededExtra(record.jobs[stage]));
  return [
    { id: "object", label: "Preparing your object", status: record?.jobs.object?.state === "failed" ? "error" : "complete" },
    { id: "shape", label: "Building its 3D shape", status: shapeState === "failed" ? "error" : shapeState === "ready" ? "complete" : "active", ...(shapeMessage ? { detail: shapeMessage } : {}) },
    { id: "course", label: record?.selection.biome ? `Creating your ${lookName(record.selection.biome)} course` : "Creating your course", status: shapeState === "ready" ? "active" : "pending", detail: shapeState === "ready" ? "The shape is ready for course preparation." : "Begins when the shape is ready." },
    { id: "story", label: "Adding its story and sound", status: optionalFailed ? "error" : optionalReady ? "complete" : optionalStarted ? "active" : "pending", ...(optionalFailed ? { detail: "Your world stays playable. Sound can be added later." } : {}) },
  ];
}

/** A creation that has left Create for My worlds: its 3D build was submitted. */
export function isBuildRecord(record: CreationRecord): record is CreationRecord & { jobs: { shape: CreationJobRef } } {
  // "ready" (course prepared) stays a card until its saved level exists; My
  // worlds then hides it (see creationLevels.ts unsavedBuilds).
  return (record.step === "building" || record.step === "ready") && Boolean(record.jobs.shape);
}

function isTerminal(state: GenerationJob["state"] | undefined): boolean {
  return state === "ready" || state === "failed";
}

export function toPendingWorld(record: CreationRecord, buildStartedAt?: string): PendingWorld | null {
  if (!isBuildRecord(record)) return null;
  const shape = record.jobs.shape;
  const stages = worldBuildStages(record);
  const requiredFailed: CreationAttentionStage | undefined =
    shape.state === "failed" ? "shape" : record.jobs.object?.state === "failed" ? "object" : undefined;
  const state: PendingWorldState = requiredFailed ? "failed" : shape.state === "ready" ? "done" : "building";
  // Required stages only (object, shape, course): the optional story stage
  // never holds the bar back.
  const required = stages.slice(0, 3);
  const weight = required.reduce((sum, stage) => sum + (stage.status === "complete" ? 1 : stage.status === "active" ? 0.45 : 0), 0);
  const progress = state === "done" ? 1 : Math.min(0.95, Math.max(0.08, weight / required.length));
  const currentStage = stages.find((stage) => stage.status === "error")
    ?? stages.find((stage) => stage.status === "active")
    ?? stages[stages.length - 1]!;
  const failedRef = requiredFailed ? record.jobs[requiredFailed] : undefined;
  return {
    id: record.id,
    title: record.title?.trim() || "Untitled world",
    style: record.selection.style,
    mode: record.selection.mode,
    ...(record.selection.biome ? { biome: record.selection.biome } : {}),
    state,
    ...(record.photo?.url ? { photoUrl: record.photo.url } : {}),
    ...(record.preview?.asset.url ? { previewUrl: record.preview.asset.url } : {}),
    shapeJobId: shape.id,
    ...(shape.state === "ready" && shape.consumedByAssetId ? { resultAssetId: shape.consumedByAssetId } : {}),
    startedAt: buildStartedAt ?? shape.updatedAt ?? record.updatedAt,
    stages,
    progress,
    currentStage,
    ...(requiredFailed ? { retryStage: requiredFailed, error: failedRef?.error ?? "This step couldn’t finish. Your photo and choices are safe." } : {}),
  };
}

/** Newest first, so a build you just started leads the list. */
export function pendingWorldsFrom(records: readonly CreationRecord[], buildStarts: Readonly<Record<string, string>> = {}): PendingWorld[] {
  return records
    .map((record) => toPendingWorld(record, buildStarts[record.id]))
    .filter((world): world is PendingWorld => world !== null)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Every job a build still waits on, for the shared poller. */
export function unfinishedBuildJobs(record: CreationRecord): { stage: CreationAttentionStage; jobId: string }[] {
  if (!isBuildRecord(record)) return [];
  const stages: CreationAttentionStage[] = ["shape", ...OPTIONAL_STAGES];
  return stages.flatMap((stage) => {
    const ref = record.jobs[stage];
    return ref && !isTerminal(ref.state) ? [{ stage, jobId: ref.id }] : [];
  });
}

/** "Started just now", "Started 4 min ago", "Started 2 h ago". */
export function startedHint(startedAt: string, now: number): string {
  const minutes = Math.floor(Math.max(0, now - new Date(startedAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "Started just now";
  if (minutes < 60) return `Started ${minutes} min ago`;
  return `Started ${Math.floor(minutes / 60)} h ago`;
}

export const LOOK_LABELS: Record<StyleId, string> = { cartoon: "Cartoon", "hand-painted": "Hand-painted", watercolor: "Watercolor" };
export const MODE_LABELS: Record<GameModeId, string> = { explore: "Explore", collect: "Collect", race: "Race" };

/** "Cartoon look · Monsoon Marsh · Collect": a world's choices in one line,
 * the same on the preview, the build page and its card. */
export function worldChoicesLine(style: StyleId, mode: GameModeId, biome?: SceneBiomeId): string {
  return [`${LOOK_LABELS[style]} look`, ...(biome ? [lookName(biome)] : []), MODE_LABELS[mode]].join(" · ");
}
