import type { AuthMode } from "./types.js";

/**
 * Google Identity Services (GIS) on our own origin: Google's consent screen
 * then names this site rather than the Supabase project, and the ID token it
 * hands back is exchanged with Supabase (`signInWithIdToken`) for an ordinary
 * session. Everything here except `loadGoogleIdentity` is pure and tested.
 */

export const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
/** How long the script, and then Google's rendered button, may take before
 * the card calls GIS unavailable and offers the standard sign-in instead. */
export const GIS_LOAD_TIMEOUT_MS = 8000;
export const GIS_BUTTON_TIMEOUT_MS = 5000;

// --- Nonce -----------------------------------------------------------------

export interface SignInNonce {
  /** Sent to Supabase, which hashes it and compares with the token's claim. */
  raw: string;
  /** SHA-256 of `raw`, hex: what Google embeds in the ID token. */
  hashed: string;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(text: string, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<string> {
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A fresh nonce for one sign-in attempt: 32 random bytes, base64url. */
export async function createSignInNonce(source: Crypto = globalThis.crypto): Promise<SignInNonce> {
  const raw = base64UrlEncode(source.getRandomValues(new Uint8Array(32)));
  return { raw, hashed: await sha256Hex(raw, source.subtle) };
}

// --- Which sign-in to run --------------------------------------------------

/**
 * - `instant`: the dev stub, signs in on the spot.
 * - `google-identity`: our card with Google's own button (needs a client id).
 * - `redirect`: today's Supabase OAuth redirect.
 * - `unavailable`: a production build without keys.
 */
export type SignInRoute = "instant" | "google-identity" | "redirect" | "unavailable";

export function signInRoute(mode: AuthMode, googleClientId: string | null | undefined): SignInRoute {
  if (mode === "stub") return "instant";
  if (mode === "unconfigured") return "unavailable";
  return googleClientId ? "google-identity" : "redirect";
}

/** One Tap is only worth asking for through FedCM: the older iframe prompt
 * would sit behind the modal card, inert and unclickable. */
export function canPromptOneTap(scope: object): boolean {
  return "IdentityCredential" in scope;
}

// --- Card state --------------------------------------------------------------

export type GoogleCardState =
  | { status: "loading" }
  | { status: "ready" }
  /** GIS could not run here; the card offers the standard sign-in. */
  | { status: "unavailable"; message: string }
  | { status: "verifying" }
  /** The token exchange failed; Google's button stays, with the reason. */
  | { status: "error"; message: string }
  | { status: "redirecting" };

export type GoogleCardEvent =
  | { type: "script-failed" }
  | { type: "button-rendered" }
  | { type: "button-timeout" }
  | { type: "credential" }
  | { type: "exchange-failed"; message: string }
  | { type: "fallback" };

export const GIS_UNAVAILABLE_MESSAGE = "Google’s sign-in button couldn’t load here. You can still sign in the standard way.";

export function googleCardReducer(state: GoogleCardState, event: GoogleCardEvent): GoogleCardState {
  switch (event.type) {
    case "script-failed":
      return { status: "unavailable", message: GIS_UNAVAILABLE_MESSAGE };
    case "button-rendered":
      return state.status === "loading" ? { status: "ready" } : state;
    case "button-timeout":
      // Only a button that never appeared counts; a slow click does not.
      return state.status === "loading" ? { status: "unavailable", message: GIS_UNAVAILABLE_MESSAGE } : state;
    case "credential":
      return state.status === "redirecting" ? state : { status: "verifying" };
    case "exchange-failed":
      return { status: "error", message: event.message };
    case "fallback":
      return { status: "redirecting" };
  }
}

/** A readable reason for a failed ID-token exchange. */
export function describeExchangeError(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message.trim() : "";
  return detail
    ? `Google sign-in didn’t finish: ${detail}`
    : "Google sign-in didn’t finish. Please try again, or use the standard sign-in.";
}

/** Width for Google's rendered button: its API accepts 200–400 px. */
export function googleButtonWidth(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 320;
  return Math.round(Math.min(400, Math.max(200, containerWidth)));
}

// --- GIS script ------------------------------------------------------------

export interface GoogleCredentialResponse { credential?: string; select_by?: string }

export interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  nonce?: string;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: "signin" | "signup" | "use";
  ux_mode?: "popup" | "redirect";
  itp_support?: boolean;
  use_fedcm_for_prompt?: boolean;
  use_fedcm_for_button?: boolean;
}

export interface GoogleButtonConfiguration {
  type: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  shape?: "rectangular" | "pill" | "circle" | "square";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  logo_alignment?: "left" | "center";
  width?: number;
}

export interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  renderButton(parent: HTMLElement, options: GoogleButtonConfiguration): void;
  prompt(): void;
  cancel(): void;
}

declare global {
  interface Window { google?: { accounts?: { id?: GoogleAccountsId } } }
}

let gisPromise: Promise<GoogleAccountsId> | null = null;

/** Loads the GIS script once, on demand. A failure is not cached, so the
 * next time the card opens it tries again. */
export function loadGoogleIdentity(timeoutMs = GIS_LOAD_TIMEOUT_MS): Promise<GoogleAccountsId> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  gisPromise ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => fail(new Error("Google sign-in took too long to load.")), timeoutMs);
    function fail(error: Error) {
      window.clearTimeout(timer);
      script.remove();
      gisPromise = null;
      reject(error);
    }
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (!api) return fail(new Error("Google sign-in loaded without its API."));
      window.clearTimeout(timer);
      resolve(api);
    };
    script.onerror = () => fail(new Error("Google sign-in couldn’t load."));
    document.head.appendChild(script);
  });
  return gisPromise;
}
