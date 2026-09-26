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
/** Worlds whose first story and music requests are still on their way. */
const startingExtras = new Set<string>();

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
export async function reaskMissingExtras(record: CreationRecord, deps: ReaskDeps, state: Map<string, { at: number; count: number }> = asked, starting: ReadonlySet<string> = startingExtras): Promise<void> {
  if (!isBuildRecord(record) || starting.has(record.id)) return;
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
  /** Saves the build once its shape exists. */
  save: (record: CreationRecord) => void;
  /** Records a story or music job the server accepted. By then Create has
   * been left, so this writes to the stored record, not the screen. */
  record: (stage: ExtraStage, job: GenerationJob) => void;
  key: (prefix: string) => string;
  /** Leaves Create for My worlds (or the build's progress). */
  navigate: (record: CreationRecord) => void;
}

/**
 * Starts a world's build. The 3D shape is recorded the moment it exists, so
 * it is never lost, and the build moves on at once: the story request can
 * take minutes (the server waits for the text), so nobody waits for it in
 * Create. Story and music are asked for alongside, and until those first
 * requests answer, the progress screen and My worlds leave them alone rather
 * than asking a second time. An extra the server turns away (busy, over
 * budget) stays unrecorded rather than failed: it is simply asked for again
 * later.
 */
export async function startWorldBuild(record: CreationRecord, shapeRequest: ImageTo3dGenerationRequest, deps: WorldBuildDeps, starting: Set<string> = startingExtras): Promise<CreationRecord> {
  const shape = await deps.submit(shapeRequest);
  const next = updateCreationJob(withCreationUpdate(record, { step: "building" }), "shape", shape);
  const extras = extrasToSubmit(next, deps.key);
  if (extras.length) starting.add(next.id);
  try {
    deps.save(next);
    deps.navigate(next);
    await Promise.allSettled(extras.map(([stage, request]) => deps.submit(request).then((job) => deps.record(stage, job))));
  } finally {
    starting.delete(next.id);
  }
  return next;
}
