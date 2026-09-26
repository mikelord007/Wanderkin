import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveClientAuthConfig } from "./config.js";
import {
  authHeaders,
  clearServerSession,
  installCredentialSource,
  setCurrentOwnerId,
  syncServerSession,
  visibleToCurrentOwner,
} from "./credentials.js";
import { DEFAULT_RETURN_PATH, sanitizeReturnTo } from "./returnTo.js";
import { createStubAuthProvider, STUB_USER } from "./stubProvider.js";
import { userFromSupabaseSession } from "./supabaseProvider.js";
import { DEV_USER_HEADER } from "./types.js";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("client auth mode", () => {
  const keys = { VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" };

  it("uses real Supabase sign-in as soon as both keys exist, in dev and production", () => {
    expect(resolveClientAuthConfig({ PROD: false, ...keys }).mode).toBe("supabase");
    expect(resolveClientAuthConfig({ PROD: true, ...keys })).toEqual({
      mode: "supabase", supabaseUrl: "https://abc.supabase.co", supabaseAnonKey: "anon", googleClientId: null,
    });
  });

  it("reads the Google client id for real sign-in, trimmed, and treats blank as absent", () => {
    const googleClientId = "123-abc.apps.googleusercontent.com";
    expect(resolveClientAuthConfig({ PROD: true, ...keys, VITE_GOOGLE_CLIENT_ID: ` ${googleClientId} ` }).googleClientId)
      .toBe(googleClientId);
    expect(resolveClientAuthConfig({ PROD: false, ...keys, VITE_GOOGLE_CLIENT_ID: googleClientId }).googleClientId)
      .toBe(googleClientId);
    expect(resolveClientAuthConfig({ PROD: true, ...keys, VITE_GOOGLE_CLIENT_ID: "  " }).googleClientId).toBeNull();
    expect(resolveClientAuthConfig({ PROD: true, ...keys }).googleClientId).toBeNull();
  });

  it("ignores the Google client id when there is no real sign-in to use it with", () => {
    const VITE_GOOGLE_CLIENT_ID = "123-abc.apps.googleusercontent.com";
    expect(resolveClientAuthConfig({ PROD: false, VITE_GOOGLE_CLIENT_ID }).googleClientId).toBeNull();
    expect(resolveClientAuthConfig({ PROD: true, VITE_GOOGLE_CLIENT_ID }).googleClientId).toBeNull();
    expect(resolveClientAuthConfig({ PROD: false, VITE_WANDERKIN_AUTH_MODE: "stub", VITE_GOOGLE_CLIENT_ID, ...keys }).googleClientId)
      .toBeNull();
  });

  it("falls back to the stub in development when keys are missing or blank", () => {
    expect(resolveClientAuthConfig({ PROD: false }).mode).toBe("stub");
    expect(resolveClientAuthConfig({ PROD: false, VITE_SUPABASE_URL: "https://abc.supabase.co" }).mode).toBe("stub");
    expect(resolveClientAuthConfig({ PROD: false, VITE_SUPABASE_URL: " ", VITE_SUPABASE_ANON_KEY: " " }).mode).toBe("stub");
  });

  it("never selects the stub in a production build, even when asked", () => {
    expect(resolveClientAuthConfig({ PROD: true }).mode).toBe("unconfigured");
    expect(resolveClientAuthConfig({ PROD: true, VITE_WANDERKIN_AUTH_MODE: "stub" }).mode).toBe("unconfigured");
    expect(resolveClientAuthConfig({ PROD: true, VITE_WANDERKIN_AUTH_MODE: "stub", ...keys }).mode).toBe("supabase");
  });

  it("lets a developer force the stub locally even with keys present", () => {
    expect(resolveClientAuthConfig({ PROD: false, VITE_WANDERKIN_AUTH_MODE: "stub", ...keys }).mode).toBe("stub");
  });
});

describe("post-sign-in destination", () => {
  it("keeps same-origin app paths", () => {
    expect(sanitizeReturnTo("/worlds")).toBe("/worlds");
    expect(sanitizeReturnTo("/edit/level-1?x=1#top")).toBe("/edit/level-1?x=1#top");
  });

  it.each([
    null, undefined, "", "worlds", "https://evil.example/", "//evil.example/x", "/\\evil.example",
    "javascript:alert(1)", "/ok\nSet-Cookie:x", "/auth/callback", "/auth/callback?code=1", `/${"a".repeat(600)}`,
  ])("rejects %j", (value) => {
    expect(sanitizeReturnTo(value)).toBe(DEFAULT_RETURN_PATH);
  });
});

describe("stub auth provider", () => {
  it("signs in instantly as the stable local user and remembers it", async () => {
    const storage = memoryStorage();
    const provider = createStubAuthProvider(storage);
    expect(provider.mode).toBe("stub");
    // The stub signs in on the spot; it never shows the Google card.
    expect(provider.googleIdentity).toBeUndefined();
    expect(await provider.init()).toBeNull();
    expect(await provider.credentialHeaders()).toEqual({});

    const changes: unknown[] = [];
    provider.onChange((session) => changes.push(session));
    expect(await provider.signIn("/worlds")).toEqual({ user: STUB_USER });
    expect(STUB_USER.id).toBe("local-dev");
    expect(await provider.credentialHeaders()).toEqual({ [DEV_USER_HEADER]: "local-dev" });

    // A fresh page load restores the same user.
    expect(await createStubAuthProvider(storage).init()).toEqual({ user: STUB_USER });

    await provider.signOut();
    expect(await provider.init()).toBeNull();
    expect(await provider.credentialHeaders()).toEqual({});
    expect(changes).toEqual([{ user: STUB_USER }, null]);
  });
});

describe("credential bridge", () => {
  afterEach(() => {
    installCredentialSource(null);
    setCurrentOwnerId(null);
  });

  it("hands out the active provider's headers and never throws", async () => {
    installCredentialSource(async () => ({ Authorization: "Bearer t" }));
    expect(await authHeaders()).toEqual({ Authorization: "Bearer t" });
    installCredentialSource(async () => { throw new Error("offline"); });
    expect(await authHeaders()).toEqual({});
  });

  it("asks the server for the media cookie only when signed in, and clears it on sign-out", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await syncServerSession(request as unknown as typeof fetch)).toBe(false);
    expect(request).not.toHaveBeenCalled();

    installCredentialSource(async () => ({ [DEV_USER_HEADER]: "local-dev" }));
    expect(await syncServerSession(request as unknown as typeof fetch)).toBe(true);
    expect(request).toHaveBeenLastCalledWith("/api/auth/session", expect.objectContaining({
      method: "POST", headers: { [DEV_USER_HEADER]: "local-dev" },
    }));

    await clearServerSession(request as unknown as typeof fetch);
    expect(request).toHaveBeenLastCalledWith("/api/auth/session", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows device-local records to their owner and keeps untagged legacy records visible", () => {
    setCurrentOwnerId("user-a");
    expect(visibleToCurrentOwner("user-a")).toBe(true);
    expect(visibleToCurrentOwner(undefined)).toBe(true);
    expect(visibleToCurrentOwner("user-b")).toBe(false);
  });
});

describe("Supabase session mapping", () => {
  it("reads the Google identity from the session", () => {
    const user = userFromSupabaseSession({
      user: {
        id: "0b0e…",
        email: "ada@example.com",
        user_metadata: { full_name: "Ada Lovelace", avatar_url: "https://lh3.googleusercontent.com/a" },
        app_metadata: { provider: "google" },
      },
    } as never);
    expect(user).toEqual({
      id: "0b0e…", email: "ada@example.com", name: "Ada Lovelace",
      avatarUrl: "https://lh3.googleusercontent.com/a", provider: "google",
    });
  });
});
