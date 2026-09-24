import type { GenerationJob } from "@shared/index.js";
import { createCreationRecord, toPendingWorldItem, withCreationUpdate, type CreationRecord, type PendingWorldItem } from "./creationFlow.js";
import type { MyWorldListItem } from "./worlds.js";

const RECORDS_KEY = "objectquest:v2:creations";
const ACTIVE_KEY = "objectquest:v2:active-creation";

function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadCreationRecords(storage: Storage | null = storageOrNull()): CreationRecord[] {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(RECORDS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(isCreationRecord).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function saveCreationRecord(record: CreationRecord, storage: Storage | null = storageOrNull()): void {
  if (!storage) return;
  const records = loadCreationRecords(storage).filter((candidate) => candidate.id !== record.id);
  storage.setItem(RECORDS_KEY, JSON.stringify([record, ...records]));
}

export function setActiveCreationId(id: string, storage: Storage | null = storageOrNull()): void {
  storage?.setItem(ACTIVE_KEY, id);
}

export function clearActiveCreationId(storage: Storage | null = storageOrNull()): void {
  storage?.removeItem(ACTIVE_KEY);
}

export function loadActiveCreation(storage: Storage | null = storageOrNull()): CreationRecord | null {
  if (!storage) return null;
  const id = storage.getItem(ACTIVE_KEY);
  return id ? loadCreationRecords(storage).find((record) => record.id === id) ?? null : null;
}

export function createAndActivateCreation(
  id: string,
  storage: Storage | null = storageOrNull(),
  now?: string,
): CreationRecord {
  const record = createCreationRecord(id, now);
  saveCreationRecord(record, storage);
  setActiveCreationId(id, storage);
  return record;
}

export function updateCreationJob(
  record: CreationRecord,
  stage: keyof CreationRecord["jobs"],
  job: GenerationJob,
  now?: string,
): CreationRecord {
  return withCreationUpdate(record, {
    jobs: {
      ...record.jobs,
      [stage]: {
        id: job.id,
        state: job.state,
        kind: job.kind ?? "image-to-3d",
        ...(job.lastError?.message ? { error: job.lastError.message } : {}),
        ...(job.lastError ? { retryable: job.lastError.retryable } : {}),
        ...(job.providerJobId ? { providerJobId: job.providerJobId } : {}),
        updatedAt: job.updatedAt,
        ...(job.result?.kind === "image-to-3d" ? { consumedByAssetId: job.result.asset.id } : {}),
        ...(job.result?.kind === "image-edit" ? { consumedByAssetId: job.result.asset.id } : {}),
      },
    },
  }, now);
}

export function loadPendingWorlds(storage: Storage | null = storageOrNull()): PendingWorldItem[] {
  return loadCreationRecords(storage)
    .map(toPendingWorldItem)
    .filter((item): item is PendingWorldItem => item !== null);
}

/** Adapts durable creation records to the shared My worlds union without
 * leaking the saved-world rendering contract into the creation flow. */
export function loadCreationWorldItems(
  storage: Storage | null = storageOrNull(),
): Extract<MyWorldListItem, { kind: "pending" | "failed" }>[] {
  return loadCreationRecords(storage).flatMap<Extract<MyWorldListItem, { kind: "pending" | "failed" }>>((record) => {
    const item = toPendingWorldItem(record);
    if (!item) return [];
    const jobRef = item.attentionStage
      ? record.jobs[item.attentionStage]
      : record.jobs.shape ?? record.jobs.preview ?? record.jobs.object;
    const failed = item.status === "needs-attention";
    const retryable = item.primaryAction === "retry";
    const job: GenerationJob = {
      schemaVersion: 1,
      id: record.id,
      idempotencyKey: `creation-${record.id}`,
      providerId: "creation-flow",
      providerJobId: jobRef?.providerJobId ?? null,
      capabilityRequested: "creation-flow",
      capabilityUsed: null,
      fallbackFired: null,
      state: failed ? "failed" : item.status === "pending" ? "generating" : "queued",
      photoOrder: [],
      createdAt: record.createdAt,
      updatedAt: item.updatedAt,
      retryCount: 0,
      maxRetries: retryable ? 1 : 0,
      ...(jobRef?.kind ? { kind: jobRef.kind } : {}),
      uiMessage: item.statusText,
      ...(failed
        ? {
            lastError: {
              message: jobRef?.error ?? item.statusText,
              retryable,
              occurredAt: jobRef?.updatedAt ?? item.updatedAt,
            },
          }
        : {}),
    };
    if (failed) {
      return [{
        kind: "failed" as const,
        id: item.id,
        title: item.title,
        job,
        statusText: item.statusText,
        actionLabel: retryable ? "Retry" as const : "Review choices" as const,
      }];
    }
    return [{
      kind: "pending" as const,
      id: item.id,
      title: item.title,
      job,
      statusText: item.statusText,
      actionLabel: item.primaryAction === "view-progress" ? "View progress" as const : "Resume" as const,
    }];
  });
}

function isCreationRecord(value: unknown): value is CreationRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CreationRecord>;
  return record.schemaVersion === 1
    && typeof record.id === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string"
    && typeof record.step === "string"
    && Boolean(record.selection)
    && Boolean(record.crop)
    && Boolean(record.jobs);
}
