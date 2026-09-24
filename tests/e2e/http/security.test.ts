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

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
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

  it("keeps captured postcard screenshots owner-private and rejects oversized dimensions", async () => {
    const created = await fetch(`${api.baseUrl}/api/levels`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(playableWorld("postcard-private")),
    });
    expect(created.status).toBe(201);
    const token = created.headers.get("x-objectquest-owner")!;

    const oversized = await fetch(`${api.baseUrl}/api/postcards/postcard-private/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ObjectQuest-Owner": token },
      body: JSON.stringify({ imageBase64: pngHeader(20_000, 20_000).toString("base64") }),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ message: expect.stringMatching(/decoded-pixel limit/i) });

    const captured = await fetch(`${api.baseUrl}/api/postcards/postcard-private/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ObjectQuest-Owner": token },
      body: JSON.stringify({ imageBase64: pngHeader(2, 2).toString("base64") }),
    });
    expect(captured.status).toBe(201);
    const asset = await captured.json() as { id: string };
    expect((await fetch(`${api.baseUrl}/api/generated-assets/${asset.id}`)).status).toBe(404);
    expect((await fetch(`${api.baseUrl}/api/generated-assets/${asset.id}`, {
      headers: { "X-ObjectQuest-Owner": token },
    })).status).toBe(200);
  });
});

describe("HTTP abuse and spend controls", () => {
  let api: ApiServerHandle | undefined;
  let mcp: FakeMcpServer | undefined;

  afterAll(async () => { await api?.stop(); await mcp?.close(); });

  async function boot(env: Record<string, string>): Promise<void> {
    await api?.stop();
    await mcp?.close();
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({ mcpEndpoint: mcp.url, env });
  }

  function textRequest(idempotencyKey: string): unknown {
    return {
      request: {
        schemaVersion: 1, kind: "text", capability: "gemini-text", idempotencyKey,
        purpose: "security-test", prompt: "Return a short safe quest.", output: "plain-text", maxCharacters: 200,
      },
      worldId: `world-${idempotencyKey}`,
    };
  }

  async function generate(idempotencyKey: string, body = textRequest(idempotencyKey)): Promise<Response> {
    return fetch(`${api!.baseUrl}/api/jobs/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
  }

  it("returns 429 and Retry-After after a billable rate-limit breach", async () => {
    await boot({ BILLABLE_RATE_LIMIT: "1", RATE_LIMIT_WINDOW_SECONDS: "60" });
    expect((await generate("rate-first")).status).toBe(201);
    const blocked = await generate("rate-second");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked.json()).toEqual({ message: expect.stringMatching(/too many generation requests/i) });
  });

  it.each([
    ["global", { LIVEPEER_MAX_GLOBAL_USD: "0.02", LIVEPEER_MAX_DAILY_USD: "20" }, /global limit/i],
    ["daily", { LIVEPEER_MAX_GLOBAL_USD: "100", LIVEPEER_MAX_DAILY_USD: "0.02" }, /daily limit/i],
  ])("rejects the %s spend cap before provider submission", async (_label, env, message) => {
    await boot(env);
    const key = `spend-${_label}`;
    const response = await generate(key, {
      request: {
        schemaVersion: 1, kind: "music", capability: "music", idempotencyKey: key,
        purpose: "security-test", prompt: "brief instrumental", durationSeconds: 10, instrumental: true, loop: false,
      },
      worldId: `world-${key}`,
    });
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "budget_exceeded", message: expect.stringMatching(message) });
    expect(mcp!.callsFor("run_capability")).toHaveLength(0);
  });

  it("keeps spend diagnostics absent unless configured and token-protected when enabled", async () => {
    await boot({ DIAGNOSTICS_TOKEN: "diagnostics-secret" });
    expect((await fetch(`${api!.baseUrl}/api/admin/spend`)).status).toBe(401);
    const response = await fetch(`${api!.baseUrl}/api/admin/spend`, { headers: { "X-Admin-Token": "diagnostics-secret" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ entries: 0, lifetimeUsd: 0, rollingDailyUsd: 0 });
  });
});
