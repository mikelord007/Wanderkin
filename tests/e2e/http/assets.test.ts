import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "./helpers/mcpHandlers.js";
import { minimalValidGlb, notAnImageOrGlb, readSampleRodinGlb, readSampleTripoGlb } from "./helpers/fixtures.js";

/** Real local server process + fake MCP endpoint (never real Livepeer) —
 * see uploads.test.ts for the shared rationale. This file exercises GLB
 * import, content-addressed hashing, and durable re-download. */
describe("POST /api/assets/import + GET /api/assets/files/:name + GET /api/assets/:id", () => {
  let api: ApiServerHandle;
  let mcp: FakeMcpServer;

  beforeAll(async () => {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({ mcpEndpoint: mcp.url });
  }, 30_000);

  afterAll(async () => {
    await api?.stop();
    await mcp?.close();
  });

  it("imports the real bundled Rodin sample GLB, content-addresses it by sha256, and serves identical bytes back", async () => {
    const bytes = readSampleRodinGlb();
    const expectedHash = createHash("sha256").update(bytes).digest("hex");

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" }), "rodin.glb");
    const importRes = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: form });
    expect(importRes.status).toBe(201);
    const asset = (await importRes.json()) as { id: string; url: string; sha256: string; sizeBytes: number; photos?: unknown };

    expect(asset.sha256).toBe(expectedHash);
    expect(asset.sizeBytes).toBe(bytes.length);
    expect(asset.url).toBe(`/api/assets/files/${expectedHash}.glb`);
    // Hand-imported assets carry no provenance/source-photo metadata.
    expect(asset.photos).toBeUndefined();

    const fileRes = await fetch(`${api.baseUrl}${asset.url}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get("content-type")).toBe("model/gltf-binary");
    const downloaded = Buffer.from(await fileRes.arrayBuffer());
    expect(downloaded.equals(bytes)).toBe(true);

    const metaRes = await fetch(`${api.baseUrl}/api/assets/${asset.id}`);
    expect(metaRes.status).toBe(200);
    expect((await metaRes.json()).sha256).toBe(expectedHash);
  }, 20_000);

  it("importing the identical Tripo sample GLB twice dedupes to the same content-addressed asset id", async () => {
    const bytes = readSampleTripoGlb();

    const form1 = new FormData();
    form1.append("file", new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" }), "tripo.glb");
    const res1 = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: form1 });
    const asset1 = (await res1.json()) as { id: string; sha256: string };

    const form2 = new FormData();
    form2.append("file", new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" }), "tripo-again.glb");
    const res2 = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: form2 });
    const asset2 = (await res2.json()) as { id: string; sha256: string };

    expect(res2.status).toBe(201);
    expect(asset2.id).toBe(asset1.id);
    expect(asset2.sha256).toBe(asset1.sha256);
  }, 20_000);

  it("accepts a minimal-but-structurally-valid GLB (magic/version/length only, no real mesh)", async () => {
    const bytes = minimalValidGlb();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "model/gltf-binary" }), "minimal.glb");
    const res = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: form });
    expect(res.status).toBe(201);
  });

  it("rejects a non-GLB file with 400 and a plain {message} body", async () => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(notAnImageOrGlb())], { type: "model/gltf-binary" }), "notreal.glb");
    const res = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/binary glTF magic/i);
    expect(Object.keys(body)).toEqual(["message"]);
  });

  it("rejects a GLB whose declared header length doesn't match the actual file size", async () => {
    const bad = minimalValidGlb();
    bad.writeUInt32LE(999, 8); // declared length now lies about the real 12-byte size
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bad)], { type: "model/gltf-binary" }), "liar.glb");
    const res = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/declares length/i);
  });

  it("GET /api/assets/files/:name refuses path traversal and non-matching filenames with 404, not a filesystem error", async () => {
    const traversal = await fetch(`${api.baseUrl}/api/assets/files/${encodeURIComponent("../../../../etc/passwd")}`);
    expect(traversal.status).toBe(404);

    const wrongShape = await fetch(`${api.baseUrl}/api/assets/files/not-a-sha256-hash.glb`);
    expect(wrongShape.status).toBe(404);

    const wrongExt = await fetch(`${api.baseUrl}/api/assets/files/${"a".repeat(64)}.txt`);
    expect(wrongExt.status).toBe(404);
  });

  it("GET /api/assets/:id returns 404 with a plain message for an unknown id", async () => {
    const res = await fetch(`${api.baseUrl}/api/assets/does-not-exist`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(Object.keys(body)).toEqual(["message"]);
  });
});
