import { createHash } from "node:crypto";
import { join } from "node:path";
import type { ImageEditGenerationRequest } from "../../shared/generation.js";
import { JsonFileStore } from "../persistence/jsonStore.js";

export interface PreviewCacheRecord {
  key: string;
  jobId: string;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

export class PreviewCacheStore {
  private readonly file: JsonFileStore<Record<string, PreviewCacheRecord>>;

  constructor(storageDir: string) {
    this.file = new JsonFileStore(join(storageDir, "preview-cache.json"), () => ({}));
  }

  keyFor(request: ImageEditGenerationRequest): string {
    return createHash("sha256").update(JSON.stringify({
      capability: request.capability,
      sourceImageAssetId: request.sourceImageAssetId,
      instruction: request.instruction,
      outputMimeType: request.outputMimeType,
    })).digest("hex");
  }

  async get(key: string): Promise<PreviewCacheRecord | undefined> {
    return (await this.file.read())[key];
  }

  async put(key: string, jobId: string): Promise<PreviewCacheRecord> {
    return this.file.update((current) => {
      const existing = current[key];
      const now = new Date().toISOString();
      const record: PreviewCacheRecord = existing
        ? { ...existing, jobId, updatedAt: now }
        : { key, jobId, approved: false, createdAt: now, updatedAt: now };
      current[key] = record;
      return record;
    });
  }

  async approve(key: string, jobId: string): Promise<PreviewCacheRecord | undefined> {
    return this.file.update((current) => {
      const existing = current[key];
      if (!existing || existing.jobId !== jobId) return undefined;
      existing.approved = true;
      existing.updatedAt = new Date().toISOString();
      return existing;
    });
  }
}
