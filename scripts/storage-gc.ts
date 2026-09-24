import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface GeneratedAssetRecord { id: string; url: string }
interface JobRecord {
  job?: { id?: string; state?: string; updatedAt?: string; completedAt?: string; resultAssetId?: string; result?: unknown };
}

export interface StorageGcOptions {
  storageDir: string;
  apply: boolean;
  failedJobRetentionDays: number;
  now?: Date;
}

export interface StorageGcReport {
  mode: "dry-run" | "apply";
  storageDir: string;
  orphanedGeneratedAssetIds: string[];
  generatedFilesRemoved: string[];
  expiredFailedJobIds: string[];
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
}

function collectReferencedIds(value: unknown, knownIds: Set<string>, found: Set<string>): void {
  if (typeof value === "string") {
    if (knownIds.has(value)) found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferencedIds(item, knownIds, found);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value as Record<string, unknown>)) collectReferencedIds(item, knownIds, found);
  }
}

export async function runStorageGc(options: StorageGcOptions): Promise<StorageGcReport> {
  const storageDir = resolve(options.storageDir);
  if (storageDir === parse(storageDir).root) {
    throw new Error("Refusing to use a filesystem root as STORAGE_DIR");
  }
  if (!Number.isFinite(options.failedJobRetentionDays) || options.failedJobRetentionDays < 1) {
    throw new Error("failedJobRetentionDays must be at least 1");
  }
  const generatedIndexPath = join(storageDir, "generated-assets.json");
  const jobsPath = join(storageDir, "jobs.json");
  const generated = await readJson<Record<string, GeneratedAssetRecord>>(generatedIndexPath, {});
  const originalGenerated = { ...generated };
  const jobs = await readJson<Record<string, JobRecord>>(jobsPath, {});
  const levels = await readJson<unknown>(join(storageDir, "levels.json"), {});
  const publications = await readJson<unknown>(join(storageDir, "published-levels.json"), {});
  const previewCache = await readJson<unknown>(join(storageDir, "preview-cache.json"), {});

  const now = options.now ?? new Date();
  const failedCutoff = now.getTime() - options.failedJobRetentionDays * 24 * 60 * 60 * 1_000;
  const expiredFailedJobIds = Object.entries(jobs)
    .filter(([, record]) => {
      if (record.job?.state !== "failed") return false;
      const timestamp = Date.parse(record.job.completedAt ?? record.job.updatedAt ?? "");
      return Number.isFinite(timestamp) && timestamp < failedCutoff;
    })
    .map(([id]) => id)
    .sort();
  const expiredSet = new Set(expiredFailedJobIds);
  const retainedJobs = Object.fromEntries(Object.entries(jobs).filter(([id]) => !expiredSet.has(id)));

  const knownIds = new Set(Object.keys(generated));
  const referenced = new Set<string>();
  collectReferencedIds(levels, knownIds, referenced);
  collectReferencedIds(publications, knownIds, referenced);
  collectReferencedIds(previewCache, knownIds, referenced);
  collectReferencedIds(retainedJobs, knownIds, referenced);

  const orphanedGeneratedAssetIds = [...knownIds].filter((id) => !referenced.has(id)).sort();

  const generatedFilesRemoved: string[] = [];
  if (options.apply) {
    for (const id of orphanedGeneratedAssetIds) delete generated[id];
    for (const id of expiredFailedJobIds) delete jobs[id];
    await writeJsonAtomic(generatedIndexPath, generated);
    await writeJsonAtomic(jobsPath, jobs);

  }

  // Capture file candidates from the original index after index decisions.
  const candidates = orphanedGeneratedAssetIds
    .map((id) => originalGenerated[id]?.url)
    .filter((url): url is string => typeof url === "string");
  if (options.apply) {
    const retainedUrls = new Set(Object.values(generated).map((asset) => asset.url));
    for (const url of candidates) {
      if (retainedUrls.has(url)) continue;
      const filename = basename(url);
      if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(filename)) continue;
      await unlink(join(storageDir, "generated-assets", filename)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      generatedFilesRemoved.push(filename);
    }
  }

  return {
    mode: options.apply ? "apply" : "dry-run",
    storageDir,
    orphanedGeneratedAssetIds,
    generatedFilesRemoved,
    expiredFailedJobIds,
  };
}

function parseArgs(argv: string[]): StorageGcOptions {
  let storageDir = process.env.STORAGE_DIR ?? "./storage";
  let failedJobRetentionDays = Number(process.env.GC_FAILED_JOB_RETENTION_DAYS ?? 30);
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") apply = true;
    else if (arg === "--storage-dir") storageDir = argv[++index] ?? "";
    else if (arg === "--failed-job-days") failedJobRetentionDays = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!storageDir) throw new Error("--storage-dir requires a value");
  return { storageDir, apply, failedJobRetentionDays };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runStorageGc(parseArgs(process.argv.slice(2)))
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
