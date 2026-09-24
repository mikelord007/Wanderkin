import { Router } from "express";
import { z } from "zod";
import { AUDIO_CUES, type AudioCue } from "./prompts.js";
import type { AudioOrchestrator } from "./orchestrator.js";

const startSchema = z.object({
  action: z.literal("start"),
  worldId: z.string().min(1).max(200),
  style: z.enum(["cartoon", "hand-painted", "watercolor"]),
  objectDescription: z.string().min(1).max(500),
  atmosphere: z.string().max(500).optional(),
  narrationScript: z.string().max(500),
  levelId: z.string().min(1).optional(),
});
const refreshSchema = z.object({
  action: z.literal("refresh"),
  jobIds: z.record(z.enum(AUDIO_CUES), z.string().min(1)),
  levelId: z.string().min(1).optional(),
});
const retrySchema = z.object({
  action: z.literal("retry"),
  cue: z.enum(AUDIO_CUES),
  jobId: z.string().min(1),
  levelId: z.string().min(1).optional(),
});
const requestSchema = z.discriminatedUnion("action", [startSchema, refreshSchema, retrySchema]);

export function createAudioRouter(orchestrator: AudioOrchestrator): Router {
  const router = Router();
  router.post("/api/audio", async (req, res, next) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid audio generation request.", issues: parsed.error.issues });
      return;
    }
    try {
      const result = parsed.data.action === "start"
        ? await orchestrator.start({
            worldId: parsed.data.worldId,
            style: parsed.data.style,
            objectDescription: parsed.data.objectDescription,
            narrationScript: parsed.data.narrationScript,
            ...(parsed.data.atmosphere !== undefined ? { atmosphere: parsed.data.atmosphere } : {}),
          })
        : parsed.data.action === "refresh"
          ? await orchestrator.refresh(parsed.data.jobIds as Partial<Record<AudioCue, string>>)
          : await orchestrator.retry(parsed.data.cue, parsed.data.jobId);
      const level = parsed.data.levelId && result.readyAssets.length
        ? await orchestrator.persist(parsed.data.levelId, result)
        : undefined;
      res.status(result.pendingCues.length ? 202 : 200).json({ ...result, ...(level ? { level } : {}) });
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) {
        res.status(404).json({ message: error.message });
        return;
      }
      next(error);
    }
  });
  return router;
}
