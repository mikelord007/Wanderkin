import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, AuthSession, AuthUser, GoogleIdentitySignIn } from "./types.js";

export const AUTH_CALLBACK_PATH = "/auth/callback";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Maps a Supabase session (Google identity) onto the app's own user shape. */
export function userFromSupabaseSession(session: Pick<Session, "user">): AuthUser {
  const { user } = session;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: text(user.email) ?? text(meta.email),
    name: text(meta.full_name) ?? text(meta.name),
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    provider: text(app.provider) ?? "google",
  };
}

/**
 * Real Google sign-in through Supabase Auth: PKCE, persisted session with
 * automatic refresh, callback handled on this origin's `/auth/callback`.
 * The SDK is loaded on first use, so the stub build never downloads it. Only
 * the public anon key is ever used here.
 *
 * With a Google client id the provider also offers `googleIdentity`: the ID
 * token comes from Google Identity Services on this origin and is exchanged
 * here; the resulting session is the same kind the redirect produces.
 */
export function createSupabaseAuthProvider(url: string, anonKey: string, googleClientId: string | null = null): AuthProvider {
  let clientPromise: Promise<SupabaseClient> | null = null;
  let current: Session | null = null;
  const listeners = new Set<(session: AuthSession | null) => void>();

  function client(): Promise<SupabaseClient> {
    clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) => {
      const created = createClient(url, anonKey, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "wanderkin-auth",
        },
      });
      created.auth.onAuthStateChange((_event, session) => {
        current = session;
        const mapped = session ? { user: userFromSupabaseSession(session) } : null;
        for (const listener of listeners) listener(mapped);
      });
      return created;
    });
    return clientPromise;
  }

  const googleIdentity: GoogleIdentitySignIn | undefined = googleClientId
    ? {
        clientId: googleClientId,
        async signInWithIdToken(token, rawNonce) {
          const supabase = await client();
          // onAuthStateChange fires SIGNED_IN for the listeners as well.
          const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token, nonce: rawNonce });
          if (error) throw error;
          if (!data.session) throw new Error("Supabase returned no session.");
          current = data.session;
          return { user: userFromSupabaseSession(data.session) };
        },
        prepare() { void client(); },
      }
    : undefined;

  return {
    mode: "supabase",
    ...(googleIdentity ? { googleIdentity } : {}),
    async init() {
      const params = new URLSearchParams(window.location.search);
      const callbackError = params.get("error_description") ?? params.get("error");
      const supabase = await client();
      // Resolves after the SDK has exchanged any `?code=` from the callback.
      const { data, error } = await supabase.auth.getSession();
      if (callbackError) throw new Error(callbackError);
      if (error) throw error;
      current = data.session;
      return data.session ? { user: userFromSupabaseSession(data.session) } : null;
    },
    async signIn() {
      const supabase = await client();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${AUTH_CALLBACK_PATH}`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      return null;
    },
    async signOut() {
      const supabase = await client();
      current = null;
      await supabase.auth.signOut({ scope: "local" });
    },
    async credentialHeaders(): Promise<Record<string, string>> {
      const supabase = await client();
      // getSession refreshes an expired access token before handing it out.
      const { data } = await supabase.auth.getSession();
      current = data.session;
      return current ? { Authorization: `Bearer ${current.access_token}` } : {};
    },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
