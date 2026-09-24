#!/usr/bin/env node
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

type Json = Record<string, any>;

const API = "http://127.0.0.1:18799";
const LEVEL_ID = "live-validation-photo4-20260924-hands-on";
const EXPECTED_NAME = "The Cozy Corner Color Caper!";
const EXPECTED_UPDATED_AT = "2026-09-24T13:53:08.014Z";
const CUES = [
  "music",
  "ambience",
  "fragment-pickup",
  "portal-activate",
  "checkpoint",
  "fall-respawn",
  "race-start",
  "race-finish",
  "completion",
  "narration",
] as const;
const JOB_IDS: Record<(typeof CUES)[number], string> = {
  music: "job_ce2d246a-37d5-4d9e-92cd-576714355ecd",
  ambience: "job_70ab5853-fc2a-4ab5-9f4a-0e61fd97643c",
  "fragment-pickup": "job_1474ebee-fa65-4d4b-b411-0f8babbabb87",
  "portal-activate": "job_e6ca6d26-95e4-4a57-9957-ccb339f7b898",
  checkpoint: "job_ad9d29da-c845-4942-a20e-73867b01e4dd",
  "fall-respawn": "job_dacec6c9-29a7-449e-a6f9-49bc10b3d0ca",
  "race-start": "job_14627b5c-a07b-4974-abb8-153e8ca77cb3",
  "race-finish": "job_2ed6d832-5280-4b3a-9fdb-321ddddc55c0",
  completion: "job_ed9531f2-28dd-455a-ade3-9f24c704956b",
  narration: "job_1e84e844-ae2b-4de9-b332-ab4f5caee724",
};

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

async function json(response: Response): Promise<Json> {
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`${response.status} ${body.message ?? response.statusText}`);
  return body;
}

async function get(path: string): Promise<Json> {
  return json(await fetch(`${API}${path}`, { signal: AbortSignal.timeout(10_000) }));
}

function preserved(manifest: Json): Json {
  const { media: _media, updatedAt: _updatedAt, ...rest } = manifest;
  return rest;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function verifyPreconditions(): Promise<{ before: Json; assets: Json[]; preservedSha256: string }> {
  assertEqual((await get("/api/health")).status, "ok", "Isolated API is not healthy.");
  const levels = await get("/api/levels") as unknown as Json[];
  assertEqual(levels.map((level) => level.levelId), [LEVEL_ID], "Saved-level identity or count changed.");
  const before = await get(`/api/levels/${encodeURIComponent(LEVEL_ID)}`);
  assertEqual(before.levelId, LEVEL_ID, "Level identity changed.");
  assertEqual(before.name, EXPECTED_NAME, "Level name changed.");
  assertEqual(before.updatedAt, EXPECTED_UPDATED_AT, "Level was edited after the attachment baseline was captured.");
  assertEqual(before.media?.audio ?? [], [], "Level already has audio; refusing a merge with an unknown mapping.");
  assertEqual(before.media?.video ?? [], [], "Level video changed.");
  assertEqual(await get(`/api/levels/${encodeURIComponent(LEVEL_ID)}/publications`), [], "Level is already published.");

  const assets: Json[] = [];
  for (const cue of CUES) {
    const job = await get(`/api/jobs/${encodeURIComponent(JOB_IDS[cue])}`);
    assertEqual(job.state, "ready", `${cue} is not ready.`);
    assertEqual(job.retryCount, 0, `${cue} has a retry.`);
    assertEqual(job.fallbackFired ?? null, null, `${cue} used a fallback.`);
    const asset = job.result?.asset;
    if (!asset?.id || !asset?.url || !asset?.sha256 || !asset?.sizeBytes) throw new Error(`${cue} has no complete asset.`);
    assets.push(asset);
  }
  return { before, assets, preservedSha256: digest(preserved(before)) };
}

async function main(): Promise<void> {
  const execute = process.argv.slice(2).includes("--execute");
  const unknown = process.argv.slice(2).filter((arg) => arg !== "--execute");
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  const { before, assets, preservedSha256 } = await verifyPreconditions();
  console.log(JSON.stringify({
    mode: execute ? "EXECUTE_SINGLE_LEVEL_ATTACHMENT" : "DRY_RUN_NO_WRITE",
    api: API,
    levelId: LEVEL_ID,
    levelName: before.name,
    updatedAtBefore: before.updatedAt,
    preservedManifestSha256: preservedSha256,
    publicationsBefore: 0,
    videoBefore: before.media?.video ?? [],
    cueOrder: CUES,
    jobIds: JOB_IDS,
    assetIds: assets.map((asset) => asset.id),
    generationCalls: 0,
    retryCalls: 0,
    publishCalls: 0,
  }, null, 2));
  if (!execute) return;

  const attached = await json(await fetch(`${API}/api/audio`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "refresh", levelId: LEVEL_ID, jobIds: JOB_IDS }),
    signal: AbortSignal.timeout(30_000),
  }));
  assertEqual(attached.pendingCues, [], "Attachment returned pending cues.");
  assertEqual(attached.failedCues, [], "Attachment returned failed cues.");
  assertEqual(attached.jobs.map((entry: Json) => entry.cue), CUES, "Attachment cue order changed.");
  assertEqual(attached.readyAssets.map((asset: Json) => asset.id), assets.map((asset) => asset.id), "Attachment asset order changed.");

  const after = await get(`/api/levels/${encodeURIComponent(LEVEL_ID)}`);
  assertEqual(digest(preserved(after)), preservedSha256, "A non-media level field changed.");
  assertEqual(after.media?.audio, assets, "Persisted audio mapping differs from the verified assets.");
  assertEqual(after.media?.video ?? [], before.media?.video ?? [], "Persisted video changed.");
  assertEqual((await get("/api/levels") as unknown as Json[]).map((level) => level.levelId), [LEVEL_ID], "Attachment changed saved-level identity or count.");
  assertEqual(await get(`/api/levels/${encodeURIComponent(LEVEL_ID)}/publications`), [], "Attachment published the level.");
  console.log(JSON.stringify({
    status: "attached_and_verified",
    levelId: after.levelId,
    levelName: after.name,
    updatedAtBefore: before.updatedAt,
    updatedAtAfter: after.updatedAt,
    preservedManifestSha256: preservedSha256,
    audioAssetCount: after.media.audio.length,
    audioAssetIds: after.media.audio.map((asset: Json) => asset.id),
    videoAssetCount: after.media.video.length,
    publicationsAfter: 0,
    generationCalls: 0,
    retryCalls: 0,
    publishCalls: 0,
  }, null, 2));
}

await main();
