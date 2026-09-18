import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "./helpers/mcpHandlers.js";
import { notAnImageOrGlb, readSamplePhoto } from "./helpers/fixtures.js";

/**
 * Runs against a REAL local server/index.ts process (spawned via tsx, same
 * as `npm run dev`) with a FAKE local MCP endpoint standing in for Livepeer
 * — these tests never make a real generation call. Storage is an isolated
 * temp directory per file; the port is OS-assigned, so this never touches
 * the shared dev server at :8787.
 */
describe("POST /api/uploads + GET /api/photos/files/:name", () => {
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

  it("stores real sample photos, preserving submission order as 1-based sourceIndex/order", async () => {
    const form = new FormData();
    form.append("photos", new Blob([new Uint8Array(readSamplePhoto(3))], { type: "image/jpeg" }), "photo-3.jpg");
    form.append("photos", new Blob([new Uint8Array(readSamplePhoto(1))], { type: "image/jpeg" }), "photo-1.jpg");

    const res = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const refs = (await res.json()) as Array<{ id: string; url: string; order: number; label?: string }>;

    expect(refs).toHaveLength(2);
    // Order reflects submission position, not filename — the caller's own
    // numbering, not something the server infers from names.
    expect(refs[0]?.order).toBe(1);
    expect(refs[1]?.order).toBe(2);
    expect(refs[0]?.url).toMatch(/^\/api\/photos\/files\/[0-9a-f-]{36}\.jpg$/);
    expect(refs[0]?.id).not.toBe(refs[1]?.id);
  });

  it("durably serves back the exact uploaded bytes at the returned URL", async () => {
    const original = readSamplePhoto(2);
    const form = new FormData();
    form.append("photos", new Blob([new Uint8Array(original)], { type: "image/jpeg" }), "photo-2.jpg");

    const uploadRes = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    const [ref] = (await uploadRes.json()) as Array<{ url: string }>;

    const fileRes = await fetch(`${api.baseUrl}${ref!.url}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get("content-type")).toBe("image/jpeg");
    const downloaded = Buffer.from(await fileRes.arrayBuffer());
    expect(downloaded.equals(original)).toBe(true);
  });

  it("rejects a file whose magic bytes aren't a recognized image, with 400 and stores nothing", async () => {
    const form = new FormData();
    form.append("photos", new Blob([new Uint8Array(notAnImageOrGlb())], { type: "image/jpeg" }), "fake.jpg");

    const res = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/not a recognized/i);
    // Error body is the plain {message} shape used everywhere — no stack, no file path.
    expect(Object.keys(body)).toEqual(["message"]);
  });

  it("rejects a recognized image header below the 512-byte minimum", async () => {
    const tooSmall = Buffer.alloc(511);
    tooSmall.set([0xff, 0xd8, 0xff]);
    const form = new FormData();
    form.append("photos", new Blob([tooSmall], { type: "image/jpeg" }), "too-small.jpg");

    const res = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/too small|512/i);
    expect(Object.keys(body)).toEqual(["message"]);
  });

  // Known server bug (reported to Astra 2026-09-18): Multer rejects before
  // the route handler and there is no terminal JSON error middleware, so
  // this currently returns 500. `fails` keeps the desired contract
  // executable and will make the suite fail as soon as the API is fixed,
  // prompting removal of the marker rather than normalizing the bad shape.
  it.fails("rejects a photo above the 20 MiB limit with a safe JSON error", async () => {
    const tooLarge = Buffer.alloc(20 * 1024 * 1024 + 1);
    tooLarge.set([0xff, 0xd8, 0xff]);
    const form = new FormData();
    form.append("photos", new Blob([tooLarge], { type: "image/jpeg" }), "too-large.jpg");

    const res = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect([400, 413]).toContain(res.status);
    expect(res.headers.get("content-type")).toMatch(/application\/json/i);
    const body = (await res.json()) as { message: string };
    expect(Object.keys(body)).toEqual(["message"]);
    expect(body.message).toMatch(/limit|large|20/i);
  });

  it("rejects a request with no files under the expected field name", async () => {
    const form = new FormData();
    form.append("notPhotos", "irrelevant");
    const res = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/no photos received/i);
  });

  it("rejects the whole batch request with 400 when any one file in it is invalid", async () => {
    const form = new FormData();
    form.append("photos", new Blob([new Uint8Array(readSamplePhoto(4))], { type: "image/jpeg" }), "photo-4.jpg");
    form.append("photos", new Blob([new Uint8Array(notAnImageOrGlb())], { type: "image/jpeg" }), "bad.jpg");

    const res = await fetch(`${api.baseUrl}/api/uploads`, { method: "POST", body: form });
    expect(res.status).toBe(400);
  });
});
