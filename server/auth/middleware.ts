import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { decodeJwt } from "jose";
import type { AuthConfig } from "./config.js";
import type { LegacyOwnership } from "./accounts.js";
import { isGatedRoute, isSafeMethod } from "./policy.js";
import {
  DEV_USER_HEADER,
  DEV_USER_ID,
  principalOf,
  SESSION_COOKIE,
  setPrincipal,
  type Principal,
} from "./principal.js";
import type { TokenVerifier } from "./verify.js";

const DEV_COOKIE_VALUE = `dev:${DEV_USER_ID}`;
const MAX_COOKIE_SECONDS = 24 * 60 * 60;
const DEV_COOKIE_SECONDS = 30 * 24 * 60 * 60;

export const STUB_PRINCIPAL: Omit<Principal, "via"> = {
  id: DEV_USER_ID,
  email: "explorer@wanderkin.local",
  emailVerified: false,
  provider: "stub",
  name: "Local explorer",
  avatarUrl: null,
};

interface Credential {
  kind: "bearer" | "dev";
  value: string;
  via: "header" | "cookie";
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readCredential(req: Request): Credential | undefined {
  const authorization = req.get("authorization");
  const bearer = authorization && /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (bearer) return { kind: "bearer", value: bearer, via: "header" };
  const dev = req.get(DEV_USER_HEADER);
  if (dev) return { kind: "dev", value: dev, via: "header" };
  const cookie = cookieValue(req.get("cookie"), SESSION_COOKIE);
  if (!cookie) return undefined;
  if (cookie.startsWith("dev:")) return { kind: "dev", value: cookie.slice(4), via: "cookie" };
  return { kind: "bearer", value: cookie, via: "cookie" };
}

function deny(res: Response, status: 401 | 403 | 503, message: string, code: string): void {
  res.status(status).json({ message, code });
}

export interface AuthRuntime {
  config: AuthConfig;
  verifier: TokenVerifier | null;
  legacy: LegacyOwnership;
}

/**
 * Attaches a verified principal to the request (never trusting anything the
 * current mode doesn't allow), then enforces the route policy:
 * - 503 when sign-in isn't configured (production without Supabase);
 * - 401 when a gated route has no valid credential;
 * - 403 when the only credential is the media cookie on a mutating request
 *   (cookies ride along cross-site; mutations must carry a header).
 */
export function createAuthenticate({ config, verifier }: AuthRuntime): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (config.mode === "off") { next(); return; }
    const gated = isGatedRoute(req.method, req.path);
    const credential = readCredential(req);
    let rejected = false;

    if (credential && (credential.via === "header" || isSafeMethod(req.method))) {
      if (credential.kind === "dev") {
        // Only the stub mode trusts the dev user, and config.ts never
        // resolves stub when NODE_ENV=production.
        if (config.mode === "stub" && !config.production && credential.value === DEV_USER_ID) {
          setPrincipal(req, { ...STUB_PRINCIPAL, via: credential.via });
        } else {
          rejected = true;
        }
      } else if (config.mode === "supabase" && verifier) {
        try {
          setPrincipal(req, { ...(await verifier(credential.value)), via: credential.via });
        } catch {
          rejected = true;
        }
      } else {
        rejected = true;
      }
    }

    if (!gated) { next(); return; }
    if (config.mode === "unconfigured") {
      deny(res, 503, "Sign-in is not configured on this server yet.", "auth_unconfigured"); return;
    }
    if (principalOf(req)) { next(); return; }
    if (credential?.via === "cookie" && !isSafeMethod(req.method)) {
      deny(res, 403, "This action needs a signed-in request, not just a cookie.", "auth_header_required"); return;
    }
    deny(
      res,
      401,
      rejected || credential ? "Your sign-in has expired. Please sign in again." : "Please sign in to continue.",
      rejected || credential ? "auth_invalid" : "auth_required",
    );
  };
}

function sessionCookie(value: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function publicUser(principal: Principal) {
  return {
    id: principal.id,
    email: principal.email,
    name: principal.name,
    avatarUrl: principal.avatarUrl,
    provider: principal.provider,
  };
}

/** /api/auth/*: public mode report, the media cookie, and "who am I". */
export function createAuthRouter({ config, legacy }: AuthRuntime): Router {
  const router = Router();

  router.get("/api/auth/config", (_req, res) => {
    res.json({
      mode: config.mode,
      reason: config.reason,
      supabaseUrl: config.supabaseUrl,
      legacyOwnerConfigured: config.legacyOwnerEmail !== null,
    });
  });

  router.get("/api/auth/me", async (req, res, next) => {
    try {
      const principal = principalOf(req)!;
      res.json({ mode: config.mode, user: publicUser(principal), legacyOwner: await legacy.isLegacyOwner(principal) });
    } catch (error) {
      next(error);
    }
  });

  // Called by the client after sign-in and after every token refresh. The
  // credential was just verified by `authenticate` (header only: a cookie
  // can't mint a cookie). First sign-in of the legacy owner binds the claim.
  router.post("/api/auth/session", async (req, res, next) => {
    try {
      const principal = principalOf(req)!;
      const credential = readCredential(req)!;
      let maxAge = DEV_COOKIE_SECONDS;
      let value = DEV_COOKIE_VALUE;
      if (credential.kind === "bearer") {
        value = credential.value;
        const exp = decodeJwt(credential.value).exp;
        maxAge = Math.min(MAX_COOKIE_SECONDS, typeof exp === "number" ? exp - Date.now() / 1000 : 0);
      }
      res.setHeader("Set-Cookie", sessionCookie(value, maxAge, config.production));
      res.setHeader("Cache-Control", "no-store");
      res.json({ mode: config.mode, user: publicUser(principal), legacyOwner: await legacy.isLegacyOwner(principal) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/api/auth/session", (_req, res) => {
    res.setHeader("Set-Cookie", sessionCookie("", 0, config.production));
    res.status(204).end();
  });

  return router;
}
