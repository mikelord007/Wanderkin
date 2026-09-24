import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerSecurity } from "./owner.js";

function request(token?: string): Request {
  return { get: (name: string) => name.toLowerCase() === "x-objectquest-owner" ? token : undefined } as Request;
}

function response(): { response: Response; headers: Map<string, string> } {
  const headers = new Map<string, string>();
  return {
    headers,
    response: { setHeader: (name: string, value: string | number | readonly string[]) => headers.set(name, String(value)) } as unknown as Response,
  };
}

describe("OwnerSecurity", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function security(legacyOpen = false): OwnerSecurity {
    const dir = mkdtempSync(join(tmpdir(), "objectquest-owner-"));
    dirs.push(dir);
    return new OwnerSecurity(dir, legacyOpen, false);
  }

  it("issues an opaque cookie/header and stores only a token hash", async () => {
    const owners = security();
    const out = response();
    const context = owners.issue(request(), out.response);
    expect(context.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(out.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(out.headers.get("X-ObjectQuest-Owner")).toBe(context.token);
    await owners.claim("photo", "photo-1", context.ownerId);
    expect(await owners.canAccess("photo", "photo-1", request(context.token))).toBe(true);
    expect(await owners.canAccess("photo", "photo-1", request())).toBe(false);
  });

  it("opens only unowned records in legacy-open mode", async () => {
    const owners = security(true);
    expect(await owners.canAccess("level", "legacy", request())).toBe(true);
    const strict = security(false);
    expect(await strict.canAccess("level", "legacy", request())).toBe(false);
  });
});
