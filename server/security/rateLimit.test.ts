import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rateLimit.js";

function request(owner?: string): Request {
  return {
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    get(name: string) {
      if (name.toLowerCase() === "x-objectquest-owner") return owner;
      return undefined;
    },
  } as unknown as Request;
}

function response() {
  const headers = new Map<string, string>();
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
  } as unknown as Response;
  return { res, headers };
}

describe("createRateLimiter", () => {
  it("returns a stable 429 with Retry-After and resets after the window", () => {
    let now = 1_000;
    const limiter = createRateLimiter({ limit: 1, windowMs: 5_000, message: "Slow down.", now: () => now });
    const next = vi.fn() as NextFunction;
    const first = response();
    limiter(request("owner-a"), first.res, next);
    expect(next).toHaveBeenCalledTimes(1);

    const blocked = response();
    limiter(request("owner-a"), blocked.res, next);
    expect(blocked.res.status).toHaveBeenCalledWith(429);
    expect(blocked.res.json).toHaveBeenCalledWith({ message: "Slow down." });
    expect(blocked.headers.get("Retry-After")).toBe("5");

    now = 6_001;
    limiter(request("owner-a"), response().res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("uses the owner token as part of the client bucket", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 5_000, message: "Slow down." });
    const next = vi.fn() as NextFunction;
    limiter(request("owner-a"), response().res, next);
    limiter(request("owner-b"), response().res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
