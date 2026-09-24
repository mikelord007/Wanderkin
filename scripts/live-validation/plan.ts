export type PlannedRequest = {
  id: string;
  capability: string;
  kind: "image-edit" | "image-to-3d" | "text" | "music" | "sfx" | "tts" | "video";
  purpose: string;
  unitPriceUsd: number;
  units: number;
  estimatedUsd: number;
  request: Record<string, unknown>;
};

const roundUsd = (value: number): number => Math.ceil(value * 10_000) / 10_000;

export const VALIDATION_WORLD_ID = "live-validation-photo4-20260924";
export const NARRATION =
  "Welcome to the Lost Colors of the Room-Corner Island. Find every lost color, then enter the glowing portal.";

export function questPrompt(): string {
  return [
    "Return one JSON object only. Do not use Markdown or code fences.",
    'Use exactly these string fields: "title", "intro", "objective", "narrationScript".',
    "Write family-friendly flavour around existing ObjectQuest mechanics only. Never write instructions to the app, code, URLs, model/provider names, or implementation details.",
    "Recognizable object: a sofa, desk, and laptop room corner.",
    "Visual style: Cartoon. Mood cue: playful miniature exploration with warm plucked strings and soft toy percussion.",
    "Atmosphere: a welcoming miniature room-corner island.",
    "Adventure mode: collect. The player finds the authored color fragments, then enters the finish portal. Do not change the fragment count or add enemies, keys, combat, puzzles, or inventory.",
    "Objective must preserve this meaning: Find every lost color, then enter the glowing portal.",
    "Limits: title 2-80 characters; intro 20-320; objective 10-160; narrationScript 20-500. Narration is at most three short sentences.",
  ].join("\n");
}

function requestBase(id: string, kind: PlannedRequest["kind"], capability: string, purpose: string) {
  return { schemaVersion: 1, kind, capability, idempotencyKey: `oq-live-20260924-${id}`, purpose };
}

export function buildPlan(options: { includePostcard?: boolean; includeAlternateEdit?: boolean } = {}): PlannedRequest[] {
  const includePostcard = options.includePostcard ?? true;
  const includeAlternateEdit = options.includeAlternateEdit ?? true;
  const rows: PlannedRequest[] = [];
  const add = (
    id: string,
    capability: string,
    kind: PlannedRequest["kind"],
    purpose: string,
    unitPriceUsd: number,
    units: number,
    body: Record<string, unknown>,
  ) => rows.push({ id, capability, kind, purpose, unitPriceUsd, units, estimatedUsd: roundUsd(unitPriceUsd * units), request: body });

  add("cutout", "bg-remove", "image-edit", "object-cutout", 0.00105, 1, {
    ...requestBase("cutout", "image-edit", "bg-remove", "object-cutout"),
    sourceImageAssetId: "$uploadedPhotoId",
    instruction: "Remove the background cleanly. Preserve the complete sofa, desk, laptop, cushions, and visible supporting surfaces; transparent background.",
    outputMimeType: "image/png",
  });
  add("style-preview", "kontext-edit", "image-edit", "style-preview", 0.042, 1, {
    ...requestBase("style-preview", "image-edit", "kontext-edit", "style-preview"),
    sourceImageAssetId: "$cutoutAssetId",
    instruction: "Create a Cartoon visual-direction preview. Preserve object identity and composition; use simplified value groups, warm miniature-adventure colour, readable edges, and gentle cel shading.",
    outputMimeType: "image/png",
  });
  if (includeAlternateEdit) {
    add("alternate-edit", "gpt-image-edit", "image-edit", "capability-validation:gpt-image-edit", 0.22995, 1, {
      ...requestBase("alternate-edit", "image-edit", "gpt-image-edit", "capability-validation:gpt-image-edit"),
      sourceImageAssetId: "$cutoutAssetId",
      instruction: "Apply a restrained hand-painted miniature look while preserving the exact object arrangement and silhouette.",
      outputMimeType: "image/png",
    });
  }
  add("mesh", "rodin-i3d", "image-to-3d", "world-mesh", 0.42, 1, {
    ...requestBase("mesh", "image-to-3d", "rodin-i3d", "world-mesh"),
    sourceImageAssetIds: ["$cutoutAssetId"],
    styleReferenceAssetId: "$approvedPreviewAssetId",
    scenePrompt: "A faithful, game-ready reconstruction of the reviewed sofa, desk, laptop, cushions, and supporting room-corner surfaces.",
  });
  const prompt = questPrompt();
  add("quest", "gemini-text", "text", "quest-text", 0.0000788, Math.max(1, Math.ceil(prompt.length / 4)) / 1000, {
    ...requestBase("quest", "text", "gemini-text", "quest-text"),
    prompt,
    output: "quest-json",
    maxCharacters: 1200,
  });
  add("music", "music", "music", "audio:music", 0.0315, 1, {
    ...requestBase("music", "music", "music", "audio:music"),
    prompt: "Playful miniature exploration with warm plucked strings and soft toy percussion; Cartoon adventure; sofa, desk, and laptop room corner; clean game-ready sound, no speech, no copyrighted melody.",
    durationSeconds: 60,
    instrumental: true,
    loop: true,
  });
  const sfx = [
    ["ambience", "audio:ambience", "gentle indoor breeze, distant soft room tone, tiny paper rustles", 20, true],
    ["fragment-pickup", "audio:fragment-pickup", "short glassy sparkle and soft toy chime", 1, false],
    ["portal-activate", "audio:portal-activate", "warm magical portal bloom with a gentle rising shimmer", 2, false],
    ["checkpoint", "audio:checkpoint", "short bright checkpoint confirmation", 1, false],
    ["fall-respawn", "audio:fall-respawn", "soft descending whoosh followed by a gentle return pop", 2, false],
    ["race-start", "audio:race-start", "crisp playful three-count start flourish", 2, false],
    ["race-finish", "audio:race-finish", "quick triumphant race finish fanfare", 3, false],
    ["completion", "audio:completion", "warm magical world completion flourish", 3, false],
  ] as const;
  for (const [id, purpose, description, seconds, loop] of sfx) {
    add(id, "mirelo-sfx", "sfx", purpose, 0.0105, seconds, {
      ...requestBase(id, "sfx", "mirelo-sfx", purpose),
      prompt: `${description}. Cartoon miniature adventure; sofa, desk, and laptop room corner; clean game-ready sound, no speech, no copyrighted melody.`,
      durationSeconds: seconds,
      loop,
    });
  }
  add("narration", "chatterbox-tts", "tts", "audio:narration", 0.02625, NARRATION.length / 1000, {
    ...requestBase("narration", "tts", "chatterbox-tts", "audio:narration"),
    text: NARRATION,
    language: "en",
  });
  if (includePostcard) {
    add("postcard", "pixverse-i2v", "video", "animated-postcard", 0.06825, 5, {
      ...requestBase("postcard", "video", "pixverse-i2v", "animated-postcard"),
      sourceImageAssetId: "$approvedPreviewAssetId",
      prompt: "Five-second animated postcard: slow dolly-in, 35mm framing, the miniature room-corner island gently regains colour, warm cartoon lighting, stable object identity, no camera cut.",
      durationSeconds: 5,
    });
  }
  return rows;
}

export function planTotal(plan: readonly PlannedRequest[]): number {
  return roundUsd(plan.reduce((sum, step) => sum + step.estimatedUsd, 0));
}

export class BudgetGuard {
  private spent = 0;
  constructor(readonly maxUsd: number) {
    if (!Number.isFinite(maxUsd) || maxUsd < 0) throw new Error("--max-usd must be a non-negative number.");
  }
  reserve(step: Pick<PlannedRequest, "id" | "estimatedUsd">): number {
    const next = roundUsd(this.spent + step.estimatedUsd);
    if (next > this.maxUsd + Number.EPSILON) {
      throw new Error(`Budget guard: ${step.id} would raise planned spend to $${next.toFixed(4)}, above --max-usd $${this.maxUsd.toFixed(4)}.`);
    }
    this.spent = next;
    return this.spent;
  }
  get reservedUsd(): number { return this.spent; }
}
