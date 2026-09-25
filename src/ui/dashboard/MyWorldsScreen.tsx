import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SceneManifest } from "@shared/index.js";
import { Button, Icon } from "../components/index.js";
import { listDrafts } from "../../editor/draftStorage.js";
import { missingAssetUrls, savedWorldItems, savedWorldOrigin, type WorldListItem } from "../worlds.js";
import { describeApiError, downloadLevelBundle, importAsset, importLevelBundle, listLevels } from "../api.js";
import { WorldPostcardPanel } from "../../capture/MediaCards.js";
import { PortalArch, TinyExplorer } from "../components/Scenery.js";
import { BRAND_NAME } from "../../brand.js";
import "../theme/welcome.css";
import "./dashboard.css";

/**
 * The best picture a saved world already has, without generating anything:
 * its animated postcard's poster frame, else the photo it was made from, else
 * the source photo of the bundled sample it copies. Null means the tile draws
 * its own lavender stage instead.
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

function modeLabel(manifest: SceneManifest): string {
  const kind = manifest.experience?.mode.kind;
  return kind === "collect" ? "Lost Colors" : kind === "race" ? "Race" : kind === "explore" ? "Explore" : "Checkpoint course";
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

export interface MyWorldsScreenProps {
  onPlaySavedLevel: (manifest: SceneManifest) => void;
  onEditSavedLevel: (manifest: SceneManifest) => void;
  onCreateFromPhotos: () => void;
  onImportGlbReady: (assetId: string) => void;
  onImportLevelBundleReady: (manifest: SceneManifest) => void;
  additionalWorldItems?: readonly Extract<WorldListItem, { kind: "pending" | "failed" }>[];
  onResumeDraft?: (manifest: SceneManifest, isPersisted: boolean) => void;
  onResumePendingWorld?: (jobId: string) => void;
  onRetryFailedWorld?: (jobId: string) => void;
  onBrowseSamples: () => void;
}

/**
 * Dashboard home. The most recent finished world leads as a large picture
 * ("Jump back in"), because the point of a world is to go back into it; the
 * whole library follows as image-led tiles with one clear way in each.
 */
export function MyWorldsScreen({
  onPlaySavedLevel,
  onEditSavedLevel,
  onCreateFromPhotos,
  onImportGlbReady,
  onImportLevelBundleReady,
  additionalWorldItems = [],
  onResumeDraft,
  onResumePendingWorld,
  onRetryFailedWorld,
  onBrowseSamples,
}: MyWorldsScreenProps) {
  const [savedLevels, setSavedLevels] = useState<SceneManifest[] | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drafts] = useState(() => listDrafts());
  const [checkingLevelId, setCheckingLevelId] = useState<string | null>(null);
  const [assetIssues, setAssetIssues] = useState<Record<string, string>>({});
  const [importingGlb, setImportingGlb] = useState(false);
  const [glbImportError, setGlbImportError] = useState<string | null>(null);
  const [importingBundle, setImportingBundle] = useState(false);
  const [bundleImportError, setBundleImportError] = useState<string | null>(null);
  const [exportingLevelId, setExportingLevelId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const glbInputRef = useRef<HTMLInputElement | null>(null);
  const bundleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSavedError(null);
    listLevels()
      .then((levels) => { if (!cancelled) setSavedLevels(levels); })
      .catch((error) => { if (!cancelled) setSavedError(describeApiError(error)); });
    return () => { cancelled = true; };
  }, [attempt]);

  const worldItems = useMemo(
    () => (savedLevels ? [...additionalWorldItems, ...savedWorldItems(savedLevels, drafts)] : []),
    [additionalWorldItems, drafts, savedLevels],
  );
  // The world to jump back into: the most recently saved finished world.
  const latest = useMemo(() => {
    const ready = (savedLevels ?? []).filter((manifest) => manifest.courseValidation?.status !== "failed");
    return [...ready].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0] ?? null;
  }, [savedLevels]);

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
          [manifest.levelId]: "A saved 3D asset is missing or expired. Edit this world to replace it, or retry after restoring the file.",
        }));
        return;
      }
      onPlaySavedLevel(manifest);
    } finally {
      setCheckingLevelId(null);
    }
  }

  async function handleImportGlb(file: File | null) {
    if (!file) return;
    setImportingGlb(true);
    setGlbImportError(null);
    try {
      onImportGlbReady((await importAsset(file)).id);
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
      onImportLevelBundleReady(await importLevelBundle(file));
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

  const count = savedLevels ? worldItems.length : null;
  const latestImage = latest ? worldImage(latest) : null;

  return (
    <main className="wk-page" aria-labelledby="my-worlds-heading">
      <header className="wk-page__head">
        <div>
          <h1 id="my-worlds-heading">My worlds</h1>
          <p className="wk-page__lede">
            {count === null ? "Everything you’ve made, in one place."
              : count === 0 ? "Nothing here yet. Your first world starts with a photo."
              : count === 1 ? "One world so far." : `${count} worlds so far.`}
          </p>
        </div>
        <Button onClick={onCreateFromPhotos}><Icon name="plus" />Create a world</Button>
      </header>

      {latest ? (
        <section className="wk-resume" aria-labelledby="resume-heading">
          <div className="wk-resume__picture">
            {latestImage ? <img src={latestImage} alt="" /> : <div className="wk-tile__scene" aria-hidden="true"><PortalArch className="wk-tile__arch" /><TinyExplorer className="wk-tile__explorer" /></div>}
          </div>
          <div className="wk-resume__card">
            <p className="wk-resume__kicker">Jump back in</p>
            <h2 id="resume-heading">{latest.name || "Untitled world"}</h2>
            <p className="wk-resume__meta">{modeLabel(latest)}, {latest.checkpoints.length} checkpoint{latest.checkpoints.length === 1 ? "" : "s"}</p>
            {assetIssues[latest.levelId] ? <p className="oq-kit-error" role="alert">{assetIssues[latest.levelId]}</p> : null}
            <div className="wk-resume__actions">
              <Button onClick={() => handlePlaySaved(latest)} loading={checkingLevelId === latest.levelId} loadingLabel="Checking assets…"><Icon name="play" />Play</Button>
              <Button variant="ghost" onClick={() => onEditSavedLevel(latest)}>Edit</Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="wk-page__section" aria-labelledby="library-heading">
        <div className="wk-page__section-head">
          <h2 id="library-heading">{latest ? "All your worlds" : "Your worlds"}</h2>
        </div>
        {savedError ? (
          <div className="wk-library__notice wk-page__notice" role="alert">
            <p>Your worlds couldn’t load. {savedError}</p>
            <Button variant="secondary" onClick={() => { setSavedLevels(null); setAttempt((value) => value + 1); }}>Try again</Button>
          </div>
        ) : !savedLevels ? (
          <div className="wk-library__grid" role="status" aria-label="Loading your worlds">
            {[0, 1, 2].map((index) => <div key={index} className="wk-tile wk-tile--skeleton" aria-hidden="true"><div className="wk-tile__image" /><div className="wk-tile__info"><span /><span /></div></div>)}
          </div>
        ) : worldItems.length === 0 ? (
          <div className="wk-library-empty">
            <div className="wk-library-empty__scene" aria-hidden="true">
              <PortalArch className="wk-library-empty__arch" />
              <TinyExplorer className="wk-library-empty__explorer" />
            </div>
            <div className="wk-library-empty__copy">
              <h3>Your first world starts with a photo</h3>
              <p className="oq-kit-muted">Pick something familiar: a chair, a kettle, a pile of books. {BRAND_NAME} makes somewhere new out of it.</p>
              <div className="oq-kit-row">
                <Button onClick={onCreateFromPhotos}>Create a world</Button>
                <Button variant="ghost" onClick={onBrowseSamples}>Borrow a sample first</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="wk-library__grid">{worldItems.map((item) => {
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
          })}</div>
        )}
        {exportError && <p className="oq-kit-error" role="alert">We couldn’t export this world. Try Export again.</p>}
      </section>

      <details className="oq-welcome__imports wk-page__imports">
        <summary><Icon name="import" />Already have a world? Import it here.</summary>
        <div className="oq-kit-row">
          <Button variant="secondary" loading={importingGlb} loadingLabel="Importing 3D object…" disabled={importingBundle} onClick={() => glbInputRef.current?.click()}>Import a 3D object</Button>
          <Button variant="secondary" loading={importingBundle} loadingLabel="Importing world…" disabled={importingGlb} onClick={() => bundleInputRef.current?.click()}>Import a world bundle</Button>
        </div>
        <p className="oq-kit-muted">3D objects use .glb files. World bundles use the .json files {BRAND_NAME} exports.</p>
        <input hidden ref={glbInputRef} type="file" accept=".glb,model/gltf-binary" disabled={importingGlb || importingBundle} aria-label="Choose a 3D object" onChange={(event) => handleImportGlb(event.target.files?.[0] ?? null)} />
        <input hidden ref={bundleInputRef} type="file" accept=".json,.objectquest.json,application/json,application/octet-stream" disabled={importingGlb || importingBundle} aria-label="Choose a world bundle" onChange={(event) => handleImportBundle(event.target.files?.[0] ?? null)} />
        {glbImportError && <p className="oq-kit-error" role="alert">We couldn’t import this 3D object. Check the file and try again.</p>}
        {bundleImportError && <p className="oq-kit-error" role="alert">We couldn’t import this world. Choose an exported {BRAND_NAME} bundle and try again.</p>}
      </details>
    </main>
  );
}
