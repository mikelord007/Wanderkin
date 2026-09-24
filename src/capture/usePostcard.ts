import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationJob, VideoAssetReference } from "@shared/index.js";
import { getPostcardStatus, retryAnimatedPostcard } from "../ui/api.js";
import type { WorldScreenshot } from "./screenshot.js";

export type PostcardViewState = "loading" | "none" | "submitting" | "pending" | "ready" | "failed";
export const POSTCARD_UNAVAILABLE_MESSAGE = "Animated postcards are temporarily unavailable.";

export interface PostcardController {
  state: PostcardViewState;
  job: GenerationJob | null;
  video: VideoAssetReference | null;
  error: string | null;
  canCreate: boolean;
  canRetry: boolean;
  create: () => Promise<void>;
  retry: () => Promise<void>;
}

function stateFor(job: GenerationJob): PostcardViewState {
  if (job.state === "ready" && job.result?.kind === "video") return "ready";
  if (job.state === "failed") return "failed";
  return "pending";
}

export function usePostcard(
  levelId: string | null,
  _screenshot: WorldScreenshot | null = null,
  initialVideo: VideoAssetReference | null = null,
): PostcardController {
  const [state, setState] = useState<PostcardViewState>(initialVideo ? "ready" : levelId ? "loading" : "none");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [video, setVideo] = useState<VideoAssetReference | null>(initialVideo);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const acceptJob = useCallback((next: GenerationJob) => {
    setJob(next);
    setState(stateFor(next));
    if (next.state === "ready" && next.result?.kind === "video") setVideo(next.result.asset);
    if (next.state === "failed") setError(next.lastError?.message ?? "The animated postcard could not be created.");
  }, []);

  useEffect(() => {
    generation.current += 1;
    const current = generation.current;
    if (!levelId) {
      setState("none");
      setJob(null);
      setVideo(null);
      setError(null);
      return;
    }
    if (initialVideo) {
      setVideo(initialVideo);
      setState("ready");
    } else {
      setState("loading");
    }
    const poll = async () => {
      try {
        const status = await getPostcardStatus(levelId);
        if (current !== generation.current) return;
        setError(null);
        if (status.state === "none") {
          if (!initialVideo) setState("none");
          return;
        }
        acceptJob(status.job);
      } catch (cause) {
        if (current !== generation.current) return;
        setError(cause instanceof Error ? cause.message : "Could not check the animated postcard.");
        if (!initialVideo) setState("none");
      }
    };
    void poll();
    return () => {
      generation.current += 1;
    };
  }, [levelId, initialVideo?.id, acceptJob]);

  useEffect(() => {
    if (!levelId || !job || job.state === "ready" || job.state === "failed") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const status = await getPostcardStatus(levelId);
        if (cancelled || status.state === "none") return;
        acceptJob(status.job);
        if (status.job.state !== "ready" && status.job.state !== "failed") timer = setTimeout(poll, 1600);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Connection lost while checking the postcard.");
        timer = setTimeout(poll, 3000);
      }
    };
    timer = setTimeout(poll, 800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [levelId, job?.id, job?.state, acceptJob]);

  const create = useCallback(async () => {
    setError(POSTCARD_UNAVAILABLE_MESSAGE);
  }, []);

  const retry = useCallback(async () => {
    if (!levelId || !job?.providerJobId || job.lastError?.retryable === false) {
      setError(POSTCARD_UNAVAILABLE_MESSAGE);
      return;
    }
    setState("submitting");
    setError(null);
    try {
      const status = await retryAnimatedPostcard(levelId);
      if (status.state === "job") acceptJob(status.job);
      else setState("none");
    } catch (cause) {
      setState("failed");
      setError(cause instanceof Error ? cause.message : "The animated postcard retry failed.");
    }
  }, [levelId, job?.providerJobId, job?.lastError?.retryable, acceptJob]);

  return {
    state,
    job,
    video,
    error,
    canCreate: false,
    canRetry: Boolean(job?.providerJobId) && job?.lastError?.retryable !== false,
    create,
    retry,
  };
}
