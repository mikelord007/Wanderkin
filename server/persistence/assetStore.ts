import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetProvenance, AssetReference, PhotoReference } from "../../shared/manifest.js";
import { JsonFileStore } from "./jsonStore.js";
import { assertValidGlb } from "./validate.js";

/** What we persist and return from GET /api/assets/:id: the shared
 * `AssetReference` shape plus an optional, server-added `photos` list (the
 * ordered source photos a generated asset came from) — additive to the
 * contract, not a breaking change to it, so it's kept out of shared/*. */
export type StoredAssetRecord = AssetReference & { photos?: PhotoReference[] };

export class AssetStore {
  private readonly index: JsonFileStore<Record<string, StoredAssetRecord>>;
  private readonly dir: string;

  constructor(storageDir: string) {
    this.dir = join(storageDir, "assets");
    this.index = new JsonFileStore(join(storageDir, "assets.json"), () => ({}));
  }

  /** Validates GLB magic bytes/size, stores content-addressed by sha256 (so
   * re-downloading the same result is a safe no-op), and records optional
   * generation provenance plus the ordered source photos (for generated
   * assets — omitted for hand-imported ones). When bytes already exist,
   * omitted metadata preserves the existing authoritative values. */
  async store(buffer: Buffer, provenance?: AssetProvenance, photos?: PhotoReference[]): Promise<StoredAssetRecord> {
    assertValidGlb(buffer);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const filename = `${sha256}.glb`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, filename), buffer);

    const existing = await this.findBySha(sha256);
    const retainedProvenance = provenance ?? existing?.provenance;
    const retainedPhotos = photos ?? existing?.photos;
    const record: StoredAssetRecord = {
      id: existing?.id ?? randomUUID(),
      url: `/api/assets/files/${filename}`,
      sha256,
      sizeBytes: buffer.byteLength,
      ...(retainedProvenance !== undefined ? { provenance: retainedProvenance } : {}),
      ...(retainedPhotos !== undefined && retainedPhotos.length > 0 ? { photos: retainedPhotos } : {}),
    };
    await this.index.update((current) => {
      current[record.id] = record;
    });
    return record;
  }

  async get(id: string): Promise<StoredAssetRecord | undefined> {
    const current = await this.index.read();
    return current[id];
  }

  async findByFilename(filename: string): Promise<StoredAssetRecord | undefined> {
    return Object.values(await this.index.read()).find((asset) => asset.url.endsWith(`/${filename}`));
  }

  /** Repairs only placeholder model provenance on an existing generated
   * asset. Both identifiers must match the stored record, and a concrete
   * model can never be overwritten with a different value. */
  async repairRegisteredModel(
    id: string,
    providerJobId: string,
    registeredModel: string,
  ): Promise<StoredAssetRecord> {
    const model = registeredModel.trim();
    if (!model || model === "unknown") {
      throw new Error("Recovery requires an authoritative registered model");
    }

    return this.index.update((current) => {
      const existing = current[id];
      if (!existing?.provenance) {
        throw new Error(`Generated asset "${id}" with provenance was not found`);
      }
      if (existing.provenance.providerJobId !== providerJobId) {
        throw new Error(`Asset "${id}" does not belong to provider job "${providerJobId}"`);
      }
      if (existing.provenance.registeredModel !== "unknown") {
        if (existing.provenance.registeredModel !== model) {
          throw new Error(`Asset "${id}" already has different concrete model provenance`);
        }
        return existing;
      }

      const repaired: StoredAssetRecord = {
        ...existing,
        provenance: { ...existing.provenance, registeredModel: model },
      };
      current[id] = repaired;
      return repaired;
    });
  }

  private async findBySha(sha256: string): Promise<StoredAssetRecord | undefined> {
    const current = await this.index.read();
    return Object.values(current).find((a) => a.sha256 === sha256);
  }

  fileDir(): string {
    return this.dir;
  }
}
