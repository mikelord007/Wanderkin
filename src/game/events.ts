import type { GameModeId } from "@shared/index.js";

export interface GameplayEventMap {
  fragmentCollected: {
    fragmentId: string;
    collected: number;
    required: number;
    restoration: number;
    color: string;
  };
  allFragmentsCollected: { collected: number; required: number };
  portalActivated: { portalId: string };
  checkpointReached: { checkpointId: string; reached: number; total: number };
  playerFell: { checkpointId: string | null };
  respawned: { reason: "fell" | "manual"; checkpointId: string | null };
  raceCountdown: { secondsRemaining: number };
  raceStarted: { publishedVersionId: string | null };
  raceFinished: {
    elapsedMilliseconds: number;
    bestMilliseconds: number;
    isPersonalBest: boolean;
    publishedVersionId: string | null;
  };
  worldCompleted: {
    mode: GameModeId;
    elapsedMilliseconds: number | null;
    publishedVersionId: string | null;
  };
  introShown: { worldId: string };
}

export type GameplayEvent = {
  [Type in keyof GameplayEventMap]: { type: Type } & GameplayEventMap[Type];
}[keyof GameplayEventMap];

export type GameplayEventType = GameplayEvent["type"];
export type GameplayEventListener<Type extends GameplayEventType = GameplayEventType> = (
  event: Extract<GameplayEvent, { type: Type }>,
) => void;

/**
 * Small synchronous bus shared by gameplay, audio, and QA.
 * Callers may subscribe to one event or to the full stream; listener errors
 * never prevent the remaining consumers from receiving the event.
 */
export class GameplayEventBus {
  private readonly listeners = new Map<GameplayEventType | "*", Set<(event: GameplayEvent) => void>>();

  on<Type extends GameplayEventType>(type: Type, listener: GameplayEventListener<Type>): () => void;
  on(type: "*", listener: GameplayEventListener): () => void;
  on(type: GameplayEventType | "*", listener: GameplayEventListener): () => void {
    const bucket = this.listeners.get(type) ?? new Set<(event: GameplayEvent) => void>();
    bucket.add(listener as (event: GameplayEvent) => void);
    this.listeners.set(type, bucket);
    return () => {
      bucket.delete(listener as (event: GameplayEvent) => void);
      if (bucket.size === 0) this.listeners.delete(type);
    };
  }

  emit(event: GameplayEvent): void {
    for (const type of [event.type, "*"] as const) {
      for (const listener of this.listeners.get(type) ?? []) {
        try {
          listener(event);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const gameplayEvents = new GameplayEventBus();
