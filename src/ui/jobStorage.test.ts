import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderInputPhoto } from "@shared/index.js";
import {
  clearActiveJob,
  clearActivePreparation,
  clearPendingSubmission,
  loadActiveJob,
  loadActivePreparation,
  loadPendingSubmission,
  resolveResumeState,
  saveActiveJob,
  saveActivePreparation,
  savePendingSubmission,
} from "./jobStorage.js";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("jobStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const inputPhotos: ProviderInputPhoto[] = [{ photoId: "p1", sourceIndex: 1 }];
  const photos = [{ id: "p1", url: "/uploads/p1.jpg", order: 1 }];

  it("round-trips a pending submission and clears it independently of the active job", () => {
    expect(loadPendingSubmission()).toBeNull();
    savePendingSubmission({ idempotencyKey: "key-1", capability: "rodin-i3d", inputPhotos, photos });
    expect(loadPendingSubmission()).toEqual({
      idempotencyKey: "key-1",
      capability: "rodin-i3d",
      inputPhotos,
      photos,
    });

    saveActiveJob({ jobId: "job-1", photos });
    clearPendingSubmission();
    expect(loadPendingSubmission()).toBeNull();
    expect(loadActiveJob()).toEqual({ jobId: "job-1", photos });

    clearActiveJob();
    expect(loadActiveJob()).toBeNull();
  });

  it("round-trips an active preparation and clears it independently of the other records", () => {
    expect(loadActivePreparation()).toBeNull();
    saveActivePreparation({ assetId: "asset-1", photos });
    expect(loadActivePreparation()).toEqual({ assetId: "asset-1", photos });
    clearActivePreparation();
    expect(loadActivePreparation()).toBeNull();
  });

  it("resolves resume state: active job wins over a pending submission", () => {
    savePendingSubmission({ idempotencyKey: "key-1", capability: "rodin-i3d", inputPhotos, photos });
    saveActiveJob({ jobId: "job-1", photos });
    expect(resolveResumeState()).toEqual({ screen: "generation", jobId: "job-1" });
  });

  it("resolves resume state: active preparation wins over an active job and a pending submission", () => {
    savePendingSubmission({ idempotencyKey: "key-1", capability: "rodin-i3d", inputPhotos, photos });
    saveActiveJob({ jobId: "job-1", photos });
    saveActivePreparation({ assetId: "asset-1", photos });
    expect(resolveResumeState()).toEqual({
      screen: "preparation",
      preparation: { assetId: "asset-1", photos },
    });
  });

  it("resolves to the Preparation screen with source photos when only an active preparation survived a reload", () => {
    saveActivePreparation({ assetId: "asset-1", photos });
    expect(resolveResumeState()).toEqual({
      screen: "preparation",
      preparation: { assetId: "asset-1", photos },
    });
  });

  it("resolves to the Photos screen with the same key when only a pending submission survived a reload", () => {
    savePendingSubmission({ idempotencyKey: "same-key", capability: "tripo-mv3d", inputPhotos, photos });
    const resumed = resolveResumeState();
    expect(resumed).toEqual({
      screen: "photos",
      pending: { idempotencyKey: "same-key", capability: "tripo-mv3d", inputPhotos, photos },
    });
    if (resumed.screen === "photos") {
      expect(resumed.pending.idempotencyKey).toBe("same-key");
    }
  });

  it("resolves to start when nothing is persisted", () => {
    expect(resolveResumeState()).toEqual({ screen: "start" });
  });
});
