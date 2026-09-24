import { describe, it } from "vitest";
import type { GenerationJobKind } from "../../shared/generation.js";

const GENERATION_JOB_KINDS = [
  "image-to-3d",
  "image-edit",
  "text",
  "music",
  "sfx",
  "tts",
  "video",
] as const satisfies readonly GenerationJobKind[];

describe("ObjectQuest v2 generation lifecycle integration contracts", () => {
  it.skip.each(GENERATION_JOB_KINDS)("deduplicates concurrent %s submissions without merging other kinds", (kind) => {
    // Given two concurrent requests with the same normalized payload,
    // purpose, world, job kind, and idempotency key,
    void kind;

    // when both cross the real gateway/job-store boundary before either
    // provider response completes,

    // then both callers receive one application job ID and exactly one
    // provider submission. The same key on another kind remains independent,
    // while a same-kind payload mismatch is rejected without a provider call.
    throw new Error("Contract stub: connect Worker 2's common multi-kind job gateway");
  });

  it.skip("polls queued/running jobs, classifies errors, and resumes the same job after refresh and restart", () => {
    // Given a durable job whose provider sequence is queued -> running -> ready,
    // observe bounded polling/backoff and persist every externally visible state.

    // Interrupt the client and API process independently, then resume through
    // Worker 4's stored pending-world path using the original application and
    // provider job IDs; neither recovery may call provider submission again.

    // Repeat with retryable and terminal provider failures. Retryable errors
    // preserve normalized input and completed assets; terminal errors stop
    // polling, expose stable safe copy, and never loop indefinitely.
    throw new Error("Contract stub: connect gateway, durable store, poller, and My worlds resume");
  });

  it.skip("preserves the playable level and successful assets when one optional asset fails", () => {
    // Given a ready mesh/course plus independent music, narration, SFX, and
    // postcard jobs, make one optional job fail after another optional asset succeeds.

    // When the failure is persisted, the world remains playable, editable,
    // saveable, publishable, and replayable with an honest missing-media state.

    // Retrying only the failed kind reuses the world/mesh and successful asset
    // IDs, creates no image-to-3d submission, and cannot erase the publication.
    throw new Error("Contract stub: connect Workers 2, 6, 7, and 8 asset orchestration");
  });

  it.skip("rejects per-request and per-world budget excess before provider submission", () => {
    // Given current catalog pricing plus configured per-request and per-world
    // ceilings, test below-limit, exact-limit, above-limit, and unknown-cost inputs.

    // Above-limit requests fail before upload/provider submission and persist a
    // stable non-retry loop error. Unknown cost is represented as unknown, never zero.

    // Existing successful assets and spend ledger entries remain unchanged;
    // the fake provider call log is empty for every rejected request.
    throw new Error("Contract stub: connect Worker 2 budget policy, ledger, and gateway");
  });

  it.skip("submits the exact approved preview and settings, never an unapproved style selection", () => {
    // Given an uploaded source, style A preview, then style B preview, approve B
    // and persist its asset ID, digest, style definition version, atmosphere,
    // mode, source identity, and approval timestamp across a refresh.

    // Style selection and preview generation alone must make zero image-to-3d
    // calls. Explicit Build submits once using B's approved durable image—not
    // the upload, A, a stale blob URL, or the current unapproved controls.

    // Changing any bound input invalidates approval and requires a new explicit
    // approval before another build can pass the gateway.
    throw new Error("Contract stub: connect Worker 4 approval store and Worker 2 request capture");
  });
});
