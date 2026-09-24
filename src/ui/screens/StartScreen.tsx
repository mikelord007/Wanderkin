import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, EmptyState, Icon, WorldStyleScope } from "../components/index.js";
import "../theme/welcome.css";
import type { SceneManifest } from "@shared/index.js";
import { listDrafts } from "../../editor/draftStorage.js";
import {
  missingAssetUrls,
  savedWorldItems,
  type MyWorldListItem,
} from "../worlds.js";
import {
  describeApiError,
  downloadLevelBundle,
  importAsset,
  importLevelBundle,
  listLevels,
} from "../api.js";

const SampleWorldPreview = lazy(() => import("../components/SampleWorldPreview.js"));

interface StartScreenProps {
  onPlaySample: (manifest: SceneManifest) => void;
  onEditSample: (manifest: SceneManifest) => void;
  onPlaySavedLevel: (manifest: SceneManifest) => void;
  onEditSavedLevel: (manifest: SceneManifest) => void;
  onCreateFromPhotos: () => void;
  onImportGlbReady: (assetId: string) => void;
  onImportLevelBundleReady: (manifest: SceneManifest) => void;
  additionalWorldItems?: readonly Extract<MyWorldListItem, { kind: "pending" | "failed" }>[];
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
        setSampleLevels([gameSamples.LOST_COLORS_SAMPLE, ...sceneSamples.SAMPLE_LEVELS]),
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
      <main className="oq-kit-container">
        <nav className="oq-welcome__nav" aria-label="Main navigation">
          <div className="oq-welcome__brand"><span className="oq-welcome__brand-mark"><Icon name="spark" /></span>ObjectQuest</div>
          <Button variant="ghost" onClick={showWorlds}>My worlds <Icon name="arrow" /></Button>
        </nav>
        <section className="oq-welcome__hero" aria-labelledby="welcome-heading">
          <div className="oq-welcome__intro">
            <p className="oq-kit-eyebrow">A little adventure, made from your world</p>
            <h1 id="welcome-heading">Your everyday objects.<br /><span>Extraordinary little worlds.</span></h1>
            <p>A familiar object. A fresh perspective. Turn a photo into a tiny place to jump, climb, and explore.</p>
            <div className="oq-kit-row">
              <Button onClick={onCreateFromPhotos}>Create my world <Icon name="arrow" /></Button>
              <Button variant="secondary" disabled={!sampleLevels?.[0]} onClick={() => { if (sampleLevels?.[0]) onPlaySample(sampleLevels[0]); }}><Icon name="play" />Play a sample</Button>
            </div>
            <p className="oq-welcome__note">Try a bundled world. No upload or generation needed.</p>
          </div>
          <div className="oq-welcome__example">
            <div className="oq-welcome__example-title"><span>FROM FAMILIAR TO FULL OF POSSIBILITY</span><Icon name="spark" /></div>
            <div className="oq-welcome__comparison">
              <figure><img className="oq-welcome__photo" src="/samples/photo-4.jpg" alt="Original photo of a wooden desk beside a dark sofa" /><figcaption>01 / Original photo</figcaption></figure>
              <figure><div className="oq-welcome__render"><Suspense fallback={<p className="oq-welcome__preview-status" role="status">Opening the little world…</p>}><SampleWorldPreview /></Suspense></div><figcaption>02 / Playable transformation</figcaption></figure>
            </div>
            <div className="oq-welcome__example-footer"><div><strong>A room becomes a playground.</strong><p>Actual bundled 3D sample · ready to explore</p></div><Icon name="arrow" /></div>
          </div>
        </section>
        <div className="oq-welcome__steps" aria-label="How ObjectQuest works">
          <div className="oq-welcome__step"><span aria-hidden="true">01</span><div><h3>Start with something real.</h3><p>A photo is the beginning of your next little adventure.</p></div></div>
          <div className="oq-welcome__step"><span aria-hidden="true">02</span><div><h3>See it a little differently.</h3><p>Your familiar shapes become a world to discover.</p></div></div>
          <div className="oq-welcome__step"><span aria-hidden="true">03</span><div><h3>Step inside.</h3><p>Jump, climb, and find a new way around.</p></div></div>
        </div>
        <section className="oq-welcome__section" aria-labelledby="samples-heading">
          <div className="oq-welcome__section-heading"><h2 id="samples-heading">A little taste of adventure.</h2><p className="oq-kit-muted">Bundled samples · keyboard controls</p></div>
          {sampleError ? <p role="alert" className="oq-kit-error">The samples couldn’t load. Refresh to try again.</p>
            : !sampleLevels ? <p role="status" className="oq-kit-muted">Opening the sample collection…</p>
            : sampleLevels.length === 0 ? <EmptyState title="No samples available" description="You can still start a world from your own photo." action={<Button onClick={onCreateFromPhotos}>Create my world</Button>} />
            : <div className="oq-kit-grid">{sampleLevels.map((manifest, index) => <Card key={manifest.levelId} className="oq-welcome__sample-card">
              <img src={`/samples/photo-${manifest.assets[0]?.url.includes("rodin") ? 4 : 2}.jpg`} alt="Source photo for the bundled room sample" loading="lazy" />
              <div><h3>{manifest.levelId === "sample-lost-colors-rodin" ? "The Lost Colors of Teacup Island" : index === 1 ? "The desk & sofa adventure" : "A different perspective"}</h3><p>{manifest.experience?.mode.kind === "collect" ? "3 color fragments · restore this miniature world" : `${manifest.checkpoints.length} checkpoints · a miniature room to explore`}</p>
                <div className="oq-kit-row"><Button onClick={() => onPlaySample(manifest)}>Play now</Button><Button variant="ghost" onClick={() => onEditSample(manifest)}>Edit course</Button></div></div>
            </Card>)}</div>}
        </section>
        <section className="oq-welcome__section" id="my-worlds" aria-labelledby="worlds-heading" ref={worldsRef} tabIndex={-1}>
          <div className="oq-welcome__section-heading"><h2 id="worlds-heading">My worlds</h2><span className="oq-kit-muted">Your next adventure is waiting.</span></div>
          {savedError ? <Card><p role="alert" className="oq-kit-error">Your saved worlds couldn’t load. Check your connection and refresh to try again.</p></Card>
            : !savedLevels ? <p role="status" className="oq-kit-muted">Finding your saved worlds…</p>
            : worldItems.length === 0 ? <EmptyState icon={<Icon name="photo" />} title="Your first world starts with a photo" description="Pick something familiar. Make somewhere new." action={<Button onClick={onCreateFromPhotos}>Create my world</Button>} />
            : <div className="oq-kit-grid">{worldItems.map(item => {
              if (item.kind === "pending") return <Card key={`pending-${item.id}`} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">In progress</p><h3>{item.title || "Untitled world"}</h3>
                <p className="oq-kit-muted">Generation is {item.job.state}. Leaving this page does not cancel it.</p>
                <Button onClick={() => onResumePendingWorld?.(item.job.id)} disabled={!onResumePendingWorld}>Resume</Button>
              </Card>;
              if (item.kind === "failed") return <Card key={`failed-${item.id}`} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">Needs attention</p><h3>{item.title || "Untitled world"}</h3>
                <p className="oq-kit-error">{item.job.uiMessage || "This generation stage needs another try."}</p>
                <Button onClick={() => onRetryFailedWorld?.(item.job.id)} disabled={!onRetryFailedWorld}>Retry</Button>
              </Card>;
              if (item.kind === "draft") return <Card key={`draft-${item.id}`} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">Draft</p><h3>{item.draft.manifest.name || "Untitled world"}</h3>
                <p className="oq-kit-muted">Unsaved course edits · {item.draft.manifest.experience?.mode.kind ?? "explore"}</p>
                <Button onClick={() => onEditSavedLevel(item.draft.manifest)}>Resume</Button>
              </Card>;
              const { manifest, draft } = item;
              return <Card key={manifest.levelId} className="oq-kit-stack">
                <p className="oq-kit-eyebrow">{draft ? "Draft changes" : "Private saved world"}</p>
                <h3>{manifest.name || "Untitled world"}</h3>
                <p className="oq-kit-muted">{manifest.experience?.style.id ?? "cartoon"} · {manifest.experience?.mode.kind ?? "explore"} · {manifest.checkpoints.length} checkpoints</p>
                {assetIssues[manifest.levelId] ? <p className="oq-kit-error" role="alert">{assetIssues[manifest.levelId]}</p> : null}
                <div className="oq-kit-row">
                  {draft ? <Button onClick={() => onEditSavedLevel(manifest)}>Resume</Button> : <Button onClick={() => handlePlaySaved(manifest)} loading={checkingLevelId === manifest.levelId} loadingLabel="Checking assets…">Play</Button>}
                  {draft ? <Button variant="secondary" onClick={() => handlePlaySaved(manifest)} loading={checkingLevelId === manifest.levelId} loadingLabel="Checking assets…">Play saved</Button> : null}
                  <Button variant="secondary" onClick={() => onEditSavedLevel(manifest)}>Edit</Button>
                  <Button variant="ghost" onClick={() => handleExport(manifest)} disabled={exportingLevelId !== null} loading={exportingLevelId === manifest.levelId} loadingLabel="Exporting…">Export</Button>
                </div>
              </Card>;
            })}</div>}
          {exportError && <p className="oq-kit-error" role="alert">We couldn’t export this world. Try Export again.</p>}
        </section>
        <details className="oq-welcome__imports"><summary>Already have a world? Import it here.</summary>
          <div className="oq-kit-row"><Button variant="secondary" loading={importingGlb} loadingLabel="Importing 3D object…" disabled={importingBundle} onClick={() => glbInputRef.current?.click()}>Import a 3D object</Button><Button variant="secondary" loading={importingBundle} loadingLabel="Importing world…" disabled={importingGlb} onClick={() => bundleInputRef.current?.click()}>Import a world bundle</Button></div>
          <p className="oq-kit-muted">3D objects use .glb files. World bundles use ObjectQuest’s exported .json files.</p>
          <input hidden ref={glbInputRef} type="file" accept=".glb,model/gltf-binary" disabled={importingGlb || importingBundle} aria-label="Choose a 3D object" onChange={event => handleImportGlb(event.target.files?.[0] ?? null)} />
          <input hidden ref={bundleInputRef} type="file" accept=".json,.objectquest.json,application/json,application/octet-stream" disabled={importingGlb || importingBundle} aria-label="Choose a world bundle" onChange={event => handleImportBundle(event.target.files?.[0] ?? null)} />
          {glbImportError && <p className="oq-kit-error" role="alert">We couldn’t import this 3D object. Check the file and try again.</p>}
          {bundleImportError && <p className="oq-kit-error" role="alert">We couldn’t import this world. Choose an exported ObjectQuest bundle and try again.</p>}
        </details>
        <footer className="oq-welcome__footer"><span>Ordinary things. Unexpected adventures.</span>{import.meta.env.DEV && <a href="/design-kit/">Explore the design kit</a>}</footer>
      </main>
    </WorldStyleScope>
  );
}
