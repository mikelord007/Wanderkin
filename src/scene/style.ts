/**
 * Interim scene-style contract.
 *
 * Worker 1's shared schema is not present in this branch yet, so rendering
 * owns this local, dependency-free shape. Its top-level field names mirror the
 * brief's shared style definition and can move to `shared/` without changing
 * the renderer: imagePrompt, sceneColors, lighting, renderParameters,
 * environmentDressing, audioPrompt, and interfaceAccent.
 */
export type SceneStyleId = "cartoon";

export interface SceneStyleColors {
  zenith: string;
  horizon: string;
  fog: string;
  ground: string;
  helperSurface: string;
  helperEdge: string;
  generatedTint: string;
  markerActive: string;
  markerPending: string;
  markerCollected: string;
}

export interface SceneLightingRig {
  ambientColor: string;
  ambientIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  keyColor: string;
  keyIntensity: number;
  fillColor: string;
  fillIntensity: number;
  shadowMapSize: 512 | 1024 | 2048;
}

export interface SceneRenderParameters {
  colorSteps: number;
  inkStrength: number;
  brushStrength: number;
  washStrength: number;
  paperGrain: number;
  pastelLift: number;
  roughness: number;
  metalness: number;
  exposure: number;
  fogNearMultiplier: number;
  fogFarMultiplier: number;
}

export type EnvironmentMotif = "cloud" | "tree" | "rock" | "reed";

export interface SceneEnvironmentDressing {
  skyTreatment: string;
  groundTreatment: string;
  motif: EnvironmentMotif;
  propColors: readonly [string, string, string];
  propCount: number;
  atmosphericMotion: "none" | "subtle";
}

export interface SceneStyleDefinition {
  id: SceneStyleId;
  label: string;
  imagePrompt: string;
  sceneColors: SceneStyleColors;
  lighting: SceneLightingRig;
  renderParameters: SceneRenderParameters;
  environmentDressing: SceneEnvironmentDressing;
  audioPrompt: string;
  interfaceAccent: string;
}

export interface ResolvedEnvironmentDressing extends SceneEnvironmentDressing {
  /** User text is display/prompt context only; it is never executed. */
  atmosphere: string | null;
}

const CARTOON: SceneStyleDefinition = {
  id: "cartoon",
  label: "Cartoon",
  imagePrompt:
    "Preserve the exact object and composition; use bold simplified colors, clear silhouettes, crisp cel-shaded value groups, and playful warm light.",
  sceneColors: {
    zenith: "#397ccf",
    horizon: "#9de7ff",
    fog: "#8fd5ec",
    ground: "#294b70",
    helperSurface: "#f3a83b",
    helperEdge: "#28172f",
    generatedTint: "#ffffff",
    markerActive: "#ffe066",
    markerPending: "#61729a",
    markerCollected: "#49df9a",
  },
  lighting: {
    ambientColor: "#dbeeff",
    ambientIntensity: 0.68,
    hemisphereSky: "#eff8ff",
    hemisphereGround: "#41324c",
    hemisphereIntensity: 0.92,
    keyColor: "#fff0c2",
    keyIntensity: 2.35,
    fillColor: "#84bcff",
    fillIntensity: 0.52,
    shadowMapSize: 1024,
  },
  renderParameters: {
    colorSteps: 5,
    inkStrength: 0.5,
    brushStrength: 0,
    washStrength: 0,
    paperGrain: 0,
    pastelLift: 0.04,
    roughness: 0.72,
    metalness: 0.02,
    exposure: 1.08,
    fogNearMultiplier: 1.9,
    fogFarMultiplier: 7.5,
  },
  environmentDressing: {
    skyTreatment: "clean gradient with graphic cloud puffs",
    groundTreatment: "bold matte stage with a clear play-space edge",
    motif: "cloud",
    propColors: ["#fff4cf", "#ff8a65", "#5cd6c0"],
    propCount: 9,
    atmosphericMotion: "subtle",
  },
  audioPrompt: "playful pizzicato adventure with bright wooden percussion and a buoyant, friendly pulse",
  interfaceAccent: "#ffb23f",
};

export const SCENE_STYLES: Readonly<Record<SceneStyleId, SceneStyleDefinition>> = {
  cartoon: CARTOON,
};

export function getSceneStyle(id: SceneStyleId = "cartoon"): SceneStyleDefinition {
  return SCENE_STYLES[id];
}

export function clampColorRestoration(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/**
 * Maps a short optional atmosphere onto a small, deterministic scenery
 * vocabulary. These props remain decorative and outside collision.
 */
export function resolveEnvironmentDressing(
  style: SceneStyleDefinition,
  atmosphere?: string,
): ResolvedEnvironmentDressing {
  const normalized = atmosphere?.trim().slice(0, 160) ?? "";
  const lower = normalized.toLowerCase();
  let motif = style.environmentDressing.motif;
  if (/forest|woodland|grove|enchanted/.test(lower)) motif = "tree";
  else if (/sea|seaside|coast|beach|ocean/.test(lower)) motif = "reed";
  else if (/rock|mountain|canyon|desert/.test(lower)) motif = "rock";
  else if (/cloud|sky|floating|air/.test(lower)) motif = "cloud";
  return {
    ...style.environmentDressing,
    motif,
    atmosphere: normalized || null,
  };
}
