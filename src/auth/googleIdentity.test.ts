import { describe, expect, it, vi } from "vitest";
import {
  base64UrlEncode,
  canPromptOneTap,
  createSignInNonce,
  describeExchangeError,
  GIS_UNAVAILABLE_MESSAGE,
  googleButtonWidth,
  googleCardReducer,
  sha256Hex,
  signInRoute,
  type GoogleCardState,
} from "./googleIdentity.js";
import { createSupabaseAuthProvider } from "./supabaseProvider.js";

const signInWithIdToken = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithIdToken },
  }),
}));

describe("sign-in nonce", () => {
  it("hashes with SHA-256 as lowercase hex", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("encodes base64url without padding", () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe("-__-");
    expect(base64UrlEncode(new Uint8Array([1]))).toBe("AQ");
  });

  it("uses 32 random bytes and sends Google the hash of the raw value", async () => {
    const nonce = await createSignInNonce();
    expect(nonce.raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(nonce.hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(nonce.hashed).toBe(await sha256Hex(nonce.raw));
  });

  it("draws from the given random source and is fresh per attempt", async () => {
    const getRandomValues = vi.fn(<T extends ArrayBufferView | null>(array: T) => array);
    const source = { getRandomValues, subtle: globalThis.crypto.subtle } as unknown as Crypto;
    const zeros = await createSignInNonce(source);
    expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect((getRandomValues.mock.calls[0]![0] as Uint8Array).length).toBe(32);
    expect(zeros.raw).toBe("A".repeat(43));

    const a = await createSignInNonce();
    const b = await createSignInNonce();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hashed).not.toBe(b.hashed);
  });
});

describe("which sign-in runs", () => {
  it("uses Google on this origin only with real sign-in and a client id", () => {
    expect(signInRoute("supabase", "123.apps.googleusercontent.com")).toBe("google-identity");
  });

  it("falls back to the Supabase redirect without a client id", () => {
    expect(signInRoute("supabase", null)).toBe("redirect");
    expect(signInRoute("supabase", undefined)).toBe("redirect");
    expect(signInRoute("supabase", "")).toBe("redirect");
  });

  it("keeps the stub instant and an unconfigured build closed", () => {
    expect(signInRoute("stub", "123.apps.googleusercontent.com")).toBe("instant");
    expect(signInRoute("unconfigured", "123.apps.googleusercontent.com")).toBe("unavailable");
  });

  it("asks for One Tap only where FedCM exists", () => {
    expect(canPromptOneTap({ IdentityCredential: class {} })).toBe(true);
    expect(canPromptOneTap({})).toBe(false);
  });
});

describe("Google card fallback", () => {
  const loading: GoogleCardState = { status: "loading" };

  it("offers the standard sign-in when the script fails or the button never appears", () => {
    expect(googleCardReducer(loading, { type: "script-failed" })).toEqual({ status: "unavailable", message: GIS_UNAVAILABLE_MESSAGE });
    expect(googleCardReducer(loading, { type: "button-timeout" })).toEqual({ status: "unavailable", message: GIS_UNAVAILABLE_MESSAGE });
  });

  it("is ready once Google's button renders, and a late timeout changes nothing", () => {
    const ready = googleCardReducer(loading, { type: "button-rendered" });
    expect(ready).toEqual({ status: "ready" });
    expect(googleCardReducer(ready, { type: "button-timeout" })).toBe(ready);
    const verifying = googleCardReducer(ready, { type: "credential" });
    expect(googleCardReducer(verifying, { type: "button-timeout" })).toBe(verifying);
  });

  it("keeps Google's button available after a failed exchange, with the reason", () => {
    const verifying = googleCardReducer({ status: "ready" }, { type: "credential" });
    expect(verifying).toEqual({ status: "verifying" });
    expect(googleCardReducer(verifying, { type: "exchange-failed", message: "nonce mismatch" }))
      .toEqual({ status: "error", message: "nonce mismatch" });
    expect(googleCardReducer({ status: "error", message: "x" }, { type: "credential" })).toEqual({ status: "verifying" });
  });

  it("goes to the redirect from any state, and stays there", () => {
    for (const state of [loading, { status: "ready" }, { status: "unavailable", message: "x" }, { status: "error", message: "x" }] as GoogleCardState[]) {
      expect(googleCardReducer(state, { type: "fallback" })).toEqual({ status: "redirecting" });
    }
    const redirecting: GoogleCardState = { status: "redirecting" };
    expect(googleCardReducer(redirecting, { type: "credential" })).toBe(redirecting);
  });

  it("explains a failed exchange", () => {
    expect(describeExchangeError(new Error("Invalid nonce"))).toBe("Google sign-in didn’t finish: Invalid nonce");
    expect(describeExchangeError("boom")).toMatch(/standard sign-in/);
  });

  it("fits Google's button to the card within its 200–400 px range", () => {
    expect(googleButtonWidth(320)).toBe(320);
    expect(googleButtonWidth(504)).toBe(400);
    expect(googleButtonWidth(150)).toBe(200);
    expect(googleButtonWidth(0)).toBe(320);
  });
});

describe("Supabase ID-token sign-in", () => {
  it("is offered only with a Google client id", () => {
    expect(createSupabaseAuthProvider("https://abc.supabase.co", "anon").googleIdentity).toBeUndefined();
    expect(createSupabaseAuthProvider("https://abc.supabase.co", "anon", "123.apps.googleusercontent.com").googleIdentity?.clientId)
      .toBe("123.apps.googleusercontent.com");
  });

  it("exchanges the token with the raw nonce and maps the session", async () => {
    signInWithIdToken.mockResolvedValueOnce({
      data: { session: { access_token: "t", user: { id: "u1", email: "ada@example.com", user_metadata: {}, app_metadata: { provider: "google" } } } },
      error: null,
    });
    const provider = createSupabaseAuthProvider("https://abc.supabase.co", "anon", "cid");
    const session = await provider.googleIdentity!.signInWithIdToken("id-token", "raw-nonce");
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: "google", token: "id-token", nonce: "raw-nonce" });
    expect(session.user).toMatchObject({ id: "u1", email: "ada@example.com", provider: "google" });
  });

  it("surfaces Supabase's refusal", async () => {
    signInWithIdToken.mockResolvedValueOnce({ data: { session: null, user: null }, error: new Error("Unacceptable audience in id_token") });
    const provider = createSupabaseAuthProvider("https://abc.supabase.co", "anon", "cid");
    await expect(provider.googleIdentity!.signInWithIdToken("id-token", "raw")).rejects.toThrow("Unacceptable audience");
  });
});
