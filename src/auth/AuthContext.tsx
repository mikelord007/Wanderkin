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
import { createSupabaseAuthProvider } from "./supabaseProvider.js";
import type { AuthMode, AuthProvider, AuthSession, AuthUser } from "./types.js";

export type AuthStatus = "loading" | "signed-in" | "signed-out";

export interface AuthState {
  status: AuthStatus;
  mode: AuthMode;
  user: AuthUser | null;
  /** A sign-in or callback problem worth showing on the landing. */
  error: string | null;
  /** Stub: signs in and resolves the destination to open. Supabase: leaves
   * for Google and never resolves a destination (null). */
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
    return createSupabaseAuthProvider(config.supabaseUrl, config.supabaseAnonKey);
  }
  if (!import.meta.env.PROD && config.mode === "stub") return createStubAuthProvider();
  return unconfiguredProvider();
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthSessionProvider({ children, provider: supplied }: { children: ReactNode; provider?: AuthProvider }) {
  const providerRef = useRef<AuthProvider | null>(null);
  providerRef.current ??= supplied ?? createAuthProvider();
  const provider = providerRef.current;

  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const signIn = useCallback(async (returnTo?: string) => {
    setError(null);
    rememberReturnTo(returnTo ?? "/worlds");
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
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthSessionProvider>.");
  return value;
}
