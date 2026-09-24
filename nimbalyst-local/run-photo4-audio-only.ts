#!/usr/bin/env node
import { isDeepStrictEqual } from "node:util";

import {
  BudgetGuard,
  buildPlan,
  planTotal,
  VALIDATION_WORLD_ID,
  type PlannedRequest,
} from "../scripts/live-validation/plan.js";
import { assertReadyReuse } from "../scripts/live-validation/run.js";

type Json = Record<string, any>;

const API_DEFAULT = "http://127.0.0.1:18799";
const MAX_REQUEST_USD = 0.5;
const MAX_BATCH_USD = 3;
const MAX_PROJECT_USD = 10;
const PRIOR_SPIKE_USD = 0.462;
const EXPECTED_LEDGER_USD = 0.7247;
const EXPECTED_LEDGER_ENTRIES = 6;
const EXPECTED_FRESH_USD = 0.4124;
const PHOTO_ID = "632f0492-579a-46ff-8436-b7649035fd98";
const CUTOUT_ASSET_ID = "e4bd9b09-4912-44e8-9b71-6f2a6ff6f2c0";
const OBSOLETE_MUSIC_JOB_ID = "job_38ac4480-6e6c-4ed5-99ef-a0e0448cb1e0";
const REUSED_JOB_IDS = {
  cutout: "job_737935e2-c54b-4c18-a6a6-782a7a4c69c8",
  "style-preview": "job_ef2fde65-65e2-4d16-b8df-e75d53c93d85",
  "alternate-edit": "job_f9bcf342-6254-4b38-9fa0-d32c797cb89f",
  mesh: "job_662f0c8a-52f1-4e33-adad-fcff355e014d",
  quest: "job_8df572b8-0ded-4e8b-b524-c3361698a1ca",
} as const;
const REUSED_IDS = Object.keys(REUSED_JOB_IDS);
const FRESH_IDS = [
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

function parseArgs(argv: readonly string[]): { api: string; execute: boolean } {
  const apiIndex = argv.indexOf("--api");
  const api = (apiIndex >= 0 ? argv[apiIndex + 1] : API_DEFAULT)?.replace(/\/$/, "");
  if (!api) throw new Error("--api requires a value.");
  const unknown = argv.filter((arg, index) => arg !== "--execute" && arg !== "--api" && argv[index - 1] !== "--api");
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
  return { api, execute: argv.includes("--execute") };
}

async function responseJson(response: Response): Promise<Json> {
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    throw Object.assign(new Error(`${response.status} ${body.message ?? response.statusText}`), {
      status: response.status,
      body,
    });
  }
  return body;
}

async function getJson(api: string, path: string): Promise<Json> {
  return responseJson(await fetch(`${api}${path}`, { signal: AbortSignal.timeout(10_000) }));
}

async function postJson(api: string, path: string, body: unknown, idempotencyKey: string): Promise<Json> {
  return responseJson(await fetch(`${api}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }));
}

function replacePlaceholders(value: unknown, values: Record<string, string>): unknown {
  if (typeof value === "string") return values[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => replacePlaceholders(item, values));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, values)]));
  }
  return value;
}

function exactUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

async function pollReady(api: string, initial: Json): Promise<Json> {
  let job = initial;
  const deadline = Date.now() + 20 * 60_000;
  while (!new Set(["ready", "failed"]).has(job.state)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out polling ${job.id}; do not resubmit or retry.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    job = await getJson(api, `/api/jobs/${encodeURIComponent(job.id)}`);
  }
  if (job.state !== "ready") {
    throw new Error(`${job.id} failed: ${job.lastError?.message ?? "unknown failure"}. No retry was attempted.`);
  }
  return job;
}

function assertFreshReady(step: PlannedRequest, job: Json): void {
  assertEqual(job.idempotencyKey, step.request.idempotencyKey, `${step.id} returned the wrong idempotency key.`);
  assertEqual(job.request, step.request, `${step.id} returned different request bytes.`);
  assertEqual(job.fallbackFired ?? null, null, `${step.id} used a fallback.`);
  if (typeof job.providerJobId !== "string" || !job.providerJobId) {
    throw new Error(`${step.id} is ready without a provider job id.`);
  }
  const servedCapability = job.provenance?.servedCapability ?? job.capabilityUsed;
  assertEqual(servedCapability, step.capability, `${step.id} served the wrong capability.`);
  if (typeof job.provenance?.servedModel !== "string" || !job.provenance.servedModel) {
    throw new Error(`${step.id} omitted named model provenance.`);
  }
  const result = job.result;
  const expectedResultKind = step.kind === "music" ? "music" : step.kind === "tts" ? "tts" : "sfx";
  assertEqual(result?.kind, expectedResultKind, `${step.id} returned the wrong result kind.`);
  if (!result?.asset?.id || !result.asset.url || !result.asset.sha256 || !result.asset.sizeBytes || !result.asset.mimeType) {
    throw new Error(`${step.id} returned an incomplete stored audio asset.`);
  }
}

async function prepare(api: string): Promise<{ fresh: PlannedRequest[]; requests: Record<string, Json>; ledger: Json }> {
  const health = await getJson(api, "/api/health");
  assertEqual(health.status, "ok", "Isolated API is not healthy.");

  const plan = buildPlan({ includePostcard: true, includeAlternateEdit: true });
  assertEqual(plan.map((step) => step.id), [...REUSED_IDS, ...FRESH_IDS, "postcard"], "Reviewed row order changed.");
  const values: Record<string, string> = {
    $uploadedPhotoId: PHOTO_ID,
    $cutoutAssetId: CUTOUT_ASSET_ID,
  };
  const requests: Record<string, Json> = {};

  for (const step of plan.slice(0, REUSED_IDS.length)) {
    const request = replacePlaceholders(step.request, values) as Json;
    const jobId = REUSED_JOB_IDS[step.id as keyof typeof REUSED_JOB_IDS];
    const job = await getJson(api, `/api/jobs/${encodeURIComponent(jobId)}`);
    assertReadyReuse(step, request, job);
    requests[step.id] = request;
    if (step.id === "cutout") {
      assertEqual(job.result?.asset?.id, CUTOUT_ASSET_ID, "Cutout asset identity changed.");
      values.$cutoutAssetId = job.result.asset.id;
    }
    if (step.id === "style-preview") {
      if (!job.result?.asset?.id) throw new Error("Reused style preview omitted its asset id.");
      values.$approvedPreviewAssetId = job.result.asset.id;
    }
  }

  const obsolete = await getJson(api, `/api/jobs/${encodeURIComponent(OBSOLETE_MUSIC_JOB_ID)}`);
  assertEqual(obsolete.state, "failed", "Obsolete music job is not failed.");
  assertEqual(obsolete.idempotencyKey, "oq-live-20260924-music", "Obsolete music key changed.");
  assertEqual(obsolete.providerJobId ?? null, null, "Obsolete music job unexpectedly has a provider id.");
  assertEqual(obsolete.request?.durationSeconds, 60, "Obsolete music request is not the rejected 60-second body.");
  assertEqual(obsolete.retryCount, 0, "Obsolete music retry count changed.");

  const fresh = plan.filter((step) => FRESH_IDS.includes(step.id as typeof FRESH_IDS[number]));
  assertEqual(fresh.map((step) => step.id), [...FRESH_IDS], "Fresh row selection changed.");
  const freshTotal = planTotal(fresh);
  assertEqual(freshTotal, EXPECTED_FRESH_USD, "Fresh plan ceiling changed.");
  assertEqual(fresh[0]?.request.idempotencyKey, "oq-live-20260924-music-v2", "Corrected music key changed.");
  assertEqual(fresh.at(-1)?.request.text?.length, 107, "Narration length changed.");

  const guard = new BudgetGuard(MAX_BATCH_USD);
  for (const step of fresh) {
    if (step.estimatedUsd > MAX_REQUEST_USD) throw new Error(`${step.id} exceeds the $${MAX_REQUEST_USD} per-request ceiling.`);
    requests[step.id] = replacePlaceholders(step.request, values) as Json;
  }
  guard.reserve({ id: "fresh-audio-batch", estimatedUsd: freshTotal });
  assertEqual(guard.reservedUsd, EXPECTED_FRESH_USD, "BudgetGuard fresh reservation changed.");

  const ledger = await getJson(api, `/api/jobs/spend/${encodeURIComponent(VALIDATION_WORLD_ID)}`);
  assertEqual(ledger.knownUsd, EXPECTED_LEDGER_USD, "Persisted batch ledger changed before execution.");
  assertEqual(ledger.entries, EXPECTED_LEDGER_ENTRIES, "Persisted ledger entry count changed before execution.");
  const conservativeBatch = exactUsd(ledger.knownUsd + EXPECTED_FRESH_USD);
  const conservativeProject = exactUsd(PRIOR_SPIKE_USD + conservativeBatch);
  if (conservativeBatch > MAX_BATCH_USD) throw new Error("Conservative batch total exceeds the server batch ceiling.");
  if (conservativeProject > MAX_PROJECT_USD) throw new Error("Conservative project total exceeds the user ceiling.");

  return { fresh, requests, ledger };
}

async function main(): Promise<void> {
  const { api, execute } = parseArgs(process.argv.slice(2));
  const { fresh, requests, ledger } = await prepare(api);
  const preflight = {
    mode: execute ? "EXECUTE" : "DRY_RUN_NO_DISPATCH",
    api,
    worldId: VALIDATION_WORLD_ID,
    reusedRows: REUSED_IDS,
    freshRows: fresh.map((step) => ({
      id: step.id,
      estimatedUsd: step.estimatedUsd,
      request: requests[step.id],
    })),
    skippedRow: { id: "postcard", status: "SKIPPED/BLOCKED", reservedUsd: 0 },
    retryCalls: 0,
    levelWrites: 0,
    publishCalls: 0,
    ledgerBefore: ledger,
    freshMaximumUsd: EXPECTED_FRESH_USD,
    conservativeBatchUsd: exactUsd(EXPECTED_LEDGER_USD + EXPECTED_FRESH_USD),
    conservativeProjectUsd: exactUsd(PRIOR_SPIKE_USD + EXPECTED_LEDGER_USD + EXPECTED_FRESH_USD),
  };
  console.log(JSON.stringify(preflight, null, 2));
  if (!execute) return;

  const completed: Json[] = [];
  const guard = new BudgetGuard(MAX_BATCH_USD);
  guard.reserve({ id: "fresh-audio-batch", estimatedUsd: EXPECTED_FRESH_USD });
  for (const [index, step] of fresh.entries()) {
    const request = requests[step.id]!;
    console.log(`SUBMIT ${step.id} key=${request.idempotencyKey} ceiling=$${step.estimatedUsd.toFixed(4)}`);
    const submitted = await postJson(api, "/api/jobs/generate", {
      request,
      worldId: VALIDATION_WORLD_ID,
      maxCostUsd: step.estimatedUsd,
    }, request.idempotencyKey);
    const job = await pollReady(api, submitted);
    assertFreshReady({ ...step, request }, job);
    const spend = await getJson(api, `/api/jobs/spend/${encodeURIComponent(VALIDATION_WORLD_ID)}`);
    const allowed = exactUsd(EXPECTED_LEDGER_USD + planTotal(fresh.slice(0, index + 1)));
    if (spend.knownUsd > allowed) {
      throw new Error(`${step.id} raised ledger spend to $${spend.knownUsd}, above the bounded $${allowed}.`);
    }
    completed.push({
      step: step.id,
      applicationJobId: job.id,
      providerJobId: job.providerJobId,
      idempotencyKey: job.idempotencyKey,
      servedCapability: job.provenance?.servedCapability ?? job.capabilityUsed,
      servedModel: job.provenance?.servedModel,
      fallbackFired: job.fallbackFired ?? null,
      reportedCost: job.provenance?.reportedCost ?? null,
      timings: job.provenance?.timings ?? null,
      asset: job.result.asset,
      ledgerAfter: spend,
    });
    console.log(`READY ${step.id} app=${job.id} provider=${job.providerJobId} asset=${job.result.asset.id}`);
  }

  console.log(JSON.stringify({
    status: "audio_rows_ready_no_level_write",
    completed,
    retryCalls: 0,
    levelWrites: 0,
    publishCalls: 0,
  }, null, 2));
}

await main();
