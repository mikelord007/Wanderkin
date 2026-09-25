export const DEFAULT_RETURN_PATH = "/worlds";
const RETURN_KEY = "wanderkin:auth:return-to";

/**
 * Only a same-origin, app-relative path may be a post-sign-in destination:
 * one leading "/", never "//" or "/\" (protocol-relative), no scheme, no
 * control characters. Anything else becomes the dashboard home, so a crafted
 * link can never bounce a fresh session off to another site.
 */
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return DEFAULT_RETURN_PATH;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_RETURN_PATH;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return DEFAULT_RETURN_PATH;
  if (value === "/auth/callback" || value.startsWith("/auth/callback?")) return DEFAULT_RETURN_PATH;
  try {
    const resolved = new URL(value, "https://wanderkin.invalid");
    if (resolved.origin !== "https://wanderkin.invalid") return DEFAULT_RETURN_PATH;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberReturnTo(path: string): void {
  sessionStore()?.setItem(RETURN_KEY, sanitizeReturnTo(path));
}

/** Reads and forgets the remembered destination. */
export function takeReturnTo(): string {
  const store = sessionStore();
  const value = store?.getItem(RETURN_KEY) ?? null;
  store?.removeItem(RETURN_KEY);
  return sanitizeReturnTo(value);
}
