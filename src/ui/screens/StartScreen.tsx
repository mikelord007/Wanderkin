import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, EmptyState, Icon, Logo, WorldStyleScope } from "../components/index.js";
import { BRAND_NAME, BRAND_TAGLINE } from "../../brand.js";
import "../theme/welcome.css";
import type { SceneManifest } from "@shared/index.js";
import { listDrafts } from "../../editor/draftStorage.js";
import {
  missingAssetUrls,
  savedWorldOrigin,
  savedWorldItems,
  type WorldListItem,
} from "../worlds.js";
import {
  describeApiError,
  downloadLevelBundle,
  importAsset,
  importLevelBundle,
  listLevels,
} from "../api.js";
import { WorldPostcardPanel } from "../../capture/MediaCards.js";
import { GiantButton, PortalArch, TinyExplorer } from "../components/Scenery.js";

const SampleWorldPreview = lazy(() => import("../components/SampleWorldPreview.js"));

/** Real in-game renders of each bundled sample (captured from the app, see
 * public/landing/README.md). Two are shown in a theme look, and say so. */
const SAMPLE_ART: Record<string, { src: string; alt: string; look?: string }> = {
  "sample-lost-colors-rodin": { src: "/landing/world-lost-colors.webp", alt: "In the game: the tiny explorer between the portal ring, a golden color fragment and a sofa leg as tall as a tower", look: "Tropical Island" },
  "sample-explore-rodin": { src: "/landing/world-teacup-wander.webp", alt: "In the game: the explorer on a sandy shore under the sofa, among island shrubs and palms", look: "Tropical Island" },
  "sample-rodin-room-corner": { src: "/landing/world-desk-sofa.webp", alt: "In the game: the explorer on desert sand beside a color fragment and a towering sofa leg", look: "Desert" },
  "sample-tripo-room-corner": { src: "/landing/world-different-perspective.webp", alt: "In the game: the explorer on a green floor under the dark underside of a sofa" },
};

function sampleTitle(manifest: SceneManifest): string {
  return manifest.levelId === "sample-lost-colors-rodin" ? "The Lost Colors of Teacup Island"
    : manifest.levelId === "sample-explore-rodin" ? "Teacup Island Wander"
    : manifest.levelId === "sample-rodin-room-corner" ? "The desk & sofa adventure"
    : "A different perspective";
}

function sampleSummary(manifest: SceneManifest): string {
  const mode = manifest.experience?.mode;
  return mode?.kind === "collect" ? "Find 3 lost colors and bring this miniature world back"
    : mode?.kind === "explore" ? `Wander ${mode.destinations.length} destinations, no timer`
    : `${manifest.checkpoints.length} checkpoints through a miniature room`;
}

function sampleModeLabel(manifest: SceneManifest): string {
  const kind = manifest.experience?.mode.kind;
  return kind === "collect" ? "Lost Colors" : kind === "explore" ? "Explore" : kind === "race" ? "Race" : "Checkpoint course";
}

/**
 * The best picture a saved world already has, without generating anything:
 * its animated postcard's poster frame, else the photo it was made from, else
 * the source photo of the bundled sample it copies. Null means the tile draws
 * its own night scene instead.
 */
function worldImage(manifest: SceneManifest): string | null {
  const poster = manifest.media?.video.find((asset) => asset.kind === "animated-postcard")?.posterUrl;
  if (poster) return poster;
  const photo = [...manifest.photos].sort((a, b) => a.order - b.order)[0]?.url;
  if (photo) return photo;
  const sample = manifest.assets.find((asset) => asset.url.startsWith("/samples/"))?.url;
  if (sample) return `/samples/photo-${sample.includes("rodin") ? 4 : 2}.jpg`;
  return null;
}

type TileStatus = "ready" | "draft" | "pending" | "failed";

/** One world in the library: a 16:9 picture with a status badge on it, then
 * its name and details, then one primary action and quiet secondary ones. */
function WorldTile({ status, badge, title, image = null, meta, notice, actions, children }: {
  status: TileStatus; badge: string; title: string; image?: string | null;
  meta?: string; notice?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  return <article className="wk-tile" data-status={status}>
    <div className="wk-tile__image">
      {image ? <img src={image} alt="" loading="lazy" /> : <div className="wk-tile__scene" aria-hidden="true"><PortalArch className="wk-tile__arch" /><TinyExplorer className="wk-tile__explorer" /></div>}
      <p className="wk-tile__badge">{badge}</p>
    </div>
    <div className="wk-tile__info">
      <h3>{title}</h3>
      {meta ? <p className="wk-tile__meta">{meta}</p> : null}
      {notice}
      {actions ? <div className="wk-tile__actions">{actions}</div> : null}
      {children}
    </div>
  </article>;
}

interface StartScreenProps {
  onPlaySample: (manifest: SceneManifest) => void;
  onEditSample: (manifest: SceneManifest) => void;
  onPlaySavedLevel: (manifest: SceneManifest) => void;
  onEditSavedLevel: (manifest: SceneManifest) => void;
  onCreateFromPhotos: () => void;
  onImportGlbReady: (assetId: string) => void;
  onImportLevelBundleReady: (manifest: SceneManifest) => void;
  additionalWorldItems?: readonly Extract<WorldListItem, { kind: "pending" | "failed" }>[];
  onResumeDraft?: (manifest: SceneManifest, isPersisted: boolean) => void;
  onResumePendingWorld?: (jobId: string) => void;
  onRetryFailedWorld?: (jobId: string) => void;
}

export function StartScreen({
  onPlaySample,
  onEditSample,
  onPlaySavedLevel,
  onEditSavedLevel,
  onCreateFromPhotos,
  onImportGlbReady,
  onImportLevelBundleReady,
  onResumeDraft,
  additionalWorldItems = [],
  onResumePendingWorld,
  onRetryFailedWorld,
}: StartScreenProps) {
  const [sampleLevels, setSampleLevels] = useState<SceneManifest[] | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const [savedLevels, setSavedLevels] = useState<SceneManifest[] | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [drafts] = useState(() => listDrafts());
  const [checkingLevelId, setCheckingLevelId] = useState<string | null>(null);
  const [assetIssues, setAssetIssues] = useState<Record<string, string>>({});

  const [importingGlb, setImportingGlb] = useState(false);
  const [glbImportError, setGlbImportError] = useState<string | null>(null);
  const [importingBundle, setImportingBundle] = useState(false);
  const [bundleImportError, setBundleImportError] = useState<string | null>(null);
  const [exportingLevelId, setExportingLevelId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const worldsRef = useRef<HTMLElement | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const bundleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    Promise.all([import("../../scene/samples.js"), import("../../game/bundledSamples.js")])
      .then(([sceneSamples, gameSamples]) =>
        setSampleLevels([gameSamples.LOST_COLORS_SAMPLE, gameSamples.EXPLORE_SAMPLE, ...sceneSamples.SAMPLE_LEVELS]),
      )
      .catch((error) =>
        setSampleError(error instanceof Error ? error.message : "Bundled samples are unavailable."),
      );
  }, []);

  const worldItems = useMemo(
    () => (savedLevels ? [...additionalWorldItems, ...savedWorldItems(savedLevels, drafts)] : []),
    [additionalWorldItems, drafts, savedLevels],
  );

  async function handlePlaySaved(manifest: SceneManifest) {
    setCheckingLevelId(manifest.levelId);
    setAssetIssues((current) => {
      const next = { ...current };
      delete next[manifest.levelId];
      return next;
    });
    try {
      const missing = await missingAssetUrls(manifest);
      if (missing.length > 0) {
        setAssetIssues((current) => ({
          ...current,
          [manifest.levelId]:
            "A saved 3D asset is missing or expired. Edit this world to replace it, or retry after restoring the file.",
        }));
        return;
      }
      onPlaySavedLevel(manifest);
    } finally {
      setCheckingLevelId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    listLevels()
      .then((levels) => {
        if (!cancelled) setSavedLevels(levels);
      })
      .catch((error) => {
        if (!cancelled) setSavedError(describeApiError(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImportGlb(file: File | null) {
    if (!file) return;
    setImportingGlb(true);
    setGlbImportError(null);
    try {
      const asset = await importAsset(file);
      onImportGlbReady(asset.id);
    } catch (error) {
      setGlbImportError(describeApiError(error));
    } finally {
      setImportingGlb(false);
      if (glbInputRef.current) glbInputRef.current.value = "";
    }
  }

  async function handleImportBundle(file: File | null) {
    if (!file) return;
    setImportingBundle(true);
    setBundleImportError(null);
    try {
      const imported = await importLevelBundle(file);
      onImportLevelBundleReady(imported);
    } catch (error) {
      setBundleImportError(describeApiError(error));
    } finally {
      setImportingBundle(false);
      if (bundleInputRef.current) bundleInputRef.current.value = "";
    }
  }

  async function handleExport(manifest: SceneManifest) {
    setExportingLevelId(manifest.levelId);
    setExportError(null);
    try {
      await downloadLevelBundle(manifest.levelId, manifest.name);
    } catch (error) {
      setExportError(describeApiError(error));
    } finally {
      setExportingLevelId(null);
    }
  }

  function showWorlds() {
    worldsRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    worldsRef.current?.focus({ preventScroll: true });
  }

  return (
    <WorldStyleScope className="oq-welcome">
      {/* The hero: the one cinematic moment, now in light. A pale world
          rises at the foot of the screen with purple light round its rim. */}
      <div className="oq-welcome__band">
        <div className="oq-kit-container">
          <nav className="oq-welcome__nav" aria-label="Main navigation">
            <Logo size={34} />
            <Button variant="secondary" className="oq-welcome__nav-action" onClick={showWorlds}>My worlds <Icon name="arrow" /></Button>
          </nav>
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
            frames, a quiet connector, and the portal behind the world. */}
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
                <div className="wk-frame wk-transform__media wk-transform__stage">
                  <PortalArch className="wk-transform__arch" />
                  <div className="oq-welcome__render">
                    <Suspense fallback={<p className="oq-welcome__preview-status" role="status">Opening the little world…</p>}><SampleWorldPreview /></Suspense>
                  </div>
                </div>
                <figcaption>The same corner<span>Now somewhere you can stand</span></figcaption>
              </figure>
            </div>
            <p className="wk-transform__note">A real bundled world, running live — not a mock-up.</p>
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
            {sampleError ? <p role="alert" className="oq-kit-error">The samples couldn’t load. Refresh to try again.</p>
              : !sampleLevels ? <p role="status" className="oq-kit-muted">Opening the sample collection…</p>
              : sampleLevels.length === 0 ? <EmptyState title="No samples available" description="You can still start a world from your own photo." action={<Button onClick={onCreateFromPhotos}>Create my world</Button>} />
              : <div className="wk-worlds__grid">{sampleLevels.map((manifest, index) => {
                const art = SAMPLE_ART[manifest.levelId];
                return <article key={manifest.levelId} className={`wk-world${index === 0 ? " wk-world--featured" : ""}`}>
                  <div className="wk-world__media">
                    <img src={art?.src ?? `/samples/photo-${manifest.assets[0]?.url.includes("rodin") ? 4 : 2}.jpg`} alt={art?.alt ?? ""} loading="lazy" />
                    <span className="wk-world__mode">{sampleModeLabel(manifest)}</span>
                  </div>
                  <div className="wk-world__body">
                    <h3>{sampleTitle(manifest)}</h3>
                    <p className="wk-world__meta">{sampleSummary(manifest)}{art?.look ? <span> · Shown in the {art.look} look</span> : null}</p>
                    <div className="wk-world__actions"><Button onClick={() => onPlaySample(manifest)}><Icon name="play" />Play now</Button><Button variant="ghost" onClick={() => onEditSample(manifest)}>Edit course</Button></div>
                  </div>
                </article>;
              })}</div>}
          </div>
        </section>
        {/* Product: the library. White cards on the tint; the picture leads,
            status is a badge on it, one clear way in. */}
        <section className="wk-section wk-section--tint wk-library" id="my-worlds" aria-labelledby="worlds-heading" ref={worldsRef} tabIndex={-1}>
          <div className="oq-kit-container">
            <div className="wk-section__head">
              <h2 id="worlds-heading">Your worlds</h2>
              <p>Everything you have made, saved on this machine.</p>
            </div>
            {savedError ? <p role="alert" className="oq-kit-error wk-library__notice">Your saved worlds couldn’t load. Check your connection and refresh to try again.</p>
              : !savedLevels ? <p role="status" className="oq-kit-muted">Finding your saved worlds…</p>
              : worldItems.length === 0 ? <div className="wk-library-empty">
                <div className="wk-library-empty__scene" aria-hidden="true">
                  <PortalArch className="wk-library-empty__arch" />
                  <TinyExplorer className="wk-library-empty__explorer" />
                </div>
                <div className="wk-library-empty__copy">
                  <h3>Your first world starts with a photo</h3>
                  <p className="oq-kit-muted">Pick something familiar. Make somewhere new.</p>
                  <Button onClick={onCreateFromPhotos}>Create my world</Button>
                </div>
              </div>
              : <div className="wk-library__grid">{worldItems.map(item => {
                if (item.kind === "pending") return <WorldTile key={`pending-${item.id}`} status="pending" badge="In progress" title={item.title || "Untitled world"}
                  meta={item.statusText ?? `Generation is ${item.job.state}. Leaving this page does not cancel it.`}
                  actions={onResumePendingWorld ? <Button onClick={() => onResumePendingWorld(item.job.id)}>{item.actionLabel ?? "Resume"}</Button> : null} />;
                if (item.kind === "failed") return <WorldTile key={`failed-${item.id}`} status="failed" badge="Needs attention" title={item.title || "Untitled world"}
                  notice={<p className="oq-kit-error">{item.statusText ?? item.job.uiMessage ?? "This generation stage needs another try."}</p>}
                  actions={onRetryFailedWorld && (item.job.lastError?.retryable || item.actionLabel === "Review choices")
                    ? <Button onClick={() => onRetryFailedWorld(item.job.id)}>{item.actionLabel ?? "Retry"}</Button>
                    : <p className="oq-kit-muted">This stage can’t be retried automatically.</p>} />;
                if (item.kind === "draft") return <WorldTile key={`draft-${item.id}`} status="draft" badge="Draft" title={item.draft.manifest.name || "Untitled world"}
                  image={worldImage(item.draft.manifest)}
                  meta={`Unsaved course edits · ${item.draft.manifest.experience?.mode.kind ?? "explore"}`}
                  actions={<Button onClick={() => (onResumeDraft ?? ((next) => onEditSavedLevel(next)))(item.draft.manifest, false)}>Resume</Button>} />;
                const { manifest, draft } = item;
                return <WorldTile key={manifest.levelId} status={draft ? "draft" : "ready"}
                  badge={draft ? "Draft changes" : savedWorldOrigin(manifest) === "generated" ? "Generated world" : savedWorldOrigin(manifest) === "sample-copy" ? "Bundled sample copy" : "Imported world"}
                  title={manifest.name || "Untitled world"} image={worldImage(manifest)}
                  meta={`${manifest.experience?.style.id ?? "cartoon"} · ${manifest.experience?.mode.kind ?? "explore"} · ${manifest.checkpoints.length} checkpoints`}
                  notice={assetIssues[manifest.levelId] ? <p className="oq-kit-error" role="alert">{assetIssues[manifest.levelId]}</p> : null}
                  actions={<>
                    {draft ? <Button onClick={() => (onResumeDraft ?? ((next) => onEditSavedLevel(next)))(draft.manifest, true)}>Resume</Button> : <Button className="wk-tile__play" onClick={() => handlePlaySaved(manifest)} loading={checkingLevelId === manifest.levelId} loadingLabel="Checking assets…"><Icon name="play" />Play</Button>}
                    <span className="wk-tile__more">
                      {draft ? <Button variant="ghost" onClick={() => handlePlaySaved(manifest)} loading={checkingLevelId === manifest.levelId} loadingLabel="Checking assets…">Play saved</Button> : null}
                      {!draft ? <Button variant="ghost" onClick={() => onEditSavedLevel(manifest)}>Edit</Button> : null}
                      <Button variant="ghost" onClick={() => handleExport(manifest)} disabled={exportingLevelId !== null} loading={exportingLevelId === manifest.levelId} loadingLabel="Exporting…">Export</Button>
                    </span>
                  </>}>
                  <WorldPostcardPanel manifest={manifest} />
                </WorldTile>;
              })}</div>}
            {exportError && <p className="oq-kit-error" role="alert">We couldn’t export this world. Try Export again.</p>}
          </div>
        </section>
        {/* The close: back to the ordinary, with a lit doorway in it. */}
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
            <div className="wk-finale__frame" aria-hidden="true">
              <div className="wk-finale__scene">
                <img src="/samples/photo-1.jpg" alt="" loading="lazy" />
                <PortalArch className="wk-finale__arch" />
                <TinyExplorer className="wk-finale__explorer" />
              </div>
            </div>
          </div>
        </section>
        <div className="oq-kit-container wk-welcome-foot">
          <details className="oq-welcome__imports"><summary>Already have a world? Import it here.</summary>
            <div className="oq-kit-row"><Button variant="secondary" loading={importingGlb} loadingLabel="Importing 3D object…" disabled={importingBundle} onClick={() => glbInputRef.current?.click()}>Import a 3D object</Button><Button variant="secondary" loading={importingBundle} loadingLabel="Importing world…" disabled={importingGlb} onClick={() => bundleInputRef.current?.click()}>Import a world bundle</Button></div>
            <p className="oq-kit-muted">3D objects use .glb files. World bundles use the .json files {BRAND_NAME} exports.</p>
            <input hidden ref={glbInputRef} type="file" accept=".glb,model/gltf-binary" disabled={importingGlb || importingBundle} aria-label="Choose a 3D object" onChange={event => handleImportGlb(event.target.files?.[0] ?? null)} />
            <input hidden ref={bundleInputRef} type="file" accept=".json,.objectquest.json,application/json,application/octet-stream" disabled={importingGlb || importingBundle} aria-label="Choose a world bundle" onChange={event => handleImportBundle(event.target.files?.[0] ?? null)} />
            {glbImportError && <p className="oq-kit-error" role="alert">We couldn’t import this 3D object. Check the file and try again.</p>}
            {bundleImportError && <p className="oq-kit-error" role="alert">We couldn’t import this world. Choose an exported {BRAND_NAME} bundle and try again.</p>}
          </details>
          <footer className="oq-welcome__footer"><span>{BRAND_TAGLINE}</span>{import.meta.env.DEV && <a href="/design-kit/">Explore the design kit</a>}</footer>
        </div>
      </main>
    </WorldStyleScope>
  );
}
