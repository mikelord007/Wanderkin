import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyManifest } from "@shared/index.js";
import { clearDraft, loadDraft, resolveDraft, saveDraft, type EditorDraft } from "./draftStorage.js";

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

function draftFor(levelId: string, baseUpdatedAt: string): EditorDraft {
  return {
    levelId,
    baseUpdatedAt,
    manifest: createEmptyManifest({ levelId, name: "Draft", seed: "s1", movementConfigId: "default-v1" }),
    savedAt: new Date().toISOString(),
  };
}

describe("draftStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a draft keyed by levelId", () => {
    expect(loadDraft("level-1")).toBeNull();
    const draft = draftFor("level-1", "2026-01-01T00:00:00.000Z");
    saveDraft(draft);
    expect(loadDraft("level-1")).toEqual(draft);
    clearDraft("level-1");
    expect(loadDraft("level-1")).toBeNull();
  });

  it("keeps drafts for different levels independent", () => {
    saveDraft(draftFor("level-1", "t1"));
    saveDraft(draftFor("level-2", "t1"));
    clearDraft("level-1");
    expect(loadDraft("level-1")).toBeNull();
    expect(loadDraft("level-2")).not.toBeNull();
  });

  it("resolves to none when nothing is stored", () => {
    expect(resolveDraft("level-1", "2026-01-01T00:00:00.000Z")).toEqual({ kind: "none" });
  });

  it("resolves to fresh when the draft's base matches the current saved manifest", () => {
    const draft = draftFor("level-1", "2026-01-01T00:00:00.000Z");
    saveDraft(draft);
    expect(resolveDraft("level-1", "2026-01-01T00:00:00.000Z")).toEqual({ kind: "fresh", draft });
  });

  it("resolves to stale when the saved manifest moved on since the draft was based off it", () => {
    const draft = draftFor("level-1", "2026-01-01T00:00:00.000Z");
    saveDraft(draft);
    expect(resolveDraft("level-1", "2026-02-01T00:00:00.000Z")).toEqual({ kind: "stale", draft });
  });

  it("ignores a corrupted or mismatched stored entry rather than throwing", () => {
    localStorage.setItem("objectquest:editorDraft:level-1", "{not json");
    expect(loadDraft("level-1")).toBeNull();

    localStorage.setItem(
      "objectquest:editorDraft:level-1",
      JSON.stringify({ levelId: "wrong-id", baseUpdatedAt: "t1", manifest: {}, savedAt: "t1" }),
    );
    expect(loadDraft("level-1")).toBeNull();
  });
});
