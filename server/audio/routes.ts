import { Router } from "express";
import { z } from "zod";
import { AUDIO_CUES, type AudioCue } from "./prompts.js";
import type { AudioOrchestrator } from "./orchestrator.js";
import type { OwnerSecurity } from "../security/owner.js";

const startSchema = z.object({
  action: z.literal("start"),
  worldId: z.string().min(1).max(200),
  style: z.enum(["cartoon", "hand-painted", "watercolor"]),
  objectDescription: z.string().min(1).max(500),
  atmosphere: z.string().max(500).optional(),
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

export function createAudioRouter(orchestrator: AudioOrchestrator, security?: OwnerSecurity): Router {
  const router = Router();
  router.post("/api/audio", async (req, res, next) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid audio generation request.", issues: parsed.error.issues });
      return;
    }
    const owner = security?.issue(req, res);
    if (security && parsed.data.levelId && !(await security.canAccess("level", parsed.data.levelId, req))) {
      res.status(404).json({ message: "Level was not found." }); return;
    }
    if (security && parsed.data.action === "start" && !(await security.isUnowned("world", parsed.data.worldId)) && !(await security.canAccess("world", parsed.data.worldId, req))) {
      res.status(404).json({ message: "World was not found." }); return;
    }
    const jobIds = parsed.data.action === "refresh"
      ? Object.values(parsed.data.jobIds)
      : parsed.data.action === "retry" ? [parsed.data.jobId] : [];
    if (security) {
      for (const jobId of jobIds) {
        if (!(await security.canAccess("job", jobId, req))) {
          res.status(404).json({ message: "Audio job was not found." }); return;
        }
      }
    }
    try {
      const result = parsed.data.action === "start"
        ? await orchestrator.start({
            worldId: parsed.data.worldId,
            style: parsed.data.style,
            objectDescription: parsed.data.objectDescription,
            ...(parsed.data.atmosphere !== undefined ? { atmosphere: parsed.data.atmosphere } : {}),
          }, owner?.ownerId)
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
