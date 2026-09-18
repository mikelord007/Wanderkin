import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import express, { Router } from "express";
import { z } from "zod";
import { SCENE_MANIFEST_SCHEMA_VERSION } from "../shared/schema-version.js";
import type { SceneManifest } from "../shared/manifest.js";
import { AssetStore } from "./persistence/assetStore.js";
import { PhotoStore } from "./persistence/photoStore.js";
import { assertValidGlb, assertValidPhoto, InvalidFileError } from "./persistence/validate.js";

/**
 * Manifest persistence (owner: Level tools and persistence). Bundle imports
 * deliberately use the same AssetStore and PhotoStore instances as the rest
 * of the API. Besides sharing validation, this keeps their in-memory indexes
 * coherent so an imported reference is immediately visible through the
 * existing asset/photo routes.
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
    try {
      await writeFile(tmpPath, JSON.stringify(Object.fromEntries(map), null, 2), "utf-8");
      await rename(tmpPath, this.filePath);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
    this.cache = map;
  }

  /** Exclusive read-modify-write, serialized through an in-process queue
   * so concurrent requests can never interleave and corrupt the file —
   * same guarantee as server/persistence/jsonStore.ts's JsonFileStore. */
  private async withLock<R>(fn: (map: Map<string, SceneManifest>) => R | Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      // Never mutate the cached map until the atomic rename succeeds. If the
      // write fails, readers must continue seeing the last durable snapshot.
      const map = new Map(await this.readAll());
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
  readonly publicDir: string;
  readonly assets: AssetStore;
  readonly photos: PhotoStore;

  constructor(
    storageDir: string,
    assets: AssetStore,
    photos: PhotoStore,
    publicDir = join(process.cwd(), "public"),
  ) {
    this.storageDir = storageDir;
    this.publicDir = publicDir;
    this.assets = assets;
    this.photos = photos;
    this.index = new AtomicLevelIndex(storageDir);
  }

  list(): Promise<SceneManifest[]> {
    return this.index.list();
  }

  get(id: string): Promise<SceneManifest | undefined> {
    return this.index.get(id);
  }

  async create(manifest: SceneManifest): Promise<SceneManifest> {
    return this.index.create(requireValidManifest(manifest));
  }

  async save(id: string, manifest: SceneManifest): Promise<SceneManifest> {
    if (!isSafeLevelId(id)) throw new Error(`Invalid level id \"${id}\"`);
    const validated = requireValidManifest(manifest);
    if (validated.levelId !== id) throw new Error("Manifest levelId does not match the save id");
    return this.index.save(id, validated);
  }
}

// ---------------------------------------------------------------------
// Strict runtime validation (zod) — mirrors shared/manifest.ts exactly so
// a malformed or corrupt manifest is rejected before it's ever persisted.
// ---------------------------------------------------------------------

const finiteNumberSchema = z.number().finite();
const referenceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "must be a bounded reference id without whitespace or path separators");
const vec3Schema = z.tuple([finiteNumberSchema, finiteNumberSchema, finiteNumberSchema]);
const positiveVec3Schema = vec3Schema.refine((value) => value.every((component) => component > 0), {
  message: "components must all be positive",
});
const nonZeroScaleSchema = vec3Schema.refine(
  (value) => value.every((component) => Math.abs(component) > Number.EPSILON),
  { message: "scale components must all be non-zero" },
);
const quatSchema = z
  .tuple([finiteNumberSchema, finiteNumberSchema, finiteNumberSchema, finiteNumberSchema])
  .refine((value) => {
    const length = Math.hypot(value[0], value[1], value[2], value[3]);
    return length > Number.EPSILON && Math.abs(length - 1) <= 1e-3;
  }, { message: "must be a normalized, non-zero quaternion" });
const transformSchema = z.object({ position: vec3Schema, rotation: quatSchema, scale: nonZeroScaleSchema });

const colliderSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("triangle-mesh") }),
  z.object({ kind: z.literal("box"), halfExtents: positiveVec3Schema }),
  z.object({ kind: z.literal("capsule"), radius: finiteNumberSchema.positive(), halfHeight: finiteNumberSchema.positive() }),
]);

const generatedMeshEntitySchema = z.object({
  id: referenceIdSchema,
  kind: z.literal("generated-mesh"),
  assetId: referenceIdSchema,
  transform: transformSchema,
  collider: colliderSchema,
});

const helperEntitySchema = z.object({
  id: referenceIdSchema,
  kind: z.enum(["floor", "box", "ramp"]),
  transform: transformSchema,
  dimensions: positiveVec3Schema,
  collider: colliderSchema,
  addedBy: z.literal("game"),
});

const sceneEntitySchema = z.union([generatedMeshEntitySchema, helperEntitySchema]);

const spawnPointSchema = z.object({ position: vec3Schema, headingRadians: finiteNumberSchema });

const checkpointSchema = z.object({
  id: referenceIdSchema,
  order: z.number().int().nonnegative(),
  position: vec3Schema,
  triggerRadius: finiteNumberSchema.positive(),
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
  id: referenceIdSchema,
  url: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/, "must be a lowercase sha256 digest"),
  sizeBytes: finiteNumberSchema.int().positive(),
  provenance: assetProvenanceSchema.optional(),
});

const photoReferenceSchema = z.object({
  id: referenceIdSchema,
  url: z.string().min(1),
  order: z.number().int().positive(),
  label: z.string().optional(),
});

const calibrationSchema = z.object({
  assumedExtentMeters: finiteNumberSchema.positive(),
  measuredDimension: z.object({ description: z.string().min(1), meters: finiteNumberSchema.positive() }).optional(),
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
  .superRefine((manifest, context) => {
    const orders = manifest.checkpoints.map((checkpoint) => checkpoint.order).sort((a, b) => a - b);
    if (!orders.every((order, index) => order === index)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkpoints"],
        message: "orders must be unique and ascending starting at 0",
      });
    }

    const assertUniqueIds = (values: readonly { id: string }[], path: string): void => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value.id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, index, "id"],
            message: `duplicate id \"${value.id}\"`,
          });
        }
        seen.add(value.id);
      });
    };
    assertUniqueIds(manifest.assets, "assets");
    assertUniqueIds(manifest.photos, "photos");
    assertUniqueIds(manifest.entities, "entities");
    assertUniqueIds(manifest.checkpoints, "checkpoints");

    const assetIds = new Set(manifest.assets.map((asset) => asset.id));
    manifest.entities.forEach((entity, index) => {
      if (entity.kind === "generated-mesh" && !assetIds.has(entity.assetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "assetId"],
          message: `unknown asset reference \"${entity.assetId}\"`,
        });
      }
      if (entity.kind === "ramp" && entity.collider.kind !== "triangle-mesh") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entities", index, "collider"],
          message: "ramp helpers require a triangle-mesh collider matching the visible wedge",
        });
      }
      if (entity.kind !== "generated-mesh" && entity.kind !== "ramp") {
        const collider = entity.collider;
        const expected = entity.dimensions.map((dimension) => dimension / 2);
        if (
          collider.kind !== "box" ||
          !collider.halfExtents.every((halfExtent, axis) => Math.abs(halfExtent - expected[axis]!) <= 1e-6)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["entities", index, "collider"],
            message: "floor/box helper collider halfExtents must match half of its visible dimensions",
          });
        }
      }
    });
  });

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ");
}

function requireValidManifest(manifest: SceneManifest): SceneManifest {
  const parsed = sceneManifestSchema.safeParse(manifest);
  if (!parsed.success) throw new Error(`Invalid level: ${formatZodError(parsed.error)}`);
  return parsed.data as SceneManifest;
}

// ---------------------------------------------------------------------
// Import/export bundle: portable JSON with base64-embedded GLBs/photos,
// remapping ids/URLs into this server's own content-addressed storage on
// import. No zip dependency — see docs/EDITOR.md for the exact shape and
// the size-limit workaround (import is NOT application/json — see below).
// ---------------------------------------------------------------------

const MAX_BUNDLE_TEXT_BYTES = 220 * 1024 * 1024; // base64 (~1.34x) plus manifest/JSON overhead

interface BundleFile {
  filename: string;
  base64: string;
}

export interface LevelBundle {
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

export class InvalidBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBundleError";
  }
}

type BundleReferenceKind = "asset" | "photo";

function resolveBundleSource(
  storageDir: string,
  publicDir: string,
  kind: BundleReferenceKind,
  url: string,
): { filename: string; path: string } {
  // Export is intentionally local-only. Never turn a manifest URL into a
  // network fetch or allow arbitrary paths outside the configured roots.
  if (!url.startsWith("/")) {
    throw new InvalidBundleError(`Cannot export ${kind} URL \"${url}\": only local API and /samples URLs are portable`);
  }
  const pathname = new URL(url, "http://objectquest.local").pathname;
  const apiPattern =
    kind === "asset"
      ? /^\/api\/assets\/files\/([a-f0-9]{64}\.glb)$/
      : /^\/api\/photos\/files\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/;
  const apiMatch = apiPattern.exec(pathname);
  if (apiMatch) {
    const filename = apiMatch[1]!;
    return { filename, path: join(storageDir, kind === "asset" ? "assets" : "photos", filename) };
  }
  const samplePattern =
    kind === "asset"
      ? /^\/samples\/([a-zA-Z0-9][a-zA-Z0-9._-]*\.glb)$/
      : /^\/samples\/([a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:jpg|jpeg|png|webp))$/;
  const sampleMatch = samplePattern.exec(pathname);
  if (sampleMatch) {
    const filename = sampleMatch[1]!;
    return { filename, path: join(publicDir, "samples", filename) };
  }
  throw new InvalidBundleError(
    `Cannot export ${kind} URL \"${url}\": expected a stored /api URL or a safe /samples filename`,
  );
}

async function readBundleSource(path: string, kind: BundleReferenceKind, url: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new InvalidBundleError(`Cannot export ${kind} \"${url}\": the referenced file is missing`);
    }
    throw error;
  }
}

function decodeBase64(file: BundleFile): Buffer {
  if (file.base64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) {
    throw new InvalidBundleError(`Embedded file \"${file.filename}\" is not canonical base64`);
  }
  const buffer = Buffer.from(file.base64, "base64");
  if (buffer.toString("base64") !== file.base64) {
    throw new InvalidBundleError(`Embedded file \"${file.filename}\" is not canonical base64`);
  }
  return buffer;
}

/** Builds a portable bundle for one level: manifest plus every asset/photo
 * it references, base64-embedded. Export is all-or-nothing: returning a
 * bundle that silently omitted a referenced file would create a result that
 * cannot be imported portably. */
export async function exportLevelBundle(
  storageDir: string,
  manifest: SceneManifest,
  publicDir = join(process.cwd(), "public"),
): Promise<LevelBundle> {
  const assets: BundleFile[] = [];
  const assetFilenames = new Set<string>();
  for (const asset of manifest.assets) {
    const source = resolveBundleSource(storageDir, publicDir, "asset", asset.url);
    if (assetFilenames.has(source.filename)) {
      throw new InvalidBundleError(`Cannot export duplicate asset mapping for \"${source.filename}\"`);
    }
    const buffer = await readBundleSource(source.path, "asset", asset.url);
    try {
      assertValidGlb(buffer);
    } catch (error) {
      if (error instanceof InvalidFileError) throw new InvalidBundleError(`Cannot export asset \"${asset.id}\": ${error.message}`);
      throw error;
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (sha256 !== asset.sha256) {
      throw new InvalidBundleError(`Cannot export asset \"${asset.id}\": sha256 does not match the referenced file`);
    }
    if (buffer.byteLength !== asset.sizeBytes) {
      throw new InvalidBundleError(`Cannot export asset \"${asset.id}\": sizeBytes does not match the referenced file`);
    }
    assetFilenames.add(source.filename);
    assets.push({ filename: source.filename, base64: buffer.toString("base64") });
  }
  const photos: BundleFile[] = [];
  const photoFilenames = new Set<string>();
  for (const photo of manifest.photos) {
    const source = resolveBundleSource(storageDir, publicDir, "photo", photo.url);
    if (photoFilenames.has(source.filename)) {
      throw new InvalidBundleError(`Cannot export duplicate photo mapping for \"${source.filename}\"`);
    }
    const buffer = await readBundleSource(source.path, "photo", photo.url);
    try {
      assertValidPhoto(buffer);
    } catch (error) {
      if (error instanceof InvalidFileError) throw new InvalidBundleError(`Cannot export photo \"${photo.id}\": ${error.message}`);
      throw error;
    }
    photoFilenames.add(source.filename);
    photos.push({ filename: source.filename, base64: buffer.toString("base64") });
  }
  return { bundleVersion: 1, manifest, assets, photos };
}

function mapEmbeddedFiles(
  files: readonly BundleFile[],
  referencedUrls: readonly string[],
  kind: BundleReferenceKind,
): Map<string, BundleFile> {
  const byFilename = new Map<string, BundleFile>();
  for (const file of files) {
    if (safeFilenameFromUrl(file.filename) !== file.filename) {
      throw new InvalidBundleError(`Embedded ${kind} filename \"${file.filename}\" is unsafe`);
    }
    if (byFilename.has(file.filename)) {
      throw new InvalidBundleError(`Duplicate embedded ${kind} mapping for \"${file.filename}\"`);
    }
    byFilename.set(file.filename, file);
  }

  const referencedFilenames = new Set<string>();
  for (const url of referencedUrls) {
    const filename = safeFilenameFromUrl(url);
    if (!filename) throw new InvalidBundleError(`Referenced ${kind} URL \"${url}\" has no safe filename`);
    if (referencedFilenames.has(filename)) {
      throw new InvalidBundleError(`Manifest has duplicate ${kind} mapping for \"${filename}\"`);
    }
    referencedFilenames.add(filename);
    if (!byFilename.has(filename)) {
      throw new InvalidBundleError(`Bundle is missing embedded ${kind} \"${filename}\"`);
    }
  }
  for (const filename of byFilename.keys()) {
    if (!referencedFilenames.has(filename)) {
      throw new InvalidBundleError(`Bundle contains unreferenced embedded ${kind} \"${filename}\"`);
    }
  }
  return byFilename;
}

/** Imports a bundle as a brand-new level (never overwrites an existing
 * one): writes every embedded asset/photo into this server's own
 * content-addressed storage (deduplicating assets by sha256) and remaps
 * the manifest's asset/photo ids and URLs to match. */
export async function importLevelBundle(store: LevelStore, rawBundle: unknown): Promise<SceneManifest> {
  const parsed = bundleSchema.safeParse(rawBundle);
  if (!parsed.success) {
    throw new InvalidBundleError(`Invalid bundle: ${formatZodError(parsed.error)}`);
  }
  const bundle = parsed.data;

  const assetByFilename = mapEmbeddedFiles(bundle.assets, bundle.manifest.assets.map((asset) => asset.url), "asset");
  const photoByFilename = mapEmbeddedFiles(bundle.photos, bundle.manifest.photos.map((photo) => photo.url), "photo");

  // Preflight every byte/hash/size/magic check before writing any file or
  // index. A malformed photo must not leave earlier assets half-imported.
  const preparedAssets = bundle.manifest.assets.map((asset) => {
    const filename = safeFilenameFromUrl(asset.url)!;
    const buffer = decodeBase64(assetByFilename.get(filename)!);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (sha256 !== asset.sha256) {
      throw new InvalidBundleError(`Embedded asset \"${filename}\" does not match manifest sha256`);
    }
    if (buffer.byteLength !== asset.sizeBytes) {
      throw new InvalidBundleError(`Embedded asset \"${filename}\" does not match manifest sizeBytes`);
    }
    try {
      assertValidGlb(buffer);
    } catch (error) {
      if (error instanceof InvalidFileError) throw new InvalidBundleError(error.message);
      throw error;
    }
    return { asset, buffer };
  });
  const preparedPhotos = bundle.manifest.photos.map((photo) => {
    const filename = safeFilenameFromUrl(photo.url)!;
    const buffer = decodeBase64(photoByFilename.get(filename)!);
    try {
      assertValidPhoto(buffer);
    } catch (error) {
      if (error instanceof InvalidFileError) throw new InvalidBundleError(error.message);
      throw error;
    }
    return { photo, buffer };
  });

  const photoIdRemap = new Map<string, SceneManifest["photos"][number]>();
  for (const { photo, buffer } of preparedPhotos) {
    try {
      const stored = await store.photos.store(buffer, photo.order, photo.label);
      photoIdRemap.set(photo.id, stored);
    } catch (error) {
      if (error instanceof InvalidFileError) throw new InvalidBundleError(error.message);
      throw error;
    }
  }

  const importedPhotos = Array.from(photoIdRemap.values());
  const assetIdRemap = new Map<string, SceneManifest["assets"][number]>();
  for (const { asset, buffer } of preparedAssets) {
    try {
      const stored = await store.assets.store(buffer, asset.provenance, importedPhotos);
      assetIdRemap.set(asset.id, stored);
    } catch (error) {
      if (error instanceof InvalidFileError) throw new InvalidBundleError(error.message);
      throw error;
    }
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
      sha256: remap?.sha256 ?? asset.sha256,
      sizeBytes: remap?.sizeBytes ?? asset.sizeBytes,
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
      try {
        const bundle = await exportLevelBundle(store.storageDir, level, store.publicDir);
        res.json(bundle);
      } catch (error) {
        if (error instanceof InvalidBundleError) {
          res.status(422).json({ message: error.message });
          return;
        }
        throw error;
      }
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
        const imported = await importLevelBundle(store, rawBundle);
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
