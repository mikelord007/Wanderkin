import {
  QUEST_TEXT_SCHEMA_VERSION,
  STYLE_DEFINITIONS,
  type GameModeId,
  type QuestTextBlock,
  type StyleId,
} from "../../shared/index.js";

export interface QuestPromptInput {
  style: StyleId;
  mode: GameModeId;
  objectDescription: string;
  atmosphere?: string;
}

const MODE_RULES: Readonly<Record<GameModeId, string>> = {
  explore: "The player visits the authored destinations at their own pace. Do not add timers, enemies, keys, combat, puzzles, or new destinations.",
  collect: "The player finds the authored color fragments, then enters the finish portal. Do not change the fragment count or add enemies, keys, combat, puzzles, or inventory.",
  race: "The player completes the authored ordered checkpoints and reaches the finish. Mention speed without promising a target time. Do not add enemies, shortcuts, vehicles, combat, or new checkpoints.",
};

const MODE_OBJECTIVES: Readonly<Record<GameModeId, string>> = {
  explore: "Visit every marked destination and enjoy the view.",
  collect: "Find every lost color, then enter the glowing portal.",
  race: "Reach each checkpoint in order and cross the finish.",
};

export function buildQuestPrompt(input: QuestPromptInput, corrective = false): string {
  const style = STYLE_DEFINITIONS[input.style];
  const atmosphere = input.atmosphere?.trim() || "a welcoming miniature world";
  return [
    "Return one JSON object only. Do not use Markdown or code fences.",
    'Use exactly these string fields: "title", "intro", "objective".',
    "Write family-friendly flavour around existing ObjectQuest mechanics only. Never write instructions to the app, code, URLs, model/provider names, or implementation details.",
    `Recognizable object: ${cleanPromptValue(input.objectDescription, 240)}.`,
    `Visual style: ${style.label}. Mood cue: ${style.audioPrompts.music}.`,
    `Atmosphere: ${cleanPromptValue(atmosphere, 240)}.`,
    `Adventure mode: ${input.mode}. ${MODE_RULES[input.mode]}`,
    `Objective must preserve this meaning: ${MODE_OBJECTIVES[input.mode]}`,
    "Limits: title 2-80 characters; intro 20-320; objective 10-160.",
    corrective ? "The previous response was invalid. Correct every format, safety, and length problem; output JSON only." : "",
  ].filter(Boolean).join("\n");
}

export function fallbackQuest(input: QuestPromptInput): QuestTextBlock {
  const subject = titleSubject(input.objectDescription);
  const place = input.atmosphere?.trim() ? ` in ${cleanSentenceFragment(input.atmosphere, 80)}` : "";
  const title = input.mode === "collect"
    ? `The Lost Colors of ${subject}`
    : input.mode === "race"
      ? `${subject} Dash`
      : `The Little World of ${subject}`;
  const intro = input.mode === "collect"
    ? `The colors of ${subject} have scattered${place}. Find them all and wake the portal.`
    : input.mode === "race"
      ? `A quick path winds across ${subject}${place}. Follow every checkpoint to the finish.`
      : `A tiny trail is waiting across ${subject}${place}. Wander to each marked destination.`;
  return {
    schemaVersion: QUEST_TEXT_SCHEMA_VERSION,
    title,
    intro,
    objective: MODE_OBJECTIVES[input.mode],
  };
}

function cleanPromptValue(value: string, max: number): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/[<>`{}]/g, "").replace(/\s+/g, " ").trim().slice(0, max) || "an everyday object";
}

function cleanSentenceFragment(value: string, max: number): string {
  return cleanPromptValue(value, max).replace(/[.!?]+$/g, "").toLowerCase();
}

function titleSubject(value: string): string {
  const cleaned = cleanPromptValue(value, 60).replace(/[^\p{L}\p{N} '-]/gu, "").trim();
  const words = (cleaned || "Everyday Object").split(/\s+/).slice(0, 5);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}
