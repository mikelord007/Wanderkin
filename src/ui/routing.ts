import { shareIdFromPath, sharePath } from "./shareRouting.js";

export { sharePath };

/**
 * Real pathname routes for every distinct top-level screen, so a direct
 * load, refresh, or browser back/forward resolves the same screen instead
 * of only ever landing on `/`. `App.tsx` is the sole place that turns a
 * `ParsedRoute` into a concrete `Screen` (it alone knows how to refetch the
 * data each screen needs); this module only owns the pure path<->route
 * mapping so it can be tested without React or the network.
 */

const SEGMENT = "[a-zA-Z0-9_-]+";
const GENERATING_RE = new RegExp(`^/create/generating/(${SEGMENT})$`);
const PREPARE_ASSET_RE = new RegExp(`^/create/prepare/(${SEGMENT})$`);
const EDIT_RE = new RegExp(`^/edit/(${SEGMENT})$`);
const PLAY_RE = new RegExp(`^/play/(${SEGMENT})$`);
const FINISH_RE = new RegExp(`^/finish/(${SEGMENT})$`);
const SHARE_PLAY_RE = new RegExp(`^/share/(${SEGMENT})/play$`);

export type ParsedRoute =
  | { kind: "start" }
  | { kind: "worlds" }
  | { kind: "create" }
  | { kind: "create-generating"; jobId: string }
  | { kind: "create-prepare" }
  | { kind: "create-prepare-asset"; assetId: string }
  | { kind: "edit"; levelId: string }
  | { kind: "play"; levelId: string }
  | { kind: "finish"; levelId: string }
  | { kind: "share"; shareId: string }
  | { kind: "share-play"; shareId: string }
  | { kind: "unknown" };

function decodeSegment(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function matchSegment(re: RegExp, path: string): string | null {
  const match = re.exec(path);
  return match ? decodeSegment(match[1]!) : null;
}

/** Pure parse: a pathname in, a typed route out. Never touches history. */
export function parseRoute(pathname: string): ParsedRoute {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "" || path === "/") return { kind: "start" };
  if (path === "/worlds") return { kind: "worlds" };
  if (path === "/create") return { kind: "create" };
  if (path === "/create/prepare") return { kind: "create-prepare" };

  const jobId = matchSegment(GENERATING_RE, path);
  if (jobId) return { kind: "create-generating", jobId };

  const prepareAssetId = matchSegment(PREPARE_ASSET_RE, path);
  if (prepareAssetId) return { kind: "create-prepare-asset", assetId: prepareAssetId };

  const editLevelId = matchSegment(EDIT_RE, path);
  if (editLevelId) return { kind: "edit", levelId: editLevelId };

  const sharePlayId = matchSegment(SHARE_PLAY_RE, path);
  if (sharePlayId) return { kind: "share-play", shareId: sharePlayId };

  const playLevelId = matchSegment(PLAY_RE, path);
  if (playLevelId) return { kind: "play", levelId: playLevelId };

  const finishLevelId = matchSegment(FINISH_RE, path);
  if (finishLevelId) return { kind: "finish", levelId: finishLevelId };

  const shareId = shareIdFromPath(path);
  if (shareId) return { kind: "share", shareId };

  return { kind: "unknown" };
}

export const pathForStart = (): string => "/";
export const pathForWorlds = (): string => "/worlds";
export const pathForCreate = (): string => "/create";
export const pathForGenerating = (jobId: string): string => `/create/generating/${encodeURIComponent(jobId)}`;
export const pathForPrepareNew = (): string => "/create/prepare";
export const pathForPrepareAsset = (assetId: string): string => `/create/prepare/${encodeURIComponent(assetId)}`;
export const pathForEdit = (levelId: string): string => `/edit/${encodeURIComponent(levelId)}`;
export const pathForPlay = (levelId: string): string => `/play/${encodeURIComponent(levelId)}`;
export const pathForFinish = (levelId: string): string => `/finish/${encodeURIComponent(levelId)}`;
export const pathForSharePlay = (shareId: string): string => `${sharePath(shareId)}/play`;

/**
 * Pushes or replaces the visible URL to `path`, preserving any existing
 * hash fragment (e.g. the legacy `#my-worlds` anchor link) so a routing
 * update never silently discards it. A no-op when the target already
 * matches the current URL, so callers can call this unconditionally after
 * every screen resolution without polluting browser history.
 */
export function navigateTo(path: string, replace = false): void {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  const target = `${path}${hash}`;
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (current === target) return;
  if (replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
}
