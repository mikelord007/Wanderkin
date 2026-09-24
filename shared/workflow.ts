import { z } from "zod";
import type { GenerationJobKind } from "./generation.js";
import type { JobState } from "./job.js";
import type { StyleId } from "./style.js";

/** Versioned independently from the schema-v1 manifest envelope. */
export const WORLD_WORKFLOW_SCHEMA_VERSION = 1 as const;

export interface SelectedWorldReferenceV1 {
  /** Durable photo ids, in the order selected by the creator. */
  photoIds: string[];
  /** The cutout or original image that was actually sent to image-to-3D. */
  reviewedImageAssetId: string;
  approvedPreviewAssetId: string;
  style: StyleId;
  mode: "explore" | "collect" | "race";
  atmosphere: string;
}

export interface WorldWorkflowJobV1 {
  kind: GenerationJobKind;
  /** ObjectQuest's durable server job id. */
  jobId: string;
  status: JobState;
  providerJobId?: string;
  updatedAt: string;
  /** Durable asset produced by the job after it has been consumed. */
  consumedByAssetId?: string;
}

/**
 * Durable observation snapshot only. The server job store remains the source
 * of truth; clients use these ids to resume polling rather than resubmitting.
 */
export interface WorldWorkflowV1 {
  schemaVersion: typeof WORLD_WORKFLOW_SCHEMA_VERSION;
  reviewedImageAssetId: string;
  selectedReference: SelectedWorldReferenceV1;
  jobs: WorldWorkflowJobV1[];
}

const nonEmpty = z.string().min(1);

export const worldWorkflowSchema = z
  .object({
    schemaVersion: z.literal(WORLD_WORKFLOW_SCHEMA_VERSION),
    reviewedImageAssetId: nonEmpty,
    selectedReference: z.object({
      photoIds: z.array(nonEmpty),
      reviewedImageAssetId: nonEmpty,
      approvedPreviewAssetId: nonEmpty,
      style: z.enum(["cartoon", "hand-painted", "watercolor"]),
      mode: z.enum(["explore", "collect", "race"]),
      atmosphere: z.string().max(500),
    }),
    jobs: z.array(
      z.object({
        kind: z.enum(["image-to-3d", "image-edit", "text", "music", "sfx", "tts", "video"]),
        jobId: nonEmpty,
        status: z.enum(["queued", "uploading", "generating", "downloading", "preparing", "ready", "failed"]),
        providerJobId: nonEmpty.optional(),
        updatedAt: nonEmpty,
        consumedByAssetId: nonEmpty.optional(),
      }),
    ),
  })
  .superRefine((workflow, context) => {
    const seen = new Set<string>();
    workflow.jobs.forEach((job, index) => {
      if (seen.has(job.jobId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["jobs", index, "jobId"],
          message: `duplicate job id "${job.jobId}"`,
        });
      }
      seen.add(job.jobId);
    });
  });
