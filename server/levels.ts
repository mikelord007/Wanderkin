import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import express, { Router } from "express";
import { z } from "zod";
import { SCENE_MANIFEST_SCHEMA_VERSION } from "../shared/schema-version.js";
import type { SceneManifest } from "../shared/manifest.js";

/**
 * Manifest persistence (owner: Level tools and persistence). Everything in
 * this file is self-contained on purpose: server/persistence/* (the atomic
 * JsonFileStore, GLB/photo magic-byte validation) is owned by the Livepeer
 * integration worker and lives on a different branch/worktree not merged
 * into this one yet, so this file carries its own small, independently
 * correct copies of the same small pieces of infrastructure (atomic
 * write-then-rename, magic-byte checks) rather than depending on files
 * that don't exist here. Once merged, these are natural candidates to
 * consolidate — see docs/EDITOR.md.
 */

// ---------------------------------------------------------------------
// Level id / path safety
// ---------------------------------------------------------------------

const LEVEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);

/** Safe to use as a Map key and, if ever needed, a path segment: bounded
 * length, restricted charset, and blocks the classic prototype-pollution
 * property names even though a Map (not a plain object) already isn't
 * vulnerable to that — defense in depth for any future code that might
 * treat level ids as object keys. */
export function isSafeLevelId(id: string): boolean {
  return typeof id === "string" && LEVEL_ID_PATTERN.test(id) && !RESERVED_IDS.has(id);
}

function safeFilenameFromUrl(url: string): string | null {
  const name = basename(url.split("?")[0] ?? url);
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  return name;
}

// ---------------------------------------------------------------------
// Atomic single-file JSON index (levels.json), keyed by a Map (not a
// plain object) so a hostile levelId can never pollute a prototype.
// ---------------------------------------------------------------------

class AtomicLevelIndex {
  private readonly filePath: string;
  private cache: Map<string, SceneManifest> | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(storageDir: string) {
    this.filePath = join(storageDir, "levels.json");
  }

  private async readAll(): Promise<Map<string, SceneManifest>> {
    if (this.cache) return this.cache;
    try {
      const text = await readFile(this.filePath, "utf-8");
      const raw = JSON.parse(text) as Record<string, SceneManifest>;
      this.cache = new Map(Object.entries(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cache = new Map();
      } else {
        throw err;
      }
    }
    return this.cache;
  }

  private async writeAll(map: Map<string, SceneManifest>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(Object.fromEntries(map), null, 2), "utf-8");
    await rename(tmpPath, this.filePath);
    this.cache = map;
  }

  /** Exclusive read-modify-write, serialized through an in-process queue
   * so concurrent requests can never interleave and corrupt the file —
   * same guarantee as server/persistence/jsonStore.ts's JsonFileStore. */
  private async withLock<R>(fn: (map: Map<string, SceneManifest>) => R | Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      const map = await this.readAll();
      const result = await fn(map);
      await this.writeAll(map);
      return result;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async list(): Promise<SceneManifest[]> {
    return Array.from((await this.readAll()).values());
  }

  async get(id: string): Promise<SceneManifest | undefined> {
    return (await this.readAll()).get(id);
  }

  /** POST /api/levels semantics: never silently overwrites an existing
   * level. Mints a fresh id if the manifest didn't bring a safe, unused
   * one of its own. */
  async create(manifest: SceneManifest): Promise<SceneManifest> {
    return this.withLock((map) => {
      let id = isSafeLevelId(manifest.levelId) ? manifest.levelId : randomUUID();
      if (map.has(id)) id = randomUUID();
      const now = new Date().toISOString();
      const record: SceneManifest = { ...manifest, levelId: id, createdAt: manifest.createdAt || now, updatedAt: now };
      map.set(id, record);
      return record;
    });
  }

  /** PUT /api/levels/:id semantics: upsert at the given id. */
  async save(id: string, manifest: SceneManifest): Promise<SceneManifest> {
    return this.withLock((map) => {
      const existing = map.get(id);
      const now = new Date().toISOString();
      const record: SceneManifest = {
        ...manifest,
        levelId: id,
        createdAt: existing?.createdAt ?? manifest.createdAt ?? now,
        updatedAt: now,
      };
      map.set(id, record);
      return record;
    });
  }
}

export class LevelStore {
  private readonly index: AtomicLevelIndex;
  readonly storageDir: string;

  constructor(storageDir: string) {
    this.storageDir = storageDir;
    this.index = new AtomicLevelIndex(storageDir);
  }

  list(): Promise<SceneManifest[]> {
    return this.index.list();
  }

  get(id: string): Promise<SceneManifest | undefined> {
    return this.index.get(id);
  }

  create(manifest: SceneManifest): Promise<SceneManifest> {
    return this.index.create(manifest);
  }

  save(id: string, manifest: SceneManifest): Promise<SceneManifest> {
    return this.index.save(id, manifest);
  }
}

// ---------------------------------------------------------------------
// Strict runtime validation (zod) — mirrors shared/manifest.ts exactly so
// a malformed or corrupt manifest is rejected before it's ever persisted.
// ---------------------------------------------------------------------

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const quatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const transformSchema = z.object({ position: vec3Schema, rotation: quatSchema, scale: vec3Schema });

const colliderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("triangle-mesh") }),
  z.object({ kind: z.literal("box"), halfExtents: vec3Schema }),
  z.object({ kind: z.literal("capsule"), radius: z.number().positive(), halfHeight: z.number().positive() }),
]);

const generatedMeshEntitySchema = z.object({
  id: z.string().min(1),
  kind: z.literal("generated-mesh"),
  assetId: z.string().min(1),
  transform: transformSchema,
  collider: colliderSchema,
});

const helperEntitySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["floor", "box", "ramp"]),
  transform: transformSchema,
  dimensions: vec3Schema,
  collider: colliderSchema,
  addedBy: z.literal("game"),
});

const sceneEntitySchema = z.union([generatedMeshEntitySchema, helperEntitySchema]);

const spawnPointSchema = z.object({ position: vec3Schema, headingRadians: z.number() });

const checkpointSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  position: vec3Schema,
  triggerRadius: z.number().positive(),
  safeRespawn: spawnPointSchema,
});

const assetProvenanceSchema = z.object({
  providerId: z.string().min(1),
  capabilityUsed: z.string().min(1),
  fallbackFired: z.string().nullable(),
  providerJobId: z.string().min(1),
  registeredModel: z.string().min(1),
  sourcePhotoOrder: z.array(z.number().int().positive()),
  generatedAt: z.string().min(1),
});

const assetReferenceSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  sha256: z.string().min(1),
  sizeBytes: z.number().nonnegative(),
  provenance: assetProvenanceSchema.optional(),
});

const photoReferenceSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  order: z.number().int().positive(),
  label: z.string().optional(),
});

const calibrationSchema = z.object({
  assumedExtentMeters: z.number().positive(),
  measuredDimension: z.object({ description: z.string().min(1), meters: z.number().positive() }).optional(),
});

const courseValidationSchema = z.object({
  status: z.enum(["unvalidated", "validated", "failed", "manually-adjusted"]),
  method: z.string().optional(),
  checkedAt: z.string().optional(),
  evidence: z.string().optional(),
  uncertaintyNotes: z.string().optional(),
});

export const sceneManifestSchema = z
  .object({
    schemaVersion: z.literal(SCENE_MANIFEST_SCHEMA_VERSION),
    // Not `.min(1)`: POST /api/levels accepts an empty/placeholder levelId
    // and mints a real one server-side (LevelStore.create) — PUT
    // /api/levels/:id separately requires the body's levelId to equal a
    // validated, non-empty :id, so that path stays strict.
    levelId: z.string().max(128),
    name: z.string().min(1).max(200),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    coordinateConvention: z.literal("y-up-right-handed-meters"),
    calibration: calibrationSchema,
    assets: z.array(assetReferenceSchema),
    photos: z.array(photoReferenceSchema),
    entities: z.array(sceneEntitySchema),
    spawn: spawnPointSchema,
    checkpoints: z.array(checkpointSchema),
    seed: z.string().min(1),
    movementConfigId: z.string().min(1),
    courseValidation: courseValidationSchema,
  })
  .refine(
    (manifest) => {
      const orders = manifest.checkpoints.map((c) => c.order).sort((a, b) => a - b);
      return orders.every((order, index) => order === index);
    },
    { message: "checkpoints[].order must be unique and ascending starting at 0" },
  );

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
}

// ---------------------------------------------------------------------
// Import/export bundle: portable JSON with base64-embedded GLBs/photos,
// remapping ids/URLs into this server's own content-addressed storage on
// import. No zip dependency — see docs/EDITOR.md for the exact shape and
// the size-limit workaround (import is NOT application/json — see below).
// ---------------------------------------------------------------------

const MAX_ASSET_BYTES = 150 * 1024 * 1024; // matches the Livepeer worker's MAX_GLB_BYTES
const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // matches the Livepeer worker's MAX_PHOTO_BYTES
const MAX_BUNDLE_TEXT_BYTES = 220 * 1024 * 1024; // base64 (~1.34x) plus manifest/JSON overhead

interface BundleFile {
  filename: string;
  base64: string;
}

interface LevelBundle {
  bundleVersion: 1;
  manifest: SceneManifest;
  assets: BundleFile[];
  photos: BundleFile[];
}

const bundleFileSchema = z.object({ filename: z.string().min(1).max(256), base64: z.string().min(1) });
const bundleSchema = z.object({
  bundleVersion: z.literal(1),
  manifest: sceneManifestSchema,
  assets: z.array(bundleFileSchema).max(32),
  photos: z.array(bundleFileSchema).max(64),
});

function detectGlb(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer[0] === 0x67 &&
    buffer[1] === 0x6c &&
    buffer[2] === 0x54 &&
    buffer[3] === 0x46 &&
    buffer.readUInt32LE(4) === 2
  );
}

const IMAGE_EXTENSION_BY_SNIFF: Array<{ ext: string; test: (b: Buffer) => boolean }> = [
  { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: "png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a,
  },
  {
    ext: "webp",
    test: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

function detectPhotoExtension(buffer: Buffer): string | null {
  return IMAGE_EXTENSION_BY_SNIFF.find((entry) => entry.test(buffer))?.ext ?? null;
}

async function readStoredFile(storageDir: string, subdir: "assets" | "photos", url: string): Promise<Buffer | null> {
  const filename = safeFilenameFromUrl(url);
  if (!filename) return null;
  try {
    return await readFile(join(storageDir, subdir, filename));
  } catch {
    return null;
  }
}

async function writeContentAddressedAsset(storageDir: string, buffer: Buffer): Promise<{ id: string; url: string; sha256: string }> {
  if (!detectGlb(buffer)) throw new InvalidBundleError("An embedded asset is not a valid binary GLB");
  if (buffer.byteLength > MAX_ASSET_BYTES) throw new InvalidBundleError(`An embedded asset exceeds the ${MAX_ASSET_BYTES}-byte limit`);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const filename = `${sha256}.glb`;
  const dir = join(storageDir, "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return { id: sha256, url: `/api/assets/files/${filename}`, sha256 };
}

async function writeNewPhoto(storageDir: string, buffer: Buffer, order: number): Promise<{ id: string; url: string; order: number }> {
  const ext = detectPhotoExtension(buffer);
  if (!ext) throw new InvalidBundleError("An embedded photo is not a recognized JPEG, PNG, or WebP image");
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw new InvalidBundleError(`An embedded photo exceeds the ${MAX_PHOTO_BYTES}-byte limit`);
  const id = randomUUID();
  const filename = `${id}.${ext}`;
  const dir = join(storageDir, "photos");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), buffer);
  return { id, url: `/api/photos/files/${filename}`, order };
}

export class InvalidBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBundleError";
  }
}

/** Builds a portable bundle for one level: manifest plus every asset/photo
 * it references, base64-embedded. Missing source files are skipped rather
 * than failing the whole export (a level can still legitimately reference
 * an asset that's since been pruned from disk). */
export async function exportLevelBundle(storageDir: string, manifest: SceneManifest): Promise<LevelBundle> {
  const assets: BundleFile[] = [];
  for (const asset of manifest.assets) {
    const buffer = await readStoredFile(storageDir, "assets", asset.url);
    const filename = safeFilenameFromUrl(asset.url);
    if (buffer && filename) assets.push({ filename, base64: buffer.toString("base64") });
  }
  const photos: BundleFile[] = [];
  for (const photo of manifest.photos) {
    const buffer = await readStoredFile(storageDir, "photos", photo.url);
    const filename = safeFilenameFromUrl(photo.url);
    if (buffer && filename) photos.push({ filename, base64: buffer.toString("base64") });
  }
  return { bundleVersion: 1, manifest, assets, photos };
}

/** Imports a bundle as a brand-new level (never overwrites an existing
 * one): writes every embedded asset/photo into this server's own
 * content-addressed storage (deduplicating assets by sha256) and remaps
 * the manifest's asset/photo ids and URLs to match. */
export async function importLevelBundle(store: LevelStore, storageDir: string, rawBundle: unknown): Promise<SceneManifest> {
  const parsed = bundleSchema.safeParse(rawBundle);
  if (!parsed.success) {
    throw new InvalidBundleError(`Invalid bundle: ${formatZodError(parsed.error)}`);
  }
  const bundle = parsed.data;

  const assetByFilename = new Map(bundle.assets.map((a) => [a.filename, a] as const));
  const photoByFilename = new Map(bundle.photos.map((p) => [p.filename, p] as const));

  const assetIdRemap = new Map<string, { id: string; url: string }>();
  for (const asset of bundle.manifest.assets) {
    const filename = safeFilenameFromUrl(asset.url);
    const embedded = filename ? assetByFilename.get(filename) : undefined;
    if (!embedded) continue; // no embedded bytes for this reference — leave it pointing at its original URL
    const buffer = Buffer.from(embedded.base64, "base64");
    const stored = await writeContentAddressedAsset(storageDir, buffer);
    assetIdRemap.set(asset.id, stored);
  }

  const photoIdRemap = new Map<string, { id: string; url: string }>();
  for (const photo of bundle.manifest.photos) {
    const filename = safeFilenameFromUrl(photo.url);
    const embedded = filename ? photoByFilename.get(filename) : undefined;
    if (!embedded) continue;
    const buffer = Buffer.from(embedded.base64, "base64");
    const stored = await writeNewPhoto(storageDir, buffer, photo.order);
    photoIdRemap.set(photo.id, stored);
  }

  // Rebuilt field-by-field rather than spread — zod's `.optional()` types
  // `provenance`/`label` as `T | undefined`, which exactOptionalPropertyTypes
  // rejects against SceneManifest's `field?: T` (never an explicit
  // `undefined` value); the runtime shape from a successful parse is
  // already correct, this only satisfies the stricter static type.
  const manifestAssets: SceneManifest["assets"] = bundle.manifest.assets.map((asset) => {
    const remap = assetIdRemap.get(asset.id);
    return {
      id: remap?.id ?? asset.id,
      url: remap?.url ?? asset.url,
      sha256: remap?.id ?? asset.sha256,
      sizeBytes: asset.sizeBytes,
      ...(asset.provenance !== undefined ? { provenance: asset.provenance } : {}),
    };
  });
  const manifestPhotos: SceneManifest["photos"] = bundle.manifest.photos.map((photo) => {
    const remap = photoIdRemap.get(photo.id);
    return {
      id: remap?.id ?? photo.id,
      url: remap?.url ?? photo.url,
      order: photo.order,
      ...(photo.label !== undefined ? { label: photo.label } : {}),
    };
  });
  // bundle.manifest is cast rather than spread field-by-field for the
  // remaining (unmodified) top-level fields — it already passed
  // sceneManifestSchema, the same validation used everywhere else in this
  // router before an `as SceneManifest` cast; only the fields actually
  // being remapped needed the manual rebuild above.
  const remapped: SceneManifest = {
    ...(bundle.manifest as SceneManifest),
    assets: manifestAssets,
    photos: manifestPhotos,
    entities: bundle.manifest.entities.map((entity) => {
      if (entity.kind !== "generated-mesh") return entity;
      const remap = assetIdRemap.get(entity.assetId);
      return remap ? { ...entity, assetId: remap.id } : entity;
    }),
  };

  return store.create(remapped);
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------

/** Express 4 doesn't forward a rejected async handler's error anywhere —
 * without this, an unexpected failure (e.g. a disk I/O error) would just
 * hang the request instead of returning a 500. */
function wrapAsync(
  handler: (req: express.Request, res: express.Response) => Promise<void>,
): (req: express.Request, res: express.Response) => void {
  return (req, res) => {
    handler(req, res).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`[${req.method} ${req.path}]`, err instanceof Error ? (err.stack ?? err.message) : err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Something went wrong. Please try again." });
      }
    });
  };
}

export function createLevelsRouter(store: LevelStore): Router {
  const router = Router();

  router.get(
    "/api/levels",
    wrapAsync(async (_req, res) => {
      res.json(await store.list());
    }),
  );

  router.post(
    "/api/levels",
    wrapAsync(async (req, res) => {
      const parsed = sceneManifestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: `Invalid level: ${formatZodError(parsed.error)}` });
        return;
      }
      const created = await store.create(parsed.data as SceneManifest);
      res.status(201).json(created);
    }),
  );

  router.get(
    "/api/levels/:id",
    wrapAsync(async (req, res) => {
      const level = await store.get(req.params.id as string);
      if (!level) {
        res.status(404).json({ message: "Level not found" });
        return;
      }
      res.json(level);
    }),
  );

  router.put(
    "/api/levels/:id",
    wrapAsync(async (req, res) => {
      const id = req.params.id as string;
      if (!isSafeLevelId(id)) {
        res.status(400).json({ message: "Invalid level id" });
        return;
      }
      const parsed = sceneManifestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: `Invalid level: ${formatZodError(parsed.error)}` });
        return;
      }
      if (parsed.data.levelId !== id) {
        res.status(400).json({ message: "Body levelId does not match the URL id" });
        return;
      }
      const saved = await store.save(id, parsed.data as SceneManifest);
      res.json(saved);
    }),
  );

  router.get(
    "/api/levels/:id/export",
    wrapAsync(async (req, res) => {
      const level = await store.get(req.params.id as string);
      if (!level) {
        res.status(404).json({ message: "Level not found" });
        return;
      }
      const bundle = await exportLevelBundle(store.storageDir, level);
      res.json(bundle);
    }),
  );

  // Deliberately NOT application/json: the global express.json() body
  // parser (server/index.ts, owned by the Livepeer worker) caps requests
  // at 10MB, far too small for an embedded GLB (up to 150MB). A
  // non-JSON content-type makes that global parser skip this request
  // entirely (it only engages for application/json), letting this
  // route's own text() parser apply its own, larger, still-bounded limit.
  // Client must POST the JSON-stringified bundle as the raw body with
  // Content-Type: application/octet-stream.
  router.post(
    "/api/levels/import",
    express.text({ type: "application/octet-stream", limit: MAX_BUNDLE_TEXT_BYTES }),
    async (req, res) => {
      let rawBundle: unknown;
      try {
        rawBundle = JSON.parse(req.body as string);
      } catch {
        res.status(400).json({ message: "Request body is not valid JSON" });
        return;
      }
      try {
        const imported = await importLevelBundle(store, store.storageDir, rawBundle);
        res.status(201).json(imported);
      } catch (err) {
        if (err instanceof InvalidBundleError) {
          res.status(400).json({ message: err.message });
          return;
        }
        // eslint-disable-next-line no-console
        console.error("[POST /api/levels/import]", err instanceof Error ? (err.stack ?? err.message) : err);
        res.status(500).json({ message: "Failed to import the level. Please try again." });
      }
    },
  );

  return router;
}
