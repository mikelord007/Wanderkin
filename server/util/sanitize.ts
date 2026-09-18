/**
 * Redacts URLs (which may carry provider tokens/signed-URL query strings —
 * see the base64-obfuscated blob URLs in outputs/room-corner-comparison/
 * rodin-response.json) and caps length before an upstream/provider message
 * is allowed anywhere in a client-facing JSON response. Raw provider text
 * belongs only in server logs / `JobInternal.lastProviderStatusRaw`, never
 * in `GenerationJob.lastError` or a route's error body.
 */
export function sanitizeMessage(message: string, maxLength = 300): string {
  const withoutUrls = message.replace(/https?:\/\/\S+/gi, "[redacted-url]");
  return withoutUrls.length > maxLength ? `${withoutUrls.slice(0, maxLength)}…` : withoutUrls;
}

/** Server-only diagnostic log — never forwarded to the client. */
export function logServerError(context: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[${context}]`, err instanceof Error ? err.stack ?? err.message : err);
}
