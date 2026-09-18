import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetProvenance, AssetReference } from "../../shared/manifest.js";
import { JsonFileStore } from "./jsonStore.js";
import { assertValidGlb } from "./validate.js";

export class AssetStore {
  private readonly index: JsonFileStore<Record<string, AssetReference>>;
  private readonly dir: string;

  constructor(storageDir: string) {
    this.dir = join(storageDir, "assets");
    this.index = new JsonFileStore(join(storageDir, "assets.json"), () => ({}));
  }

  /** Validates GLB magic bytes/size, stores content-addressed by sha256 (so
   * re-downloading the same result is a safe no-op), and records optional
   * generation provenance. */
  async store(buffer: Buffer, provenance?: AssetProvenance): Promise<AssetReference> {
    assertValidGlb(buffer);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const filename = `${sha256}.glb`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, filename), buffer);

    const existing = await this.findBySha(sha256);
    const reference: AssetReference = {
      id: existing?.id ?? randomUUID(),
      url: `/api/assets/files/${filename}`,
      sha256,
      sizeBytes: buffer.byteLength,
      ...(provenance !== undefined ? { provenance } : {}),
    };
    await this.index.update((current) => {
      current[reference.id] = reference;
    });
    return reference;
  }

  async get(id: string): Promise<AssetReference | undefined> {
    const current = await this.index.read();
    return current[id];
  }

  private async findBySha(sha256: string): Promise<AssetReference | undefined> {
    const current = await this.index.read();
    return Object.values(current).find((a) => a.sha256 === sha256);
  }

  fileDir(): string {
    return this.dir;
  }
}
