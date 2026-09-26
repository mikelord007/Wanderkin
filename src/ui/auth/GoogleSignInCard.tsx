import { useEffect, useReducer, useRef, useState } from "react";
import {
  canPromptOneTap,
  createSignInNonce,
  describeExchangeError,
  GIS_BUTTON_TIMEOUT_MS,
  googleButtonWidth,
  googleCardReducer,
  loadGoogleIdentity,
  type GoogleAccountsId,
} from "../../auth/googleIdentity.js";
import { Button } from "../components/Button.js";
import { Modal } from "../components/Modal.js";
import { SignInConsent } from "../legal/LegalScreen.js";
import "./googleSignIn.css";

export interface GoogleSignInCardProps {
  clientId: string;
  /** Exchanges Google's ID token; throws when that fails. */
  onCredential: (token: string, rawNonce: string) => Promise<void>;
  /** The standard (Supabase redirect) sign-in. */
  onFallback: () => void;
  onClose: () => void;
}

/** Google's rendered button counts as there once its iframe (or button) is in. */
function hasRenderedButton(host: HTMLElement): boolean {
  return host.querySelector("iframe, [role='button']") !== null;
}

/**
 * Sign-in card for Google Identity Services. Google requires its own button
 * for the ID-token flow, so the card hosts it, asks for One Tap where FedCM
 * can show it, and always keeps the standard sign-in one click away.
 */
export function GoogleSignInCard({ clientId, onCredential, onFallback, onClose }: GoogleSignInCardProps) {
  const [state, dispatch] = useReducer(googleCardReducer, { status: "loading" });
  // Each attempt gets a fresh nonce, so a failed exchange re-arms Google's
  // button with a new one.
  const [attempt, setAttempt] = useState(0);
  const buttonHost = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onCredential });
  callbacks.current = { onCredential };

  useEffect(() => {
    let active = true;
    let gis: GoogleAccountsId | null = null;
    let observer: MutationObserver | null = null;
    let timer = 0;

    void (async () => {
      let nonce;
      try {
        [gis, nonce] = await Promise.all([loadGoogleIdentity(), createSignInNonce()]);
      } catch {
        if (active) dispatch({ type: "script-failed" });
        return;
      }
      const host = buttonHost.current;
      if (!active || !host) return;
      const raw = nonce.raw;

      gis.initialize({
        client_id: clientId,
        nonce: nonce.hashed,
        context: "signin",
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
        callback: ({ credential }) => {
          if (!active || !credential) return;
          dispatch({ type: "credential" });
          callbacks.current.onCredential(credential, raw).catch((cause: unknown) => {
            if (!active) return;
            dispatch({ type: "exchange-failed", message: describeExchangeError(cause) });
            setAttempt((n) => n + 1);
          });
        },
      });

      host.replaceChildren();
      gis.renderButton(host, {
        type: "standard", theme: "outline", size: "large", shape: "pill",
        text: "continue_with", logo_alignment: "left", width: googleButtonWidth(host.clientWidth),
      });
      if (hasRenderedButton(host)) dispatch({ type: "button-rendered" });
      else {
        observer = new MutationObserver(() => {
          if (hasRenderedButton(host)) { observer?.disconnect(); dispatch({ type: "button-rendered" }); }
        });
        observer.observe(host, { childList: true, subtree: true });
        timer = window.setTimeout(() => { observer?.disconnect(); if (active) dispatch({ type: "button-timeout" }); }, GIS_BUTTON_TIMEOUT_MS);
      }
      if (attempt === 0 && canPromptOneTap(window)) gis.prompt();
    })();

    return () => {
      active = false;
      observer?.disconnect();
      window.clearTimeout(timer);
      gis?.cancel();
    };
  }, [attempt, clientId]);

  const fallback = () => {
    dispatch({ type: "fallback" });
    onFallback();
  };

  const busy = state.status === "verifying" || state.status === "redirecting";

  return (
    <Modal open onClose={onClose} title="Sign in to Wanderkin">
      <div className="wk-google-card">
        <p className="wk-google-card__lede">Use your Google account. Your worlds stay with it, on any device.</p>

        <div className="wk-google-card__button" ref={buttonHost} hidden={state.status === "unavailable"} aria-busy={state.status === "loading" || undefined} />

        {state.status === "unavailable" && (
          <>
            <p className="wk-google-card__error" role="alert">{state.message}</p>
            <Button onClick={fallback}>Continue with Google</Button>
          </>
        )}
        {state.status === "error" && <p className="wk-google-card__error" role="alert">{state.message}</p>}
        <p className="wk-google-card__status" role="status">
          {state.status === "loading" ? "Loading Google sign-in…"
            : state.status === "verifying" ? "Signing you in…"
            : state.status === "redirecting" ? "Taking you to Google…"
            : ""}
        </p>

        {state.status !== "unavailable" && (
          <p className="wk-google-card__alt">
            Trouble with the button?{" "}
            <button type="button" className="wk-google-card__link" onClick={fallback} disabled={busy}>Use the standard sign-in</button>
          </p>
        )}

        <SignInConsent className="wk-signin-consent wk-google-card__consent" />
      </div>
    </Modal>
  );
}
