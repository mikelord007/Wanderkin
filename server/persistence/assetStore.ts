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
   * assets — omitted for hand-imported ones). */
  async store(buffer: Buffer, provenance?: AssetProvenance, photos?: PhotoReference[]): Promise<StoredAssetRecord> {
    assertValidGlb(buffer);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const filename = `${sha256}.glb`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, filename), buffer);

    const existing = await this.findBySha(sha256);
    const record: StoredAssetRecord = {
      id: existing?.id ?? randomUUID(),
      url: `/api/assets/files/${filename}`,
      sha256,
      sizeBytes: buffer.byteLength,
      ...(provenance !== undefined ? { provenance } : {}),
      ...(photos !== undefined && photos.length > 0 ? { photos } : {}),
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

  private async findBySha(sha256: string): Promise<StoredAssetRecord | undefined> {
    const current = await this.index.read();
    return Object.values(current).find((a) => a.sha256 === sha256);
  }

  fileDir(): string {
    return this.dir;
  }
}
