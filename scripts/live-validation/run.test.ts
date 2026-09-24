import { describe, expect, it } from "vitest";
import { BudgetGuard, buildPlan, NARRATION, planTotal } from "./plan.js";
import { assertReadyReuse, parseArgs, renderDryRun, resumePlanTotal, shouldReconcileStoredProviderJob } from "./run.js";

const AUDIO_RESUME_ARGS = [
  "--reuse-photo-id", "photo-existing",
  "--reuse-cutout-asset-id", "cutout-existing",
  "--reuse-ready-job", "cutout=job-cutout",
  "--reuse-ready-job", "style-preview=job-preview",
  "--reuse-ready-job", "alternate-edit=job-alternate",
  "--reuse-ready-job", "mesh=job-mesh",
  "--reuse-ready-job", "quest=job-quest",
  "--skip-postcard",
] as const;

describe("live-validation planner", () => {
  it("keeps the complete batch bounded and covers every claimed capability", () => {
    const plan = buildPlan();
    expect(new Set(plan.map((step) => step.capability))).toEqual(new Set([
      "bg-remove", "kontext-edit", "gpt-image-edit", "rodin-i3d", "gemini-text",
      "music", "mirelo-sfx", "chatterbox-tts", "pixverse-i2v",
    ]));
    expect(plan.filter((step) => step.capability === "mirelo-sfx")).toHaveLength(8);
    expect(planTotal(plan)).toBe(1.4469);
  });

  it("uses provider-supported audio durations while preserving stable identities", () => {
    const plan = buildPlan();
    expect(plan.slice(0, 5).map((step) => step.request.idempotencyKey)).toEqual([
      "oq-live-20260924-cutout",
      "oq-live-20260924-style-preview",
      "oq-live-20260924-alternate-edit",
      "oq-live-20260924-mesh",
      "oq-live-20260924-quest",
    ]);
    expect(plan.find((step) => step.id === "music")?.request).toMatchObject({
      idempotencyKey: "oq-live-20260924-music-v2",
      durationSeconds: 15,
      instrumental: true,
      loop: true,
    });
    expect(plan.filter((step) => step.capability === "mirelo-sfx").map((step) => step.request.durationSeconds))
      .toEqual([15, 3, 3, 3, 3, 3, 3, 3]);
    expect(plan.find((step) => step.id === "narration")?.request).toMatchObject({
      idempotencyKey: "oq-live-20260924-narration",
      text: NARRATION,
      language: "en",
    });
    expect(plan.slice(6).map((step) => step.request.idempotencyKey)).toEqual([
      "oq-live-20260924-ambience",
      "oq-live-20260924-fragment-pickup",
      "oq-live-20260924-portal-activate",
      "oq-live-20260924-checkpoint",
      "oq-live-20260924-fall-respawn",
      "oq-live-20260924-race-start",
      "oq-live-20260924-race-finish",
      "oq-live-20260924-completion",
      "oq-live-20260924-narration",
      "oq-live-20260924-postcard",
    ]);
  });

  it("keeps image formats as preferences while wiring downstream rows by opaque asset id", () => {
    const plan = buildPlan();
    const preview = plan.find((step) => step.id === "style-preview")!;
    const alternate = plan.find((step) => step.id === "alternate-edit")!;
    const mesh = plan.find((step) => step.id === "mesh")!;

    expect(preview.request).toMatchObject({ sourceImageAssetId: "$cutoutAssetId", outputMimeType: "image/png" });
    expect(alternate.request).toMatchObject({ sourceImageAssetId: "$cutoutAssetId", outputMimeType: "image/png" });
    expect(mesh.request).toMatchObject({
      sourceImageAssetIds: ["$cutoutAssetId"],
      styleReferenceAssetId: "$approvedPreviewAssetId",
    });
  });

  it("aborts before reserving a request that crosses the caller guard", () => {
    const guard = new BudgetGuard(0.42);
    guard.reserve({ id: "small", estimatedUsd: 0.0011 });
    expect(() => guard.reserve({ id: "mesh", estimatedUsd: 0.42 })).toThrow(/above --max-usd/);
    expect(guard.reservedUsd).toBe(0.0011);
  });

  it("dry-run prints requests without suggesting they were submitted", () => {
    const args = parseArgs(["--dry-run", "--api", "http://127.0.0.1:8899", "--max-usd", "1.5"]);
    const output = renderDryRun(args, buildPlan());
    expect(output).toContain("No billable request was submitted");
    expect(output).toContain("POST /api/jobs/previews");
    expect(output).toContain("pixverse-i2v");
  });

  it("plans an audio-only resume with rows 1-5 reused and postcard explicitly blocked", () => {
    const args = parseArgs([
      "--dry-run",
      "--max-usd", "3",
      ...AUDIO_RESUME_ARGS,
    ]);
    const plan = buildPlan();
    const output = renderDryRun(args, plan);

    expect(args).toMatchObject({ reusePhotoId: "photo-existing", reuseCutoutAssetId: "cutout-existing", skipPostcard: true });
    expect(resumePlanTotal(args, plan)).toBe(0.4124);
    expect(output).toContain("planned new spend: $0.4124");
    expect(output).toContain("01. cutout -> GET/REUSE /api/jobs/job-cutout | bg-remove | $0.0000");
    expect(output).toContain("05. quest -> GET/REUSE /api/jobs/job-quest | gemini-text | $0.0000");
    expect(output).toContain("06. music -> POST /api/jobs/generate | music | $0.0315");
    expect(output).toContain("16. postcard -> SKIPPED/BLOCKED | pixverse-i2v | $0.0000");
    expect(output).toContain("cap_price is a lower bound rather than an enforceable maximum");
    expect(output).not.toContain('"idempotencyKey":"oq-live-20260924-postcard"');
    expect(output).toContain('\"sourceImageAssetId\":\"photo-existing\"');
    expect(output).toContain('\"sourceImageAssetId\":\"cutout-existing\"');
  });

  it("requires both stored resume ids", () => {
    expect(() => parseArgs(["--reuse-photo-id", "photo-existing"]))
      .toThrow("--reuse-photo-id and --reuse-cutout-asset-id must be supplied together.");
  });

  it("requires a complete ready-job set before classifying rows 1-5 as reused", () => {
    expect(() => parseArgs([
      "--reuse-photo-id", "photo-existing",
      "--reuse-cutout-asset-id", "cutout-existing",
      "--reuse-ready-job", "cutout=job-cutout",
    ])).toThrow(/ready application job ids for all/);
  });

  it("refuses audio-only resume unless postcard is explicitly blocked", () => {
    expect(() => parseArgs(AUDIO_RESUME_ARGS.slice(0, -1))).toThrow(/requires --skip-postcard/);
  });

  it("requires each read-only reused job to be ready and byte-for-byte identical", () => {
    const step = buildPlan().find((item) => item.id === "quest")!;
    const matching = {
      id: "job-quest",
      state: "ready",
      idempotencyKey: step.request.idempotencyKey,
      request: step.request,
      fallbackFired: null,
    };
    expect(() => assertReadyReuse(step, step.request, matching)).not.toThrow();
    expect(() => assertReadyReuse(step, step.request, { ...matching, state: "failed" })).toThrow(/stopped before fresh media submission/);
    expect(() => assertReadyReuse(step, step.request, { ...matching, request: { ...step.request, maxCharacters: 999 } })).toThrow(/byte-for-byte ready match/);
    expect(() => assertReadyReuse(step, step.request, { ...matching, fallbackFired: "fallback-text" })).toThrow(/used fallback/);
  });

  it("reconciles only a stored retryable failure that already has a provider job", () => {
    expect(shouldReconcileStoredProviderJob({
      state: "failed",
      providerJobId: "mjob_existing",
      lastError: { retryable: true },
    })).toBe(true);
    expect(shouldReconcileStoredProviderJob({ state: "generating", providerJobId: "mjob_existing" })).toBe(false);
    expect(shouldReconcileStoredProviderJob({ state: "failed", providerJobId: null, lastError: { retryable: true } })).toBe(false);
    expect(shouldReconcileStoredProviderJob({
      state: "failed",
      providerJobId: "mjob_existing",
      lastError: { retryable: false },
    })).toBe(false);
  });
});
