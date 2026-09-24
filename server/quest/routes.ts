import { Router } from "express";
import { z } from "zod";
import type { QuestOrchestrator } from "./orchestrator.js";

const questInputSchema = z.object({
  worldId: z.string().min(1).max(200),
  style: z.enum(["cartoon", "hand-painted", "watercolor"]),
  mode: z.enum(["explore", "collect", "race"]),
  objectDescription: z.string().min(1).max(500),
  atmosphere: z.string().max(500).optional(),
  jobId: z.string().min(1).optional(),
  attempt: z.union([z.literal(0), z.literal(1)]).optional(),
  levelId: z.string().min(1).optional(),
});

export function createQuestRouter(orchestrator: QuestOrchestrator): Router {
  const router = Router();
  router.post("/api/quests", async (req, res, next) => {
    const parsed = questInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid quest generation request.", issues: parsed.error.issues });
      return;
    }
    const { jobId, attempt = 0, levelId } = parsed.data;
    const input = {
      worldId: parsed.data.worldId,
      style: parsed.data.style,
      mode: parsed.data.mode,
      objectDescription: parsed.data.objectDescription,
      ...(parsed.data.atmosphere !== undefined ? { atmosphere: parsed.data.atmosphere } : {}),
    };
    try {
      const result = jobId
        ? await orchestrator.continue(input, jobId, attempt)
        : await orchestrator.start(input);
      const level = result.state === "ready" && levelId
        ? await orchestrator.persist(levelId, result.quest)
        : undefined;
      res.status(result.state === "pending" ? 202 : 200).json({ ...result, ...(level ? { level } : {}) });
    } catch (error) {
      if (error instanceof Error && /not found|does not have/i.test(error.message)) {
        res.status(404).json({ message: error.message });
        return;
      }
      next(error);
    }
  });
  return router;
}
