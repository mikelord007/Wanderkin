import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { resolveStorageDir } from "./env.js";
import { AssetStore } from "./persistence/assetStore.js";
import { PhotoStore } from "./persistence/photoStore.js";
import { createAssetsRouter } from "./routes/assets.js";
import { createPhotosRouter } from "./routes/photos.js";

function minimalGlb(): Buffer {
  const buffer = Buffer.alloc(64, 0xaa);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(buffer.length, 8);
  return buffer;
}

function minimalJpeg(): Buffer {
  const buffer = Buffer.alloc(512, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

describe("storage path normalization", () => {
  let closeServer: (() => Promise<void>) | undefined;
  let storageDir: string | undefined;

  afterEach(async () => {
    await closeServer?.();
    if (storageDir) await rm(storageDir, { recursive: true, force: true });
  });

  it("serves assets and photos when STORAGE_DIR is configured relatively", async () => {
    expect(resolveStorageDir(undefined)).toBe(resolve(process.cwd(), "storage"));

    const absoluteTempDir = await mkdtemp(join(tmpdir(), "objectquest-storage-"));
    const relativeTempDir = relative(process.cwd(), absoluteTempDir);
    storageDir = resolveStorageDir(relativeTempDir);
    expect(isAbsolute(storageDir)).toBe(true);
    expect(storageDir).toBe(absoluteTempDir);

    const assets = new AssetStore(storageDir);
    const photos = new PhotoStore(storageDir);
    const glb = minimalGlb();
    const jpeg = minimalJpeg();
    const asset = await assets.store(glb);
    const photo = await photos.store(jpeg, 1, "source.jpg");

    const app = express();
    app.use(createAssetsRouter(assets));
    app.use(createPhotosRouter(photos));
    const listener = app.listen(0);
    await new Promise<void>((resolveListening) =>
      listener.once("listening", resolveListening),
    );
    closeServer = () =>
      new Promise<void>((resolveClosed) => listener.close(() => resolveClosed()));
    const { port } = listener.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const assetResponse = await fetch(`${baseUrl}${asset.url}`);
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("content-type")).toContain("model/gltf-binary");
    expect(Buffer.from(await assetResponse.arrayBuffer())).toEqual(glb);

    const photoResponse = await fetch(`${baseUrl}${photo.url}`);
    expect(photoResponse.status).toBe(200);
    expect(photoResponse.headers.get("content-type")).toContain("image/jpeg");
    expect(Buffer.from(await photoResponse.arrayBuffer())).toEqual(jpeg);
  });
});
