import type { GenerationJob } from "./job.js";
import type { SceneManifest } from "./manifest.js";
import type { AudioAssetReference } from "./media.js";

/**
 * A world's own soundtrack is a separate music job that often finishes after
 * the course was prepared or saved. The manifest keeps only that job's id (in
 * `workflow.jobs`), so the music has to be copied into `media.audio` once the
 * job is ready; until then the game plays the bundled loop.
 */

/** The music job asked for this world: its newest `music` workflow entry.
 * Clients before a5868bb carried jobs over from an earlier creation, so an
 * older entry may be another world's music and is never used instead. */
export function worldMusicJobId(manifest: SceneManifest): string | null {
  let newest: { jobId: string; updatedAt: string } | null = null;
  for (const job of manifest.workflow?.jobs ?? []) {
    if (job.kind !== "music") continue;
    if (!newest || job.updatedAt >= newest.updatedAt) newest = job;
  }
  return newest?.jobId ?? null;
}

/** The finished soundtrack of a music job, or null while it isn't one. */
export function readyMusicAsset(job: GenerationJob | undefined): AudioAssetReference | null {
  return job?.state === "ready" && job.result?.kind === "music" ? job.result.asset : null;
}

/** The manifest with `asset` as its music (any other music replaced, all
 * other audio and video kept) and the workflow job marked consumed. The same
 * object comes back when that music is already attached. */
export function withWorldMusic(manifest: SceneManifest, jobId: string, asset: AudioAssetReference): SceneManifest {
  const audio = manifest.media?.audio ?? [];
  if (audio.some((existing) => existing.kind === "music" && existing.id === asset.id)) return manifest;
  return {
    ...manifest,
    media: {
      audio: [asset, ...audio.filter((existing) => existing.kind !== "music")],
      video: manifest.media?.video ?? [],
    },
    ...(manifest.workflow ? {
      workflow: {
        ...manifest.workflow,
        jobs: manifest.workflow.jobs.map((job) => job.jobId === jobId
          ? { ...job, status: "ready" as const, consumedByAssetId: asset.id }
          : job),
      },
    } : {}),
  };
}

/** Attaches the world's soundtrack if its job is ready. Anything else — no
 * music job, still generating, failed, unreachable — leaves it unchanged. */
export async function attachWorldMusic(
  manifest: SceneManifest,
  getJob: (jobId: string) => Promise<GenerationJob | undefined>,
): Promise<SceneManifest> {
  const jobId = worldMusicJobId(manifest);
  if (!jobId) return manifest;
  let asset: AudioAssetReference | null;
  try { asset = readyMusicAsset(await getJob(jobId)); } catch { return manifest; }
  return asset ? withWorldMusic(manifest, jobId, asset) : manifest;
}
