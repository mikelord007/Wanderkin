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
}

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
  private readonly fragmentsById: ReadonlyMap<string, ColorFragmentEntity>;
  private collectedFragmentIds = new Set<string>();
  private reachedCheckpointIds: string[] = [];
  private destinationsReached = new Set<string>();
  private restoration: number;
  private portalActive: boolean;
  private completed = false;

  constructor(options: GameplaySessionOptions) {
    this.experience = options.experience;
    this.worldId = options.worldId;
    this.publishedVersionId = options.publishedVersionId ?? null;
    this.eventBus = options.eventBus ?? gameplayEvents;
    this.fragmentsById = new Map(
      options.experience.collectibles.map((fragment) => [fragment.id, fragment]),
    );
    this.restoration = clamp01(options.experience.initialColorRestoration);
    this.portalActive = options.experience.finishPortal?.activation === "always";
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
        phase: mode.kind === "race" ? "countdown" : "not-applicable",
        countdownSecondsRemaining: mode.kind === "race" ? mode.countdownSeconds : 0,
        elapsedMilliseconds: 0,
        bestMilliseconds: mode.kind === "race" ? mode.personalBestMilliseconds ?? null : null,
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

  enterPortal(portalId: string): boolean {
    const portal = this.experience.finishPortal;
    if (this.completed || !portal || portal.id !== portalId || !this.portalActive) return false;
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
  }

  private activatePortal(): void {
    const portal = this.experience.finishPortal;
    if (!portal || this.portalActive) return;
    this.portalActive = true;
    this.eventBus.emit({ type: "portalActivated", portalId: portal.id });
  }

  private completeWorld(): boolean {
    if (this.completed) return false;
    this.completed = true;
    this.eventBus.emit({
      type: "worldCompleted",
      mode: this.experience.mode.kind,
      elapsedMilliseconds: null,
      publishedVersionId: this.publishedVersionId,
    });
    return true;
  }
}
