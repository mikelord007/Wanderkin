import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import { installCredentialSource } from "../auth/credentials.js";
import { createLevel } from "./api.js";
import { createCreationRecord, type CreationJobRef, type CreationRecord } from "./creationFlow.js";
import { playPreparedWorld, unsavedBuilds } from "./creationLevels.js";
import { toPendingWorld } from "./pendingWorlds.js";

afterEach(() => {
  installCredentialSource(null);
  vi.unstubAllGlobals();
});

const shape: CreationJobRef = { id: "shape-plane", state: "ready", kind: "image-to-3d", consumedByAssetId: "asset-plane", updatedAt: "2026-09-26T17:39:00.000Z" };

/** A plane world whose course was prepared (step "ready") but never saved,
 * like the two lost on the live server on 2026-09-26. */
const prepared: CreationRecord = {
  ...createCreationRecord("world-plane", "2026-09-26T17:30:00.000Z"),
  step: "ready",
  title: "The Paper Plane Sky Race",
  photo: { id: "photo-plane", url: "/photos/plane.jpg", order: 1 },
  jobs: { object: { id: "object-plane", state: "ready", kind: "image-edit" }, shape },
};

const manifest = {
  levelId: "draft-plane",
  name: "The Paper Plane Sky Race",
  biome: "monsoon",
  workflow: { schemaVersion: 1, reviewedImageAssetId: "cutout", selectedReference: {}, jobs: [{ kind: "image-to-3d", jobId: "shape-plane", status: "ready", updatedAt: shape.updatedAt }] },
} as unknown as SceneManifest;

function deps(overrides: Partial<Parameters<typeof playPreparedWorld>[1]> = {}) {
  return {
    signedIn: true,
    save: vi.fn(createLevel),
    playSaved: vi.fn(),
    playDraft: vi.fn(),
    saveFailed: vi.fn(),
    ...overrides,
  };
}

describe("playing a world prepared from Create", () => {
  it("keeps a prepared but unsaved world on My worlds as a playable card", () => {
    expect(toPendingWorld(prepared)).toMatchObject({ id: "world-plane", state: "done", resultAssetId: "asset-plane" });
    expect(unsavedBuilds([toPendingWorld(prepared)!], [])).toHaveLength(1);
  });

  it("saves the level for the signed-in player, with their bearer, before play starts", async () => {
    installCredentialSource(async () => ({ Authorization: "Bearer player-token" }));
    const saved = { ...manifest, levelId: "level-plane" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const play = deps();

    await playPreparedWorld(manifest, play);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/levels");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer player-token");
    expect(JSON.parse(String(init.body))).toMatchObject({ name: "The Paper Plane Sky Race", biome: "monsoon", workflow: { jobs: [{ jobId: "shape-plane" }] } });
    expect(play.playSaved).toHaveBeenCalledWith(saved);
    expect(play.playDraft).not.toHaveBeenCalled();
  });

  it("does not start play when the save fails: it says why, and the card stays", async () => {
    const play = deps({ save: vi.fn(async () => { throw new Error("Could not reach the server."); }) });

    await playPreparedWorld(manifest, play);

    expect(play.saveFailed).toHaveBeenCalledWith("Could not reach the server.");
    expect(play.playSaved).not.toHaveBeenCalled();
    expect(play.playDraft).not.toHaveBeenCalled();
    expect(unsavedBuilds([toPendingWorld(prepared)!], [])).toHaveLength(1);
  });

  it("shows exactly one tile once the world is saved: the saved level takes over from the card", () => {
    const levels = [{ ...manifest, levelId: "level-plane" }];
    const cards = unsavedBuilds([toPendingWorld(prepared)!], levels);
    expect(cards.length + levels.length).toBe(1);
    // Before the saved list has loaded, the card is not hidden.
    expect(unsavedBuilds([toPendingWorld(prepared)!], null)).toHaveLength(1);
  });

  it("plays a signed-out draft, or a world not from Create, without saving", async () => {
    const signedOut = deps({ signedIn: false });
    await playPreparedWorld(manifest, signedOut);
    const { workflow: _workflow, ...imported } = manifest;
    const notFromCreate = deps();
    await playPreparedWorld(imported as SceneManifest, notFromCreate);
    for (const play of [signedOut, notFromCreate]) {
      expect(play.save).not.toHaveBeenCalled();
      expect(play.playDraft).toHaveBeenCalledTimes(1);
    }
  });
});
