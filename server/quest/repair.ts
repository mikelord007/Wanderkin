import { QUEST_TEXT_LIMITS } from "./validation.js";

export interface RepairedQuest {
  title: string;
  intro?: string;
  objective: string;
}

export type QuestRepairResult =
  | { ok: true; quest: RepairedQuest; text: string }
  | { ok: false; reason: string };

/**
 * Turns a model's quest answer into the three fields the game uses. Models
 * often wrap the JSON in a Markdown fence, add fields nobody asked for, send
 * the objective as an object, or run long; none of that is worth failing a
 * world over. The answer is unwrapped, reduced to title, intro and objective,
 * and each is trimmed to its limit at a sentence or word boundary. Only an
 * answer with no usable JSON, title or objective is rejected.
 */
export function repairQuestJson(text: string, alreadyParsed?: unknown): QuestRepairResult {
  const value = alreadyParsed !== undefined && typeof alreadyParsed === "object" ? alreadyParsed : parseLoose(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "Quest generation did not return a JSON object" };
  }
  const record = value as Record<string, unknown>;
  const title = fieldText(record.title);
  const objective = fieldText(record.objective);
  if (!title || !objective) return { ok: false, reason: "Quest JSON must include text fields title and objective" };
  const intro = fieldText(record.intro);
  const quest: RepairedQuest = {
    title: clamp(title, QUEST_TEXT_LIMITS.title[1]),
    ...(intro ? { intro: clamp(intro, QUEST_TEXT_LIMITS.intro[1]) } : {}),
    objective: clamp(objective, QUEST_TEXT_LIMITS.objective[1]),
  };
  return { ok: true, quest, text: JSON.stringify(quest) };
}

/** The stricter wording for the one automatic retry after an answer could
 * not be repaired. */
export function strictQuestPromptSuffix(): string {
  const [titleMin, titleMax] = QUEST_TEXT_LIMITS.title;
  const [introMin, introMax] = QUEST_TEXT_LIMITS.intro;
  const [objectiveMin, objectiveMax] = QUEST_TEXT_LIMITS.objective;
  return [
    "The previous answer could not be used.",
    "Return one JSON object only. Do not use Markdown or code fences.",
    `Use exactly these string fields and nothing else: "title" (${titleMin}-${titleMax} characters), "intro" (${introMin}-${introMax}), "objective" (${objectiveMin}-${objectiveMax}).`,
  ].join("\n");
}

function parseLoose(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1];
  const candidates = [text, fenced, braces(fenced ?? text)].filter((candidate): candidate is string => Boolean(candidate?.trim()));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      continue;
    }
  }
  return undefined;
}

function braces(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}

/** A plain string, or the prose inside an object such as
 * `{ type, item, quantity, description }`. */
function fieldText(value: unknown): string | undefined {
  if (typeof value === "string") return clean(value) || undefined;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["description", "text", "summary", "goal"]) {
      if (typeof record[key] === "string" && clean(record[key] as string)) return clean(record[key] as string);
    }
  }
  return undefined;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentenceEnd >= max / 2) return cut.slice(0, sentenceEnd + 1);
  const wordEnd = cut.slice(0, max - 1).lastIndexOf(" ");
  return `${(wordEnd > 0 ? cut.slice(0, wordEnd) : cut.slice(0, max - 1)).replace(/[\s,;:–—-]+$/, "")}…`;
}
