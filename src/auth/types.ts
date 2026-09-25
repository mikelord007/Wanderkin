/**
 * Client-side sign-in boundary. The app only ever talks to an `AuthProvider`;
 * which one it gets (real Supabase Google sign-in, or the local stub used
 * until keys exist) is decided once from the environment in `config.ts`.
 */

export type AuthMode = "supabase" | "stub" | "unconfigured";

export interface AuthUser {
  /** Stable account id: the Supabase user id, or "local-dev" for the stub. */
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** "google" for real sign-in, "stub" for the local dev user. */
  provider: string;
}

export interface AuthSession {
  user: AuthUser;
}

export interface AuthProvider {
  readonly mode: AuthMode;
  /** Restores a persisted session. The Supabase provider also completes an
   * OAuth callback that is sitting in the URL. */
  init(): Promise<AuthSession | null>;
  /** Stub: resolves with the session at once. Supabase: leaves the page for
   * Google and resolves null (the session arrives on the callback). */
  signIn(returnTo: string): Promise<AuthSession | null>;
  signOut(): Promise<void>;
  /** Headers that prove who is calling the Wanderkin API. */
  credentialHeaders(): Promise<Record<string, string>>;
  onChange(listener: (session: AuthSession | null) => void): () => void;
}

/** Header the server trusts for the stub user, outside production only. */
export const DEV_USER_HEADER = "X-Wanderkin-Dev-User";
export const DEV_USER_ID = "local-dev";
