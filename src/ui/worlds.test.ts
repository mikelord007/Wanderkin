import { describe, expect, it, vi } from "vitest";
import { createEmptyManifest } from "@shared/index.js";
import type { EditorDraft } from "../editor/draftStorage.js";
import { missingAssetUrls, savedWorldItems, savedWorldOrigin } from "./worlds.js";

function manifest(id: string) {
  return createEmptyManifest({ levelId: id, name: id, seed: id, movementConfigId: "default-v1" });
}

function draft(id: string): EditorDraft {
  return { levelId: id, baseUpdatedAt: "t1", manifest: manifest(id), savedAt: "t2" };
}

describe("My worlds list model", () => {
  it("merges drafts with saved levels and keeps unsaved drafts resumable", () => {
    const items = savedWorldItems([manifest("saved")], [draft("saved"), draft("unsaved")]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "draft", id: "unsaved" });
    expect(items[1]).toMatchObject({ kind: "saved", id: "saved", draft: { levelId: "saved" } });
  });

  it("reports missing assets without submitting generation work", async () => {
    const world = manifest("saved");
    world.assets = [
      { id: "ok", url: "/assets/ok.glb", sha256: "a".repeat(64), sizeBytes: 10 },
      { id: "gone", url: "/assets/gone.glb", sha256: "b".repeat(64), sizeBytes: 10 },
    ];
    const request = vi.fn(async (url: string | URL | Request, _init: RequestInit) =>
      new Response(null, { status: String(url).includes("gone") ? 404 : 200 }),
    );
    await expect(missingAssetUrls(world, request as typeof fetch)).resolves.toEqual(["/assets/gone.glb"]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every((call) => call[1]?.method === "HEAD")).toBe(true);
  });

  it("distinguishes generated worlds, bundled sample copies, and imports", () => {
    const generated = manifest("generated");
    generated.photos = [{ id: "photo-1", url: "/photos/1.jpg", order: 1 }];
    const sample = manifest("sample");
    sample.assets = [{ id: "sample", url: "/samples/rodin.glb", sha256: "a".repeat(64), sizeBytes: 10 }];
    expect(savedWorldOrigin(generated)).toBe("generated");
    expect(savedWorldOrigin(sample)).toBe("sample-copy");
    expect(savedWorldOrigin(manifest("imported"))).toBe("imported");
  });
});
