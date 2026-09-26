import type { AuthMode } from "./types.js";

export interface ClientAuthEnv {
  PROD: boolean;
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_ANON_KEY?: string | undefined;
  VITE_WANDERKIN_AUTH_MODE?: string | undefined;
  VITE_GOOGLE_CLIENT_ID?: string | undefined;
}

export interface ClientAuthConfig {
  mode: AuthMode;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** Public Google OAuth web client id. With it, Google sign-in runs on this
   * origin (Google Identity Services); without it, the Supabase redirect. */
  googleClientId: string | null;
}

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Real Google sign-in whenever both Supabase keys are present; otherwise the
 * local stub, which exists only in development builds. A production build
 * without keys is "unconfigured": nothing gated opens, and the stub can never
 * be forced on (`VITE_WANDERKIN_AUTH_MODE=stub` is ignored there).
 */
export function resolveClientAuthConfig(env: ClientAuthEnv): ClientAuthConfig {
  const supabaseUrl = present(env.VITE_SUPABASE_URL);
  const supabaseAnonKey = present(env.VITE_SUPABASE_ANON_KEY);
  const hasKeys = supabaseUrl !== null && supabaseAnonKey !== null;
  const requested = present(env.VITE_WANDERKIN_AUTH_MODE)?.toLowerCase() ?? "auto";

  let mode: AuthMode;
  if (requested === "stub" && !env.PROD) mode = "stub";
  else if (hasKeys) mode = "supabase";
  else mode = env.PROD ? "unconfigured" : "stub";

  // Only meaningful for real sign-in: the stub never talks to Google.
  const googleClientId = mode === "supabase" ? present(env.VITE_GOOGLE_CLIENT_ID) : null;

  return { mode, supabaseUrl, supabaseAnonKey, googleClientId };
}

export function clientAuthConfig(): ClientAuthConfig {
  return resolveClientAuthConfig({
    PROD: import.meta.env.PROD,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
    VITE_WANDERKIN_AUTH_MODE: import.meta.env.VITE_WANDERKIN_AUTH_MODE as string | undefined,
    VITE_GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  });
}
