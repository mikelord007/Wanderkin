import { useCallback, useEffect, useMemo, useState } from "react";
import { visibleToCurrentOwner } from "../../auth/credentials.js";
import { getJob, retryJob, describeApiError } from "../api.js";
import { createBuildPoller } from "../buildPoller.js";
import { loadCreationRecords, saveCreationRecord, updateCreationJob } from "../creationStorage.js";
import { unfinishedBuildJobs, type PendingWorld } from "../pendingWorlds.js";
import { discardPendingWorld, loadPendingWorldCards } from "../pendingWorldStore.js";

/** One poller for the whole app: every card shares its single timer. */
const sharedPoller = createBuildPoller({ fetchJob: getJob });

function buildRecords() {
  return loadCreationRecords().filter((record) => visibleToCurrentOwner(record.ownerId));
}

/**
 * The builds shown on My worlds, kept fresh by the shared poller. Each fresh
 * job is written back into its creation record, so a reload, the progress
 * screen and the card all agree.
 */
export function usePendingWorlds() {
  const [cards, setCards] = useState<PendingWorld[]>(() => loadPendingWorldCards());
  const [retrying, setRetrying] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const reload = useCallback(() => setCards(loadPendingWorldCards()), []);

  // Only the set of unfinished jobs decides what is watched, so progress
  // updates within a job never restart the poller.
  const watchKey = useMemo(
    () => buildRecords().flatMap((record) => unfinishedBuildJobs(record).map(({ stage, jobId }) => `${record.id}:${stage}:${jobId}`)).sort().join("|"),
    // Recomputed whenever the cards change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards],
  );

  useEffect(() => {
    if (!watchKey) return;
    const unwatch = watchKey.split("|").map((entry) => {
      const [recordId, stage, jobId] = entry.split(":") as [string, "shape" | "story" | "music", string];
      return sharedPoller.watch(jobId, (job) => {
        const current = loadCreationRecords().find((record) => record.id === recordId);
        if (!current) return;
        saveCreationRecord(updateCreationJob(current, stage, job));
        reload();
      });
    });
    return () => unwatch.forEach((stop) => stop());
  }, [watchKey, reload]);

  // The "Started 4 min ago" hint only needs a minute's accuracy.
  const anyBuilding = cards.some((card) => card.state === "building");
  useEffect(() => {
    if (!anyBuilding) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [anyBuilding]);

  const retry = useCallback(async (world: PendingWorld) => {
    const stage = world.retryStage;
    const record = loadCreationRecords().find((candidate) => candidate.id === world.id);
    const ref = stage && record ? record.jobs[stage] : undefined;
    if (!stage || !record || !ref) return;
    setRetrying(world.id);
    setErrors(({ [world.id]: _dropped, ...rest }) => rest);
    try {
      // The same retry WorldProgressScreen uses: the same job, photo and choices.
      const next = await retryJob(ref.id);
      saveCreationRecord(updateCreationJob(record, stage, next));
      reload();
    } catch (error) {
      setErrors((current) => ({ ...current, [world.id]: describeApiError(error) }));
    } finally {
      setRetrying(null);
    }
  }, [reload]);

  const discard = useCallback((world: PendingWorld) => {
    discardPendingWorld(world.id);
    reload();
  }, [reload]);

  return { cards, now, retrying, errors, retry, discard, reload };
}
