import { join } from "node:path";
import type { GenerationJobKind } from "../../shared/generation.js";
import { JsonFileStore } from "../persistence/jsonStore.js";

export interface SpendLedgerEntry {
  jobId: string;
  worldId: string | null;
  capability: string;
  kind: GenerationJobKind;
  estimateUsd: number | null;
  reportedUsd: number | null;
  status: "estimated" | "reported" | "unknown";
  createdAt: string;
  updatedAt: string;
}

export interface SpendSummary {
  worldId: string;
  knownUsd: number;
  unknownEntries: number;
  entries: number;
}

export class BudgetExceededError extends Error {
  readonly code = "budget_exceeded";
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export class SpendLedger {
  private readonly file: JsonFileStore<Record<string, SpendLedgerEntry>>;

  constructor(storageDir: string) {
    this.file = new JsonFileStore(join(storageDir, "spend-ledger.json"), () => ({}));
  }

  async reserve(params: {
    jobId: string;
    worldId: string | null;
    capability: string;
    kind: GenerationJobKind;
    estimateUsd: number | null;
    perRequestLimitUsd: number;
    perWorldLimitUsd: number;
  }): Promise<SpendLedgerEntry> {
    return this.file.update((current) => {
      const existing = current[params.jobId];
      if (existing) return existing;

      if (params.estimateUsd !== null && params.estimateUsd > params.perRequestLimitUsd) {
        throw new BudgetExceededError(
          `Estimated request cost $${params.estimateUsd.toFixed(4)} exceeds the $${params.perRequestLimitUsd.toFixed(4)} per-request limit.`,
        );
      }

      if (params.worldId && params.estimateUsd !== null) {
        const existingKnown = Object.values(current)
          .filter((entry) => entry.worldId === params.worldId)
          .reduce((sum, entry) => sum + (entry.reportedUsd ?? entry.estimateUsd ?? 0), 0);
        if (existingKnown + params.estimateUsd > params.perWorldLimitUsd) {
          throw new BudgetExceededError(
            `Estimated world spend $${(existingKnown + params.estimateUsd).toFixed(4)} exceeds the $${params.perWorldLimitUsd.toFixed(4)} per-world limit.`,
          );
        }
      }

      const now = new Date().toISOString();
      const entry: SpendLedgerEntry = {
        jobId: params.jobId,
        worldId: params.worldId,
        capability: params.capability,
        kind: params.kind,
        estimateUsd: params.estimateUsd,
        reportedUsd: null,
        status: params.estimateUsd === null ? "unknown" : "estimated",
        createdAt: now,
        updatedAt: now,
      };
      current[params.jobId] = entry;
      return entry;
    });
  }

  async reconcile(jobId: string, reportedUsd: number | null): Promise<SpendLedgerEntry | undefined> {
    return this.file.update((current) => {
      const entry = current[jobId];
      if (!entry) return undefined;
      if (reportedUsd !== null && Number.isFinite(reportedUsd) && reportedUsd >= 0) {
        entry.reportedUsd = reportedUsd;
        entry.status = "reported";
      } else if (entry.estimateUsd === null) {
        entry.status = "unknown";
      }
      entry.updatedAt = new Date().toISOString();
      return entry;
    });
  }

  async get(jobId: string): Promise<SpendLedgerEntry | undefined> {
    return (await this.file.read())[jobId];
  }

  async summaryForWorld(worldId: string): Promise<SpendSummary> {
    const entries = Object.values(await this.file.read()).filter((entry) => entry.worldId === worldId);
    return {
      worldId,
      knownUsd: entries.reduce((sum, entry) => sum + (entry.reportedUsd ?? entry.estimateUsd ?? 0), 0),
      unknownEntries: entries.filter((entry) => entry.reportedUsd === null && entry.estimateUsd === null).length,
      entries: entries.length,
    };
  }
}
