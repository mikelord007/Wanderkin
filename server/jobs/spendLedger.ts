import { join } from "node:path";
import type { GenerationJobKind } from "../../shared/generation.js";
import { capabilityContract } from "../livepeer/capabilities.js";
import { JsonFileStore } from "../persistence/jsonStore.js";

export interface SpendLedgerEntry {
  jobId: string;
  worldId: string | null;
  capability: string;
  kind: GenerationJobKind;
  estimateUsd: number | null;
  /** Amount reserved against hard caps. Unknown estimates use list price. */
  reservedUsd?: number;
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
  reservedUsd: number;
}

export interface GlobalSpendSummary {
  lifetimeUsd: number;
  rollingDailyUsd: number;
  unknownEntries: number;
  entries: number;
  rollingWindowStartedAt: string;
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
    globalLimitUsd?: number;
    dailyLimitUsd?: number;
    listPriceUsd?: number | null;
    now?: Date;
  }): Promise<SpendLedgerEntry> {
    return this.file.update((current) => {
      const existing = current[params.jobId];
      if (existing) return existing;

      const reservedUsd = params.estimateUsd
        ?? params.listPriceUsd
        ?? capabilityContract(params.capability)?.priceUsd
        ?? params.perRequestLimitUsd;
      if (reservedUsd > params.perRequestLimitUsd) {
        throw new BudgetExceededError(
          `Estimated request cost $${reservedUsd.toFixed(4)} exceeds the $${params.perRequestLimitUsd.toFixed(4)} per-request limit.`,
        );
      }

      if (params.worldId) {
        const existingKnown = Object.values(current)
          .filter((entry) => entry.worldId === params.worldId)
          .reduce((sum, entry) => sum + budgetedUsd(entry), 0);
        if (existingKnown + reservedUsd > params.perWorldLimitUsd) {
          throw new BudgetExceededError(
            `Estimated world spend $${(existingKnown + reservedUsd).toFixed(4)} exceeds the $${params.perWorldLimitUsd.toFixed(4)} per-world limit.`,
          );
        }
      }

      const nowDate = params.now ?? new Date();
      const entries = Object.values(current);
      const lifetimeUsd = entries.reduce((sum, entry) => sum + budgetedUsd(entry), 0);
      const globalLimitUsd = params.globalLimitUsd ?? Number.POSITIVE_INFINITY;
      if (lifetimeUsd + reservedUsd > globalLimitUsd) {
        throw new BudgetExceededError(
          `Estimated lifetime spend $${(lifetimeUsd + reservedUsd).toFixed(4)} exceeds the $${globalLimitUsd.toFixed(4)} global limit.`,
        );
      }
      const rollingStart = nowDate.getTime() - 24 * 60 * 60 * 1_000;
      const rollingDailyUsd = entries
        .filter((entry) => new Date(entry.createdAt).getTime() >= rollingStart)
        .reduce((sum, entry) => sum + budgetedUsd(entry), 0);
      const dailyLimitUsd = params.dailyLimitUsd ?? Number.POSITIVE_INFINITY;
      if (rollingDailyUsd + reservedUsd > dailyLimitUsd) {
        throw new BudgetExceededError(
          `Estimated rolling 24-hour spend $${(rollingDailyUsd + reservedUsd).toFixed(4)} exceeds the $${dailyLimitUsd.toFixed(4)} daily limit.`,
        );
      }

      const now = nowDate.toISOString();
      const entry: SpendLedgerEntry = {
        jobId: params.jobId,
        worldId: params.worldId,
        capability: params.capability,
        kind: params.kind,
        estimateUsd: params.estimateUsd,
        reservedUsd,
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
      reservedUsd: entries.reduce((sum, entry) => sum + budgetedUsd(entry), 0),
    };
  }

  async summaryAll(now = new Date()): Promise<GlobalSpendSummary> {
    const entries = Object.values(await this.file.read());
    const rollingStart = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    return {
      lifetimeUsd: entries.reduce((sum, entry) => sum + budgetedUsd(entry), 0),
      rollingDailyUsd: entries
        .filter((entry) => new Date(entry.createdAt).getTime() >= rollingStart.getTime())
        .reduce((sum, entry) => sum + budgetedUsd(entry), 0),
      unknownEntries: entries.filter((entry) => entry.reportedUsd === null && entry.estimateUsd === null).length,
      entries: entries.length,
      rollingWindowStartedAt: rollingStart.toISOString(),
    };
  }
}

function budgetedUsd(entry: SpendLedgerEntry): number {
  return entry.reportedUsd
    ?? entry.reservedUsd
    ?? entry.estimateUsd
    ?? capabilityContract(entry.capability)?.priceUsd
    ?? 0;
}
