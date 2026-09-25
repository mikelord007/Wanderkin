import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import type { Principal } from "./principal.js";

export class TokenRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRejectedError";
  }
}

export type TokenVerifier = (token: string) => Promise<Principal>;

const ASYMMETRIC_ALGORITHMS = ["ES256", "RS256", "EdDSA"];
const AUDIENCE = "authenticated";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function principalFromClaims(payload: JWTPayload): Principal {
  const sub = text(payload.sub);
  if (!sub) throw new TokenRejectedError("token has no subject");
  const app = record(payload.app_metadata);
  const meta = record(payload.user_metadata);
  const provider = text(app.provider) ?? "email";
  return {
    id: sub,
    email: text(payload.email)?.toLowerCase() ?? null,
    // Google only hands Supabase verified addresses; other providers must say so.
    emailVerified: meta.email_verified === true || provider === "google",
    provider,
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    via: "header",
  };
}

/**
 * Verifies a Supabase access token: signature, issuer, audience and expiry.
 *
 * Asymmetric tokens (ES256/RS256/EdDSA, the default for current Supabase
 * projects) are checked against the project's public JWKS, fetched from
 * `<issuer>/.well-known/jwks.json` and cached by `jose` (with rotation). Older
 * projects that still sign HS256 tokens need `SUPABASE_JWT_SECRET`; without
 * it such a token is rejected. `alg: none` and anything unlisted is rejected.
 */
export function createSupabaseVerifier(options: {
  issuer: string;
  jwksUrl?: string | null;
  /** Injected in tests (a local key set) so the real verify path runs offline. */
  jwks?: JWTVerifyGetKey;
  jwtSecret?: string | null;
}): TokenVerifier {
  const jwks = options.jwks ?? (options.jwksUrl
    ? createRemoteJWKSet(new URL(options.jwksUrl), { cacheMaxAge: 10 * 60_000, cooldownDuration: 30_000 })
    : null);
  const secret = options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : null;
  let warnedMissingSecret = false;

  return async (token) => {
    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      throw new TokenRejectedError("malformed token");
    }
    try {
      if (alg === "HS256") {
        if (!secret) {
          if (!warnedMissingSecret) {
            warnedMissingSecret = true;
            // eslint-disable-next-line no-console
            console.warn("[auth] Received an HS256 Supabase token but SUPABASE_JWT_SECRET is not set; rejecting it.");
          }
          throw new TokenRejectedError("HS256 tokens need SUPABASE_JWT_SECRET");
        }
        const { payload } = await jwtVerify(token, secret, { issuer: options.issuer, audience: AUDIENCE, algorithms: ["HS256"] });
        return principalFromClaims(payload);
      }
      if (!alg || !ASYMMETRIC_ALGORITHMS.includes(alg) || !jwks) throw new TokenRejectedError("unsupported token algorithm");
      const { payload } = await jwtVerify(token, jwks, { issuer: options.issuer, audience: AUDIENCE, algorithms: ASYMMETRIC_ALGORITHMS });
      return principalFromClaims(payload);
    } catch (error) {
      if (error instanceof TokenRejectedError) throw error;
      throw new TokenRejectedError(error instanceof Error ? error.message : "invalid token");
    }
  };
}
