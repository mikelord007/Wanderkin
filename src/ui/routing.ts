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
  | { kind: "samples" }
  | { kind: "account" }
  | { kind: "auth-callback" }
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
  if (path === "/samples") return { kind: "samples" };
  if (path === "/account") return { kind: "account" };
  if (path === "/auth/callback") return { kind: "auth-callback" };
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
export const pathForSamples = (): string => "/samples";
export const pathForAccount = (): string => "/account";
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

/**
 * Some routes only resolve to a `Screen` after an async fetch (see
 * `App.tsx`'s `resolveScreen`). Without a guard, a slow fetch for an older
 * navigation (e.g. `/edit/:id`) can finish *after* the user has already
 * navigated elsewhere (Back, Home, another link) and silently snap them
 * back into the stale screen — including rewriting the URL back via
 * `history.replaceState`. A `NavigationGuard` fixes this: every navigation
 * attempt (initial load, `popstate`, or an in-app `go()`) calls `begin()`
 * first, which invalidates every earlier attempt regardless of whether
 * that earlier attempt is still pending, already settled, or resolves out
 * of order later — only the result whose token is still current when it
 * arrives may be applied. This covers both an eventually-successful stale
 * resolution and a stale *fallback* result (routes like `/edit/:id` already
 * resolve their own fetch failure to a fallback `Screen`, e.g. `start`,
 * rather than rejecting — so "current" is the only thing that matters,
 * not success vs. failure).
 */
export interface NavigationGuard {
  /** Call once, synchronously, at the start of every navigation attempt —
   * including ones that resolve synchronously — so any still-pending async
   * attempt from before is superseded. Returns a token to check later. */
  begin(): number;
  /** True only if `token` is still the most recently started attempt. */
  isCurrent(token: number): boolean;
}

export function createNavigationGuard(): NavigationGuard {
  let token = 0;
  return {
    begin: () => {
      token += 1;
      return token;
    },
    isCurrent: (started: number) => started === token,
  };
}
