import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEmptyManifest, migrateSceneManifest, type PublishedLevelVersion, type SceneManifest } from "../../../shared/index.js";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { minimalValidGlb, readSamplePhoto } from "./helpers/fixtures.js";
import { defaultMcpHandlers } from "./helpers/mcpHandlers.js";

function playableWorld(levelId: string): SceneManifest {
  const manifest = createEmptyManifest({ levelId, name: "Private Island", seed: levelId, movementConfigId: "default-v1" });
  manifest.photos = [{ id: "source-photo", url: "/samples/photo-1.jpg", order: 1 }];
  manifest.entities = [{
    id: "floor", kind: "floor",
    transform: { position: [0, -0.2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    dimensions: [12, 0.4, 12], collider: { kind: "box", halfExtents: [6, 0.2, 6] }, addedBy: "game",
  }];
  manifest.spawn = { position: [0, 0.37, 0], headingRadians: 0 };
  manifest.checkpoints = [{
    id: "checkpoint-1", order: 0, position: [2, 0.37, 0], triggerRadius: 0.5,
    safeRespawn: { position: [2, 0.37, 0], headingRadians: 0 },
  }];
  return migrateSceneManifest(manifest);
}

describe("strict owner-token boundary", () => {
  let api: ApiServerHandle;
  let mcp: FakeMcpServer;

  beforeAll(async () => {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({
      mcpEndpoint: mcp.url,
      env: { OBJECTQUEST_LEGACY_OPEN: "false", OBJECTQUEST_SECURE_COOKIE: "false" },
    });
  }, 30_000);

  afterAll(async () => { await api?.stop(); await mcp?.close(); });

  it("does not expose an owner's photo URL to another client", async () => {
    const form = new FormData();
    form.append("photos", new Blob([new Uint8Array(readSamplePhoto(1))], { type: "image/jpeg" }), "private.jpg");
    const upload = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect(upload.status).toBe(201);
    const token = upload.headers.get("x-objectquest-owner");
    const [photo] = await upload.json() as Array<{ url: string }>;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect((await fetch(`${api.baseUrl}${photo!.url}`)).status).toBe(404);
    const owned = await fetch(`${api.baseUrl}${photo!.url}`, { headers: { "X-ObjectQuest-Owner": token! } });
    expect(owned.status).toBe(200);
    expect(owned.headers.get("cache-control")).toBe("private, no-store");
  });

  it("protects imported asset metadata and bytes", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(minimalValidGlb())], { type: "model/gltf-binary" }), "private.glb");
    const imported = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: form });
    expect(imported.status).toBe(201);
    const token = imported.headers.get("x-objectquest-owner")!;
    const asset = await imported.json() as { id: string; url: string };
    expect((await fetch(`${api.baseUrl}/api/assets/${asset.id}`)).status).toBe(404);
    expect((await fetch(`${api.baseUrl}${asset.url}`)).status).toBe(404);
    expect((await fetch(`${api.baseUrl}/api/assets/${asset.id}`, { headers: { "X-ObjectQuest-Owner": token } })).status).toBe(200);
    expect((await fetch(`${api.baseUrl}${asset.url}`, { headers: { "X-ObjectQuest-Owner": token } })).status).toBe(200);
  });

  it("keeps private levels private while the immutable photo-free share is public", async () => {
    const createdResponse = await fetch(`${api.baseUrl}/api/levels`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(playableWorld("strict-private")),
    });
    expect(createdResponse.status).toBe(201);
    const token = createdResponse.headers.get("x-objectquest-owner")!;
    const level = await createdResponse.json() as SceneManifest;

    expect((await fetch(`${api.baseUrl}/api/levels/${level.levelId}`)).status).toBe(404);
    expect((await fetch(`${api.baseUrl}/api/levels/${level.levelId}`, { headers: { "X-ObjectQuest-Owner": token } })).status).toBe(200);

    const publish = await fetch(`${api.baseUrl}/api/levels/${level.levelId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ObjectQuest-Owner": token },
      body: JSON.stringify({ challenge: { kind: "completion" } }),
    });
    expect(publish.status).toBe(201);
    const version = await publish.json() as PublishedLevelVersion;
    expect(version.manifest.photos).toEqual([]);
    const shared = await fetch(`${api.baseUrl}/api/shares/${version.shareId}`);
    expect(shared.status).toBe(200);
    expect((await shared.json() as PublishedLevelVersion).manifest.photos).toEqual([]);
  });
});
