import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BudgetExceededError, SpendLedger } from "./spendLedger.js";

describe("SpendLedger", () => {
  let dir: string;
  let ledger: SpendLedger;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "objectquest-spend-"));
    ledger = new SpendLedger(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("rejects a request over its limit before recording it", async () => {
    await expect(ledger.reserve({
      jobId: "j1", worldId: "w1", capability: "meshy-v7-i3d", kind: "image-to-3d",
      estimateUsd: 1.26, perRequestLimitUsd: 1, perWorldLimitUsd: 10,
    })).rejects.toBeInstanceOf(BudgetExceededError);
    expect(await ledger.get("j1")).toBeUndefined();
  });

  it("rejects cumulative known spend over the world limit", async () => {
    await ledger.reserve({
      jobId: "j1", worldId: "w1", capability: "rodin-i3d", kind: "image-to-3d",
      estimateUsd: 0.42, perRequestLimitUsd: 1, perWorldLimitUsd: 0.5,
    });
    await expect(ledger.reserve({
      jobId: "j2", worldId: "w1", capability: "music", kind: "music",
      estimateUsd: 0.1, perRequestLimitUsd: 1, perWorldLimitUsd: 0.5,
    })).rejects.toThrow(/per-world limit/);
  });

  it("persists unknown cost as unknown rather than zero and reconciles reported cost", async () => {
    await ledger.reserve({
      jobId: "j1", worldId: "w1", capability: "future-cap", kind: "text",
      estimateUsd: null, perRequestLimitUsd: 1, perWorldLimitUsd: 1,
    });
    expect(await ledger.summaryForWorld("w1")).toEqual({ worldId: "w1", knownUsd: 0, unknownEntries: 1, entries: 1, reservedUsd: 1 });
    await ledger.reconcile("j1", 0.125);
    expect(await ledger.summaryForWorld("w1")).toEqual({ worldId: "w1", knownUsd: 0.125, unknownEntries: 0, entries: 1, reservedUsd: 0.125 });
  });

  it("enforces lifetime and rolling daily caps before recording", async () => {
    const base = {
      worldId: null, capability: "music", kind: "music" as const,
      estimateUsd: 0.4, perRequestLimitUsd: 1, perWorldLimitUsd: 10,
      globalLimitUsd: 0.7, dailyLimitUsd: 0.7,
    };
    await ledger.reserve({ ...base, jobId: "j1", now: new Date("2026-09-24T00:00:00Z") });
    await expect(ledger.reserve({ ...base, jobId: "j2", now: new Date("2026-09-24T01:00:00Z") }))
      .rejects.toThrow(/global limit/);
    expect((await ledger.summaryAll(new Date("2026-09-24T01:00:00Z"))).entries).toBe(1);

    const dailyLedger = new SpendLedger(join(dir, "daily"));
    await dailyLedger.reserve({ ...base, jobId: "old", globalLimitUsd: 10, now: new Date("2026-09-22T00:00:00Z") });
    await dailyLedger.reserve({ ...base, jobId: "new", globalLimitUsd: 10, now: new Date("2026-09-24T00:00:00Z") });
    await expect(dailyLedger.reserve({ ...base, jobId: "blocked", globalLimitUsd: 10, now: new Date("2026-09-24T01:00:00Z") }))
      .rejects.toThrow(/daily limit/);
  });

  it("reserves list price when the estimate is unknown", async () => {
    await ledger.reserve({
      jobId: "j1", worldId: null, capability: "music", kind: "music",
      estimateUsd: null, listPriceUsd: 0.0315, perRequestLimitUsd: 1, perWorldLimitUsd: 1,
      globalLimitUsd: 1, dailyLimitUsd: 0.03,
    }).then(
      () => { throw new Error("expected rejection"); },
      (error: unknown) => expect(error).toMatchObject({ code: "budget_exceeded" }),
    );
  });

  it("is idempotent for a repeated reservation of the same job", async () => {
    const params = {
      jobId: "j1", worldId: "w1", capability: "music", kind: "music" as const,
      estimateUsd: 0.0315, perRequestLimitUsd: 1, perWorldLimitUsd: 1,
    };
    const first = await ledger.reserve(params);
    const second = await ledger.reserve({ ...params, estimateUsd: 0.9 });
    expect(second).toEqual(first);
    expect((await ledger.summaryForWorld("w1")).entries).toBe(1);
  });
});
