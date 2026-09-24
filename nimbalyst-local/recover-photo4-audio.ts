#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  BudgetGuard,
  buildPlan,
  VALIDATION_WORLD_ID,
  type PlannedRequest,
} from "../scripts/live-validation/plan.js";
import { assertReadyReuse } from "../scripts/live-validation/run.js";

type Json = Record<string, any>;

const API_DEFAULT = "http://127.0.0.1:18799";
const STORAGE = "C:\\Users\\manuj\\code_barely_runs\\Objectquest_worktrees\\sudden-stone\\storage\\live-validation-2026-09-24";
const PHOTO_ID = "632f0492-579a-46ff-8436-b7649035fd98";
const CUTOUT_ASSET_ID = "e4bd9b09-4912-44e8-9b71-6f2a6ff6f2c0";
const EXPECTED_LEDGER_USD = 0.9767;
const EXPECTED_LEDGER_ENTRIES = 10;
const RECOVERY_MAXIMUM_USD = 0.1919;
const PRIOR_SPIKE_USD = 0.462;
const MAX_REQUEST_USD = 0.5;
const MAX_BATCH_USD = 3;
const MAX_PROJECT_USD = 10;
const PORTAL_REPLACEMENT_KEY = "oq-live-20260924-portal-activate-v2";

const READY_JOB_IDS = {
  cutout: "job_737935e2-c54b-4c18-a6a6-782a7a4c69c8",
  "style-preview": "job_ef2fde65-65e2-4d16-b8df-e75d53c93d85",
  "alternate-edit": "job_f9bcf342-6254-4b38-9fa0-d32c797cb89f",
  mesh: "job_662f0c8a-52f1-4e33-adad-fcff355e014d",
  quest: "job_8df572b8-0ded-4e8b-b524-c3361698a1ca",
  music: "job_ce2d246a-37d5-4d9e-92cd-576714355ecd",
  ambience: "job_70ab5853-fc2a-4ab5-9f4a-0e61fd97643c",
  "fragment-pickup": "job_1474ebee-fa65-4d4b-b411-0f8babbabb87",
} as const;
const READY_IDS = Object.keys(READY_JOB_IDS);
const ORIGINAL_PORTAL_JOB_ID = "job_0ea8326f-b76f-46d6-aba1-5b2d03a02a14";
const REMAINING_IDS = [
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

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${message} Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

async function responseJson(response: Response): Promise<Json> {
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw Object.assign(new Error(`${response.status} ${body.message ?? response.statusText}`), { status: response.status, body });
  return body;
}

async function getJson(api: string, path: string): Promise<Json> {
  return responseJson(await fetch(`${api}${path}`, { signal: AbortSignal.timeout(10_000) }));
}

async function postJson(api: string, body: Json, key: string): Promise<Json> {
  return responseJson(await fetch(`${api}/api/jobs/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
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

async function pollReady(api: string, initial: Json): Promise<Json> {
  let job = initial;
  const deadline = Date.now() + 20 * 60_000;
  while (!new Set(["ready", "failed"]).has(job.state)) {
    if (Date.now() > deadline) throw new Error(`Timed out polling ${job.id}; no retry or replacement was attempted.`);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    job = await getJson(api, `/api/jobs/${encodeURIComponent(job.id)}`);
  }
  if (job.state !== "ready") {
    throw new Error(`${job.id} failed: ${job.lastError?.message ?? "unknown failure"}. No retry or second replacement was attempted.`);
  }
  return job;
}

function assertFreshReady(step: PlannedRequest, job: Json): void {
  assertEqual(job.idempotencyKey, step.request.idempotencyKey, `${step.id} returned the wrong idempotency key.`);
  assertEqual(job.request, step.request, `${step.id} returned different request bytes.`);
  assertEqual(job.fallbackFired ?? null, null, `${step.id} used a fallback.`);
  if (typeof job.providerJobId !== "string" || !job.providerJobId) throw new Error(`${step.id} omitted its provider job id.`);
  assertEqual(job.provenance?.servedCapability ?? job.capabilityUsed, step.capability, `${step.id} served the wrong capability.`);
  if (typeof job.provenance?.servedModel !== "string" || !job.provenance.servedModel) throw new Error(`${step.id} omitted named model provenance.`);
  const expectedKind = step.kind === "tts" ? "tts" : "sfx";
  assertEqual(job.result?.kind, expectedKind, `${step.id} returned the wrong result kind.`);
  const asset = job.result?.asset;
  if (!asset?.id || !asset.url || !asset.sha256 || !asset.sizeBytes || !asset.mimeType) throw new Error(`${step.id} returned an incomplete audio asset.`);
}

async function prepare(api: string): Promise<{ recovery: PlannedRequest[]; ledger: Json }> {
  const health = await getJson(api, "/api/health");
  assertEqual(health.status, "ok", "Isolated API is not healthy.");

  const plan = buildPlan({ includePostcard: true, includeAlternateEdit: true });
  const byId = new Map(plan.map((step) => [step.id, step]));
  const values: Record<string, string> = { $uploadedPhotoId: PHOTO_ID, $cutoutAssetId: CUTOUT_ASSET_ID };
  for (const id of READY_IDS) {
    const step = byId.get(id);
    if (!step) throw new Error(`Reviewed plan omitted ready step ${id}.`);
    const request = replacePlaceholders(step.request, values) as Json;
    const job = await getJson(api, `/api/jobs/${encodeURIComponent(READY_JOB_IDS[id as keyof typeof READY_JOB_IDS])}`);
    assertReadyReuse(step, request, job);
    if (id === "cutout") {
      assertEqual(job.result?.asset?.id, CUTOUT_ASSET_ID, "Cutout identity changed.");
      values.$cutoutAssetId = job.result.asset.id;
    }
    if (id === "style-preview") {
      if (!job.result?.asset?.id) throw new Error("Style preview omitted its asset id.");
      values.$approvedPreviewAssetId = job.result.asset.id;
    }
  }

  const portal = byId.get("portal-activate");
  if (!portal) throw new Error("Reviewed plan omitted portal-activate.");
  const originalPortalRequest = replacePlaceholders(portal.request, values) as Json;
  const failed = await getJson(api, `/api/jobs/${encodeURIComponent(ORIGINAL_PORTAL_JOB_ID)}`);
  assertEqual(failed.state, "failed", "Original portal job is not failed.");
  assertEqual(failed.request, originalPortalRequest, "Original portal request bytes changed.");
  assertEqual(failed.providerJobId, "mjob_f9db028110fb", "Original portal provider id changed.");
  assertEqual(failed.retryCount, 0, "Original portal retry count changed.");
  assertEqual(failed.lastError?.retryable, false, "Original portal failure is no longer nonretryable.");

  const persisted = JSON.parse(await readFile(`${STORAGE}\\jobs.json`, "utf8")) as Record<string, Json>;
  const internal = persisted[ORIGINAL_PORTAL_JOB_ID]?.internal?.lastProviderStatusRaw?.structuredContent;
  assertEqual(internal?.status, "failed", "Raw portal provider status changed.");
  assertEqual(internal?.url ?? null, null, "Raw portal failure unexpectedly has a URL.");
  assertEqual(internal?.run_output ?? null, null, "Raw portal failure unexpectedly has run output.");
  if (!String(internal?.error ?? "").includes("No media was produced")) throw new Error("Raw portal failure no longer proves no media was produced.");

  const portalReplacement: PlannedRequest = {
    ...portal,
    id: "portal-activate-v2",
    request: { ...originalPortalRequest, idempotencyKey: PORTAL_REPLACEMENT_KEY },
  };
  const recovery = [portalReplacement, ...REMAINING_IDS.map((id) => {
    const step = byId.get(id);
    if (!step) throw new Error(`Reviewed plan omitted ${id}.`);
    return { ...step, request: replacePlaceholders(step.request, values) as Json };
  })];
  assertEqual(recovery.map((step) => step.id), ["portal-activate-v2", ...REMAINING_IDS], "Recovery row order changed.");
  assertEqual(roundUsd(recovery.reduce((sum, step) => sum + step.estimatedUsd, 0)), RECOVERY_MAXIMUM_USD, "Recovery ceiling changed.");
  assertEqual(recovery[0]?.request, { ...originalPortalRequest, idempotencyKey: PORTAL_REPLACEMENT_KEY }, "Portal replacement changed more than its key.");

  const existingKeys = new Set(Object.values(persisted).map((record) => record.job?.idempotencyKey));
  for (const step of recovery) {
    if (existingKeys.has(step.request.idempotencyKey)) throw new Error(`${step.id} recovery key is not unused.`);
    if (step.estimatedUsd > MAX_REQUEST_USD) throw new Error(`${step.id} exceeds the per-request ceiling.`);
  }
  const guard = new BudgetGuard(MAX_BATCH_USD);
  guard.reserve({ id: "authorized-recovery", estimatedUsd: RECOVERY_MAXIMUM_USD });
  assertEqual(guard.reservedUsd, RECOVERY_MAXIMUM_USD, "BudgetGuard recovery reservation changed.");

  const ledger = await getJson(api, `/api/jobs/spend/${encodeURIComponent(VALIDATION_WORLD_ID)}`);
  if (Math.abs(ledger.knownUsd - EXPECTED_LEDGER_USD) > 1e-9) throw new Error(`Persisted ledger changed: ${ledger.knownUsd}.`);
  assertEqual(ledger.entries, EXPECTED_LEDGER_ENTRIES, "Persisted ledger entry count changed.");
  const batchAfter = roundUsd(EXPECTED_LEDGER_USD + RECOVERY_MAXIMUM_USD);
  const projectAfter = roundUsd(PRIOR_SPIKE_USD + batchAfter);
  if (batchAfter > MAX_BATCH_USD || projectAfter > MAX_PROJECT_USD) throw new Error("Recovery exceeds an authorized budget ceiling.");
  return { recovery, ledger };
}

async function main(): Promise<void> {
  const { api, execute } = parseArgs(process.argv.slice(2));
  const { recovery, ledger } = await prepare(api);
  console.log(JSON.stringify({
    mode: execute ? "EXECUTE" : "DRY_RUN_NO_DISPATCH",
    api,
    worldId: VALIDATION_WORLD_ID,
    reusedReadyRows: READY_IDS,
    preservedFailedRow: { id: "portal-activate", applicationJobId: ORIGINAL_PORTAL_JOB_ID, providerJobId: "mjob_f9db028110fb" },
    submissions: recovery.map((step) => ({ id: step.id, estimatedUsd: step.estimatedUsd, request: step.request })),
    retryCalls: 0,
    uploads: 0,
    levelWrites: 0,
    publishCalls: 0,
    postcardCalls: 0,
    ledgerBefore: ledger,
    recoveryMaximumUsd: RECOVERY_MAXIMUM_USD,
    conservativeBatchAfterUsd: roundUsd(EXPECTED_LEDGER_USD + RECOVERY_MAXIMUM_USD),
    conservativeProjectAfterUsd: roundUsd(PRIOR_SPIKE_USD + EXPECTED_LEDGER_USD + RECOVERY_MAXIMUM_USD),
  }, null, 2));
  if (!execute) return;

  const guard = new BudgetGuard(MAX_BATCH_USD);
  guard.reserve({ id: "authorized-recovery", estimatedUsd: RECOVERY_MAXIMUM_USD });
  const completed: Json[] = [];
  for (const [index, step] of recovery.entries()) {
    console.log(`SUBMIT ${step.id} key=${step.request.idempotencyKey} ceiling=$${step.estimatedUsd.toFixed(4)}`);
    const submitted = await postJson(api, {
      request: step.request,
      worldId: VALIDATION_WORLD_ID,
      maxCostUsd: step.estimatedUsd,
    }, String(step.request.idempotencyKey));
    const job = await pollReady(api, submitted);
    assertFreshReady(step, job);
    const spend = await getJson(api, `/api/jobs/spend/${encodeURIComponent(VALIDATION_WORLD_ID)}`);
    const completedCeiling = roundUsd(recovery.slice(0, index + 1).reduce((sum, item) => sum + item.estimatedUsd, 0));
    const allowed = roundUsd(EXPECTED_LEDGER_USD + completedCeiling);
    if (spend.knownUsd > allowed + 1e-9) throw new Error(`${step.id} raised ledger to ${spend.knownUsd}, above ${allowed}.`);
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
  console.log(JSON.stringify({ status: "recovery_audio_rows_ready_no_level_write", completed, retryCalls: 0, levelWrites: 0, publishCalls: 0 }, null, 2));
}

await main();
