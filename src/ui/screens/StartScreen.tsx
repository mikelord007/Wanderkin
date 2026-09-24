import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, EmptyState, Icon, Logo, WorldStyleScope } from "../components/index.js";
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

const SampleWorldPreview = lazy(() => import("../components/SampleWorldPreview.js"));

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
      <div className="oq-welcome__band oq-shade">
        <div className="oq-kit-container">
          <nav className="oq-welcome__nav" aria-label="Main navigation">
            <Logo size={34} />
            <Button variant="ghost" onClick={showWorlds}>My worlds <Icon name="arrow" /></Button>
          </nav>
          <section className="oq-welcome__hero" aria-labelledby="welcome-heading">
            <div className="oq-welcome__intro">
              <h1 id="welcome-heading">Your sofa is a mountain range.</h1>
              <p className="oq-welcome__lede">Photograph something ordinary. {BRAND_NAME} rebuilds it in 3D and shrinks you down until the cushions are cliffs.</p>
              <div className="oq-kit-row">
                <Button onClick={onCreateFromPhotos}>Make my world <Icon name="arrow" /></Button>
                <Button variant="secondary" disabled={!sampleLevels?.[0]} onClick={() => { if (sampleLevels?.[0]) onPlaySample(sampleLevels[0]); }}><Icon name="play" />Play a sample</Button>
              </div>
              <p className="oq-welcome__note">The sample is already built in — no photo, no waiting.</p>
            </div>
            <div className="oq-welcome__example">
              <div className="oq-welcome__comparison">
                <figure>
                  <img className="oq-welcome__photo" src="/samples/photo-4.jpg" alt="A photo of a small room: a wooden desk with a laptop beside a dark fabric sofa" />
                  <figcaption>The photograph<span>One corner of a real room</span></figcaption>
                </figure>
                <figure>
                  <div className="oq-welcome__render">
                    <Suspense fallback={<p className="oq-welcome__preview-status" role="status">Opening the little world…</p>}><SampleWorldPreview /></Suspense>
                  </div>
                  <figcaption>The same corner<span>Now somewhere you can stand</span></figcaption>
                </figure>
              </div>
              <p className="oq-welcome__example-footer">A real bundled world, running live — not a mock-up.</p>
            </div>
          </section>
        </div>
      </div>
      <main className="oq-kit-container">
        <div className="oq-welcome__steps" aria-label={`How ${BRAND_NAME} works`}>
          <div className="oq-welcome__step"><span aria-hidden="true">1</span><h3>Photograph it</h3><p>Anything with some shape to it — a chair, a kettle, a pile of books.</p></div>
          <div className="oq-welcome__step"><span aria-hidden="true">2</span><h3>Watch it get big</h3><p>Your object is rebuilt in 3D, and a course is laid out through it.</p></div>
          <div className="oq-welcome__step"><span aria-hidden="true">3</span><h3>Shrink and explore</h3><p>Run its length, climb what you can, and find the way through.</p></div>
        </div>
        <section className="oq-welcome__section" aria-labelledby="samples-heading">
          <div className="oq-welcome__section-heading"><h2 id="samples-heading">Worlds to borrow</h2><p>Built in already. Keyboard controls.</p></div>
          {sampleError ? <p role="alert" className="oq-kit-error">The samples couldn’t load. Refresh to try again.</p>
            : !sampleLevels ? <p role="status" className="oq-kit-muted">Opening the sample collection…</p>
            : sampleLevels.length === 0 ? <EmptyState title="No samples available" description="You can still start a world from your own photo." action={<Button onClick={onCreateFromPhotos}>Create my world</Button>} />
            : <div className="oq-kit-grid">{sampleLevels.map((manifest) => <Card key={manifest.levelId} className="oq-welcome__sample-card">
              {/* The thumbnail sits beside the name only. Three of the four
                  samples come from the same room, so a full-width banner would
                  print the same photo down the page; at this size it reads as
                  provenance rather than as the card's subject. */}
              <div className="oq-welcome__sample-head">
                <img src={`/samples/photo-${manifest.assets[0]?.url.includes("rodin") ? 4 : 2}.jpg`} alt="" loading="lazy" />
                <h3>{manifest.levelId === "sample-lost-colors-rodin" ? "The Lost Colors of Teacup Island" : manifest.levelId === "sample-explore-rodin" ? "Teacup Island Wander" : manifest.levelId === "sample-rodin-room-corner" ? "The desk & sofa adventure" : "A different perspective"}</h3>
              </div>
              <p>{manifest.experience?.mode.kind === "collect" ? "Find 3 lost colors and bring this miniature world back" : manifest.experience?.mode.kind === "explore" ? `Wander ${manifest.experience.mode.destinations.length} destinations, no timer` : `${manifest.checkpoints.length} checkpoints through a miniature room`}</p>
              <div className="oq-kit-row"><Button onClick={() => onPlaySample(manifest)}>Play now</Button><Button variant="ghost" onClick={() => onEditSample(manifest)}>Edit course</Button></div>
            </Card>)}</div>}
        </section>
        <section className="oq-welcome__section" id="my-worlds" aria-labelledby="worlds-heading" ref={worldsRef} tabIndex={-1}>
          <div className="oq-welcome__section-heading"><h2 id="worlds-heading">Your worlds</h2><p>Everything you have made, saved on this machine.</p></div>
          {savedError ? <Card><p role="alert" className="oq-kit-error">Your saved worlds couldn’t load. Check your connection and refresh to try again.</p></Card>
            : !savedLevels ? <p role="status" className="oq-kit-muted">Finding your saved worlds…</p>
            : worldItems.length === 0 ? <EmptyState icon={<Icon name="photo" />} title="Your first world starts with a photo" description="Pick something familiar. Make somewhere new." action={<Button onClick={onCreateFromPhotos}>Create my world</Button>} />
            : <div className="oq-kit-grid">{worldItems.map(item => {
              if (item.kind === "pending") return <Card key={`pending-${item.id}`} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">In progress</p><h3>{item.title || "Untitled world"}</h3>
                <p className="oq-kit-muted">{item.statusText ?? `Generation is ${item.job.state}. Leaving this page does not cancel it.`}</p>
                {onResumePendingWorld ? <Button onClick={() => onResumePendingWorld(item.job.id)}>{item.actionLabel ?? "Resume"}</Button> : null}
              </Card>;
              if (item.kind === "failed") return <Card key={`failed-${item.id}`} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">Needs attention</p><h3>{item.title || "Untitled world"}</h3>
                <p className="oq-kit-error">{item.statusText ?? item.job.uiMessage ?? "This generation stage needs another try."}</p>
                {onRetryFailedWorld && (item.job.lastError?.retryable || item.actionLabel === "Review choices")
                  ? <Button onClick={() => onRetryFailedWorld(item.job.id)}>{item.actionLabel ?? "Retry"}</Button>
                  : <p className="oq-kit-muted">This stage can’t be retried automatically.</p>}
              </Card>;
              if (item.kind === "draft") return <Card key={`draft-${item.id}`} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">Draft</p><h3>{item.draft.manifest.name || "Untitled world"}</h3>
                <p className="oq-kit-muted">Unsaved course edits · {item.draft.manifest.experience?.mode.kind ?? "explore"}</p>
                <Button onClick={() => (onResumeDraft ?? ((next) => onEditSavedLevel(next)))(item.draft.manifest, false)}>Resume</Button>
              </Card>;
              const { manifest, draft } = item;
              return <Card key={manifest.levelId} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">{draft ? "Draft changes" : savedWorldOrigin(manifest) === "generated" ? "Generated world" : savedWorldOrigin(manifest) === "sample-copy" ? "Bundled sample copy" : "Imported world"}</p>
                <h3>{manifest.name || "Untitled world"}</h3>
                <p className="oq-kit-muted">{manifest.experience?.style.id ?? "cartoon"} · {manifest.experience?.mode.kind ?? "explore"} · {manifest.checkpoints.length} checkpoints</p>
                {assetIssues[manifest.levelId] ? <p className="oq-kit-error" role="alert">{assetIssues[manifest.levelId]}</p> : null}
                <div className="oq-kit-row">
                  {draft ? <Button onClick={() => (onResumeDraft ?? ((next) => onEditSavedLevel(next)))(draft.manifest, true)}>Resume</Button> : <Button onClick={() => handlePlaySaved(manifest)} loading={checkingLevelId === manifest.levelId} loadingLabel="Checking assets…">Play</Button>}
                  {draft ? <Button variant="secondary" onClick={() => handlePlaySaved(manifest)} loading={checkingLevelId === manifest.levelId} loadingLabel="Checking assets…">Play saved</Button> : null}
                  {!draft ? <Button variant="secondary" onClick={() => onEditSavedLevel(manifest)}>Edit</Button> : null}
                  <Button variant="ghost" onClick={() => handleExport(manifest)} disabled={exportingLevelId !== null} loading={exportingLevelId === manifest.levelId} loadingLabel="Exporting…">Export</Button>
                </div>
                <WorldPostcardPanel manifest={manifest} />
              </Card>;
            })}</div>}
          {exportError && <p className="oq-kit-error" role="alert">We couldn’t export this world. Try Export again.</p>}
        </section>
        <details className="oq-welcome__imports"><summary>Already have a world? Import it here.</summary>
          <div className="oq-kit-row"><Button variant="secondary" loading={importingGlb} loadingLabel="Importing 3D object…" disabled={importingBundle} onClick={() => glbInputRef.current?.click()}>Import a 3D object</Button><Button variant="secondary" loading={importingBundle} loadingLabel="Importing world…" disabled={importingGlb} onClick={() => bundleInputRef.current?.click()}>Import a world bundle</Button></div>
          <p className="oq-kit-muted">3D objects use .glb files. World bundles use the .json files {BRAND_NAME} exports.</p>
          <input hidden ref={glbInputRef} type="file" accept=".glb,model/gltf-binary" disabled={importingGlb || importingBundle} aria-label="Choose a 3D object" onChange={event => handleImportGlb(event.target.files?.[0] ?? null)} />
          <input hidden ref={bundleInputRef} type="file" accept=".json,.objectquest.json,application/json,application/octet-stream" disabled={importingGlb || importingBundle} aria-label="Choose a world bundle" onChange={event => handleImportBundle(event.target.files?.[0] ?? null)} />
          {glbImportError && <p className="oq-kit-error" role="alert">We couldn’t import this 3D object. Check the file and try again.</p>}
          {bundleImportError && <p className="oq-kit-error" role="alert">We couldn’t import this world. Choose an exported {BRAND_NAME} bundle and try again.</p>}
        </details>
        <footer className="oq-welcome__footer"><span>{BRAND_TAGLINE}</span>{import.meta.env.DEV && <a href="/design-kit/">Explore the design kit</a>}</footer>
      </main>
    </WorldStyleScope>
  );
}
