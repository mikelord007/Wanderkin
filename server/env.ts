import "dotenv/config";
import { resolve } from "node:path";

/** Express `sendFile` requires absolute paths. Resolve the configured storage
 * root once so every store and file-serving route shares the same safe base. */
export function resolveStorageDir(configured: string | undefined): string {
  return resolve(configured ?? "./storage");
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (/^(?:1|true|yes)$/i.test(value)) return true;
  if (/^(?:0|false|no)$/i.test(value)) return false;
  return fallback;
}

/** Server-only environment access. Never import this module from src/. */
export const env = {
  port: Number(process.env.PORT ?? 8787),
  storageDir: resolveStorageDir(process.env.STORAGE_DIR),
  // Falls back to the known public endpoint even if .env was never copied
  // from .env.example, so a fresh checkout still works out of the box.
  livepeerMcpEndpoint: process.env.LIVEPEER_MCP_ENDPOINT ?? "https://agent.livepeer.org/api/mcp/full",
  livepeerApiKey: process.env.LIVEPEER_API_KEY ?? "",
  livepeerMaxRequestUsd: positiveNumber(process.env.LIVEPEER_MAX_REQUEST_USD, 2),
  livepeerMaxWorldUsd: positiveNumber(process.env.LIVEPEER_MAX_WORLD_USD, 8),
  livepeerMaxGlobalUsd: positiveNumber(process.env.LIVEPEER_MAX_GLOBAL_USD, 100),
  livepeerMaxDailyUsd: positiveNumber(process.env.LIVEPEER_MAX_DAILY_USD, 20),
  livepeerMaxAutomaticRetries: boundedInteger(process.env.LIVEPEER_MAX_AUTOMATIC_RETRIES, 3, 0, 5),
  providerMaxInFlight: boundedInteger(process.env.PROVIDER_MAX_IN_FLIGHT, 4, 1, 100),
  providerConcurrencyRetrySeconds: boundedInteger(process.env.PROVIDER_CONCURRENCY_RETRY_SECONDS, 15, 1, 3_600),
  billableRateLimit: boundedInteger(process.env.BILLABLE_RATE_LIMIT, 10, 1, 10_000),
  uploadRateLimit: boundedInteger(process.env.UPLOAD_RATE_LIMIT, 30, 1, 10_000),
  rateLimitWindowSeconds: boundedInteger(process.env.RATE_LIMIT_WINDOW_SECONDS, 60, 1, 86_400),
  // Trusting forwarding headers is an explicit deployment choice. Keep it
  // disabled unless a trusted reverse proxy overwrites X-Forwarded-For.
  trustProxyHops: nonNegativeInteger(process.env.TRUST_PROXY_HOPS, 0),
  diagnosticsToken: process.env.DIAGNOSTICS_TOKEN ?? "",
  legacyOpen: booleanValue(process.env.OBJECTQUEST_LEGACY_OPEN, process.env.NODE_ENV !== "production"),
  secureOwnerCookie: booleanValue(process.env.OBJECTQUEST_SECURE_COOKIE, process.env.NODE_ENV === "production"),
};
