import type { GenerationJob, GenerationRequest, ImageTo3dGenerationRequest } from "@shared/index.js";
import { withCreationUpdate, type CreationRecord } from "./creationFlow.js";
import { updateCreationJob } from "./creationStorage.js";
import { extrasToSubmit, isBuildRecord, type ExtraStage } from "./pendingWorlds.js";

/** How often a world's missing story and music are asked for again. */
export const EXTRAS_REASK_MS = 20_000;
/** Asks per world per page load; past this, a request the server keeps
 * refusing (its reason is in the server log) stops being repeated. */
export const EXTRAS_MAX_ASKS = 10;

const asked = new Map<string, { at: number; count: number }>();

export interface ReaskDeps {
  submit: (request: GenerationRequest) => Promise<GenerationJob>;
  /** Records a job the server accepted. */
  record: (stage: ExtraStage, job: GenerationJob) => void;
  key: (prefix: string) => string;
  now?: number;
}

/**
 * Asks again for a building world's missing story and music: turned away
 * while the service was busy or over its limit, or never asked for. Shared by
 * the progress screen and My worlds, and throttled per world across both, so
 * the two never ask at once. A refusal is simply tried again later; it never
 * marks the stage failed.
 */
export async function reaskMissingExtras(record: CreationRecord, deps: ReaskDeps, state: Map<string, { at: number; count: number }> = asked): Promise<void> {
  if (!isBuildRecord(record)) return;
  const missing = extrasToSubmit(record, deps.key);
  if (!missing.length) return;
  const now = deps.now ?? Date.now();
  const last = state.get(record.id);
  if (last && (now - last.at < EXTRAS_REASK_MS || last.count >= EXTRAS_MAX_ASKS)) return;
  state.set(record.id, { at: now, count: (last?.count ?? 0) + 1 });
  await Promise.allSettled(missing.map(([stage, request]) => deps.submit(request).then((job) => deps.record(stage, job))));
}

export interface WorldBuildDeps {
  submit: (request: GenerationRequest) => Promise<GenerationJob>;
  save: (record: CreationRecord) => void;
  key: (prefix: string) => string;
  /** Leaves Create for the build's progress (or My worlds). */
  navigate: (record: CreationRecord) => void;
}

/**
 * Starts a world's build. The 3D shape is recorded the moment it exists, so
 * it is never lost; story and music are asked for next, and only once they
 * are recorded does the build move on. Whatever opens next (the progress
 * screen, a My worlds card) then sees every job started here and never asks
 * for them a second time. An extra the server turns away (busy, over budget)
 * stays unrecorded rather than failed: it is simply asked for again later.
 */
export async function startWorldBuild(record: CreationRecord, shapeRequest: ImageTo3dGenerationRequest, deps: WorldBuildDeps): Promise<CreationRecord> {
  const shape = await deps.submit(shapeRequest);
  let next = updateCreationJob(withCreationUpdate(record, { step: "building" }), "shape", shape);
  deps.save(next);
  const extras = await Promise.allSettled(extrasToSubmit(next, deps.key).map(([stage, request]) => deps.submit(request).then((job) => [stage, job] as const)));
  for (const result of extras) if (result.status === "fulfilled") next = updateCreationJob(next, result.value[0], result.value[1]);
  deps.save(next);
  deps.navigate(next);
  return next;
}
