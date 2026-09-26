import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Button, Icon, Logo, Modal, WorldStyleScope } from "../components/index.js";
import { BRAND_NAME, BRAND_TAGLINE } from "../../brand.js";
import "../theme/welcome.css";
import type { SceneManifest } from "@shared/index.js";
import type { AuthMode } from "../../auth/types.js";
import { SampleWorlds, useSampleLevels } from "../library/SampleWorlds.js";
import { GiantButton, TinyExplorer } from "../components/Scenery.js";
import { useInView } from "../components/useInView.js";

// Loaded only when the card comes near the viewport, with its model.
const CornerTurntable = lazy(() => import("../components/CornerTurntable.js"));

interface StartScreenProps {
  onPlaySample: (manifest: SceneManifest) => void;
  onEditSample: (manifest: SceneManifest) => void;
  /** "Make my world" / "Get started": opens Create, signing in first if needed. */
  onCreateFromPhotos: () => void;
  signedIn: boolean;
  authMode: AuthMode;
  /** Sign in, then land on the dashboard (or wherever the prompt pointed). */
  onSignIn: () => void;
  onOpenDashboard: () => void;
  signingIn?: boolean;
  /** Shown when a signed-out visitor opened a page that needs an account. */
  signInPrompt?: string | null;
  onDismissSignInPrompt?: () => void;
  authError?: string | null;
}

/**
 * The public landing. Anyone can read it and play the bundled samples; the
 * worlds you make live behind sign-in, on the dashboard.
 */
export function StartScreen({
  onPlaySample,
  onEditSample,
  onCreateFromPhotos,
  signedIn,
  authMode,
  onSignIn,
  onOpenDashboard,
  signingIn = false,
  signInPrompt = null,
  onDismissSignInPrompt,
  authError = null,
}: StartScreenProps) {
  const { samples: sampleLevels, error: sampleError } = useSampleLevels();
  const finaleRef = useRef<HTMLDivElement>(null);
  const finaleView = useInView(finaleRef);
  // The turntable starts loading a little before it scrolls into view.
  const cornerRef = useRef<HTMLDivElement>(null);
  const cornerView = useInView(cornerRef, "120px 0px");
  const [cornerReady, setCornerReady] = useState(false);
  const onCornerReady = useCallback(() => setCornerReady(true), []);
  const signInLabel = authMode === "supabase" ? "Continue with Google" : "Sign in";

  return (
    <WorldStyleScope className="oq-welcome">
      {/* The hero: the one cinematic moment, now in light. A pale world
          rises at the foot of the screen with purple light round its rim. */}
      <div className="oq-welcome__band">
        <div className="oq-kit-container">
          <nav className="oq-welcome__nav" aria-label="Main navigation">
            <Logo size={34} />
            {signedIn
              ? <Button variant="secondary" className="oq-welcome__nav-action" onClick={onOpenDashboard}>Open my worlds <Icon name="arrow" /></Button>
              : <div className="oq-kit-row oq-welcome__nav-actions">
                  <Button variant="ghost" className="oq-welcome__nav-action" onClick={onSignIn} loading={signingIn} loadingLabel="Signing in…">Sign in</Button>
                  <Button className="oq-welcome__nav-action" onClick={onCreateFromPhotos} disabled={signingIn}>Get started</Button>
                </div>}
          </nav>
          {authError ? <p className="wk-auth-error" role="alert">Sign-in didn’t finish: {authError}. Try again.</p> : null}
          <section className="oq-welcome__hero" aria-labelledby="welcome-heading">
            <div className="oq-welcome__intro">
              <p className="wk-chip">{BRAND_TAGLINE}</p>
              <h1 id="welcome-heading">Your sofa is a mountain range.</h1>
              <p className="oq-welcome__lede">Photograph something ordinary. {BRAND_NAME} rebuilds it in 3D and shrinks you down until the cushions are cliffs.</p>
              <div className="oq-kit-row oq-welcome__ctas">
                <Button onClick={onCreateFromPhotos}>Make my world <Icon name="arrow" /></Button>
                <Button variant="secondary" disabled={!sampleLevels?.[0]} onClick={() => { if (sampleLevels?.[0]) onPlaySample(sampleLevels[0]); }}><Icon name="play" />Play a sample</Button>
              </div>
              <p className="oq-welcome__note"><Icon name="spark" />The sample is already built in — no photo, no waiting.</p>
            </div>
          </section>
        </div>
      </div>
      <main>
        {/* Explanatory: the transformation, read at a glance. Two equal
            frames and a quiet connector; the rebuilt corner turns slowly on
            a turntable and can be dragged round. */}
        <section className="wk-section wk-transform" aria-labelledby="transform-heading">
          <div className="oq-kit-container">
            <div className="wk-section__head wk-section__head--center">
              <h2 id="transform-heading">From photo to explorable world</h2>
              <p>{BRAND_NAME} rebuilds an ordinary object in 3D and turns it into somewhere you can walk through.</p>
            </div>
            <div className="wk-transform__pair">
              <figure className="wk-transform__item">
                <div className="wk-frame wk-transform__media">
                  <img className="oq-welcome__photo" src="/samples/photo-4.jpg" alt="A photo of a small room: a wooden desk with a laptop beside a dark fabric sofa" />
                </div>
                <figcaption>The photograph<span>One corner of a real room</span></figcaption>
              </figure>
              <div className="wk-transform__link" aria-hidden="true">
                <svg viewBox="0 0 64 24" focusable="false"><path d="M2 12h52" /><path d="M48 5l8 7-8 7" /></svg>
              </div>
              <figure className="wk-transform__item">
                {/* A still of the model until the live turntable is ready,
                    and in its place if WebGL is unavailable. */}
                <div className="wk-frame wk-transform__media wk-transform__stage" ref={cornerRef} data-ready={cornerReady}>
                  <img className="wk-transform__poster" src="/landing/step-reconstruction.webp" alt="The desk and sofa from the photo, rebuilt as a 3D model" />
                  {cornerView.seen ? (
                    <Suspense fallback={null}><CornerTurntable active={cornerView.active} onReady={onCornerReady} /></Suspense>
                  ) : null}
                  {cornerView.seen && !cornerReady ? <p className="wk-transform__status" role="status">Opening the 3D view…</p> : null}
                  {cornerReady ? <p className="wk-transform__hint" aria-hidden="true">Drag to look around</p> : null}
                </div>
                <figcaption>The same corner<span>Now somewhere you can stand, all the way round</span></figcaption>
              </figure>
            </div>
            <p className="wk-transform__note">The real 3D reconstruction of this photo, running live in your browser.</p>
          </div>
        </section>
        {/* Explanatory: one journey. Three identical cards on a checkpoint
            track, so no step outweighs the others. */}
        <section className="wk-section wk-section--tint wk-steps" aria-label={`How ${BRAND_NAME} works`}>
          <div className="oq-kit-container">
            <div className="wk-section__head wk-section__head--center">
              <h2>How it works</h2>
              <p>Three steps from something in your room to somewhere you can explore.</p>
            </div>
            <ol className="wk-steps__list">
              <li className="wk-step-card">
                <span className="wk-step-card__num" aria-hidden="true">1</span>
                <div className="wk-step-card__media"><img src="/samples/photo-4.jpg" alt="The original photo: a desk and a sofa in the corner of a room" loading="lazy" /></div>
                <h3>Photograph it</h3><p>Anything with some shape to it — a chair, a kettle, a pile of books.</p>
              </li>
              <li className="wk-step-card">
                <span className="wk-step-card__num" aria-hidden="true">2</span>
                <div className="wk-step-card__media wk-step-card__media--model"><img src="/landing/step-reconstruction.webp" alt="The same desk and sofa rebuilt as a 3D model" loading="lazy" /></div>
                <h3>Watch it get big</h3><p>Your object is rebuilt in 3D, and a course is laid out through it.</p>
              </li>
              <li className="wk-step-card">
                <span className="wk-step-card__num" aria-hidden="true">3</span>
                <div className="wk-step-card__media"><img src="/landing/step-explore.webp" alt="In the game: the tiny explorer on the floor under the desk, with the portal ring beside them" loading="lazy" /></div>
                <h3>Shrink and explore</h3><p>Run its length, climb what you can, and find the way through.</p>
              </li>
            </ol>
          </div>
        </section>
        {/* Interlude: breaks the rhythm without stopping the page. One
            oversized object entering from the edge, one tiny figure. */}
        <section className="wk-interlude" aria-label="Scale">
          <div className="oq-kit-container wk-interlude__inner">
            <p className="wk-interlude__line">At this size, a sewing button is a planet.</p>
          </div>
          <div className="wk-interlude__scene" aria-hidden="true">
            <GiantButton className="wk-interlude__button" />
            <TinyExplorer className="wk-interlude__explorer" />
          </div>
        </section>
        {/* Product: choosing a world, like choosing a game. One featured
            world, then the rest; image first, then title, mode, Play. */}
        <section className="wk-section wk-worlds" aria-labelledby="samples-heading">
          <div className="oq-kit-container">
            <div className="wk-section__head">
              <h2 id="samples-heading">Worlds to borrow</h2>
              <p>Built in and ready to play, no photo needed. Keyboard and mouse controls.</p>
            </div>
            <SampleWorlds samples={sampleLevels} error={sampleError} onPlaySample={onPlaySample} onEditSample={onEditSample} onCreateFromPhotos={onCreateFromPhotos} />
          </div>
        </section>
        {/* Product: your own worlds live on the dashboard, behind sign-in. */}
        <section className="wk-section wk-section--tint wk-library" id="my-worlds" aria-labelledby="worlds-heading">
          <div className="oq-kit-container">
            <div className="wk-library-invite">
              {/* What "your worlds" are: two saved worlds, real in-game
                  renders in the Autumn Forest and Snowy Alpine looks. */}
              <div className="wk-library-invite__scene" aria-hidden="true">
                <img className="wk-library-invite__print wk-library-invite__print--back" src="/landing/library-autumn.webp" alt="" loading="lazy" />
                <img className="wk-library-invite__print wk-library-invite__print--front" src="/landing/library-alpine.webp" alt="" loading="lazy" />
              </div>
              <div className="wk-library-invite__copy">
                <h2 id="worlds-heading">{signedIn ? "Your worlds are waiting" : "Keep every world you make"}</h2>
                <p>{signedIn
                  ? "Pick up where you left off, start something new, or borrow a sample."
                  : "Sign in to save your worlds, come back to them on any visit, and share the finished ones."}</p>
                <div className="oq-kit-row">
                  {signedIn
                    ? <Button onClick={onOpenDashboard}>Open my worlds <Icon name="arrow" /></Button>
                    : <><Button onClick={onSignIn} loading={signingIn} loadingLabel="Signing in…">{signInLabel}</Button>
                      <Button variant="ghost" onClick={onCreateFromPhotos} disabled={signingIn}>Make my world</Button></>}
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* The close: the ordinary room, then the same sofa in the game with
            the explorer standing on it. The photo slowly dissolves into the
            real render and back; see welcome.css for the timing. */}
        <section className="wk-section wk-finale" aria-labelledby="finale-heading">
          <div className="oq-kit-container wk-finale__inner">
            <div className="wk-finale__copy">
              <h2 id="finale-heading">Point your camera at something ordinary.</h2>
              <p>{BRAND_NAME} turns it into a world you can stand in, climb and explore.</p>
              <div className="oq-kit-row">
                <Button onClick={onCreateFromPhotos}>Make my world <Icon name="arrow" /></Button>
                <Button variant="ghost" disabled={!sampleLevels?.[0]} onClick={() => { if (sampleLevels?.[0]) onPlaySample(sampleLevels[0]); }}><Icon name="play" />Play a sample</Button>
              </div>
            </div>
            <figure className="wk-finale__frame">
              <div className="wk-finale__scene" ref={finaleRef} data-playing={finaleView.active}>
                <img className="wk-finale__render" src="/landing/finale-sofa.webp" alt="In the game: the tiny explorer standing on the sofa seat, with the desk and laptop beyond" loading="lazy" />
                <p className="wk-finale__pill">Your explorer starts right here</p>
                <img className="wk-finale__photo" src="/samples/photo-4.jpg" alt="" loading="lazy" />
              </div>
            </figure>
          </div>
        </section>
        <div className="oq-kit-container wk-welcome-foot">
          <footer className="oq-welcome__footer"><span>{BRAND_TAGLINE}</span>{import.meta.env.DEV && <a href="/design-kit/">Explore the design kit</a>}</footer>
        </div>
      </main>
      <Modal open={signInPrompt !== null} onClose={() => onDismissSignInPrompt?.()} title="Sign in to continue">
        <div className="wk-signin-prompt">
          <p>Sign in to open {signInPrompt}. Worlds are private to the account that made them, and you’ll go straight there after signing in.</p>
          <div className="oq-kit-row">
            <Button onClick={onSignIn} loading={signingIn} loadingLabel="Signing in…">{signInLabel}</Button>
            <Button variant="ghost" onClick={() => onDismissSignInPrompt?.()}>Not now</Button>
          </div>
        </div>
      </Modal>
    </WorldStyleScope>
  );
}
