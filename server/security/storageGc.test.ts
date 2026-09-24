import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runStorageGc } from "../../scripts/storage-gc.js";

describe("storage GC", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function fixture(): string {
    const dir = mkdtempSync(join(tmpdir(), "objectquest-gc-"));
    dirs.push(dir);
    mkdirSync(join(dir, "generated-assets"));
    const names = {
      kept: `${"a".repeat(64)}.png`,
      orphan: `${"b".repeat(64)}.png`,
      failed: `${"c".repeat(64)}.png`,
    };
    for (const name of Object.values(names)) writeFileSync(join(dir, "generated-assets", name), name);
    writeFileSync(join(dir, "generated-assets.json"), JSON.stringify({
      kept: { id: "kept", url: `/api/generated-assets/files/${names.kept}` },
      orphan: { id: "orphan", url: `/api/generated-assets/files/${names.orphan}` },
      failedAsset: { id: "failedAsset", url: `/api/generated-assets/files/${names.failed}` },
    }));
    writeFileSync(join(dir, "levels.json"), JSON.stringify({ level: { media: { audio: [{ id: "kept" }] } } }));
    writeFileSync(join(dir, "jobs.json"), JSON.stringify({
      oldFailed: { job: { id: "oldFailed", state: "failed", updatedAt: "2026-01-01T00:00:00Z", resultAssetId: "failedAsset" } },
      recentFailed: { job: { id: "recentFailed", state: "failed", updatedAt: "2026-09-20T00:00:00Z" } },
    }));
    return dir;
  }

  it("defaults to a non-mutating dry run", async () => {
    const dir = fixture();
    const before = readFileSync(join(dir, "generated-assets.json"), "utf8");
    const report = await runStorageGc({ storageDir: dir, apply: false, failedJobRetentionDays: 30, now: new Date("2026-09-24T00:00:00Z") });
    expect(report).toMatchObject({ mode: "dry-run", orphanedGeneratedAssetIds: ["failedAsset", "orphan"], expiredFailedJobIds: ["oldFailed"] });
    expect(readFileSync(join(dir, "generated-assets.json"), "utf8")).toBe(before);
  });

  it("removes only orphan files/index rows and expired failed jobs when applied", async () => {
    const dir = fixture();
    const report = await runStorageGc({ storageDir: dir, apply: true, failedJobRetentionDays: 30, now: new Date("2026-09-24T00:00:00Z") });
    const generated = JSON.parse(readFileSync(join(dir, "generated-assets.json"), "utf8")) as Record<string, unknown>;
    const jobs = JSON.parse(readFileSync(join(dir, "jobs.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(generated)).toEqual(["kept"]);
    expect(Object.keys(jobs)).toEqual(["recentFailed"]);
    expect(report.generatedFilesRemoved).toHaveLength(2);
    expect(existsSync(join(dir, "generated-assets", `${"a".repeat(64)}.png`))).toBe(true);
  });
});
