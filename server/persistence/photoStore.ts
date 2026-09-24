import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PhotoReference } from "../../shared/manifest.js";
import type { PhotoBytesProvider } from "../livepeer/adapter.js";
import { JsonFileStore } from "./jsonStore.js";
import { assertValidPhoto } from "./validate.js";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface StoredPhotoRecord extends PhotoReference {
  contentSha256?: string;
  /** A token digest in strict mode, or null for legacy-open ownerless photos. */
  ownerScope?: string | null;
}

export interface StorePhotoResult {
  photo: PhotoReference;
  created: boolean;
}

function toReference(record: StoredPhotoRecord): PhotoReference {
  return {
    id: record.id,
    url: record.url,
    order: record.order,
    ...(record.label !== undefined ? { label: record.label } : {}),
  };
}

export class PhotoStore implements PhotoBytesProvider {
  private readonly index: JsonFileStore<Record<string, StoredPhotoRecord>>;
  private readonly dir: string;

  constructor(storageDir: string) {
    this.dir = join(storageDir, "photos");
    this.index = new JsonFileStore(join(storageDir, "photos.json"), () => ({}));
  }

  /** Validates magic bytes/size and persists one uploaded photo to disk. */
  async store(buffer: Buffer, order: number, label?: string): Promise<PhotoReference> {
    const mimeType = assertValidPhoto(buffer);
    const id = randomUUID();
    const filename = `${id}.${EXTENSION_BY_MIME[mimeType]}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, filename), buffer);
    const reference: StoredPhotoRecord = {
      id,
      url: `/api/photos/files/${filename}`,
      order,
      contentSha256: createHash("sha256").update(buffer).digest("hex"),
      ...(label !== undefined ? { label } : {}),
    };
    await this.index.update((current) => {
      current[id] = reference;
    });
    return toReference(reference);
  }

  /**
   * Stores a photo once per owner scope. Validation deliberately happens
   * before the hash lookup so an invalid retry cannot reuse a prior record.
   * `canReuseLegacyRecord` lets pre-deduplication indexes consult the
   * ownership store before their owner scope is backfilled.
   */
  async storeOrReuse(
    buffer: Buffer,
    order: number,
    label: string | undefined,
    ownerScope: string | null,
    canReuseLegacyRecord?: (photoId: string) => Promise<boolean>,
  ): Promise<StorePhotoResult> {
    const mimeType = assertValidPhoto(buffer);
    const contentSha256 = createHash("sha256").update(buffer).digest("hex");

    return this.index.update(async (current) => {
      for (const record of Object.values(current)) {
        let candidateHash = record.contentSha256;
        if (!candidateHash) {
          const filename = record.url.split("/").pop();
          if (!filename) continue;
          try {
            candidateHash = createHash("sha256")
              .update(await readFile(join(this.dir, filename)))
              .digest("hex");
            record.contentSha256 = candidateHash;
          } catch {
            continue;
          }
        }
        if (candidateHash !== contentSha256) continue;

        const hasStoredScope = Object.prototype.hasOwnProperty.call(record, "ownerScope");
        const sameScope = hasStoredScope
          ? record.ownerScope === ownerScope
          : await canReuseLegacyRecord?.(record.id) === true;
        if (!sameScope) continue;

        if (!hasStoredScope) record.ownerScope = ownerScope;
        return { photo: toReference(record), created: false };
      }

      const id = randomUUID();
      const filename = `${id}.${EXTENSION_BY_MIME[mimeType]}`;
      await mkdir(this.dir, { recursive: true });
      await writeFile(join(this.dir, filename), buffer);
      const record: StoredPhotoRecord = {
        id,
        url: `/api/photos/files/${filename}`,
        order,
        contentSha256,
        ownerScope,
        ...(label !== undefined ? { label } : {}),
      };
      current[id] = record;
      return { photo: toReference(record), created: true };
    });
  }

  async get(id: string): Promise<PhotoReference | undefined> {
    const current = await this.index.read();
    const record = current[id];
    return record ? toReference(record) : undefined;
  }

  async findByFilename(filename: string): Promise<PhotoReference | undefined> {
    const record = Object.values(await this.index.read()).find((photo) => photo.url.endsWith(`/${filename}`));
    return record ? toReference(record) : undefined;
  }

  async getPhotoBytes(photoId: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const reference = await this.get(photoId);
    if (!reference) {
      throw new Error(`Unknown photo id "${photoId}"`);
    }
    const filename = reference.url.split("/").pop();
    if (!filename) {
      throw new Error(`Photo "${photoId}" has an unexpected stored URL "${reference.url}"`);
    }
    const buffer = await readFile(join(this.dir, filename));
    const ext = filename.split(".").pop();
    const mimeType = Object.entries(EXTENSION_BY_MIME).find(([, e]) => e === ext)?.[0] ?? "image/jpeg";
    return { buffer, mimeType, filename };
  }

  /** Absolute path for the static file route; caller must basename-sanitize
   * the requested name before joining it in. */
  fileDir(): string {
    return this.dir;
  }
}
