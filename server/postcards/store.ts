import { join } from "node:path";
import { JsonFileStore } from "../persistence/jsonStore.js";

export interface PostcardCacheRecord {
  levelId: string;
  worldFingerprint: string;
  screenshotAssetId: string;
  jobId: string;
  updatedAt: string;
}

export class PostcardCacheStore {
  private readonly store: JsonFileStore<Record<string, PostcardCacheRecord>>;

  constructor(storageDir: string) {
    this.store = new JsonFileStore(join(storageDir, "postcard-cache.json"), () => ({}));
  }

  async get(levelId: string): Promise<PostcardCacheRecord | undefined> {
    return (await this.store.read())[levelId];
  }

  async put(record: PostcardCacheRecord): Promise<void> {
    await this.store.update((current) => {
      current[record.levelId] = record;
    });
  }
}
