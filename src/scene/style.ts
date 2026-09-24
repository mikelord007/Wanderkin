/** Scene-runtime helpers over the canonical contract in `shared/style.ts`. */
import {
  STYLE_DEFINITIONS,
  type StyleDefinition,
  type StyleId,
} from "../../shared/style.js";
import type { SceneManifest } from "../../shared/manifest.js";

export type EnvironmentMotif = "cloud" | "tree" | "rock" | "reed";

export interface ResolvedEnvironmentDressing {
  definition: StyleDefinition["environment"];
  motif: EnvironmentMotif;
  /** User text is display/prompt context only; it is never executed. */
  atmosphere: string | null;
}

export interface ScenePresentationOverrides {
  styleId?: StyleId;
  atmosphere?: string;
  colorRestoration?: number;
}

export interface ResolvedScenePresentation {
  style: StyleDefinition;
  atmosphere: string | undefined;
  colorRestoration: number;
}

export function getSceneStyle(id: StyleId = "cartoon"): StyleDefinition {
  return STYLE_DEFINITIONS[id];
}

export function clampColorRestoration(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/**
 * Resolves saved v2 presentation state while keeping the public preview props
 * authoritative. Legacy v1 manifests intentionally retain the colourful
 * Cartoon default.
 */
export function resolveScenePresentation(
  manifest: SceneManifest,
  overrides: ScenePresentationOverrides = {},
): ResolvedScenePresentation {
  return {
    style: getSceneStyle(overrides.styleId ?? manifest.experience?.style.id ?? "cartoon"),
    atmosphere: overrides.atmosphere ?? manifest.experience?.style.atmosphere,
    colorRestoration: clampColorRestoration(
      overrides.colorRestoration ?? manifest.experience?.initialColorRestoration ?? 1,
    ),
  };
}

/**
 * Maps a short optional atmosphere onto a small, deterministic scenery
 * vocabulary. These props remain decorative and outside collision.
 */
export function resolveEnvironmentDressing(
  style: StyleDefinition,
  atmosphere?: string,
): ResolvedEnvironmentDressing {
  const normalized = atmosphere?.trim().slice(0, 160) ?? "";
  const lower = normalized.toLowerCase();
  let motif: EnvironmentMotif = defaultMotif(style);
  if (/forest|woodland|grove|enchanted/.test(lower)) motif = "tree";
  else if (/sea|seaside|coast|beach|ocean/.test(lower)) motif = "reed";
  else if (/rock|mountain|canyon|desert/.test(lower)) motif = "rock";
  else if (/cloud|sky|floating|air/.test(lower)) motif = "cloud";
  return {
    definition: style.environment,
    motif,
    atmosphere: normalized || null,
  };
}

function defaultMotif(style: StyleDefinition): EnvironmentMotif {
  if (style.environment.sky === "clouds" || style.environment.sky === "gradient") return "cloud";
  if (style.environment.sky === "storybook") return "tree";
  return "reed";
}
