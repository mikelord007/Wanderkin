import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clientAuthConfig } from "./config.js";
import {
  clearServerSession,
  installCredentialSource,
  setCurrentOwnerId,
  syncServerSession,
} from "./credentials.js";
import { rememberReturnTo, takeReturnTo } from "./returnTo.js";
import { createStubAuthProvider } from "./stubProvider.js";
import { GoogleSignInCard } from "../ui/auth/GoogleSignInCard.js";
import { createSupabaseAuthProvider } from "./supabaseProvider.js";
import type { AuthMode, AuthProvider, AuthSession, AuthUser } from "./types.js";

export type AuthStatus = "loading" | "signed-in" | "signed-out";

export interface AuthState {
  status: AuthStatus;
  mode: AuthMode;
  user: AuthUser | null;
  /** A sign-in or callback problem worth showing on the landing. */
  error: string | null;
  /** Stub: signs in and resolves the destination to open. Supabase with a
   * Google client id: opens the Google card and resolves the destination once
   * signed in there (null if it is closed or falls back to the redirect).
   * Supabase without one: leaves for Google and resolves null. */
  signIn: (returnTo?: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

function unconfiguredProvider(): AuthProvider {
  return {
    mode: "unconfigured",
    async init() { return null; },
    async signIn() { throw new Error("Sign-in isn’t set up on this site yet."); },
    async signOut() {},
    async credentialHeaders() { return {}; },
    onChange() { return () => {}; },
  };
}

/** Picks the provider once per page from the build's environment. The stub
 * branch is dead code in production builds (`import.meta.env.PROD`). */
export function createAuthProvider(): AuthProvider {
  const config = clientAuthConfig();
  if (config.mode === "supabase" && config.supabaseUrl && config.supabaseAnonKey) {
    return createSupabaseAuthProvider(config.supabaseUrl, config.supabaseAnonKey, config.googleClientId);
  }
  if (!import.meta.env.PROD && config.mode === "stub") return createStubAuthProvider();
  return unconfiguredProvider();
}

const AuthContext = createContext<AuthState | null>(null);

/** One open Google card and the `signIn` call waiting on it. */
interface GoogleCardRequest {
  returnTo: string;
  resolve: (destination: string | null) => void;
}

export function AuthSessionProvider({ children, provider: supplied }: { children: ReactNode; provider?: AuthProvider }) {
  const providerRef = useRef<AuthProvider | null>(null);
  providerRef.current ??= supplied ?? createAuthProvider();
  const provider = providerRef.current;

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleCard, setGoogleCard] = useState<GoogleCardRequest | null>(null);
  const googleCardRef = useRef<GoogleCardRequest | null>(null);

  const apply = useCallback((session: AuthSession | null) => {
    setCurrentOwnerId(session?.user.id ?? null);
    setUser(session?.user ?? null);
    setStatus(session ? "signed-in" : "signed-out");
  }, []);

  useEffect(() => {
    installCredentialSource(() => provider.credentialHeaders());
    let cancelled = false;
    const unsubscribe = provider.onChange((session) => {
      if (cancelled) return;
      apply(session);
      // Keeps the media cookie in step with a refreshed access token.
      if (session) void syncServerSession();
    });
    provider.init().then(
      async (session) => {
        if (cancelled) return;
        if (session) await syncServerSession();
        apply(session);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Sign-in didn’t finish. Please try again.");
        apply(null);
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [apply, provider]);

  const closeGoogleCard = useCallback((destination: string | null) => {
    const request = googleCardRef.current;
    googleCardRef.current = null;
    setGoogleCard(null);
    request?.resolve(destination);
  }, []);

  const signIn = useCallback(async (returnTo?: string) => {
    setError(null);
    rememberReturnTo(returnTo ?? "/worlds");
    if (provider.googleIdentity) {
      provider.googleIdentity.prepare();
      googleCardRef.current?.resolve(null);
      return new Promise<string | null>((resolve) => {
        const request = { returnTo: returnTo ?? "/worlds", resolve };
        googleCardRef.current = request;
        setGoogleCard(request);
      });
    }
    try {
      const session = await provider.signIn(returnTo ?? "/worlds");
      if (!session) return null;
      await syncServerSession();
      apply(session);
      return takeReturnTo();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in didn’t start. Please try again.");
      return null;
    }
  }, [apply, provider]);

  const signInWithGoogleCredential = useCallback(async (token: string, rawNonce: string) => {
    const session = await provider.googleIdentity!.signInWithIdToken(token, rawNonce);
    await syncServerSession();
    apply(session);
    closeGoogleCard(takeReturnTo());
  }, [apply, closeGoogleCard, provider]);

  /** The standard redirect sign-in, from the card. */
  const signInWithRedirect = useCallback(async () => {
    const returnTo = googleCardRef.current?.returnTo ?? "/worlds";
    try {
      await provider.signIn(returnTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in didn’t start. Please try again.");
      closeGoogleCard(null);
    }
  }, [closeGoogleCard, provider]);

  const signOut = useCallback(async () => {
    try {
      await provider.signOut();
    } finally {
      await clearServerSession();
      apply(null);
    }
  }, [apply, provider]);

  const value = useMemo<AuthState>(
    () => ({ status, mode: provider.mode, user, error, signIn, signOut }),
    [error, provider.mode, signIn, signOut, status, user],
  );
  return (
    <AuthContext.Provider value={value}>
      {children}
      {googleCard && provider.googleIdentity && (
        <GoogleSignInCard
          clientId={provider.googleIdentity.clientId}
          onCredential={signInWithGoogleCredential}
          onFallback={() => { void signInWithRedirect(); }}
          onClose={() => closeGoogleCard(null)}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthSessionProvider>.");
  return value;
}
