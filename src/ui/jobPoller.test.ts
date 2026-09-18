import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationJob, JobState } from "@shared/index.js";
import { startJobPolling } from "./jobPoller.js";

function makeJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    schemaVersion: 1,
    id: "job-1",
    idempotencyKey: "key-1",
    providerId: "livepeer",
    providerJobId: null,
    capabilityRequested: "rodin-i3d",
    capabilityUsed: null,
    fallbackFired: null,
    state: "queued",
    photoOrder: [1],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}

describe("startJobPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately, resets backoff on state change, grows on repeat, stops on terminal state", async () => {
    const states: JobState[] = ["queued", "queued", "generating", "ready"];
    let call = 0;
    const fetchJob = vi.fn(() => Promise.resolve(makeJob({ state: states[call++]! })));
    const onUpdate = vi.fn();
    const onPollingChange = vi.fn();

    startJobPolling("job-1", {
      fetchJob,
      onUpdate,
      onConnectionIssue: vi.fn(),
      onPollingChange,
      initialDelayMs: 1000,
      maxDelayMs: 8000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    expect(onPollingChange).toHaveBeenCalledWith(true);

    // Same state repeated -> backoff doubles to 2000ms before the next call.
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchJob).toHaveBeenCalledTimes(2);

    // State changed -> backoff resets to 1000ms.
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchJob).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchJob).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchJob).toHaveBeenCalledTimes(4);
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ state: "ready" }));
    expect(onPollingChange).toHaveBeenLastCalledWith(false);

    // Terminal — no further polling even after a long wait.
    await vi.advanceTimersByTimeAsync(20000);
    expect(fetchJob).toHaveBeenCalledTimes(4);
  });

  it("reports a connection issue and backs off on fetch failure, clearing it on the next success", async () => {
    const fetchJob = vi
      .fn<(jobId: string) => Promise<GenerationJob>>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(makeJob({ state: "queued" }));
    const onConnectionIssue = vi.fn();

    startJobPolling("job-1", {
      fetchJob,
      onUpdate: vi.fn(),
      onConnectionIssue,
      onPollingChange: vi.fn(),
      initialDelayMs: 1000,
      maxDelayMs: 15000,
      backoffMultiplier: 2,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onConnectionIssue).toHaveBeenLastCalledWith("network down");

    // Backoff after a failure is initialDelay * multiplier = 2000ms.
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(onConnectionIssue).toHaveBeenLastCalledWith(null);
  });

  it("stop() cancels the pending timer and ignores any in-flight response", async () => {
    const fetchJob = vi.fn(() => Promise.resolve(makeJob({ state: "queued" })));
    const onPollingChange = vi.fn();

    const handle = startJobPolling("job-1", {
      fetchJob,
      onUpdate: vi.fn(),
      onConnectionIssue: vi.fn(),
      onPollingChange,
      initialDelayMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJob).toHaveBeenCalledTimes(1);

    handle.stop();
    expect(onPollingChange).toHaveBeenLastCalledWith(false);

    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it("restart() resumes polling a job that had gone terminal, and discards a stale pre-restart response", async () => {
    let resolveStale!: (job: GenerationJob) => void;
    const stale = new Promise<GenerationJob>((resolve) => {
      resolveStale = resolve;
    });
    const fetchJob = vi
      .fn<(jobId: string) => Promise<GenerationJob>>()
      .mockReturnValueOnce(stale)
      .mockResolvedValueOnce(makeJob({ state: "generating" }));
    const onUpdate = vi.fn();

    const handle = startJobPolling("job-1", {
      fetchJob,
      onUpdate,
      onConnectionIssue: vi.fn(),
      onPollingChange: vi.fn(),
      initialDelayMs: 1000,
    });

    // First fetch is still in flight when the caller restarts (e.g. right
    // after POST /api/jobs/:id/retry succeeded).
    handle.restart();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchJob).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ state: "generating" }));

    // The stale first request finally resolves as "failed" — must not
    // overwrite the fresher "generating" state reported after restart.
    resolveStale(makeJob({ state: "failed" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ state: "failed" }));
  });
});
