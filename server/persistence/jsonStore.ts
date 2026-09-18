import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Atomic single-file JSON store: write-to-temp then rename, guarded by an
 * in-process mutex so concurrent request handlers never interleave a
 * read-modify-write and corrupt the file. Good enough for this project's
 * single-process Node server; not a substitute for a real database if this
 * ever needs multi-process durability.
 */
export class JsonFileStore<T> {
  private queue: Promise<unknown> = Promise.resolve();
  private cached: T | undefined;

  constructor(
    private readonly filePath: string,
    private readonly defaultValue: () => T,
  ) {}

  private async readRaw(): Promise<T> {
    if (this.cached !== undefined) return this.cached;
    try {
      const text = await readFile(this.filePath, "utf-8");
      this.cached = JSON.parse(text) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cached = this.defaultValue();
      } else {
        throw err;
      }
    }
    return this.cached;
  }

  /** Runs `fn` against the current value with exclusive access; anything
   * `fn` returns other than `undefined` becomes the new persisted value. */
  async update<R>(fn: (current: T) => R | Promise<R>): Promise<R> {
    const run = async (): Promise<R> => {
      const current = await this.readRaw();
      const result = await fn(current);
      await mkdir(dirname(this.filePath), { recursive: true });
      const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmpPath, JSON.stringify(current, null, 2), "utf-8");
      await rename(tmpPath, this.filePath);
      this.cached = current;
      return result;
    };
    const result = this.queue.then(run, run);
    // Keep the chain alive even if this call rejects, without ever awaiting
    // a rejection that isn't ours to observe.
    this.queue = result.catch(() => undefined);
    return result;
  }

  async read(): Promise<T> {
    return this.queue.then(() => this.readRaw());
  }
}
