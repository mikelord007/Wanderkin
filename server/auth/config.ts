/**
 * Server sign-in configuration, resolved once from the environment.
 *
 * `auto` (the default) means: verify real Supabase tokens as soon as a
 * Supabase URL is configured, otherwise trust the local stub user — but only
 * outside production. Production never trusts the stub, whatever is asked;
 * without Supabase it is "unconfigured" and every gated route fails closed.
 */

export type ServerAuthMode = "supabase" | "stub" | "off" | "unconfigured";

export interface AuthConfig {
  mode: ServerAuthMode;
  production: boolean;
  /** e.g. https://abcd.supabase.co (no trailing slash). */
  supabaseUrl: string | null;
  /** `${supabaseUrl}/auth/v1`, the `iss` of every Supabase access token. */
  issuer: string | null;
  jwksUrl: string | null;
  jwtSecret: string | null;
  /** Lower-cased; the Google account that claims pre-sign-in worlds. */
  legacyOwnerEmail: string | null;
  /** Why the mode was chosen, for the boot log and /api/auth/config. */
  reason: string;
}

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normaliseUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveAuthConfig(source: Record<string, string | undefined> = process.env): AuthConfig {
  const production = source.NODE_ENV === "production";
  const requested = (present(source.WANDERKIN_AUTH_MODE) ?? "auto").toLowerCase();
  const supabaseUrl = normaliseUrl(present(source.SUPABASE_URL) ?? present(source.VITE_SUPABASE_URL));
  const issuer = supabaseUrl ? `${supabaseUrl}/auth/v1` : null;
  const base = {
    production,
    supabaseUrl,
    issuer,
    jwksUrl: issuer ? `${issuer}/.well-known/jwks.json` : null,
    jwtSecret: present(source.SUPABASE_JWT_SECRET),
    legacyOwnerEmail: present(source.WANDERKIN_LEGACY_OWNER_EMAIL)?.toLowerCase() ?? null,
  };

  if (requested === "stub" || requested === "off") {
    if (production) {
      return { ...base, mode: "unconfigured", reason: `WANDERKIN_AUTH_MODE=${requested} is refused in production` };
    }
    return { ...base, mode: requested, reason: `WANDERKIN_AUTH_MODE=${requested}` };
  }
  if (supabaseUrl) return { ...base, mode: "supabase", reason: "Supabase URL configured" };
  if (requested === "supabase") {
    return { ...base, mode: "unconfigured", reason: "WANDERKIN_AUTH_MODE=supabase but no SUPABASE_URL / VITE_SUPABASE_URL" };
  }
  if (production) return { ...base, mode: "unconfigured", reason: "production without Supabase configuration" };
  return { ...base, mode: "stub", reason: "no Supabase keys yet; local dev sign-in" };
}
