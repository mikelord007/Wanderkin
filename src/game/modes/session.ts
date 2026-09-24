import type {
  ColorFragmentEntity,
  GameModeId,
  LevelExperience,
  PublishedLevelVersion,
} from "@shared/index.js";
import { GameplayEventBus, gameplayEvents } from "../events.js";

export type RacePhase = "not-applicable" | "countdown" | "running" | "finished";

export interface GameplaySessionSnapshot {
  mode: GameModeId;
  collectedFragmentIds: ReadonlySet<string>;
  requiredFragmentsCollected: number;
  requiredFragmentsTotal: number;
  restoration: number;
  portalActive: boolean;
  portalId: string | null;
  reachedCheckpointIds: readonly string[];
  destinationsReached: ReadonlySet<string>;
  completed: boolean;
  race: {
    phase: RacePhase;
    countdownSecondsRemaining: number;
    elapsedMilliseconds: number;
    bestMilliseconds: number | null;
    publishedVersionId: PublishedLevelVersion["versionId"] | null;
  };
}

export interface GameplaySessionOptions {
  experience: LevelExperience;
  worldId: string;
  eventBus?: GameplayEventBus;
  publishedVersionId?: PublishedLevelVersion["versionId"] | null;
  clock?: MonotonicClock;
  bestTimeStore?: RaceBestTimeStore;
}

export interface MonotonicClock {
  now(): number;
}

export interface RaceBestTimeStore {
  read(key: string): number | null;
  write(key: string, milliseconds: number): void;
}

const SYSTEM_CLOCK: MonotonicClock = {
  now: () => (typeof performance === "undefined" ? Date.now() : performance.now()),
};

export const localRaceBestTimes: RaceBestTimeStore = {
  read(key) {
    if (typeof localStorage === "undefined") return null;
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  },
  write(key, milliseconds) {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, String(milliseconds));
  },
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Pure mode state layered over GameSimulation. The movement controller owns
 * poses and collision; this class owns rewards, finish rules, and run resets.
 */
export class GameplaySession {
  readonly experience: LevelExperience;
  readonly worldId: string;
  readonly publishedVersionId: PublishedLevelVersion["versionId"] | null;

  private readonly eventBus: GameplayEventBus;
  private readonly clock: MonotonicClock;
  private readonly bestTimeStore: RaceBestTimeStore;
  private readonly bestTimeKey: string;
  private readonly fragmentsById: ReadonlyMap<string, ColorFragmentEntity>;
  private collectedFragmentIds = new Set<string>();
  private reachedCheckpointIds: string[] = [];
  private destinationsReached = new Set<string>();
  private restoration: number;
  private portalActive: boolean;
  private completed = false;
  private racePhase: RacePhase;
  private countdownStartedAt: number | null = null;
  private raceStartedAt: number | null = null;
  private pausedAt: number | null = null;
  private elapsedAtFinish = 0;
  private countdownSecondsRemaining = 0;
  private lastCountdownAnnounced: number | null = null;
  private bestMilliseconds: number | null;

  constructor(options: GameplaySessionOptions) {
    this.experience = options.experience;
    this.worldId = options.worldId;
    this.publishedVersionId = options.publishedVersionId ?? null;
    this.eventBus = options.eventBus ?? gameplayEvents;
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.bestTimeStore = options.bestTimeStore ?? localRaceBestTimes;
    this.bestTimeKey = `objectquest:race-best:${this.publishedVersionId ?? `draft:${this.worldId}`}`;
    this.fragmentsById = new Map(
      options.experience.collectibles.map((fragment) => [fragment.id, fragment]),
    );
    this.restoration = clamp01(options.experience.initialColorRestoration);
    this.portalActive = options.experience.finishPortal?.activation === "always";
    this.racePhase = options.experience.mode.kind === "race" ? "countdown" : "not-applicable";
    this.countdownSecondsRemaining =
      options.experience.mode.kind === "race" ? options.experience.mode.countdownSeconds : 0;
    const authoredBest =
      options.experience.mode.kind === "race"
        ? options.experience.mode.personalBestMilliseconds ?? null
        : null;
    const storedBest = options.experience.mode.kind === "race" ? this.bestTimeStore.read(this.bestTimeKey) : null;
    this.bestMilliseconds =
      authoredBest === null
        ? storedBest
        : storedBest === null
          ? authoredBest
          : Math.min(authoredBest, storedBest);
  }

  get snapshot(): GameplaySessionSnapshot {
    const mode = this.experience.mode;
    const requiredIds = mode.kind === "collect" ? new Set(mode.requiredCollectibleIds) : new Set<string>();
    let requiredCollected = 0;
    for (const id of this.collectedFragmentIds) if (requiredIds.has(id)) requiredCollected += 1;

    return {
      mode: mode.kind,
      collectedFragmentIds: new Set(this.collectedFragmentIds),
      requiredFragmentsCollected: requiredCollected,
      requiredFragmentsTotal: mode.kind === "collect" ? mode.requiredCount : 0,
      restoration: this.restoration,
      portalActive: this.portalActive,
      portalId: this.experience.finishPortal?.id ?? null,
      reachedCheckpointIds: [...this.reachedCheckpointIds],
      destinationsReached: new Set(this.destinationsReached),
      completed: this.completed,
      race: {
        phase: this.racePhase,
        countdownSecondsRemaining: this.countdownSecondsRemaining,
        elapsedMilliseconds: this.currentRaceElapsed(),
        bestMilliseconds: this.bestMilliseconds,
        publishedVersionId: this.publishedVersionId,
      },
    };
  }

  collectFragment(fragmentId: string): boolean {
    if (this.completed || this.collectedFragmentIds.has(fragmentId)) return false;
    const fragment = this.fragmentsById.get(fragmentId);
    if (!fragment) return false;

    this.collectedFragmentIds.add(fragmentId);
    const mode = this.experience.mode;
    const requiredIds = mode.kind === "collect" ? new Set(mode.requiredCollectibleIds) : new Set<string>();
    let requiredCollected = 0;
    for (const id of this.collectedFragmentIds) if (requiredIds.has(id)) requiredCollected += 1;

    if (mode.kind === "collect" && requiredIds.has(fragmentId)) {
      const authoredStep = mode.restorationSteps[requiredCollected - 1];
      this.restoration = Math.max(
        this.restoration,
        clamp01(authoredStep ?? this.restoration + fragment.restorationAmount),
      );
    } else {
      this.restoration = Math.max(this.restoration, clamp01(this.restoration + fragment.restorationAmount));
    }

    this.eventBus.emit({
      type: "fragmentCollected",
      fragmentId,
      collected: requiredCollected,
      required: mode.kind === "collect" ? mode.requiredCount : 0,
      restoration: this.restoration,
      color: fragment.color,
    });

    if (
      mode.kind === "collect" &&
      requiredCollected >= mode.requiredCount &&
      mode.requiredCollectibleIds.every((id) => this.collectedFragmentIds.has(id))
    ) {
      this.eventBus.emit({
        type: "allFragmentsCollected",
        collected: requiredCollected,
        required: mode.requiredCount,
      });
      this.activatePortal();
    }

    return true;
  }

  reachDestination(destinationId: string): boolean {
    const mode = this.experience.mode;
    if (this.completed || mode.kind !== "explore" || this.destinationsReached.has(destinationId)) {
      return false;
    }
    if (!mode.destinations.some((destination) => destination.id === destinationId)) return false;

    this.destinationsReached.add(destinationId);
    if (
      mode.destinations.length > 0 &&
      mode.destinations.every((destination) => this.destinationsReached.has(destination.id))
    ) {
      this.completeWorld();
    }
    return true;
  }

  start(): void {
    const mode = this.experience.mode;
    if (mode.kind !== "race" || this.countdownStartedAt !== null || this.completed) return;
    this.racePhase = "countdown";
    this.countdownStartedAt = this.clock.now();
    this.countdownSecondsRemaining = mode.countdownSeconds;
    this.lastCountdownAnnounced = mode.countdownSeconds;
    this.eventBus.emit({ type: "raceCountdown", secondsRemaining: mode.countdownSeconds });
    if (mode.countdownSeconds === 0) this.update(this.countdownStartedAt);
  }

  update(now = this.clock.now()): void {
    const mode = this.experience.mode;
    if (mode.kind !== "race" || this.completed || this.pausedAt !== null) return;
    if (this.countdownStartedAt === null) return;

    if (this.racePhase === "countdown") {
      const countdownMilliseconds = mode.countdownSeconds * 1000;
      const elapsed = Math.max(0, now - this.countdownStartedAt);
      const remaining = Math.max(0, Math.ceil((countdownMilliseconds - elapsed) / 1000));
      this.countdownSecondsRemaining = remaining;
      if (remaining !== this.lastCountdownAnnounced) {
        this.lastCountdownAnnounced = remaining;
        this.eventBus.emit({ type: "raceCountdown", secondsRemaining: remaining });
      }
      if (elapsed >= countdownMilliseconds) {
        this.racePhase = "running";
        this.raceStartedAt = this.countdownStartedAt + countdownMilliseconds;
        this.eventBus.emit({ type: "raceStarted", publishedVersionId: this.publishedVersionId });
      }
    }
  }

  setPaused(paused: boolean, now = this.clock.now()): void {
    if (this.experience.mode.kind !== "race" || this.completed) return;
    if (paused) {
      if (this.pausedAt === null) this.pausedAt = now;
      return;
    }
    if (this.pausedAt === null) return;
    const pausedDuration = Math.max(0, now - this.pausedAt);
    if (this.racePhase === "countdown" && this.countdownStartedAt !== null) {
      this.countdownStartedAt += pausedDuration;
    }
    if (this.racePhase === "running" && this.raceStartedAt !== null) {
      this.raceStartedAt += pausedDuration;
    }
    this.pausedAt = null;
  }

  reachCheckpoint(checkpointId: string): boolean {
    const mode = this.experience.mode;
    if (this.completed || mode.kind !== "race" || this.racePhase !== "running") return false;
    const expected = mode.orderedCheckpointIds[this.reachedCheckpointIds.length];
    if (checkpointId !== expected) return false;

    this.reachedCheckpointIds.push(checkpointId);
    this.eventBus.emit({
      type: "checkpointReached",
      checkpointId,
      reached: this.reachedCheckpointIds.length,
      total: mode.orderedCheckpointIds.length,
    });
    if (this.reachedCheckpointIds.length === mode.orderedCheckpointIds.length) {
      if (this.experience.finishPortal) this.activatePortal();
      else this.finishRace();
    }
    return true;
  }

  enterPortal(portalId: string): boolean {
    const portal = this.experience.finishPortal;
    if (this.completed || !portal || portal.id !== portalId || !this.portalActive) return false;
    if (this.experience.mode.kind === "race") return this.finishRace();
    return this.completeWorld();
  }

  /** Respawn is deliberately state-preserving; only the movement layer moves. */
  respawn(reason: "fell" | "manual", checkpointId: string | null): void {
    if (reason === "fell") this.eventBus.emit({ type: "playerFell", checkpointId });
    this.eventBus.emit({ type: "respawned", reason, checkpointId });
  }

  restart(): void {
    this.collectedFragmentIds.clear();
    this.reachedCheckpointIds = [];
    this.destinationsReached.clear();
    this.restoration = clamp01(this.experience.initialColorRestoration);
    this.portalActive = this.experience.finishPortal?.activation === "always";
    this.completed = false;
    this.countdownStartedAt = null;
    this.raceStartedAt = null;
    this.pausedAt = null;
    this.elapsedAtFinish = 0;
    this.lastCountdownAnnounced = null;
    this.racePhase = this.experience.mode.kind === "race" ? "countdown" : "not-applicable";
    this.countdownSecondsRemaining =
      this.experience.mode.kind === "race" ? this.experience.mode.countdownSeconds : 0;
    if (this.experience.mode.kind === "race") this.start();
  }

  private activatePortal(): void {
    const portal = this.experience.finishPortal;
    if (!portal || this.portalActive) return;
    this.portalActive = true;
    this.eventBus.emit({ type: "portalActivated", portalId: portal.id });
  }

  private finishRace(): boolean {
    if (this.completed || this.experience.mode.kind !== "race" || this.racePhase !== "running") {
      return false;
    }
    this.elapsedAtFinish = this.currentRaceElapsed();
    this.racePhase = "finished";
    const isPersonalBest = this.bestMilliseconds === null || this.elapsedAtFinish < this.bestMilliseconds;
    if (isPersonalBest) {
      this.bestMilliseconds = this.elapsedAtFinish;
      this.bestTimeStore.write(this.bestTimeKey, this.elapsedAtFinish);
    }
    this.eventBus.emit({
      type: "raceFinished",
      elapsedMilliseconds: this.elapsedAtFinish,
      bestMilliseconds: this.bestMilliseconds ?? this.elapsedAtFinish,
      isPersonalBest,
      publishedVersionId: this.publishedVersionId,
    });
    return this.completeWorld(this.elapsedAtFinish);
  }

  private currentRaceElapsed(): number {
    if (this.experience.mode.kind !== "race" || this.raceStartedAt === null) return 0;
    if (this.racePhase === "finished") return this.elapsedAtFinish;
    const endpoint = this.pausedAt ?? this.clock.now();
    return Math.max(0, Math.round(endpoint - this.raceStartedAt));
  }

  private completeWorld(elapsedMilliseconds: number | null = null): boolean {
    if (this.completed) return false;
    this.completed = true;
    this.eventBus.emit({
      type: "worldCompleted",
      mode: this.experience.mode.kind,
      elapsedMilliseconds,
      publishedVersionId: this.publishedVersionId,
    });
    return true;
  }
}
