import { QUEST_TEXT_SCHEMA_VERSION, type QuestTextBlock } from "../../shared/index.js";

export interface QuestValidationResult {
  ok: boolean;
  value?: QuestTextBlock;
  errors: string[];
}

export const QUEST_TEXT_LIMITS = {
  title: [2, 80],
  intro: [20, 320],
  objective: [10, 160],
} as const;
const LIMITS = QUEST_TEXT_LIMITS;

/** Older prompts asked for narration text; a model that still sends it is
 * not penalised with a retry. The value is dropped unread. */
const IGNORED_FIELDS = new Set(["narrationScript"]);

const BLOCKED_PATTERNS: readonly [RegExp, string][] = [
  [/\b(?:openai|chatgpt|gemini|livepeer|anthropic|claude|gpt[-\s]?\d|provider|language model)\b/i, "provider or model name"],
  [/\b(?:javascript|typescript|python|powershell|bash|shell|eval\s*\(|<script|```|https?:\/\/|www\.)/i, "instructions, executable content, or URL"],
  [/\b(?:ignore (?:all|the|previous)|system prompt|developer message|run (?:this|the) command|execute (?:this|the))\b/i, "prompt or execution instruction"],
  [/\b(?:fuck|shit|bitch|cunt|nigger|faggot)\b/i, "profanity or hateful language"],
  [/\b(?:kill yourself|suicide|sexual|porn(?:ography)?|rape)\b/i, "unsafe content"],
];

export function validateQuestOutput(raw: unknown): QuestValidationResult {
  const parsed = parseRaw(raw);
  if (!parsed || Array.isArray(parsed)) return { ok: false, errors: ["Quest output must be one JSON object."] };
  const record = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const allowed = new Set(Object.keys(LIMITS));
  for (const key of Object.keys(record)) if (!allowed.has(key) && !IGNORED_FIELDS.has(key)) errors.push(`Unexpected field: ${key}.`);

  const text = {} as Record<keyof typeof LIMITS, string>;
  for (const [field, [min, max]] of Object.entries(LIMITS) as [keyof typeof LIMITS, readonly [number, number]][]) {
    const value = record[field];
    if (typeof value !== "string") {
      errors.push(`${field} must be text.`);
      continue;
    }
    const clean = value.replace(/\s+/g, " ").trim();
    text[field] = clean;
    if (clean.length < min || clean.length > max) errors.push(`${field} must contain ${min}-${max} characters.`);
    for (const [pattern, reason] of BLOCKED_PATTERNS) if (pattern.test(clean)) errors.push(`${field} contains ${reason}.`);
    if (/[<>]{1,2}\/?[a-z][^>]*>/i.test(clean)) errors.push(`${field} contains markup.`);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      schemaVersion: QUEST_TEXT_SCHEMA_VERSION,
      title: text.title,
      intro: text.intro,
      objective: text.objective,
    },
  };
}

function parseRaw(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "object" && raw !== null) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
