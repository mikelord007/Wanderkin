import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import lostColorsFixture from "../../shared/fixtures/lost-colors.json";
import { migrateSceneManifest } from "../../shared/manifest-migration.js";
import type { JobManager } from "../jobs/manager.js";
import type { LevelStore } from "../levels.js";
import { RequestCostNotBoundedError } from "../livepeer/capabilities.js";
import { GeneratedAssetStore } from "../persistence/generatedAssetStore.js";
import { ImageDecodeBudget } from "../security/imageDimensions.js";
import { createPostcardsRouter } from "./routes.js";
import type { PostcardCacheStore } from "./store.js";

function webp(width = 320, height = 180): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

describe("postcard screenshot route", () => {
  let dir: string;
  let close: (() => Promise<void>) | undefined;

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "objectquest-postcard-route-")); });
  afterEach(async () => { await close?.(); rmSync(dir, { recursive: true, force: true }); });

  it("accepts WebP bytes and returns detected asset metadata", async () => {
    const levels = { get: vi.fn(async () => ({ levelId: "world-1" })) } as unknown as LevelStore;
    const assets = new GeneratedAssetStore(dir);
    const jobs = {} as JobManager;
    const cache = {} as PostcardCacheStore;
    const app = express();
    app.use(express.json());
    app.use(createPostcardsRouter(levels, assets, jobs, cache, undefined, {
      limits: { maxWidth: 4_096, maxHeight: 4_096, maxPixels: 16_000_000 },
      budget: new ImageDecodeBudget(64_000_000),
    }));
    const listener = app.listen(0);
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    close = () => new Promise<void>((resolve) => listener.close(() => resolve()));
    const baseUrl = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;

    const bytes = webp();
    const response = await fetch(`${baseUrl}/api/postcards/world-1/screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: bytes.toString("base64") }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      mimeType: "image/webp",
      width: 320,
      height: 180,
      sizeBytes: bytes.length,
      url: expect.stringMatching(/\/api\/generated-assets\/files\/[a-f0-9]{64}\.webp$/),
    });
  });

  it("maps the postcard cost guard to a stable ordinary-user unavailable response", async () => {
    const manifest = migrateSceneManifest(lostColorsFixture);
    const levels = {
      get: vi.fn(async () => manifest),
      save: vi.fn(async () => manifest),
    } as unknown as LevelStore;
    const assets = {
      getProviderImage: vi.fn(async () => ({
        id: "capture-1",
        provenance: { requestedCapability: "browser-world-capture" },
      })),
    } as unknown as GeneratedAssetStore;
    const jobs = {
      submitGenerationOrReconcile: vi.fn(async () => { throw new RequestCostNotBoundedError(); }),
    } as unknown as JobManager;
    const cache = {
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => undefined),
    } as unknown as PostcardCacheStore;
    const app = express();
    app.use(express.json());
    app.use(createPostcardsRouter(levels, assets, jobs, cache));
    const listener = app.listen(0);
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    close = () => new Promise<void>((resolve) => listener.close(() => resolve()));
    const baseUrl = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;

    const response = await fetch(`${baseUrl}/api/postcards/${manifest.levelId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenshotAssetId: "capture-1" }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "Animated postcards are temporarily unavailable.",
      code: "cost_not_bounded",
      retryable: false,
    });
    expect(cache.put).not.toHaveBeenCalled();
  });
});
