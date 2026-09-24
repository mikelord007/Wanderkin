import type { LevelExperience } from "@shared/index.js";
import type { Vec3Like } from "../core/vec.js";
import type { GameplaySession } from "./session.js";

const DESTINATION_TRIGGER_RADIUS = 0.7;

function within(position: Vec3Like, target: readonly [number, number, number], radius: number): boolean {
  const dx = position.x - target[0];
  const dy = position.y - target[1];
  const dz = position.z - target[2];
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/** Applies authored trigger volumes to a mode session. Returns true on change. */
export function updateGameplayProximity(
  session: GameplaySession,
  experience: LevelExperience,
  playerPosition: Vec3Like,
): boolean {
  let changed = false;
  for (const fragment of experience.collectibles) {
    if (within(playerPosition, fragment.transform.position, fragment.triggerRadius)) {
      changed = session.collectFragment(fragment.id) || changed;
    }
  }

  if (experience.mode.kind === "explore") {
    for (const destination of experience.mode.destinations) {
      if (within(playerPosition, destination.position, DESTINATION_TRIGGER_RADIUS)) {
        changed = session.reachDestination(destination.id) || changed;
      }
    }
  }

  const portal = experience.finishPortal;
  if (portal && within(playerPosition, portal.transform.position, portal.triggerRadius)) {
    changed = session.enterPortal(portal.id) || changed;
  }
  return changed;
}
