/** Player-facing mission copy for generated adventures.
 *
 * Only worlds carrying the `adventure` marker get this copy; every other
 * world keeps its existing HUD wording. The theme changes names and colours
 * only — never which objectives exist or where they are. */
import type { SceneManifest } from "@shared/index.js";
import type { AdventureFlavor } from "./planning.js";
import type { BiomeDefinition, BiomeId } from "./types.js";

export interface AdventureHudCopy {
  title: string;
  objective: string;
  /** Shown once every fragment is collected and the exit is open. */
  exitOpenHint: string;
  counterLabel: string;
  destinationName: string;
  pickup: (collected: number, required: number) => string;
}

const DESTINATIONS: Readonly<Record<BiomeId, { portal: string; beacon: string }>> = {
  original: { portal: "portal", beacon: "beacon" },
  tropical: { portal: "island gate", beacon: "lagoon beacon" },
  desert: { portal: "oasis gate", beacon: "oasis beacon" },
  alpine: { portal: "summit gate", beacon: "summit beacon" },
  autumn: { portal: "hollow gate", beacon: "hollow beacon" },
  ember: { portal: "obsidian gate", beacon: "obsidian beacon" },
};

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function plural(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}

export function adventureHudCopy(
  manifest: Pick<SceneManifest, "adventure" | "experience">,
  definition: BiomeDefinition,
  flavor: Partial<AdventureFlavor> = {},
): AdventureHudCopy | null {
  const template = manifest.adventure?.template;
  if (!template) return null;
  const fragment = flavor.fragmentName ?? definition.mission.fragmentName;
  if (template === "restore-portal") {
    const destination = flavor.destinationName ?? DESTINATIONS[definition.id].portal;
    const required = manifest.experience?.collectibles.length ?? 3;
    return {
      title: sentence(flavor.title ?? definition.mission.portalTitle),
      objective: `Collect ${required} ${plural(fragment, required)}, then step through the ${destination}.`,
      exitOpenHint: `The ${destination} is open — step inside.`,
      counterLabel: "Fragments",
      destinationName: destination,
      pickup: (collected, total) => `${sentence(fragment)} found — ${collected} of ${total}`,
    };
  }
  const destination = flavor.destinationName ?? DESTINATIONS[definition.id].beacon;
  return {
    title: sentence(flavor.title ?? definition.mission.beaconTitle),
    objective: `Follow the route and reach the ${destination}.`,
    exitOpenHint: `You reached the ${destination}!`,
    counterLabel: "Beacon",
    destinationName: destination,
    pickup: (collected, total) => `${sentence(fragment)} found — ${collected} of ${total}`,
  };
}
