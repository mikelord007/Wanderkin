#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { BudgetGuard, buildPlan, planTotal, VALIDATION_WORLD_ID, type PlannedRequest } from "./plan.js";

type Json = Record<string, any>;
type Args = {
  api: string;
  dryRun: boolean;
  maxUsd: number;
  photo: string;
  skipPostcard: boolean;
  includeAlternateEdit: boolean;
  reusePhotoId?: string;
  reuseCutoutAssetId?: string;
  reuseReadyJobIds: Partial<Record<ReusableStepId, string>>;
  publishLevelId?: string;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TERMINAL = new Set(["ready", "failed"]);
const REUSABLE_STEPS = ["cutout", "style-preview", "alternate-edit", "mesh", "quest"] as const;
type ReusableStepId = typeof REUSABLE_STEPS[number];
const POSTCARD_BLOCK_REASON =
  "The current create_media wrapper cannot pin postcard resolution or audio, and cap_price is a lower bound rather than an enforceable maximum.";

export function parseArgs(argv: readonly string[]): Args {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const max = Number(value("--max-usd") ?? "1.50");
  if (!Number.isFinite(max) || max < 0) throw new Error("--max-usd must be a non-negative number.");
  const reusePhotoId = value("--reuse-photo-id");
  const reuseCutoutAssetId = value("--reuse-cutout-asset-id");
  if (Boolean(reusePhotoId) !== Boolean(reuseCutoutAssetId)) {
    throw new Error("--reuse-photo-id and --reuse-cutout-asset-id must be supplied together.");
  }
  const reuseReadyJobIds: Partial<Record<ReusableStepId, string>> = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--reuse-ready-job") continue;
    const mapping = argv[index + 1];
    const separator = mapping?.indexOf("=") ?? -1;
    const step = separator > 0 ? mapping!.slice(0, separator) : "";
    const jobId = separator > 0 ? mapping!.slice(separator + 1) : "";
    if (!REUSABLE_STEPS.includes(step as ReusableStepId) || !jobId) {
      throw new Error(`--reuse-ready-job must be one of ${REUSABLE_STEPS.join(", ")} followed by =<application-job-id>.`);
    }
    if (reuseReadyJobIds[step as ReusableStepId]) {
      throw new Error(`--reuse-ready-job was supplied more than once for ${step}.`);
    }
    reuseReadyJobIds[step as ReusableStepId] = jobId;
  }
  const reuseCount = Object.keys(reuseReadyJobIds).length;
  const skipPostcard = argv.includes("--skip-postcard") || argv.includes("--no-postcard");
  if (reuseCount > 0 && reuseCount !== REUSABLE_STEPS.length) {
    throw new Error(`Audio-only resume requires ready application job ids for all of: ${REUSABLE_STEPS.join(", ")}.`);
  }
  if (reuseCount > 0 && (!reusePhotoId || !reuseCutoutAssetId)) {
    throw new Error("Audio-only resume requires --reuse-photo-id and --reuse-cutout-asset-id.");
  }
  if (reuseCount > 0 && argv.includes("--no-alternate-edit")) {
    throw new Error("Audio-only resume cannot omit the already completed alternate-edit row.");
  }
  if (reuseCount > 0 && !skipPostcard) {
    throw new Error("Audio-only resume requires --skip-postcard because row 16 has no enforceable price maximum.");
  }
  return {
    api: (value("--api") ?? "http://127.0.0.1:8787").replace(/\/$/, ""),
    dryRun: argv.includes("--dry-run"),
    maxUsd: max,
    photo: resolve(value("--photo") ?? resolve(ROOT, "public/samples/photo-4.jpg")),
    skipPostcard,
    includeAlternateEdit: !argv.includes("--no-alternate-edit"),
    reuseReadyJobIds,
    ...(reusePhotoId && reuseCutoutAssetId ? { reusePhotoId, reuseCutoutAssetId } : {}),
    ...(value("--publish-level-id") ? { publishLevelId: value("--publish-level-id") } : {}),
  };
}

async function responseJson(response: Response): Promise<Json> {
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw Object.assign(new Error(`${response.status} ${body.message ?? response.statusText}`), { status: response.status, body });
  return body;
}

async function getJson(api: string, path: string): Promise<Json> {
  return responseJson(await fetch(`${api}${path}`));
}

async function postJson(api: string, path: string, body: unknown, headers: Record<string, string> = {}): Promise<Json> {
  return responseJson(await fetch(`${api}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));
}

function replacePlaceholders(value: unknown, values: Record<string, string>): unknown {
  if (typeof value === "string") return values[value] ?? value;
  if (Array.isArray(value)) return value.map((item) => replacePlaceholders(item, values));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePlaceholders(item, values)]));
  return value;
}

async function pollJob(api: string, initial: Json): Promise<Json> {
  let job = initial;
  const deadline = Date.now() + 20 * 60_000;
  while (!TERMINAL.has(job.state)) {
    if (Date.now() > deadline) throw new Error(`Timed out polling application job ${job.id}; do not resubmit—resume by job id.`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 4_000));
    job = await getJson(api, `/api/jobs/${encodeURIComponent(job.id)}`);
  }
  return job;
}

export function shouldReconcileStoredProviderJob(job: Json): boolean {
  return job.state === "failed" && typeof job.providerJobId === "string" && job.providerJobId.length > 0
    && job.lastError?.retryable !== false;
}

export function assertReadyReuse(step: Pick<PlannedRequest, "id">, request: Json, job: Json): void {
  if (job.state !== "ready" || job.idempotencyKey !== request.idempotencyKey || !isDeepStrictEqual(job.request, request)) {
    throw new Error(
      `Stored ${step.id} job ${job.id ?? "<unknown>"} is not a byte-for-byte ready match for ${request.idempotencyKey}; stopped before fresh media submission.`,
    );
  }
  if (job.fallbackFired) {
    throw new Error(`Stored ${step.id} job ${job.id ?? "<unknown>"} used fallback ${job.fallbackFired}; stopped before fresh media submission.`);
  }
}

function isReadyReuse(args: Args, step: PlannedRequest): step is PlannedRequest & { id: ReusableStepId } {
  return REUSABLE_STEPS.includes(step.id as ReusableStepId)
    && Boolean(args.reuseReadyJobIds[step.id as ReusableStepId]);
}

function isBlockedPostcard(args: Args, step: PlannedRequest): boolean {
  return args.skipPostcard && step.id === "postcard";
}

export function resumePlanTotal(args: Args, plan: readonly PlannedRequest[]): number {
  return planTotal(plan.filter((step) => !isReadyReuse(args, step) && !isBlockedPostcard(args, step)));
}

function evidenceFor(step: PlannedRequest, job: Json, startedAt: number): Json {
  const result = job.result;
  const asset = result?.asset;
  const text = result?.kind === "text" ? JSON.stringify(result.output?.structured ?? result.output?.text ?? "") : undefined;
  return {
    step: step.id,
    capability: step.capability,
    applicationJobId: job.id,
    providerJobId: job.providerJobId ?? null,
    servedCapability: job.provenance?.servedCapability ?? job.capabilityUsed ?? null,
    servedModel: job.provenance?.servedModel ?? null,
    fallbackFired: job.fallbackFired ?? null,
    wallMilliseconds: Date.now() - startedAt,
    providerTimings: job.provenance?.timings ?? null,
    estimatedUsd: step.estimatedUsd,
    reportedCost: job.provenance?.reportedCost ?? null,
    artifact: asset ? { id: asset.id, url: asset.url, sha256: asset.sha256, sizeBytes: asset.sizeBytes, mimeType: asset.mimeType ?? "model/gltf-binary" } :
      text !== undefined ? { kind: "text", sha256: createHash("sha256").update(text).digest("hex") } : null,
  };
}

export function renderDryRun(args: Args, plan: readonly PlannedRequest[]): string {
  const plannedSpend = resumePlanTotal(args, plan);
  const dryRunValues: Record<string, string> = {
    ...(args.reusePhotoId ? { $uploadedPhotoId: args.reusePhotoId } : {}),
    ...(args.reuseCutoutAssetId ? { $cutoutAssetId: args.reuseCutoutAssetId } : {}),
  };
  const lines = [
    `ObjectQuest live validation DRY RUN`,
    `API: ${args.api}`,
    `Input: ${args.photo}`,
    `World: ${VALIDATION_WORLD_ID}`,
    `Guard: $${args.maxUsd.toFixed(4)}; planned new spend: $${plannedSpend.toFixed(4)}; retries: 0 required`,
  ];
  for (const [index, step] of plan.entries()) {
    const reuse = isReadyReuse(args, step);
    const blockedPostcard = isBlockedPostcard(args, step);
    if (blockedPostcard) {
      lines.push(`${String(index + 1).padStart(2, "0")}. ${step.id} -> SKIPPED/BLOCKED | ${step.capability} | $0.0000`);
      lines.push(`    Reason: ${POSTCARD_BLOCK_REASON}`);
      continue;
    }
    const request = replacePlaceholders(step.request, dryRunValues);
    const action = reuse
      ? `GET/REUSE /api/jobs/${args.reuseReadyJobIds[step.id as ReusableStepId]}`
      : `POST ${step.purpose === "style-preview" ? "/api/jobs/previews" : "/api/jobs/generate"}`;
    lines.push(`${String(index + 1).padStart(2, "0")}. ${step.id} -> ${action} | ${step.capability} | $${reuse ? "0.0000" : step.estimatedUsd.toFixed(4)}`);
    lines.push(`    ${JSON.stringify({ request, worldId: VALIDATION_WORLD_ID, maxCostUsd: step.estimatedUsd })}`);
  }
  lines.push(Object.keys(args.reuseReadyJobIds).length === REUSABLE_STEPS.length
    ? "Then: verify rows 1-5 read-only -> execute fresh audio rows -> save draft level -> POST publish (or record explicit repair-required response). No billable request was submitted."
    : "Then: approve preview -> save draft level -> POST publish (or record explicit repair-required response). No billable request was submitted.");
  return lines.join("\n");
}

async function appendEvidence(run: Json): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const path = resolve(ROOT, `docs/evidence/live-validation-${date}.json`);
  await mkdir(dirname(path), { recursive: true });
  let document: Json = { schemaVersion: 1, runs: [] };
  try { document = JSON.parse(await readFile(path, "utf8")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  document.runs = [...(Array.isArray(document.runs) ? document.runs : []), run];
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return path;
}

async function publishReviewed(api: string, levelId: string): Promise<void> {
  const publication = await postJson(api, `/api/levels/${encodeURIComponent(levelId)}/publish`, {
    challenge: { kind: "completion" }, includesSourcePhotos: false,
  });
  console.log(`Published ${levelId}: share ${publication.shareId}`);
}

async function saveDraftAndAttemptPublish(api: string, jobs: Map<string, Json>, uploadedPhoto: Json): Promise<Json> {
  const template = JSON.parse(await readFile(resolve(ROOT, "shared/fixtures/lost-colors.json"), "utf8")) as Json;
  const mesh = jobs.get("mesh")?.result?.asset;
  if (!mesh) throw new Error("Mesh result is missing; cannot save the level.");
  const quest = jobs.get("quest")?.result?.output?.structured;
  const now = new Date().toISOString();
  const manifest = {
    ...template,
    levelId: VALIDATION_WORLD_ID,
    name: typeof quest?.title === "string" ? quest.title : "Live Validation Room Corner",
    createdAt: now,
    updatedAt: now,
    assets: [mesh],
    photos: [{ ...uploadedPhoto, label: "Bundled representative source photo 4" }],
    entities: template.entities.map((entity: Json) => entity.kind === "generated-mesh" ? { ...entity, assetId: mesh.id } : entity),
    courseValidation: {
      status: "unvalidated",
      method: "pending browser traversal on this newly generated mesh",
      uncertaintyNotes: "Use the editor repair path if any collectible, checkpoint, or portal is unreachable; do not publish until validated.",
    },
    experience: { ...template.experience, ...(quest ? { quest: { schemaVersion: 1, ...quest } } : {}) },
    media: {
      audio: [...jobs.values()].flatMap((job) => ["music", "sfx", "tts"].includes(job.result?.kind) ? [job.result.asset] : []),
      video: [...jobs.values()].flatMap((job) => job.result?.kind === "video" ? [job.result.asset] : []),
    },
  };
  const saved = await responseJson(await fetch(`${api}/api/levels`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(manifest),
  }));
  try {
    const publication = await postJson(api, `/api/levels/${encodeURIComponent(saved.levelId)}/publish`, {
      challenge: { kind: "completion" }, includesSourcePhotos: false,
    });
    return { levelId: saved.levelId, status: "published", shareId: publication.shareId };
  } catch (error) {
    const detail = error as Error & { status?: number; body?: Json };
    if (detail.status === 422) return { levelId: saved.levelId, status: "repair-required", error: detail.message, issues: detail.body?.issues ?? [] };
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const health = await getJson(args.api, "/api/health");
  if (health.status !== "ok") throw new Error(`API health check failed: ${JSON.stringify(health)}`);
  if (args.publishLevelId) { await publishReviewed(args.api, args.publishLevelId); return; }
  const plan = buildPlan({ includePostcard: true, includeAlternateEdit: args.includeAlternateEdit });
  const guard = new BudgetGuard(args.maxUsd);
  const plannedSpend = resumePlanTotal(args, plan);
  if (plannedSpend > args.maxUsd) guard.reserve({ id: "complete-batch", estimatedUsd: plannedSpend });
  if (args.dryRun) { console.log(renderDryRun(args, plan)); return; }

  let uploadedPhoto: Json;
  if (args.reusePhotoId && args.reuseCutoutAssetId) {
    uploadedPhoto = {
      id: args.reusePhotoId,
      url: `/api/photos/files/${args.reusePhotoId}.jpg`,
      order: 1,
      label: "Bundled representative source photo 4",
    };
  } else {
    const form = new FormData();
    const bytes = await readFile(args.photo);
    form.append("photos", new Blob([bytes], { type: "image/jpeg" }), "photo-4.jpg");
    const uploaded = await responseJson(await fetch(`${args.api}/api/uploads`, { method: "POST", body: form }));
    uploadedPhoto = uploaded[0];
    if (!uploadedPhoto?.id) throw new Error("Upload did not return a photo id.");
  }

  const values: Record<string, string> = {
    "$uploadedPhotoId": uploadedPhoto.id,
    ...(args.reuseCutoutAssetId ? { "$cutoutAssetId": args.reuseCutoutAssetId } : {}),
  };
  const jobs = new Map<string, Json>();
  const evidence: Json[] = [];
  const blocked: Json[] = plan.filter((step) => isBlockedPostcard(args, step)).map((step) => ({
    step: step.id,
    status: "blocked",
    reason: POSTCARD_BLOCK_REASON,
    quotedLowerBoundUsd: step.estimatedUsd,
    reservedUsd: 0,
    applicationJobId: null,
    providerJobId: null,
  }));
  for (const step of plan) {
    if (isBlockedPostcard(args, step)) {
      continue;
    }
    const request = replacePlaceholders(step.request, values) as Json;
    if (isReadyReuse(args, step)) {
      const jobId = args.reuseReadyJobIds[step.id];
      const job = await getJson(args.api, `/api/jobs/${encodeURIComponent(jobId!)}`);
      assertReadyReuse(step, request, job);
      jobs.set(step.id, job);
      evidence.push({ ...evidenceFor(step, job, Date.now()), status: "reused", estimatedUsd: 0, originalEstimatedUsd: step.estimatedUsd });
      const reusedAssetId = job.result?.asset?.id;
      if (step.id === "cutout" && reusedAssetId) values.$cutoutAssetId = reusedAssetId;
      if (step.id === "style-preview") {
        if (!reusedAssetId) throw new Error(`Stored style-preview job ${jobId} omitted its asset id.`);
        values.$approvedPreviewAssetId = reusedAssetId;
      }
      continue;
    }
    guard.reserve(step);
    const startedAt = Date.now();
    const path = step.purpose === "style-preview" ? "/api/jobs/previews" : "/api/jobs/generate";
    const submitted = await postJson(args.api, path, { request, worldId: VALIDATION_WORLD_ID, maxCostUsd: step.estimatedUsd }, { "Idempotency-Key": request.idempotencyKey });
    let submittedJob = submitted.job ?? submitted;
    if (shouldReconcileStoredProviderJob(submittedJob)) {
      submittedJob = await postJson(args.api, `/api/jobs/${encodeURIComponent(submittedJob.id)}/retry`, {});
    }
    const job = await pollJob(args.api, submittedJob);
    jobs.set(step.id, job);
    evidence.push(evidenceFor(step, job, startedAt));
    if (job.state !== "ready" || job.fallbackFired) {
      const ledger = await getJson(args.api, `/api/jobs/spend/${encodeURIComponent(VALIDATION_WORLD_ID)}`);
      const evidencePath = await appendEvidence({
        runId: `objectquest-live-${Date.now()}`,
        status: "failed",
        failedStep: step.id,
        completedAt: new Date().toISOString(),
        maxUsd: args.maxUsd,
        plannedMaximumUsd: plannedSpend,
        reservedByRunnerUsd: guard.reservedUsd,
        ledger,
        jobs: evidence,
        blocked,
      });
      const reason = job.state !== "ready"
        ? (job.lastError?.message ?? "job did not become ready")
        : `requested ${step.capability} but fallback ${job.fallbackFired} served`;
      throw new Error(`Validation stopped at ${step.id}: ${reason}. Partial evidence: ${evidencePath}`);
    }
    const assetId = job.result?.asset?.id;
    if (step.id === "cutout" && assetId) values.$cutoutAssetId = assetId;
    if (step.id === "style-preview") {
      const cacheKey = submitted.cacheKey;
      if (!cacheKey || !assetId) throw new Error("Style preview response omitted its cache key or asset id.");
      await postJson(args.api, `/api/jobs/preview-cache/${cacheKey}/approve`, { jobId: job.id });
      values.$approvedPreviewAssetId = assetId;
    }
  }
  const level = await saveDraftAndAttemptPublish(args.api, jobs, uploadedPhoto);
  const ledger = await getJson(args.api, `/api/jobs/spend/${encodeURIComponent(VALIDATION_WORLD_ID)}`);
  const path = await appendEvidence({
    runId: `objectquest-live-${Date.now()}`,
    startedFrom: args.photo,
    completedAt: new Date().toISOString(),
    maxUsd: args.maxUsd,
    plannedMaximumUsd: plannedSpend,
    reservedByRunnerUsd: guard.reservedUsd,
    ledger,
    jobs: evidence,
    blocked,
    level,
    status: blocked.length > 0 ? "required-audio-ready-postcard-blocked" : "complete",
  });
  console.log(blocked.length > 0
    ? `Required audio rows ready; postcard remains blocked. Evidence: ${path}`
    : `Validation batch complete. Evidence: ${path}`);
  console.log(JSON.stringify({ plannedMaximumUsd: plannedSpend, ledger, blocked, level }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
