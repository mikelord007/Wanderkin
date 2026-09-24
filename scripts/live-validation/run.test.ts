import { describe, expect, it } from "vitest";
import { BudgetGuard, buildPlan, planTotal } from "./plan.js";
import { parseArgs, renderDryRun } from "./run.js";

describe("live-validation planner", () => {
  it("keeps the complete batch bounded and covers every claimed capability", () => {
    const plan = buildPlan();
    expect(new Set(plan.map((step) => step.capability))).toEqual(new Set([
      "bg-remove", "kontext-edit", "gpt-image-edit", "rodin-i3d", "gemini-text",
      "music", "mirelo-sfx", "chatterbox-tts", "pixverse-i2v",
    ]));
    expect(plan.filter((step) => step.capability === "mirelo-sfx")).toHaveLength(8);
    expect(planTotal(plan)).toBeLessThan(1.5);
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
});
