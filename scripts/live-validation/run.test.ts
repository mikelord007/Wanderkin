import { describe, expect, it } from "vitest";
import { BudgetGuard, buildPlan, planTotal } from "./plan.js";
import { parseArgs, renderDryRun, shouldReconcileStoredProviderJob } from "./run.js";

describe("live-validation planner", () => {
  it("keeps the complete batch bounded and covers every claimed capability", () => {
    const plan = buildPlan();
    expect(new Set(plan.map((step) => step.capability))).toEqual(new Set([
      "bg-remove", "kontext-edit", "gpt-image-edit", "rodin-i3d", "gemini-text",
      "music", "mirelo-sfx", "chatterbox-tts", "pixverse-i2v",
    ]));
    expect(plan.filter((step) => step.capability === "mirelo-sfx")).toHaveLength(8);
    expect(planTotal(plan)).toBe(1.4259);
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
