import { STYLE_DEFINITION_SCHEMA_VERSION } from "./schema-version.js";

export type StyleId = "cartoon" | "hand-painted" | "watercolor";

export interface StyleImagePrompts {
  /** Prompt fragment for the user's real-object style preview. */
  preview: string;
  /** Prompt fragment used only when producing a geometry reference. */
  geometryReference: string;
  /** Constraints shared by image generation and editing adapters. */
  negative: string;
}

export interface StyleSceneColors {
  background: string;
  fog: string;
  ambientLight: string;
  keyLight: string;
  fillLight: string;
  surfaces: readonly string[];
  colorFragments: readonly [string, string, string];
  finishPortal: string;
}

export interface StyleLighting {
  ambientIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  keyPosition: readonly [number, number, number];
  shadowOpacity: number;
  shadowSoftness: number;
}

export interface StyleRenderParameters {
  toneMappingExposure: number;
  saturation: number;
  contrast: number;
  outline: {
    enabled: boolean;
    color: string;
    thickness: number;
  };
  bloomStrength: number;
  paperTextureOpacity: number;
  watercolorWashStrength: number;
  /** Effects disabled when the player requests reduced motion. */
  ambientMotion: "none" | "subtle";
}

export interface EnvironmentDressing {
  sky: "gradient" | "clouds" | "storybook" | "paper-wash";
  groundTreatment: string;
  propPrompts: readonly string[];
  particlePrompt: string | null;
  density: "sparse" | "medium";
}

export interface StyleAudioPrompts {
  music: string;
  ambience: string;
  collectSfx: string;
  portalSfx: string;
}

export interface StyleUiAccents {
  primary: string;
  secondary: string;
  surface: string;
  surfaceRaised: string;
  text: string;
  focusRing: string;
}

/** A single source of truth shared by preview, game renderer, audio, and UI. */
export interface StyleDefinition {
  schemaVersion: typeof STYLE_DEFINITION_SCHEMA_VERSION;
  id: StyleId;
  label: string;
  imagePrompts: StyleImagePrompts;
  sceneColors: StyleSceneColors;
  lighting: StyleLighting;
  render: StyleRenderParameters;
  environment: EnvironmentDressing;
  audioPrompts: StyleAudioPrompts;
  uiAccents: StyleUiAccents;
}

export const STYLE_DEFINITIONS: Readonly<Record<StyleId, StyleDefinition>> = {
  cartoon: {
    schemaVersion: STYLE_DEFINITION_SCHEMA_VERSION,
    id: "cartoon",
    label: "Cartoon",
    imagePrompts: {
      preview: "Keep the object recognizable; use bold colors, clean silhouettes, playful proportions, and crisp readable edges.",
      geometryReference: "A faithful single-object reference with simplified cartoon materials and unchanged major geometry.",
      negative: "Do not replace the object, crop it, add text, add characters, or hide climbable edges.",
    },
    sceneColors: {
      background: "#8ED8FF",
      fog: "#DDF5FF",
      ambientLight: "#FFF3CF",
      keyLight: "#FFF1A8",
      fillLight: "#9ED9FF",
      surfaces: ["#FFCF4A", "#FF6B6B", "#4D96FF", "#6BCB77"],
      colorFragments: ["#FF4D6D", "#FFD93D", "#4D96FF"],
      finishPortal: "#9B5DE5",
    },
    lighting: {
      ambientIntensity: 0.85,
      keyIntensity: 2.1,
      fillIntensity: 0.7,
      keyPosition: [5, 8, 4],
      shadowOpacity: 0.28,
      shadowSoftness: 0.7,
    },
    render: {
      toneMappingExposure: 1.1,
      saturation: 1.2,
      contrast: 1.08,
      outline: { enabled: true, color: "#253047", thickness: 0.012 },
      bloomStrength: 0.12,
      paperTextureOpacity: 0,
      watercolorWashStrength: 0,
      ambientMotion: "subtle",
    },
    environment: {
      sky: "gradient",
      groundTreatment: "soft rounded islands with bold color blocking",
      propPrompts: ["chunky flowers", "rounded clouds", "tiny pennant flags"],
      particlePrompt: "a few slow floating color motes",
      density: "medium",
    },
    audioPrompts: {
      music: "playful instrumental miniature-adventure theme, bright marimba and pizzicato, seamless loop, no vocals",
      ambience: "gentle open-air breeze with distant birds, soft and unobtrusive",
      collectSfx: "short sparkling color pickup chime with a warm pop",
      portalSfx: "friendly magical portal opening flourish",
    },
    uiAccents: {
      primary: "#6C4DFF",
      secondary: "#FFCF4A",
      surface: "#FFF8E8",
      surfaceRaised: "#FFFFFF",
      text: "#253047",
      focusRing: "#1F75FF",
    },
  },
  "hand-painted": {
    schemaVersion: STYLE_DEFINITION_SCHEMA_VERSION,
    id: "hand-painted",
    label: "Hand-painted",
    imagePrompts: {
      preview: "Keep the object recognizable; add hand-painted brush texture, warm storybook color, and softly modeled detail.",
      geometryReference: "A faithful single-object reference with coherent hand-painted surfaces and unchanged major geometry.",
      negative: "Do not replace the object, crop it, add text, add characters, or obscure platform edges.",
    },
    sceneColors: {
      background: "#B7C8A3",
      fog: "#E8DFC8",
      ambientLight: "#F5DDB4",
      keyLight: "#FFD08A",
      fillLight: "#93A8B6",
      surfaces: ["#B86F52", "#D7A85B", "#6F8B6B", "#607D8B"],
      colorFragments: ["#C94C4C", "#E3B341", "#4E719E"],
      finishPortal: "#7D5A8C",
    },
    lighting: {
      ambientIntensity: 0.72,
      keyIntensity: 1.75,
      fillIntensity: 0.55,
      keyPosition: [4, 7, 2],
      shadowOpacity: 0.38,
      shadowSoftness: 0.82,
    },
    render: {
      toneMappingExposure: 0.98,
      saturation: 0.96,
      contrast: 1.04,
      outline: { enabled: false, color: "#3C302B", thickness: 0 },
      bloomStrength: 0.05,
      paperTextureOpacity: 0.16,
      watercolorWashStrength: 0.08,
      ambientMotion: "subtle",
    },
    environment: {
      sky: "storybook",
      groundTreatment: "layered brush-painted earth and moss",
      propPrompts: ["painted grasses", "small storybook stones", "warm paper lanterns"],
      particlePrompt: "occasional drifting leaf",
      density: "medium",
    },
    audioPrompts: {
      music: "warm instrumental storybook theme, acoustic strings and wooden flute, seamless loop, no vocals",
      ambience: "soft woodland air, leaves, and distant gentle birds",
      collectSfx: "handcrafted bell and wooden sparkle color pickup",
      portalSfx: "warm resonant storybook magic reveal",
    },
    uiAccents: {
      primary: "#8A4F3D",
      secondary: "#D7A85B",
      surface: "#F3E8D2",
      surfaceRaised: "#FFF9EC",
      text: "#3C302B",
      focusRing: "#315F8C",
    },
  },
  watercolor: {
    schemaVersion: STYLE_DEFINITION_SCHEMA_VERSION,
    id: "watercolor",
    label: "Watercolor",
    imagePrompts: {
      preview: "Keep the object recognizable; use translucent watercolor washes, pastel pigments, paper grain, and clean gameplay-readable edges.",
      geometryReference: "A faithful single-object reference with restrained watercolor surface cues and unchanged major geometry.",
      negative: "Do not replace the object, crop it, add text, dissolve its silhouette, or blur climbable edges.",
    },
    sceneColors: {
      background: "#DCECF2",
      fog: "#F4F0E9",
      ambientLight: "#FFF8EC",
      keyLight: "#FFE8C6",
      fillLight: "#C9DDF2",
      surfaces: ["#E6A6A1", "#E8D28B", "#93C7C1", "#A8B8D8"],
      colorFragments: ["#E8848C", "#E8C95F", "#77AFC7"],
      finishPortal: "#AD8BC9",
    },
    lighting: {
      ambientIntensity: 0.95,
      keyIntensity: 1.3,
      fillIntensity: 0.8,
      keyPosition: [3, 8, 5],
      shadowOpacity: 0.2,
      shadowSoftness: 0.95,
    },
    render: {
      toneMappingExposure: 1.05,
      saturation: 0.84,
      contrast: 0.94,
      outline: { enabled: true, color: "#65758A", thickness: 0.006 },
      bloomStrength: 0.03,
      paperTextureOpacity: 0.34,
      watercolorWashStrength: 0.62,
      ambientMotion: "subtle",
    },
    environment: {
      sky: "paper-wash",
      groundTreatment: "layered translucent washes with crisp walkable boundaries",
      propPrompts: ["loose painted reeds", "pastel paper flowers", "soft wash clouds"],
      particlePrompt: "very sparse pigment-like motes",
      density: "sparse",
    },
    audioPrompts: {
      music: "delicate instrumental watercolor dream, felt piano and airy woodwinds, seamless loop, no vocals",
      ambience: "light breeze and distant water with generous quiet space",
      collectSfx: "soft glassy brush-stroke sparkle",
      portalSfx: "gentle swelling watercolor shimmer",
    },
    uiAccents: {
      primary: "#6D7FA8",
      secondary: "#E6A6A1",
      surface: "#F6F2EC",
      surfaceRaised: "#FFFCF7",
      text: "#3F4F63",
      focusRing: "#3B73B9",
    },
  },
};
