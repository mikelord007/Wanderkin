import type { Express } from "express";
import type { JWTVerifyGetKey } from "jose";
import { LegacyOwnership } from "./accounts.js";
import { resolveAuthConfig, type AuthConfig } from "./config.js";
import { createAuthenticate, createAuthRouter, type AuthRuntime } from "./middleware.js";
import { createSupabaseVerifier } from "./verify.js";

export { resolveAuthConfig, type AuthConfig } from "./config.js";
export { LegacyOwnership, type LegacyOwnerPolicy } from "./accounts.js";
export { principalOf, ownerIdFor, DEV_USER_ID, DEV_USER_HEADER, SESSION_COOKIE, type Principal } from "./principal.js";

export function createAuthRuntime(
  storageDir: string,
  config: AuthConfig = resolveAuthConfig(),
  options: { jwks?: JWTVerifyGetKey } = {},
): AuthRuntime {
  const verifier = config.mode === "supabase" && config.issuer
    ? createSupabaseVerifier({
        issuer: config.issuer,
        jwksUrl: config.jwksUrl,
        jwtSecret: config.jwtSecret,
        ...(options.jwks ? { jwks: options.jwks } : {}),
      })
    : null;
  return { config, verifier, legacy: new LegacyOwnership(storageDir, config) };
}

/** Mounts authentication before every API router. Call before the routers. */
export function installAuth(app: Express, runtime: AuthRuntime): void {
  app.use(createAuthenticate(runtime));
  app.use(createAuthRouter(runtime));
}

/** One boot line so it's obvious which sign-in the server trusts. */
export function describeAuth(config: AuthConfig): string {
  const legacy = config.legacyOwnerEmail ? "legacy owner email set" : "no legacy owner email";
  return `[auth] mode=${config.mode} (${config.reason}); ${legacy}`;
}
