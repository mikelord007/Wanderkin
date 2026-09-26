import { STYLE_DEFINITIONS } from "@shared/index.js";
import type {
  GameModeId,
  GeneratedImageReference,
  GenerationJob,
  GenerationRequest,
  PhotoReference,
  StyleId,
  SelectedWorldReferenceV1,
  WorldWorkflowV1,
} from "@shared/index.js";

export type CreationStep = "photo" | "review" | "customize" | "preview" | "building" | "ready";
/** Creations saved before narration was removed may still carry a
 * `jobs.narration` entry; it is kept as history and never shown or retried. */
export type CreationAttentionStage = "object" | "preview" | "shape" | "story" | "music";

export interface CropSettings {
  scale: number;
  x: number;
  y: number;
}

export interface CreationSelection {
  style: StyleId;
  mode: GameModeId;
  atmosphere: string;
}

export interface ApprovedPreview {
  cacheKey: string;
  jobId: string;
  asset: GeneratedImageReference;
  selection: CreationSelection;
  approvedAt: string;
}

export interface CreationJobRef {
  id: string;
  state: GenerationJob["state"];
  kind: NonNullable<GenerationJob["kind"]>;
  error?: string;
  retryable?: boolean;
  providerJobId?: string;
  updatedAt?: string;
  consumedByAssetId?: string;
}

export interface CreationRecord {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  step: CreationStep;
  photo?: PhotoReference;
  objectImage?: GeneratedImageReference;
  useOriginalImage: boolean;
  crop: CropSettings;
  selection: CreationSelection;
  reviewedImageAssetId?: string;
  selectedReference?: SelectedWorldReferenceV1;
  preview?: ApprovedPreview | {
    cacheKey: string;
    jobId: string;
    asset: GeneratedImageReference;
    selection: CreationSelection;
    approvedAt?: never;
  };
  jobs: Partial<Record<CreationAttentionStage, CreationJobRef>>;
  /** A style preview that has been asked for but has no picture yet. It
   * becomes `preview` when its job is ready; until then the preview slot shows
   * the last successful preview of this same photo, or nothing. */
  pendingPreview?: { cacheKey: string; jobId: string; selection: CreationSelection };
  title?: string;
  questIntro?: string;
  /** The signed-in account that started this creation on this device.
   * Records from before sign-in have none and stay visible to everyone. */
  ownerId?: string;
}

export const DEFAULT_CREATION_SELECTION: CreationSelection = {
  style: "cartoon",
  mode: "collect",
  atmosphere: "",
};

export const DEFAULT_CROP: CropSettings = { scale: 1, x: 0, y: 0 };

export function createCreationRecord(id: string, now = new Date().toISOString()): CreationRecord {
  return {
    schemaVersion: 1,
    id,
    createdAt: now,
    updatedAt: now,
    step: "photo",
    useOriginalImage: false,
    crop: DEFAULT_CROP,
    selection: DEFAULT_CREATION_SELECTION,
    jobs: {},
  };
}

export function withCreationUpdate(
  record: CreationRecord,
  patch: Partial<Omit<CreationRecord, "schemaVersion" | "id" | "createdAt">>,
  now = new Date().toISOString(),
): CreationRecord {
  return { ...record, ...patch, updatedAt: now };
}

/** Everything a creation worked out from its photo. A different photo makes
 * all of it stale, so none of it may carry over to the new one. */
function withoutPhotoWork(record: CreationRecord): CreationRecord {
  const next: CreationRecord = { ...record, jobs: { ...record.jobs }, useOriginalImage: false };
  delete next.jobs.object;
  delete next.jobs.preview;
  delete next.objectImage;
  delete next.preview;
  delete next.pendingPreview;
  delete next.reviewedImageAssetId;
  delete next.selectedReference;
  return next;
}

/** The creation with a new photo, ready for review. The cut-out, style
 * preview and approval all belonged to the old photo and are dropped, so
 * step 3 starts with an empty preview slot. Re-using the same photo keeps
 * them. */
export function withNewPhoto(record: CreationRecord, photo: PhotoReference, now?: string): CreationRecord {
  const base = record.photo?.id === photo.id ? record : withoutPhotoWork(record);
  return withCreationUpdate(base, { photo, step: "review" }, now);
}

/** The creation back at step 1 with no photo, and nothing derived from one. */
export function withoutPhoto(record: CreationRecord, now?: string): CreationRecord {
  const next = withoutPhotoWork(record);
  delete next.photo;
  return withCreationUpdate(next, { step: "photo" }, now);
}

/**
 * Puts a finished preview job's picture in the preview slot, but only for the
 * job this creation is waiting on (its pending preview, or the preview it
 * already shows). A job for anything else changes nothing.
 */
export function withReadyPreview(next: CreationRecord, before: CreationRecord, jobId: string, asset: GeneratedImageReference): CreationRecord {
  const pending = before.pendingPreview;
  if (pending?.jobId === jobId) {
    const promoted = withCreationUpdate(next, { preview: { cacheKey: pending.cacheKey, jobId, asset, selection: pending.selection } });
    delete promoted.pendingPreview;
    return promoted;
  }
  if (before.preview?.jobId === jobId) return withCreationUpdate(next, { preview: { ...before.preview, asset } });
  return next;
}

/**
 * The picture for step 3's preview slot: this creation's own last successful
 * style preview, or nothing. Records saved before pending previews existed
 * could hold the cut-out or the photo itself as a stand-in while a preview was
 * loading; that is never shown as a preview.
 */
export function visiblePreviewUrl(record: CreationRecord): string | undefined {
  const preview = record.preview;
  if (!preview) return undefined;
  if (preview.asset.id === record.objectImage?.id || preview.asset.id === record.photo?.id) return undefined;
  // A preview of a different look or atmosphere is not a preview of this one.
  if (preview.selection.style !== record.selection.style || preview.selection.atmosphere !== record.selection.atmosphere) return undefined;
  return preview.asset.url;
}

export function approvedPreviewMatchesSelection(record: CreationRecord): boolean {
  const preview = record.preview;
  return Boolean(
    preview?.approvedAt
      && preview.selection.style === record.selection.style
      && preview.selection.mode === record.selection.mode
      && preview.selection.atmosphere === record.selection.atmosphere,
  );
}

export function canBuildWorld(record: CreationRecord): record is CreationRecord & { preview: ApprovedPreview } {
  return approvedPreviewMatchesSelection(record);
}

/** True only for a record that still looks exactly like what
 * `createCreationRecord()` minted — no photo, no job of any kind, and no
 * customization carried over from an earlier photo that was since replaced.
 * (`crop`/`selection` can only ever be edited once a photo exists, i.e.
 * once `jobs.object` exists, so the jobs check alone already implies them —
 * the explicit comparisons just make that guarantee obvious at the call
 * site instead of relying on it silently.) Used to tell a genuinely
 * untouched draft, safe to delete outright, apart from one that carries
 * real user work — a photo, a job, or a config edit — which must never be
 * silently discarded just because the user backed out of the screen. */
export function isUntouchedCreationRecord(record: CreationRecord): boolean {
  return (
    record.step === "photo"
    && !record.photo
    && !record.objectImage
    && !record.useOriginalImage
    && !record.reviewedImageAssetId
    && !record.selectedReference
    && !record.preview
    && !record.pendingPreview
    && !record.title
    && !record.questIntro
    && Object.keys(record.jobs).length === 0
    && record.crop.scale === DEFAULT_CROP.scale
    && record.crop.x === DEFAULT_CROP.x
    && record.crop.y === DEFAULT_CROP.y
    && record.selection.style === DEFAULT_CREATION_SELECTION.style
    && record.selection.mode === DEFAULT_CREATION_SELECTION.mode
    && record.selection.atmosphere === DEFAULT_CREATION_SELECTION.atmosphere
  );
}

export function creationNeedsAttention(record: CreationRecord): CreationAttentionStage | null {
  const order: CreationAttentionStage[] = ["object", "preview", "shape", "story", "music"];
  return order.find((stage) => record.jobs[stage]?.state === "failed") ?? null;
}

export function buildWorldExtrasRequests(record: CreationRecord, key: (prefix: string) => string): [CreationAttentionStage, GenerationRequest][] {
  const definition = STYLE_DEFINITIONS[record.selection.style];
  const titleSubject = record.selection.atmosphere.trim() || "a tiny object world";
  const requests: [CreationAttentionStage, GenerationRequest][] = [];
  if (!record.jobs.story) requests.push(["story", { schemaVersion: 1, kind: "text", capability: "gemini-text", idempotencyKey: key("story"), purpose: "quest-text", prompt: `Write a short, family-friendly quest for ${titleSubject}. Mode: ${record.selection.mode}.\nReturn one JSON object only. Do not use Markdown or code fences.\nUse exactly these string fields and nothing else: "title" (2-80 characters), "intro" (20-320), "objective" (10-160).`, output: "quest-json", maxCharacters: 1200 }]);
  if (!record.jobs.music) requests.push(["music", { schemaVersion: 1, kind: "music", capability: "music", idempotencyKey: key("music"), purpose: "world-soundtrack", prompt: definition.audioPrompts.music, durationSeconds: 15, instrumental: true, loop: true }]);
  return requests;
}

export function toWorldWorkflow(record: CreationRecord): WorldWorkflowV1 | null {
  if (!record.reviewedImageAssetId || !record.selectedReference) return null;
  return {
    schemaVersion: 1,
    reviewedImageAssetId: record.reviewedImageAssetId,
    selectedReference: record.selectedReference,
    jobs: Object.values(record.jobs).filter((job): job is CreationJobRef => Boolean(job)).map(job => ({
      kind: job.kind,
      jobId: job.id,
      status: job.state,
      updatedAt: job.updatedAt ?? record.updatedAt,
      ...(job.providerJobId ? { providerJobId: job.providerJobId } : {}),
      ...(job.consumedByAssetId ? { consumedByAssetId: job.consumedByAssetId } : {}),
    })),
  };
}

export type PendingWorldStatus = "draft" | "pending" | "needs-attention";

export interface PendingWorldItem {
  id: string;
  title: string;
  style: StyleId;
  mode: GameModeId;
  status: PendingWorldStatus;
  statusText: string;
  primaryAction: "resume" | "view-progress" | "retry" | "review";
  attentionStage?: CreationAttentionStage;
  updatedAt: string;
  previewUrl?: string;
}

export function toPendingWorldItem(record: CreationRecord): PendingWorldItem | null {
  if (record.step === "ready") return null;
  const attentionStage = creationNeedsAttention(record);
  const base = {
    id: record.id,
    title: record.title?.trim() || "Untitled world",
    style: record.selection.style,
    mode: record.selection.mode,
    updatedAt: record.updatedAt,
    ...(record.preview?.asset.url ? { previewUrl: record.preview.asset.url } : {}),
  };
  if (attentionStage) {
    const retryable = record.jobs[attentionStage]?.retryable !== false;
    return {
      ...base,
      status: "needs-attention",
      statusText: retryable ? `${stageLabel(attentionStage)} needs attention` : `${stageLabel(attentionStage)} couldn’t finish — your choices are safe`,
      primaryAction: retryable ? "retry" : "review",
      attentionStage,
    };
  }
  if (record.step === "building") {
    return {
      ...base,
      status: "pending",
      statusText: "Your world is taking shape",
      primaryAction: "view-progress",
    };
  }
  return {
    ...base,
    status: "draft",
    statusText: draftStatus(record.step),
    primaryAction: "resume",
  };
}

export function stageLabel(stage: CreationAttentionStage): string {
  switch (stage) {
    case "object": return "Object preparation";
    case "preview": return "Style preview";
    case "shape": return "3D shape";
    case "story": return "Story";
    case "music": return "Music";
  }
}

function draftStatus(step: CreationStep): string {
  switch (step) {
    case "photo": return "Add a photo to continue";
    case "review": return "Review your object";
    case "customize": return "Choose a look and adventure";
    case "preview": return "Approve your style preview";
    default: return "Continue creating";
  }
}
