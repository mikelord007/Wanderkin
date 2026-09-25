/**
 * Which API routes need a signed-in user. Fail closed: everything under /api
 * is gated unless it appears below. Public routes are the health/config
 * endpoints, share links, and the media-by-URL reads, which are still
 * guarded per record by OwnerSecurity (published and bundled media are "*",
 * private media answers 404 to anyone else).
 *
 * Express matches routes case-insensitively and ignores a trailing slash,
 * so the path is normalised the same way before it is checked.
 */

const PUBLIC_ANY_METHOD: readonly RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/movement-config$/,
  /^\/api\/capabilities$/,
  /^\/api\/auth\/config$/,
  // Protected by its own diagnostics token.
  /^\/api\/admin\/spend$/,
];

const PUBLIC_READS: readonly RegExp[] = [
  /^\/api\/shares\/[^/]+$/,
  /^\/api\/photos\/files\/[^/]+$/,
  /^\/api\/assets\/files\/[^/]+$/,
  /^\/api\/assets\/(?!import$)[^/]+$/,
  /^\/api\/generated-assets\/files\/[^/]+$/,
  /^\/api\/generated-assets\/[^/]+$/,
];

export function normaliseApiPath(path: string): string {
  const lower = path.toLowerCase();
  return lower.length > 1 ? lower.replace(/\/+$/, "") : lower;
}

export function isSafeMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD";
}

export function isGatedRoute(method: string, path: string): boolean {
  const normalised = normaliseApiPath(path);
  if (normalised !== "/api" && !normalised.startsWith("/api/")) return false;
  if (PUBLIC_ANY_METHOD.some((pattern) => pattern.test(normalised))) return false;
  // Signing out must work even when the session has already expired.
  if (method.toUpperCase() === "DELETE" && normalised === "/api/auth/session") return false;
  if (isSafeMethod(method) && PUBLIC_READS.some((pattern) => pattern.test(normalised))) return false;
  return true;
}
