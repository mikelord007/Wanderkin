import { visibleToCurrentOwner } from "../auth/credentials.js";
import type { CreationRecord } from "./creationFlow.js";
import { clearActiveCreationId, loadActiveCreation, loadCreationRecords, removeCreationRecord } from "./creationStorage.js";
import { isBuildRecord, pendingWorldsFrom, type PendingWorld } from "./pendingWorlds.js";

/*
 * The My worlds side of a build. When Create submits the 3D shape, the
 * creation is handed over here: Create forgets it (so "Create a world" starts
 * again at step 1) and My worlds shows it as a card. The records stay in the
 * creation store; this only adds when each build started, for the card's
 * time hint.
 */

const BUILD_STARTS_KEY = "objectquest:v2:build-started";

function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadBuildStarts(storage: Storage | null = storageOrNull()): Record<string, string> {
  if (!storage) return {};
  try {
    const value = JSON.parse(storage.getItem(BUILD_STARTS_KEY) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

function saveBuildStarts(starts: Record<string, string>, storage: Storage | null): void {
  storage?.setItem(BUILD_STARTS_KEY, JSON.stringify(starts));
}

/** The building creations this account can see, as cards, newest first. */
export function loadPendingWorldCards(storage: Storage | null = storageOrNull()): PendingWorld[] {
  const records = loadCreationRecords(storage).filter((record) => visibleToCurrentOwner(record.ownerId));
  return pendingWorldsFrom(records, loadBuildStarts(storage));
}

/**
 * Hands a creation whose 3D build was just submitted over to My worlds:
 * notes when it started, and clears the active creation so Create starts
 * fresh at step 1. The creation record itself, with its job ids, stays
 * exactly where it is. (The caller also clears the older reload-recovery
 * record in jobStorage.)
 */
export function handOffBuild(record: CreationRecord, now = new Date().toISOString(), storage: Storage | null = storageOrNull()): void {
  if (!isBuildRecord(record)) return;
  const starts = loadBuildStarts(storage);
  if (!starts[record.id]) saveBuildStarts({ ...starts, [record.id]: now }, storage);
  if (loadActiveCreation(storage)?.id === record.id) clearActiveCreationId(storage);
}

/** Where Create goes once a build's 3D shape job exists. */
export type StartedBuildDestination = { name: "worlds"; notice: string } | { name: "generation"; jobId: string };

/**
 * Signed in (with Google through Supabase or the local stub alike), the
 * build is handed over to My worlds, with a note saying so, so another world
 * can be started at once. Otherwise, or when this device has no record of
 * the creation, its progress screen opens instead.
 */
export function destinationForStartedBuild(jobId: string, signedIn: boolean, now = new Date().toISOString(), storage: Storage | null = storageOrNull()): StartedBuildDestination {
  const creation = findCreationByShapeJob(jobId, storage);
  if (!signedIn || !creation) return { name: "generation", jobId };
  handOffBuild(creation, now, storage);
  return { name: "worlds", notice: "Building your world. Watch it here." };
}

/** The creation whose 3D build is this job, if this device has it. */
export function findCreationByShapeJob(jobId: string, storage: Storage | null = storageOrNull()): CreationRecord | null {
  return loadCreationRecords(storage).find((record) => record.jobs.shape?.id === jobId) ?? null;
}

/** Forgets a build on this device. The server job is not cancelled (there is
 * no cancel endpoint); it simply stops being shown. */
export function discardPendingWorld(id: string, storage: Storage | null = storageOrNull()): void {
  removeCreationRecord(id, storage);
  const starts = loadBuildStarts(storage);
  if (id in starts) {
    delete starts[id];
    saveBuildStarts(starts, storage);
  }
  if (loadActiveCreation(storage)?.id === id) clearActiveCreationId(storage);
}
