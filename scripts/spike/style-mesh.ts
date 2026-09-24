/**
 * Bounded ObjectQuest style-to-mesh spike.
 *
 * This deliberately lives outside product code. It uses the existing
 * server-side MCP client and upload tool, persists the first hosted URL before
 * any paid call, and uses stable idempotency keys so a manual rerun cannot
 * double-bill the same logical generation within the provider's retention
 * window.
 *
 * Usage:
 *   npx tsx scripts/spike/style-mesh.ts discover
 *   npx tsx scripts/spike/style-mesh.ts run
 *
 * `run` makes at most one Kontext edit and one Rodin call. It never retries a
 * paid call automatically and never accepts a fallback capability.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { mcpClient } from "../../server/livepeer/mcpClient.js";

const ROOT = resolve(import.meta.dirname, "../..");
const INPUT_PATH = resolve(ROOT, "public/samples/photo-4.jpg");
const OUTPUT_DIR = resolve(ROOT, "scripts/spike/output");
const STATE_PATH = resolve(OUTPUT_DIR, "style-mesh-state.json");
const STYLE_PATH = resolve(OUTPUT_DIR, "photo-4-cartoon.png");
const MESH_PATH = resolve(OUTPUT_DIR, "photo-4-cartoon-rodin.glb");

const SESSION_ID = "objectquest_v2_worker3_style_spike_20260924";
const STYLE_IDEMPOTENCY_KEY = "objectquest_v2_style_spike_photo4_cartoon_v1";
const MESH_IDEMPOTENCY_KEY = "objectquest_v2_style_spike_photo4_cartoon_rodin_v1";
const HARD_CAP_USD = 1.5;

const STYLE_PROMPT = [
  "Restyle this exact photographed room-corner furniture arrangement as a clean colorful cartoon miniature world.",
  "Preserve the sofa, desk, laptop, door, camera viewpoint, proportions, placement, and recognizable silhouettes.",
  "Use bold simplified colors, crisp cel-shaded forms, subtle dark contour lines, and playful warm daylight.",
  "Do not add or remove furniture, do not change the composition, and include no text, logos, or characters.",
].join(" ");

const MESH_PROMPT = [
  "Reconstruct the central sofa-and-desk furniture arrangement from this image as a single navigable 3D asset.",
  "Preserve its recognizable cartoon shapes and colors. Keep broad horizontal surfaces usable and avoid adding scenery or text.",
].join(" ");

interface CapabilityDescription {
  name?: string;
  found?: boolean;
  availability?: string;
  status?: string;
  health?: string;
  display_price_usd?: number | null;
  effective_cost_usd?: number | null;
  model_id?: string;
  invoke_via?: string;
  fallback_chain?: string[];
}

interface MediaResponse {
  job_id?: string;
  status?: string;
  url?: string | null;
  capability?: string | null;
  capability_used?: string | null;
  requested_capability?: string | null;
  fallback_fired?: unknown;
  served_model_id?: string;
  idempotency_replay?: boolean;
  cost_usd_estimated?: number | null;
  cost_paid_usd?: number | null;
  cost_disposition?: string;
  billable_units?: number;
  billable_units_source?: string;
  elapsed_ms?: number | null;
  error?: unknown;
  error_code?: string | null;
}

interface RecordedJob {
  requestedCapability: string;
  idempotencyKey: string;
  descriptionAtSubmit: CapabilityDescription;
  submit: MediaResponse;
  final?: MediaResponse;
  outputPath?: string;
  outputBytes?: number;
  outputSha256?: string;
}

interface SpikeState {
  inputPath: string;
  inputSha256?: string;
  inputUploadUrl?: string;
  style?: RecordedJob;
  mesh?: RecordedJob;
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "discover";
  await mkdir(OUTPUT_DIR, { recursive: true });

  if (command === "discover") {
    for (const name of ["kontext-edit", "rodin-i3d"]) {
      const description = await describe(name);
      console.log(JSON.stringify(description, null, 2));
    }
    return;
  }
  if (command !== "run") {
    throw new Error(`Unknown command "${command}"; expected "discover" or "run".`);
  }

  const state = await readState();
  const input = await readFile(INPUT_PATH);
  state.inputPath = relativeToRoot(INPUT_PATH);
  state.inputSha256 = sha256(input);

  if (!state.inputUploadUrl) {
    const uploaded = await mcpClient.callTool<{ url?: string }>("upload", {
      data: input.toString("base64"),
      mime_type: "image/jpeg",
      kind: "image",
      filename: basename(INPUT_PATH),
    });
    if (!uploaded.url) throw new Error("Livepeer upload returned no URL for the sample photo.");
    state.inputUploadUrl = uploaded.url;
    await writeState(state);
  }

  if (!state.style?.final?.url) {
    state.style = await createAndDownload({
      capability: "kontext-edit",
      idempotencyKey: STYLE_IDEMPOTENCY_KEY,
      sourceUrl: state.inputUploadUrl,
      prompt: STYLE_PROMPT,
      outputPath: STYLE_PATH,
      state,
      stateKey: "style",
    });
    await writeState(state);
  }

  const styledUrl = state.style.final?.url;
  if (!styledUrl) throw new Error("Styled image job completed without a URL.");

  if (!state.mesh?.final?.url) {
    state.mesh = await createAndDownload({
      capability: "rodin-i3d",
      idempotencyKey: MESH_IDEMPOTENCY_KEY,
      sourceUrl: styledUrl,
      prompt: MESH_PROMPT,
      outputPath: MESH_PATH,
      state,
      stateKey: "mesh",
    });
    await writeState(state);
  }

  console.log(JSON.stringify(redactHostedUrls(state), null, 2));
}

async function createAndDownload(options: {
  capability: "kontext-edit" | "rodin-i3d";
  idempotencyKey: string;
  sourceUrl: string;
  prompt: string;
  outputPath: string;
  state: SpikeState;
  stateKey: "style" | "mesh";
}): Promise<RecordedJob> {
  // Required immediately before each paid call: this is both the health gate
  // and the fresh price used by the hard-cap calculation.
  const description = await describe(options.capability);
  assertAvailable(description);
  const price = description.effective_cost_usd ?? description.display_price_usd;
  if (price === null || price === undefined) {
    throw new Error(`${options.capability} has no reportable price; unknown cost is not zero.`);
  }
  const alreadyCommitted = recordedCost(options.state);
  if (alreadyCommitted + price > HARD_CAP_USD) {
    throw new Error(
      `Spike hard cap exceeded: recorded $${alreadyCommitted.toFixed(4)} + ` +
        `${options.capability} $${price.toFixed(4)} > $${HARD_CAP_USD.toFixed(2)}.`,
    );
  }

  const previous = options.state[options.stateKey];
  let submit = previous?.submit;
  if (!submit?.job_id && !submit?.url) {
    submit = await mcpClient.callTool<MediaResponse>(
      "create_media",
      {
        action: "generate",
        model_override: options.capability,
        source_url: options.sourceUrl,
        prompt: options.prompt,
        async: true,
        persist: false,
        idempotency_key: options.idempotencyKey,
        session_id: SESSION_ID,
      },
      { timeoutMs: 30_000 },
    );
  }

  assertRequestedCapability(options.capability, submit);
  const record: RecordedJob = {
    requestedCapability: options.capability,
    idempotencyKey: options.idempotencyKey,
    descriptionAtSubmit: description,
    submit,
    ...(previous?.final ? { final: previous.final } : {}),
  };
  options.state[options.stateKey] = record;
  // Persist the job id before polling. A rerun resumes this exact job and never
  // submits a fresh paid request automatically.
  await writeState(options.state);

  const final = submit.url ? submit : await pollJob(submit.job_id);
  assertRequestedCapability(options.capability, final);
  if (!final.url) throw new Error(`${options.capability} completed without an output URL.`);
  record.final = final;
  await writeState(options.state);

  const bytes = new Uint8Array(await fetchBytes(final.url));
  await writeFile(options.outputPath, bytes);
  record.outputPath = relativeToRoot(options.outputPath);
  record.outputBytes = bytes.byteLength;
  record.outputSha256 = sha256(bytes);
  return record;
}

async function describe(name: string): Promise<CapabilityDescription> {
  return mcpClient.callTool<CapabilityDescription>(
    "describe_capability",
    { name },
    { timeoutMs: 20_000 },
  );
}

function assertAvailable(description: CapabilityDescription): void {
  const health = description.health?.toLowerCase();
  if (!description.found || description.availability !== "available" || description.status !== "active") {
    throw new Error(`${description.name ?? "Capability"} is not available and active: ${JSON.stringify(description)}`);
  }
  if (health === "degraded" || health === "down" || health === "critical") {
    throw new Error(`${description.name} reports degraded health (${description.health}); spike stopped.`);
  }
}

function assertRequestedCapability(requested: string, response: MediaResponse): void {
  if (response.error) {
    throw new Error(`${requested} failed (${response.error_code ?? "unknown"}): ${String(response.error)}`);
  }
  const fallback = response.fallback_fired;
  if (fallback !== null && fallback !== undefined && fallback !== false && fallback !== "") {
    throw new Error(`${requested} fired fallback ${JSON.stringify(fallback)}; result rejected.`);
  }
  const used = response.capability_used ?? response.capability ?? response.requested_capability;
  if (used && used !== requested) {
    throw new Error(`${requested} was requested but ${used} was reported; result rejected.`);
  }
}

async function pollJob(jobId: string | undefined): Promise<MediaResponse> {
  if (!jobId) throw new Error("Async create_media response returned no job id.");
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    const status = await mcpClient.callTool<MediaResponse>(
      "get_create_media",
      { job_id: jobId },
      { timeoutMs: 20_000 },
    );
    const normalized = status.status?.toLowerCase();
    if (["done", "completed", "succeeded", "ok"].includes(normalized ?? "")) return status;
    if (["failed", "error", "cancelled"].includes(normalized ?? "")) {
      throw new Error(`Job ${jobId} ${normalized}: ${String(status.error ?? status.error_code ?? "unknown error")}`);
    }
    await delay(5_000);
  }
  throw new Error(`Job ${jobId} did not finish within 12 minutes; rerun resumes polling without a new paid call.`);
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download output: HTTP ${response.status}`);
  return response.arrayBuffer();
}

function recordedCost(state: SpikeState): number {
  return ([state.style, state.mesh] as const).reduce((sum, job) => {
    if (!job) return sum;
    const response = job.final ?? job.submit;
    const reported = response.cost_paid_usd ?? response.cost_usd_estimated;
    const described = job.descriptionAtSubmit.effective_cost_usd ?? job.descriptionAtSubmit.display_price_usd;
    return sum + (reported ?? described ?? 0);
  }, 0);
}

async function readState(): Promise<SpikeState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8")) as SpikeState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { inputPath: relativeToRoot(INPUT_PATH) };
    throw error;
  }
}

async function writeState(state: SpikeState): Promise<void> {
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function redactHostedUrls(state: SpikeState): SpikeState {
  return JSON.parse(
    JSON.stringify(state, (key, value) =>
      (key === "inputUploadUrl" || key === "url") && typeof value === "string" ? "[recorded locally]" : value,
    ),
  ) as SpikeState;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function relativeToRoot(path: string): string {
  return path.slice(ROOT.length + 1).replaceAll("\\", "/");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
