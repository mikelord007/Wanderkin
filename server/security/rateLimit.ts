import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  message: string;
  now?: () => number;
}

const OWNER_HEADER = "x-objectquest-owner";
const OWNER_COOKIE = "objectquest_owner";

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

/**
 * A stable, non-secret client key. Owner tokens are hashed before they are
 * retained in memory; IP remains part of the key so sharing a token does not
 * create a single easy-to-exhaust bucket across networks.
 */
export function rateLimitClientKey(req: Request): string {
  const ownerToken = req.get(OWNER_HEADER) ?? cookieValue(req.get("cookie"), OWNER_COOKIE);
  const owner = ownerToken
    ? createHash("sha256").update(ownerToken).digest("hex").slice(0, 24)
    : "anonymous";
  return `${req.ip || req.socket.remoteAddress || "unknown"}:${owner}`;
}

/** In-process fixed-window limiter for the supported single API instance. */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, RateLimitBucket>();
  const now = options.now ?? Date.now;
  let nextSweepAt = 0;

  return (req: Request, res: Response, next: NextFunction): void => {
    const timestamp = now();
    if (timestamp >= nextSweepAt) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= timestamp) buckets.delete(key);
      }
      nextSweepAt = timestamp + options.windowMs;
    }

    const key = rateLimitClientKey(req);
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + options.windowMs }
      : existing;
    bucket.count += 1;
    buckets.set(key, bucket);

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
    res.setHeader("RateLimit-Limit", String(options.limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.limit - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > options.limit) {
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ message: options.message });
      return;
    }
    next();
  };
}

export function isBillableRoute(req: Request): boolean {
  if (req.method !== "POST") return false;
  return (
    req.path === "/api/jobs" ||
    req.path === "/api/jobs/generate" ||
    req.path === "/api/jobs/previews" ||
    /^\/api\/jobs\/[^/]+\/retry$/.test(req.path) ||
    /^\/api\/(?:quests?|audio|postcards?)(?:\/|$)/.test(req.path)
  );
}

export function isUploadRoute(req: Request): boolean {
  return req.method === "POST" && (
    req.path === "/api/uploads" ||
    /(?:^|\/)screenshots?(?:\/|$)/.test(req.path)
  );
}
