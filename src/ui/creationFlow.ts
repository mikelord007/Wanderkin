import type {
  GameModeId,
  GeneratedImageReference,
  GenerationJob,
  PhotoReference,
  StyleId,
} from "@shared/index.js";

export type CreationStep = "photo" | "review" | "customize" | "preview" | "building" | "ready";
export type CreationAttentionStage = "object" | "preview" | "shape" | "story" | "music" | "narration";

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
  preview?: ApprovedPreview | {
    cacheKey: string;
    jobId: string;
    asset: GeneratedImageReference;
    selection: CreationSelection;
    approvedAt?: never;
  };
  jobs: Partial<Record<CreationAttentionStage, CreationJobRef>>;
  title?: string;
  questIntro?: string;
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

export function creationNeedsAttention(record: CreationRecord): CreationAttentionStage | null {
  const order: CreationAttentionStage[] = ["object", "preview", "shape", "story", "music", "narration"];
  return order.find((stage) => record.jobs[stage]?.state === "failed") ?? null;
}

export type PendingWorldStatus = "draft" | "pending" | "needs-attention";

export interface PendingWorldItem {
  id: string;
  title: string;
  style: StyleId;
  mode: GameModeId;
  status: PendingWorldStatus;
  statusText: string;
  primaryAction: "resume" | "view-progress" | "retry";
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
    return {
      ...base,
      status: "needs-attention",
      statusText: `${stageLabel(attentionStage)} needs attention`,
      primaryAction: "retry",
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
    case "narration": return "Narration";
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

