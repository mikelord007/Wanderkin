import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderInputPhoto } from "@shared/index.js";
import {
  clearActiveSource,
  clearPendingSubmission,
  loadActiveSource,
  loadPendingSubmission,
  resolveResumeState,
  saveActiveSource,
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

  it("round-trips a pending submission and clears it independently of the active source", () => {
    expect(loadPendingSubmission()).toBeNull();
    savePendingSubmission({ idempotencyKey: "key-1", capability: "rodin-i3d", inputPhotos, photos });
    expect(loadPendingSubmission()).toEqual({
      idempotencyKey: "key-1",
      capability: "rodin-i3d",
      inputPhotos,
      photos,
    });

    saveActiveSource({ kind: "job", jobId: "job-1", photos });
    clearPendingSubmission();
    expect(loadPendingSubmission()).toBeNull();
    expect(loadActiveSource()).toEqual({ kind: "job", jobId: "job-1", photos });

    clearActiveSource();
    expect(loadActiveSource()).toBeNull();
  });

  it("updates the same active-source record in place when a job goes ready, rather than clearing it", () => {
    saveActiveSource({ kind: "job", jobId: "job-1", photos });
    expect(loadActiveSource()).toEqual({ kind: "job", jobId: "job-1", photos });

    saveActiveSource({ kind: "job", jobId: "job-1", photos, resultAssetId: "asset-1" });
    expect(loadActiveSource()).toEqual({
      kind: "job",
      jobId: "job-1",
      photos,
      resultAssetId: "asset-1",
    });
  });

  it("round-trips an import-sourced active record", () => {
    saveActiveSource({ kind: "import", assetId: "asset-imported" });
    expect(loadActiveSource()).toEqual({ kind: "import", assetId: "asset-imported" });
    clearActiveSource();
    expect(loadActiveSource()).toBeNull();
  });

  it("resolves resume state: a still-generating job (no resultAssetId yet) resumes on Generation", () => {
    savePendingSubmission({ idempotencyKey: "key-1", capability: "rodin-i3d", inputPhotos, photos });
    saveActiveSource({ kind: "job", jobId: "job-1", photos });
    expect(resolveResumeState()).toEqual({ screen: "generation", jobId: "job-1" });
  });

  it("resolves resume state: a ready job (resultAssetId set) resumes straight to Preparation, beating a pending submission", () => {
    savePendingSubmission({ idempotencyKey: "key-1", capability: "rodin-i3d", inputPhotos, photos });
    saveActiveSource({ kind: "job", jobId: "job-1", photos, resultAssetId: "asset-1" });
    expect(resolveResumeState()).toEqual({
      screen: "preparation",
      assetId: "asset-1",
      photos,
    });
  });

  it("resolves resume state: an imported asset resumes straight to Preparation with no source photos", () => {
    saveActiveSource({ kind: "import", assetId: "asset-imported" });
    expect(resolveResumeState()).toEqual({
      screen: "preparation",
      assetId: "asset-imported",
      photos: [],
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
