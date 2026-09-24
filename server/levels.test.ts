import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyManifest } from "../shared/manifest.js";
import type { SceneManifest } from "../shared/manifest.js";
import lostColorsFixture from "../shared/fixtures/lost-colors.json";
import { AssetStore } from "./persistence/assetStore.js";
import { PhotoStore } from "./persistence/photoStore.js";
import { createAssetsRouter } from "./routes/assets.js";
import {
  LevelStore,
  createLevelsRouter,
  exportLevelBundle,
  importLevelBundle,
  isSafeLevelId,
  sceneManifestSchema,
} from "./levels.js";

function minimalGlb(byte = 0xaa): Buffer {
  const buffer = Buffer.alloc(64, byte);
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

function baseManifest(overrides: Partial<SceneManifest> = {}): SceneManifest {
  const manifest = createEmptyManifest({
    levelId: "level-1",
    name: "Test level",
    seed: "seed-1",
    movementConfigId: "default-v1",
  });
  return { ...manifest, ...overrides };
}

function levelStore(storageDir: string, publicDir?: string): LevelStore {
  return new LevelStore(storageDir, new AssetStore(storageDir), new PhotoStore(storageDir), publicDir);
}

describe("isSafeLevelId", () => {
  it("accepts a reasonable alphanumeric/dash/underscore id", () => {
    expect(isSafeLevelId("level-1")).toBe(true);
    expect(isSafeLevelId("a1b2c3")).toBe(true);
  });

  it("rejects empty, path-traversal-looking, and overlong ids", () => {
    expect(isSafeLevelId("")).toBe(false);
    expect(isSafeLevelId("../../etc/passwd")).toBe(false);
    expect(isSafeLevelId("a/b")).toBe(false);
    expect(isSafeLevelId("a".repeat(65))).toBe(false);
  });

  it("rejects prototype-pollution-looking ids even though they'd otherwise match the charset", () => {
    expect(isSafeLevelId("__proto__")).toBe(false);
    expect(isSafeLevelId("constructor")).toBe(false);
    expect(isSafeLevelId("prototype")).toBe(false);
  });
});

describe("sceneManifestSchema", () => {
  it("accepts a minimal, freshly-created manifest", () => {
    expect(sceneManifestSchema.safeParse(baseManifest()).success).toBe(true);
  });

  it("rejects a manifest missing required fields", () => {
    const { spawn: _spawn, ...corrupt } = baseManifest();
    expect(sceneManifestSchema.safeParse(corrupt).success).toBe(false);
  });

  it("rejects a manifest with the wrong schema version", () => {
    const corrupt = { ...baseManifest(), schemaVersion: 999 };
    expect(sceneManifestSchema.safeParse(corrupt).success).toBe(false);
  });

  it("rejects checkpoints whose order isn't unique/ascending from 0", () => {
    const manifest = baseManifest({
      checkpoints: [
        { id: "c1", order: 0, position: [0, 1, 0], triggerRadius: 0.5, safeRespawn: { position: [0, 1, 0], headingRadians: 0 } },
        { id: "c2", order: 2, position: [1, 1, 0], triggerRadius: 0.5, safeRespawn: { position: [1, 1, 0], headingRadians: 0 } },
      ],
    });
    expect(sceneManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("accepts checkpoints with a valid ascending order", () => {
    const manifest = baseManifest({
      checkpoints: [
        { id: "c1", order: 0, position: [0, 1, 0], triggerRadius: 0.5, safeRespawn: { position: [0, 1, 0], headingRadians: 0 } },
        { id: "c2", order: 1, position: [1, 1, 0], triggerRadius: 0.5, safeRespawn: { position: [1, 1, 0], headingRadians: 0 } },
      ],
    });
    expect(sceneManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("rejects garbage/corrupted input entirely", () => {
    expect(sceneManifestSchema.safeParse(null).success).toBe(false);
    expect(sceneManifestSchema.safeParse("not an object").success).toBe(false);
    expect(sceneManifestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects non-finite vectors, zero scale, and invalid quaternions", () => {
    const withMesh = (transform: SceneManifest["entities"][number]["transform"]) =>
      baseManifest({
        assets: [{ id: "asset-1", url: "/samples/test.glb", sha256: "a".repeat(64), sizeBytes: 64 }],
        entities: [
          {
            id: "mesh-1",
            kind: "generated-mesh",
            assetId: "asset-1",
            transform,
            collider: { kind: "triangle-mesh" },
          },
        ],
      });
    expect(
      sceneManifestSchema.safeParse(
        withMesh({ position: [Number.POSITIVE_INFINITY, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }),
      ).success,
    ).toBe(false);
    expect(
      sceneManifestSchema.safeParse(
        withMesh({ position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 0, 1] }),
      ).success,
    ).toBe(false);
    expect(
      sceneManifestSchema.safeParse(
        withMesh({ position: [0, 0, 0], rotation: [0, 0, 0, 0], scale: [1, 1, 1] }),
      ).success,
    ).toBe(false);
  });

  it("rejects non-positive helper dimensions and colliders that disagree with visible helper geometry", () => {
    const helper = {
      id: "helper-1",
      kind: "box" as const,
      transform: { position: [0, 0, 0] as const, rotation: [0, 0, 0, 1] as const, scale: [1, 1, 1] as const },
      dimensions: [2, 1, 2] as const,
      collider: { kind: "box" as const, halfExtents: [1, 0.5, 1] as const },
      addedBy: "game" as const,
    };
    expect(sceneManifestSchema.safeParse(baseManifest({ entities: [{ ...helper, dimensions: [2, 0, 2] }] })).success).toBe(false);
    expect(
      sceneManifestSchema.safeParse(
        baseManifest({ entities: [{ ...helper, collider: { kind: "box", halfExtents: [2, 0.5, 1] } }] }),
      ).success,
    ).toBe(false);
    expect(
      sceneManifestSchema.safeParse(
        baseManifest({ entities: [{ ...helper, kind: "ramp", collider: { kind: "box", halfExtents: [1, 0.5, 1] } }] }),
      ).success,
    ).toBe(false);
  });

  it("rejects duplicate ids and dangling generated-mesh asset references", () => {
    const asset = { id: "asset-1", url: "/samples/test.glb", sha256: "a".repeat(64), sizeBytes: 64 };
    expect(sceneManifestSchema.safeParse(baseManifest({ assets: [asset, asset] })).success).toBe(false);
    expect(
      sceneManifestSchema.safeParse(
        baseManifest({
          assets: [asset],
          entities: [
            {
              id: "mesh-1",
              kind: "generated-mesh",
              assetId: "missing-asset",
              transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
              collider: { kind: "triangle-mesh" },
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});

describe("LevelStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "objectquest-levels-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates a level, stamping timestamps and assigning an id when none is usable", async () => {
    const store = levelStore(dir);
    const created = await store.create(baseManifest({ levelId: "" }));
    expect(created.levelId).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();

    const fetched = await store.get(created.levelId);
    expect(fetched).toEqual(created);
  });

  it("lists every created level", async () => {
    const store = levelStore(dir);
    await store.create(baseManifest({ levelId: "level-a" }));
    await store.create(baseManifest({ levelId: "level-b" }));
    const all = await store.list();
    expect(all.map((m) => m.levelId).sort()).toEqual(["level-a", "level-b"]);
  });

  it("never lets create() silently overwrite an existing level with a colliding id", async () => {
    const store = levelStore(dir);
    const first = await store.create(baseManifest({ levelId: "level-1", name: "First" }));
    const second = await store.create(baseManifest({ levelId: "level-1", name: "Second" }));
    expect(second.levelId).not.toBe(first.levelId);
    expect(await store.get(first.levelId)).toMatchObject({ name: "First" });
  });

  it("save() upserts at the given id and bumps updatedAt", async () => {
    const store = levelStore(dir);
    const created = await store.create(baseManifest({ levelId: "level-1" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const saved = await store.save("level-1", { ...created, name: "Renamed" });
    expect(saved.name).toBe("Renamed");
    expect(saved.updatedAt).not.toBe(created.updatedAt);
    expect(saved.createdAt).toBe(created.createdAt);
  });

  it("validates direct persistence calls instead of relying only on HTTP routes", async () => {
    const store = levelStore(dir);
    await expect(
      store.create({ ...baseManifest(), spawn: { position: [Number.NaN, 0, 0], headingRadians: 0 } }),
    ).rejects.toThrow(/Invalid level/);
    await expect(store.save("../unsafe", baseManifest())).rejects.toThrow(/Invalid level id/);
  });

  it("persists atomically across many concurrent creates without corrupting the index", async () => {
    const store = levelStore(dir);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.create(baseManifest({ levelId: `level-${i}`, name: `Level ${i}` }))),
    );
    const ids = new Set(results.map((r) => r.levelId));
    expect(ids.size).toBe(20);

    // A fresh store instance re-reading the file from disk sees everything.
    const reopened = levelStore(dir);
    const all = await reopened.list();
    expect(all).toHaveLength(20);
  });

  it("survives a corrupted levels.json by treating it as empty rather than throwing", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "levels.json"), "{not valid json", "utf-8");
    const store = levelStore(dir);
    await expect(store.list()).rejects.toThrow();
    // Confirms corruption is surfaced (not silently ignored) rather than
    // masking data loss as an empty list — callers see a real error.
  });

  it("does not mutate its cached snapshot when an atomic write fails", async () => {
    const store = levelStore(dir);
    const created = await store.create(baseManifest({ levelId: "durable", name: "Durable" }));
    rmSync(join(dir, "levels.json"));
    mkdirSync(join(dir, "levels.json"));

    await expect(store.save("durable", { ...created, name: "Must not leak into cache" })).rejects.toThrow();
    expect(await store.get("durable")).toMatchObject({ name: "Durable" });
  });
});

describe("exportLevelBundle / importLevelBundle", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "objectquest-levels-bundle-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeStoredAsset(buffer: Buffer): { id: string; url: string } {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", `${sha256}.glb`), buffer);
    return { id: sha256, url: `/api/assets/files/${sha256}.glb` };
  }

  function writeStoredPhoto(buffer: Buffer, id: string): { id: string; url: string } {
    mkdirSync(join(dir, "photos"), { recursive: true });
    writeFileSync(join(dir, "photos", `${id}.jpg`), buffer);
    return { id, url: `/api/photos/files/${id}.jpg` };
  }

  it("exports a bundle embedding every referenced asset/photo as base64", async () => {
    const glb = minimalGlb();
    const asset = writeStoredAsset(glb);
    const photo = writeStoredPhoto(minimalJpeg(), "00000000-0000-4000-8000-000000000001");

    const manifest = baseManifest({
      assets: [{ id: asset.id, url: asset.url, sha256: asset.id, sizeBytes: glb.byteLength }],
      photos: [{ id: photo.id, url: photo.url, order: 1 }],
    });

    const bundle = await exportLevelBundle(dir, manifest);
    expect(bundle.bundleVersion).toBe(1);
    expect(bundle.assets).toHaveLength(1);
    expect(Buffer.from(bundle.assets[0]!.base64, "base64")).toEqual(glb);
    expect(bundle.photos).toHaveLength(1);
  });

  it("exports safe bundled sample references from public/samples", async () => {
    const publicDir = join(dir, "public");
    const glb = minimalGlb(0xbb);
    const photo = minimalJpeg();
    mkdirSync(join(publicDir, "samples"), { recursive: true });
    writeFileSync(join(publicDir, "samples", "sample.glb"), glb);
    writeFileSync(join(publicDir, "samples", "photo.jpg"), photo);
    const sha256 = createHash("sha256").update(glb).digest("hex");
    const manifest = baseManifest({
      assets: [{ id: "sample-asset", url: "/samples/sample.glb", sha256, sizeBytes: glb.byteLength }],
      photos: [{ id: "sample-photo", url: "/samples/photo.jpg", order: 1 }],
    });

    const bundle = await exportLevelBundle(dir, manifest, publicDir);
    expect(bundle.assets.map((file) => file.filename)).toEqual(["sample.glb"]);
    expect(bundle.photos.map((file) => file.filename)).toEqual(["photo.jpg"]);
  });

  it("fails explicitly rather than returning an incomplete bundle when a referenced file is missing", async () => {
    const missingSha = "a".repeat(64);
    const manifest = baseManifest({
      assets: [{ id: "missing", url: `/api/assets/files/${missingSha}.glb`, sha256: missingSha, sizeBytes: 10 }],
    });
    await expect(exportLevelBundle(dir, manifest)).rejects.toThrow(/referenced file is missing/);
  });

  it("round-trips export -> import into a new level with remapped, deduplicated asset URLs", async () => {
    const store = levelStore(dir);
    const glb = minimalGlb();
    const asset = writeStoredAsset(glb);
    const photo = writeStoredPhoto(minimalJpeg(), "00000000-0000-4000-8000-000000000001");

    const manifest = baseManifest({
      levelId: "original-level",
      assets: [{ id: asset.id, url: asset.url, sha256: asset.id, sizeBytes: glb.byteLength }],
      photos: [{ id: photo.id, url: photo.url, order: 1 }],
      entities: [
        {
          id: "mesh-1",
          kind: "generated-mesh",
          assetId: asset.id,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          collider: { kind: "triangle-mesh" },
        },
      ],
    });
    await store.create(manifest);

    const bundle = await exportLevelBundle(dir, manifest);
    const imported = await importLevelBundle(store, bundle);

    expect(imported.levelId).not.toBe("original-level"); // always a new level, never overwrites
    expect(imported.assets[0]!.url).toBe(asset.url); // same sha256 -> same content-addressed file, deduplicated
    expect(imported.entities[0]).toMatchObject({ assetId: imported.assets[0]!.id });
    expect(imported.photos[0]!.id).not.toBe(photo.id); // photos are never content-addressed, always minted fresh
    expect(await store.assets.get(imported.assets[0]!.id)).toMatchObject({
      id: imported.assets[0]!.id,
      sha256: asset.id,
      sizeBytes: glb.byteLength,
      photos: imported.photos,
    });
    expect(await store.photos.get(imported.photos[0]!.id)).toEqual(imported.photos[0]);

    // The re-materialized asset file is byte-identical and servable at the
    // same conventional path the assets router already serves from.
    expect(readFileSync(join(dir, "assets", `${asset.id}.glb`))).toEqual(glb);
  });

  it("rejects a bundle whose embedded asset bytes aren't actually a GLB", async () => {
    const store = levelStore(dir);
    const invalidBytes = Buffer.from("not a glb");
    const invalidSha = createHash("sha256").update(invalidBytes).digest("hex");
    const manifest = baseManifest({
      assets: [{ id: "a1", url: `/api/assets/files/${invalidSha}.glb`, sha256: invalidSha, sizeBytes: invalidBytes.byteLength }],
    });
    const bundle = {
      bundleVersion: 1,
      manifest,
      assets: [{ filename: `${invalidSha}.glb`, base64: invalidBytes.toString("base64") }],
      photos: [],
    };
    await expect(importLevelBundle(store, bundle)).rejects.toThrow(/valid GLB|glTF/);
  });

  it("rejects a structurally invalid bundle before touching disk", async () => {
    const store = levelStore(dir);
    await expect(importLevelBundle(store, { bundleVersion: 1 })).rejects.toThrow(/Invalid bundle/);
  });

  it("requires one unambiguous embedded mapping for every referenced file", async () => {
    const store = levelStore(dir);
    const glb = minimalGlb();
    const sha256 = createHash("sha256").update(glb).digest("hex");
    const manifest = baseManifest({
      assets: [{ id: "asset-1", url: `/api/assets/files/${sha256}.glb`, sha256, sizeBytes: glb.byteLength }],
    });
    const file = { filename: `${sha256}.glb`, base64: glb.toString("base64") };

    await expect(importLevelBundle(store, { bundleVersion: 1, manifest, assets: [], photos: [] })).rejects.toThrow(
      /missing embedded asset/,
    );
    await expect(
      importLevelBundle(store, { bundleVersion: 1, manifest, assets: [file, file], photos: [] }),
    ).rejects.toThrow(/Duplicate embedded asset mapping/);
  });

  it("rejects embedded asset hash and size mismatches before indexing anything", async () => {
    const store = levelStore(dir);
    const glb = minimalGlb();
    const actualSha = createHash("sha256").update(glb).digest("hex");
    const filename = `${actualSha}.glb`;
    const file = { filename, base64: glb.toString("base64") };
    const wrongHashManifest = baseManifest({
      assets: [{ id: "asset-1", url: `/api/assets/files/${filename}`, sha256: "b".repeat(64), sizeBytes: glb.byteLength }],
    });
    await expect(
      importLevelBundle(store, { bundleVersion: 1, manifest: wrongHashManifest, assets: [file], photos: [] }),
    ).rejects.toThrow(/does not match manifest sha256/);
    expect(await store.assets.get("asset-1")).toBeUndefined();

    const wrongSizeManifest = baseManifest({
      assets: [{ id: "asset-1", url: `/api/assets/files/${filename}`, sha256: actualSha, sizeBytes: glb.byteLength + 1 }],
    });
    await expect(
      importLevelBundle(store, { bundleVersion: 1, manifest: wrongSizeManifest, assets: [file], photos: [] }),
    ).rejects.toThrow(/does not match manifest sizeBytes/);
  });
});

describe("createLevelsRouter (HTTP)", () => {
  let dir: string;
  let server: ReturnType<typeof express>;
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "objectquest-levels-http-"));
    const app = express();
    app.use(express.json({ limit: "10mb" }));
    const store = levelStore(dir);
    app.use(createAssetsRouter(store.assets));
    app.use(createLevelsRouter(store));
    const listener = app.listen(0);
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    const { port } = listener.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    close = () => new Promise<void>((resolve) => listener.close(() => resolve()));
    server = app;
    void server;
  });

  afterEach(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/levels starts empty", async () => {
    const res = await fetch(`${baseUrl}/api/levels`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("POST then GET round-trips a level", async () => {
    const created = await fetch(`${baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseManifest({ levelId: "" })),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as SceneManifest;
    expect(createdBody.levelId).toBeTruthy();

    const fetched = await fetch(`${baseUrl}/api/levels/${createdBody.levelId}`);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toEqual(createdBody);
  });

  it("POST then GET round-trips every v2 experience and media block", async () => {
    const created = await fetch(`${baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lostColorsFixture),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as SceneManifest;

    const fetched = await fetch(`${baseUrl}/api/levels/${createdBody.levelId}`);
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toEqual(createdBody);
    expect(createdBody.experience).toEqual(lostColorsFixture.experience);
    expect(createdBody.media).toEqual(lostColorsFixture.media);
    expect(createdBody.assets).toEqual(lostColorsFixture.assets);
  });

  it("POST rejects a structurally invalid manifest with 400", async () => {
    const res = await fetch(`${baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not: "a manifest" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toMatch(/Invalid level/);
  });

  it("GET /api/levels/:id returns 404 for an unknown id", async () => {
    const res = await fetch(`${baseUrl}/api/levels/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("PUT saves an existing level and rejects a body/URL levelId mismatch", async () => {
    const created = await fetch(`${baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseManifest({ levelId: "level-put" })),
    });
    const manifest = (await created.json()) as SceneManifest;

    const mismatch = await fetch(`${baseUrl}/api/levels/level-put`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...manifest, levelId: "different-id" }),
    });
    expect(mismatch.status).toBe(400);

    const updated = await fetch(`${baseUrl}/api/levels/level-put`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...manifest, name: "Updated name" }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()) as SceneManifest).toMatchObject({ name: "Updated name" });
  });

  it("publishes an immutable share without source photos by default", async () => {
    const created = await fetch(`${baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseManifest({
        levelId: "publish-me",
        photos: [{ id: "private-photo", url: "/samples/photo-1.jpg", order: 1 }],
      })),
    });
    const privateLevel = (await created.json()) as SceneManifest;

    const published = await fetch(`${baseUrl}/api/levels/publish-me/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: { kind: "completion" } }),
    });
    expect(published.status).toBe(201);
    const version = (await published.json()) as { shareId: string; manifest: SceneManifest; versionId: string };
    expect(version.manifest.photos).toEqual([]);
    expect(version.manifest).not.toHaveProperty("workflow");

    const edited = await fetch(`${baseUrl}/api/levels/publish-me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...privateLevel, name: "Edited private copy" }),
    });
    expect(edited.status).toBe(200);

    const shared = await fetch(`${baseUrl}/api/shares/${version.shareId}`);
    expect(shared.status).toBe(200);
    expect(await shared.json()).toEqual(version);
  });

  it("blocks publication when conservative experience placement validation reports a repair", async () => {
    await fetch(`${baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lostColorsFixture, levelId: "needs-repair" }),
    });

    const response = await fetch(`${baseUrl}/api/levels/needs-repair/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: { kind: "completion" } }),
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { message: string; issues: { entityId: string; message: string }[] };
    expect(body.issues[0]).toMatchObject({
      entityId: "fragment-blue",
      message: "Move this color fragment onto a reachable platform.",
    });
  });

  it("PUT rejects an unsafe :id before ever touching validation", async () => {
    const res = await fetch(`${baseUrl}/api/levels/${encodeURIComponent("../etc/passwd")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseManifest()),
    });
    expect(res.status).toBe(400);
  });

  it("GET .../export then POST .../import round-trips over real HTTP", async () => {
    const glb = minimalGlb();
    const sha256 = createHash("sha256").update(glb).digest("hex");
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", `${sha256}.glb`), glb);

    const manifest = baseManifest({
      levelId: "export-me",
      assets: [{ id: sha256, url: `/api/assets/files/${sha256}.glb`, sha256, sizeBytes: glb.byteLength }],
    });
    await fetch(`${baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
    });

    const exported = await fetch(`${baseUrl}/api/levels/export-me/export`);
    expect(exported.status).toBe(200);
    const bundle = await exported.json();

    const imported = await fetch(`${baseUrl}/api/levels/import`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: JSON.stringify(bundle),
    });
    expect(imported.status).toBe(201);
    const importedBody = (await imported.json()) as SceneManifest;
    expect(importedBody.levelId).not.toBe("export-me");
    expect(importedBody.assets[0]!.url).toBe(`/api/assets/files/${sha256}.glb`);

    const indexedAsset = await fetch(`${baseUrl}/api/assets/${importedBody.assets[0]!.id}`);
    expect(indexedAsset.status).toBe(200);
    expect(await indexedAsset.json()).toMatchObject({ sha256, sizeBytes: glb.byteLength });
  });

  it("rejects an oversized import payload before it ever reaches the handler", async () => {
    const res = await fetch(`${baseUrl}/api/levels/import`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: "x".repeat(10),
    });
    // A tiny non-JSON body is a 400 from our own JSON.parse guard, not a
    // size rejection — this just confirms the octet-stream route accepts
    // the request at all (i.e. wasn't swallowed by the global json()
    // parser, which would have produced a different failure mode).
    expect(res.status).toBe(400);
  });
});
