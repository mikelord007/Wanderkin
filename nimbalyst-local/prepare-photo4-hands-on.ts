import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { LevelExperience, SceneManifest, Vec3 } from "../shared/index.js";
import { validateExperiencePlacements } from "../src/game/placementValidation.js";
import { getCachedAsset } from "../src/scene/loader.js";
import { prepareAsset } from "../src/scene/prepare.js";
import { attachProvenance } from "../src/ui/manifestProvenance.js";
import { sceneManifestSchema } from "../server/levels.js";

const STORAGE = "C:\\Users\\manuj\\code_barely_runs\\Objectquest_worktrees\\sudden-stone\\storage\\live-validation-2026-09-24";
const API = "http://127.0.0.1:18799";
const LEVEL_ID = "live-validation-photo4-20260924-hands-on";
const MESH_JOB_ID = "job_662f0c8a-52f1-4e33-adad-fcff355e014d";
const QUEST_JOB_ID = "job_8df572b8-0ded-4e8b-b524-c3361698a1ca";
const PHOTO_ID = "632f0492-579a-46ff-8436-b7649035fd98";
const CUTOUT_ASSET_ID = "e4bd9b09-4912-44e8-9b71-6f2a6ff6f2c0";
const PREVIEW_ASSET_ID = "4372d056-ec44-49a9-a374-31cfec00f2c7";
const ALTERNATE_ASSET_ID = "12b090df-d46d-4e28-a2e5-da1648c81f67";
const MESH_ASSET_ID = "4c7a5b8a-234a-4fad-bc14-4b8674f08f4d";
const MESH_SHA256 = "f0855519fb1314e14703ef91a7778b6992f2f4c80b64910cfe4781e719b0e24c";
const PREPARE_URL = "http://objectquest.local/photo4.glb";
const OUTPUT = join(process.cwd(), "nimbalyst-local", "prepared-photo4-hands-on.json");

type StoredJob = {
  job: {
    id: string;
    state: string;
    kind: string;
    updatedAt: string;
    providerJobId?: string | null;
    result?: Record<string, any>;
  };
};

function atCheckpoint(position: Vec3, lift: number): Vec3 {
  return [position[0], position[1] + lift, position[2]];
}

async function main(): Promise<void> {
  Object.assign(globalThis, { self: globalThis });
  const jobs = JSON.parse(await readFile(join(STORAGE, "jobs.json"), "utf8")) as Record<string, StoredJob>;
  const meshJob = jobs[MESH_JOB_ID]?.job;
  const questJob = jobs[QUEST_JOB_ID]?.job;
  if (meshJob?.state !== "ready" || questJob?.state !== "ready") {
    throw new Error("The recorded mesh and quest jobs are not both ready.");
  }
  const meshAsset = meshJob.result?.asset;
  const quest = questJob.result?.output?.structured;
  if (meshAsset?.id !== MESH_ASSET_ID || meshAsset?.sha256 !== MESH_SHA256) {
    throw new Error("The stored mesh identity/hash does not match the reviewed evidence.");
  }
  if (!quest?.title || !quest?.intro || !quest?.objective || !quest?.narrationScript) {
    throw new Error("The recovered quest is missing a required field.");
  }

  const meshPath = join(STORAGE, "assets", `${MESH_SHA256}.glb`);
  const meshBytes = await readFile(meshPath);
  const actualHash = createHash("sha256").update(meshBytes).digest("hex");
  if (actualHash !== MESH_SHA256 || meshBytes.byteLength !== 4_680_412) {
    throw new Error(`Stored GLB integrity mismatch: ${actualHash}, ${meshBytes.byteLength} bytes.`);
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === PREPARE_URL) {
      return new Response(meshBytes, {
        status: 200,
        headers: {
          "content-length": String(meshBytes.byteLength),
          "content-type": "model/gltf-binary",
        },
      });
    }
    return originalFetch(input, init);
  };

  const photo = {
    id: PHOTO_ID,
    url: `/api/photos/files/${PHOTO_ID}.jpg`,
    order: 1,
    label: "Reviewed representative source photo 4",
  };
  const prepared = await prepareAsset(PREPARE_URL, {
    levelId: LEVEL_ID,
    name: quest.title,
    seed: "live-validation-photo4-20260924-hands-on-v1",
    checkpointCount: 5,
    courseCandidateCount: 2,
    provenance: meshAsset.provenance,
    sha256: MESH_SHA256,
    photos: [photo],
    manifestAssetUrl: meshAsset.url,
  });
  globalThis.fetch = originalFetch;

  const points = prepared.manifest.checkpoints.map((checkpoint) => checkpoint.position);
  if (points.length < 1) throw new Error("Preparation produced no checkpoint anchors.");
  const point = (index: number): Vec3 => points[Math.min(index, points.length - 1)]!;
  const fragmentIds = ["fragment-red", "fragment-yellow", "fragment-blue"];
  const colors = ["#FF4D6D", "#FFD93D", "#4D96FF"];
  const experience: LevelExperience = {
    schemaVersion: 1,
    style: {
      id: "cartoon",
      definitionVersion: 1,
      atmosphere: "A welcoming miniature room-corner island.",
      approvedPreviewAssetId: PREVIEW_ASSET_ID,
    },
    mode: {
      kind: "collect",
      requiredCollectibleIds: fragmentIds,
      requiredCount: fragmentIds.length,
      finishPortalId: "finish-portal",
      restorationSteps: [1 / 3, 2 / 3, 1],
    },
    quest: { schemaVersion: 1, ...quest },
    collectibles: fragmentIds.map((id, order) => ({
      id,
      kind: "color-fragment" as const,
      transform: {
        position: atCheckpoint(point(order), 0.3375),
        rotation: [0, 0, 0, 1],
        scale: [0.22, 0.22, 0.22],
      },
      triggerRadius: 0.45,
      color: colors[order]!,
      order,
      restorationAmount: order === 2 ? 0.3333333334 : 0.3333333333,
    })),
    finishPortal: {
      id: "finish-portal",
      kind: "finish-portal",
      transform: {
        position: atCheckpoint(point(Math.min(3, points.length - 1)), 0.35),
        rotation: [0, 0, 0, 1],
        scale: [0.8, 1.2, 0.25],
      },
      triggerRadius: 0.75,
      activation: "all-required-collectibles",
      inactiveColor: "#6D6780",
      activeColor: "#9B5DE5",
    },
    initialColorRestoration: 0,
  };

  const attached = attachProvenance(prepared.manifest, meshAsset, [photo]);
  const withExperience: SceneManifest = {
    ...attached,
    name: quest.title,
    experience,
    media: { audio: [], video: [] },
    workflow: {
      schemaVersion: 1,
      reviewedImageAssetId: CUTOUT_ASSET_ID,
      selectedReference: {
        photoIds: [PHOTO_ID],
        reviewedImageAssetId: CUTOUT_ASSET_ID,
        approvedPreviewAssetId: PREVIEW_ASSET_ID,
        style: "cartoon",
        mode: "collect",
        atmosphere: experience.style.atmosphere!,
      },
      jobs: [
        { kind: "image-edit", jobId: "job_737935e2-c54b-4c18-a6a6-782a7a4c69c8", status: "ready", providerJobId: "mjob_a2426904c928", updatedAt: jobs["job_737935e2-c54b-4c18-a6a6-782a7a4c69c8"]!.job.updatedAt, consumedByAssetId: CUTOUT_ASSET_ID },
        { kind: "image-edit", jobId: "job_ef2fde65-65e2-4d16-b8df-e75d53c93d85", status: "ready", providerJobId: "mjob_d3d1797a1657", updatedAt: jobs["job_ef2fde65-65e2-4d16-b8df-e75d53c93d85"]!.job.updatedAt, consumedByAssetId: PREVIEW_ASSET_ID },
        { kind: "image-edit", jobId: "job_f9bcf342-6254-4b38-9fa0-d32c797cb89f", status: "ready", providerJobId: "mjob_4a0b2bde417b", updatedAt: jobs["job_f9bcf342-6254-4b38-9fa0-d32c797cb89f"]!.job.updatedAt, consumedByAssetId: ALTERNATE_ASSET_ID },
        { kind: "image-to-3d", jobId: MESH_JOB_ID, status: "ready", providerJobId: meshJob.providerJobId!, updatedAt: meshJob.updatedAt, consumedByAssetId: MESH_ASSET_ID },
        { kind: "text", jobId: QUEST_JOB_ID, status: "ready", providerJobId: questJob.providerJobId!, updatedAt: questJob.updatedAt },
      ],
    },
  };

  const loaded = getCachedAsset(PREPARE_URL);
  if (!loaded) throw new Error("Prepared GLB was not retained for conservative validation.");
  const placement = validateExperiencePlacements(
    withExperience,
    new Map([[MESH_ASSET_ID, loaded.triangles]]),
  );
  const manifest: SceneManifest = { ...withExperience, courseValidation: placement.validation };
  const parsed = sceneManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(`Prepared manifest is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  }

  await writeFile(OUTPUT, `${JSON.stringify({ manifest, placementIssues: placement.issues }, null, 2)}\n`, "utf8");

  let saved: SceneManifest | null = null;
  let saveError: string | null = null;
  try {
    const health = await originalFetch(`${API}/api/health`, { signal: AbortSignal.timeout(2_000) });
    if (!health.ok) throw new Error(`health returned ${health.status}`);
    const response = await originalFetch(`${API}/api/levels`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(manifest),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json() as SceneManifest & { message?: string };
    if (!response.ok) throw new Error(`${response.status}: ${body.message ?? "save failed"}`);
    saved = body;
  } catch (error) {
    saveError = error instanceof Error ? error.message : String(error);
  }

  console.log(JSON.stringify({
    prepared: true,
    manifestPath: OUTPUT,
    targetLevelId: LEVEL_ID,
    courseValidation: manifest.courseValidation,
    placementIssues: placement.issues,
    checkpoints: manifest.checkpoints.length,
    helpers: manifest.entities.filter((entity) => entity.kind !== "generated-mesh").length,
    saved: Boolean(saved),
    savedLevelId: saved?.levelId ?? null,
    saveError,
  }, null, 2));
}

await main();
