import { randomUUID } from "node:crypto";
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

export class PhotoStore implements PhotoBytesProvider {
  private readonly index: JsonFileStore<Record<string, PhotoReference>>;
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
    const reference: PhotoReference = {
      id,
      url: `/api/photos/files/${filename}`,
      order,
      ...(label !== undefined ? { label } : {}),
    };
    await this.index.update((current) => {
      current[id] = reference;
    });
    return reference;
  }

  async get(id: string): Promise<PhotoReference | undefined> {
    const current = await this.index.read();
    return current[id];
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
