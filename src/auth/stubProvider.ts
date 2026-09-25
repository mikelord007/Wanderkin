import { DEV_USER_HEADER, DEV_USER_ID, type AuthProvider, type AuthSession, type AuthUser } from "./types.js";

const STUB_SESSION_KEY = "wanderkin:auth:stub-session";

export const STUB_USER: AuthUser = {
  id: DEV_USER_ID,
  email: "explorer@wanderkin.local",
  name: "Local explorer",
  avatarUrl: null,
  provider: "stub",
};

/**
 * Development-only sign-in used until Supabase keys are configured: "Sign in"
 * succeeds instantly as one stable local user, remembered in localStorage.
 * The server accepts this user only outside production, and `config.ts`
 * never selects this provider in a production build.
 */
export function createStubAuthProvider(storage: Storage | null = safeLocalStorage()): AuthProvider {
  const listeners = new Set<(session: AuthSession | null) => void>();
  const emit = (session: AuthSession | null) => { for (const listener of listeners) listener(session); };

  return {
    mode: "stub",
    async init() {
      return storage?.getItem(STUB_SESSION_KEY) === DEV_USER_ID ? { user: STUB_USER } : null;
    },
    async signIn() {
      storage?.setItem(STUB_SESSION_KEY, DEV_USER_ID);
      const session = { user: STUB_USER };
      emit(session);
      return session;
    },
    async signOut() {
      storage?.removeItem(STUB_SESSION_KEY);
      emit(null);
    },
    async credentialHeaders(): Promise<Record<string, string>> {
      return storage?.getItem(STUB_SESSION_KEY) === DEV_USER_ID ? { [DEV_USER_HEADER]: DEV_USER_ID } : {};
    },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
