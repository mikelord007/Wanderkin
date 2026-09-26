import type { GenerationJob } from "@shared/index.js";
import type { CreationRecord } from "./creationFlow.js";

/** What scene preparation calls a world it has no name for. */
export const UNNAMED_LEVEL = "Imported level";

/** The quest title a world's story job wrote, if it has one. */
export function questTitle(job: GenerationJob | null | undefined): string | null {
  const structured = job?.result?.kind === "text" ? job.result.output.structured : null;
  const title = structured && typeof structured === "object" ? (structured as Record<string, unknown>).title : null;
  return typeof title === "string" && title.trim() ? title.trim().slice(0, 80) : null;
}

/**
 * The name a world made in Create is prepared and saved under: the quest
 * title its story wrote, or else a title the creation already has. Null (the
 * scene's own default) only when neither exists. A story that cannot be read
 * right now never stops the course from being prepared.
 */
export async function creationWorldName(creation: CreationRecord | null, fetchJob: (id: string) => Promise<GenerationJob>): Promise<string | null> {
  if (!creation) return null;
  const story = creation.jobs.story;
  if (story?.state === "ready") {
    try {
      const title = questTitle(await fetchJob(story.id));
      if (title) return title;
    } catch {
      // Fall through to the creation's own title.
    }
  }
  const own = creation.title?.trim();
  return own && own !== UNNAMED_LEVEL ? own : null;
}
