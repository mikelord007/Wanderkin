import { describe, expect, it, vi } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import { saveThenExport } from "./exportFlow.js";

function manifest(levelId: string, name: string): SceneManifest {
  return { levelId, name } as SceneManifest;
}

describe("saveThenExport", () => {
  it("exports the authoritative minted id with the latest saved edits", async () => {
    const working = manifest("sample-rodin-room-corner", "Latest edited name");
    const saved = { ...working, levelId: "minted-level-id", updatedAt: "2026-09-18T10:00:00.000Z" };
    const onSave = vi.fn().mockResolvedValue(saved);
    const onPersisted = vi.fn();
    const onExport = vi.fn().mockResolvedValue(undefined);

    await expect(
      saveThenExport({ workingManifest: working, needsSave: true, onSave, onPersisted, onExport }),
    ).resolves.toBe(saved);

    expect(onSave).toHaveBeenCalledWith(working);
    expect(onPersisted).toHaveBeenCalledWith(saved);
    expect(onExport).toHaveBeenCalledWith(saved);
    expect(onExport.mock.invocationCallOrder[0]).toBeGreaterThan(onSave.mock.invocationCallOrder[0]!);
  });

  it("does not export or update the snapshot when saving fails", async () => {
    const failure = new Error("save failed");
    const onPersisted = vi.fn();
    const onExport = vi.fn();

    await expect(
      saveThenExport({
        workingManifest: manifest("sample-rodin-room-corner", "Unsaved"),
        needsSave: true,
        onSave: vi.fn().mockRejectedValue(failure),
        onPersisted,
        onExport,
      }),
    ).rejects.toBe(failure);

    expect(onPersisted).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it("exports a clean saved manifest without saving again", async () => {
    const saved = manifest("saved-level", "Saved");
    const onSave = vi.fn();
    const onExport = vi.fn().mockResolvedValue(undefined);

    await saveThenExport({
      workingManifest: saved,
      needsSave: false,
      onSave,
      onPersisted: vi.fn(),
      onExport,
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(onExport).toHaveBeenCalledWith(saved);
  });
});
