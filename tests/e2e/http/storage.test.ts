import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { minimalValidGlb, readSamplePhoto } from "./helpers/fixtures.js";
import { defaultMcpHandlers } from "./helpers/mcpHandlers.js";

describe("relative STORAGE_DIR through the full server", () => {
  let api: ApiServerHandle;
  let mcp: FakeMcpServer;

  beforeAll(async () => {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({
      mcpEndpoint: mcp.url,
      useRelativeStoragePath: true,
    });
  }, 30_000);

  afterAll(async () => {
    await api?.stop();
    await mcp?.close();
  });

  it("uploads and serves photo and GLB bytes from a relative storage root", async () => {
    const photo = readSamplePhoto(1);
    const photoForm = new FormData();
    photoForm.append("photos", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "photo-1.jpg");
    const uploadResponse = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: photoForm });
    expect(uploadResponse.status).toBe(201);
    const [photoRef] = (await uploadResponse.json()) as Array<{ url: string }>;

    const downloadedPhoto = await fetch(`${api.baseUrl}${photoRef!.url}`);
    expect(downloadedPhoto.status).toBe(200);
    expect(Buffer.from(await downloadedPhoto.arrayBuffer())).toEqual(photo);

    const glb = minimalValidGlb();
    const hash = createHash("sha256").update(glb).digest("hex");
    const glbForm = new FormData();
    glbForm.append("file", new Blob([new Uint8Array(glb)], { type: "model/gltf-binary" }), "relative.glb");
    const importResponse = await fetch(`${api.baseUrl}/api/assets/import`, { method: "POST", body: glbForm });
    expect(importResponse.status).toBe(201);
    const asset = (await importResponse.json()) as { url: string; sha256: string };
    expect(asset.sha256).toBe(hash);

    const downloadedGlb = await fetch(`${api.baseUrl}${asset.url}`);
    expect(downloadedGlb.status).toBe(200);
    expect(Buffer.from(await downloadedGlb.arrayBuffer())).toEqual(glb);
  });
});
