import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type {
  GenerationJob,
  PublishedChallenge,
  PublishedLevelVersion,
  SceneManifest,
} from "@shared/index.js";
import { StartScreen } from "./ui/screens/StartScreen.js";
import { DashboardShell, type DashboardSection } from "./ui/dashboard/DashboardShell.js";
import { MyWorldsScreen } from "./ui/dashboard/MyWorldsScreen.js";
import { BorrowScreen } from "./ui/dashboard/BorrowScreen.js";
import { AccountScreen } from "./ui/dashboard/AccountScreen.js";
import { useAuth } from "./auth/AuthContext.js";
import { takeReturnTo } from "./auth/returnTo.js";
import { PhotosScreen } from "./ui/screens/PhotosScreen.js";
import { GenerationScreen } from "./ui/screens/GenerationScreen.js";
import { PreparationScreen, type PreparationSource } from "./ui/screens/PreparationScreen.js";
import { PlayScreen } from "./ui/screens/PlayScreen.js";
import { FinishScreen } from "./ui/screens/FinishScreen.js";
import { FriendLandingScreen } from "./ui/screens/FriendLandingScreen.js";
import { LoadingScreen } from "./ui/components/LoadingScreen.js";
import { publishedManifestForPlay } from "./ui/shareRouting.js";
import {
  createNavigationGuard,
  navigateTo,
  parseRoute,
  pathForCreate,
  pathForEdit,
  pathForGenerating,
  pathForAccount,
  pathForPlay,
  pathForPrepareAsset,
  pathForPrepareNew,
  pathForSamples,
  pathForSharePlay,
  pathForStart,
  pathForWorlds,
  sharePath,
  type ParsedRoute,
} from "./ui/routing.js";
import {
  clearActiveSource,
  clearPendingSubmission,
  loadActiveSource,
  resolveResumeState,
  saveActiveSource,
} from "./ui/jobStorage.js";
import { createLevel, downloadLevelBundle, getLevel, getSharedLevel, publishLevel, saveLevel } from "./ui/api.js";
import { createRaceVariant } from "./game/modes/raceVariant.js";
import type { GameCompletionResult } from "./game/types.js";
import {
  clearActiveCreationId,
  loadActiveCreation,
  loadCreationWorldItems,
  removeCreationRecord,
  setActiveCreationId,
} from "./ui/creationStorage.js";
import { isUntouchedCreationRecord } from "./ui/creationFlow.js";
import type { CompletedRunMedia } from "./capture/types.js";
import { usePostcard } from "./capture/usePostcard.js";
import { downloadGameplayHighlight } from "./capture/recorder.js";

type Screen =
  | { name: "resolving" }
  /** The public landing. `signInPrompt` asks a signed-out visitor to sign in
   * for the account-only page they opened (kept in the URL as `returnTo`). */
  | { name: "start"; signInPrompt?: SignInPrompt }
  | { name: "worlds" }
  | { name: "samples" }
  | { name: "account" }
  | { name: "auth-callback" }
  | { name: "friend"; shareId: string }
  | { name: "photos" }
  | { name: "generation"; jobId: string }
  | { name: "preparation"; source: PreparationSource; isNew: boolean; fromSample?: true }
  | {
      name: "play";
      manifest: SceneManifest;
      publishable: boolean;
      unsaved?: UnsavedOrigin;
      publication?: PublishedLevelVersion;
    }
  | {
      name: "finish";
      manifest: SceneManifest;
      result: GameCompletionResult;
      media: CompletedRunMedia;
      publishable: boolean;
      unsaved?: UnsavedOrigin;
      publication?: PublishedLevelVersion;
    };

/** Why a non-publishable run has no stored level behind it, recorded where
 * the run starts. `publishable: false` alone can't tell Finish whether
 * Share should explain "bundled example" or offer to save the user's own
 * unsaved world first — and a sample must never be saved by accident.
 * `manifest` is the draft exactly as Preparation would save it (before any
 * Race variant is derived from it). */
type UnsavedOrigin = { kind: "sample" } | { kind: "draft"; manifest: SceneManifest };

interface SignInPrompt {
  returnTo: string;
  /** What they tried to open, e.g. "your worlds". */
  label: string;
}

/** Screens that need a signed-in account: the dashboard, creation, the
 * editor, and any saved (private) world. Bundled samples, share links and
 * the landing stay public. */
function accountLabel(screen: Screen): string | null {
  switch (screen.name) {
    case "worlds": return "your worlds";
    case "samples": return "the sample library";
    case "account": return "your account";
    case "photos":
    case "generation": return "the world maker";
    case "preparation": return "the course editor";
    case "play":
    case "finish": return screen.publishable || screen.unsaved?.kind === "draft" ? "this world" : null;
    default: return null;
  }
}
/** Every distinct top-level screen the router can restore from a URL alone
 * (start/worlds/create/generation resume from existing localStorage state,
 * exactly as before real routes existed) without any network round trip. */
function resolveSyncScreen(route: ParsedRoute, signedIn: boolean): Screen | null {
  switch (route.kind) {
    case "start":
      // The legacy `/#my-worlds` link now means the dashboard.
      if (typeof window !== "undefined" && window.location.hash === "#my-worlds") return { name: "worlds" };
      return { name: "start" };
    case "samples":
      return { name: "samples" };
    case "account":
      return { name: "account" };
    case "auth-callback":
      return { name: "auth-callback" };
    case "worlds": {
      // Only a signed-in visit may reopen in-progress creation work.
      if (!signedIn) return { name: "worlds" };
      const resume = resolveResumeState();
      if (resume.screen === "generation") return { name: "generation", jobId: resume.jobId };
      if (resume.screen === "preparation") {
        const { assetId, photos } = resume;
        return {
          name: "preparation",
          source: photos.length > 0 ? { kind: "asset", assetId, sourcePhotos: photos } : { kind: "asset", assetId },
          isNew: true,
        };
      }
      if (resume.screen === "photos") return { name: "photos" };
      const creation = loadActiveCreation();
      if (creation && creation.step !== "ready") return { name: "photos" };
      return { name: "worlds" };
    }
    case "create":
      return { name: "photos" };
    case "create-generating":
      return { name: "generation", jobId: route.jobId };
    case "create-prepare": {
      const resume = resolveResumeState();
      if (resume.screen === "preparation") {
        const { assetId, photos } = resume;
        return {
          name: "preparation",
          source: photos.length > 0 ? { kind: "asset", assetId, sourcePhotos: photos } : { kind: "asset", assetId },
          isNew: true,
        };
      }
      return { name: "start" };
    }
    case "create-prepare-asset":
      return { name: "preparation", source: { kind: "asset", assetId: route.assetId }, isNew: true };
    case "share":
      return { name: "friend", shareId: route.shareId };
    case "unknown":
      return { name: "start" };
    default:
      return null;
  }
}

async function findBundledSample(levelId: string): Promise<SceneManifest | null> {
  try {
    const [sceneSamples, gameSamples] = await Promise.all([
      import("./scene/samples.js"),
      import("./game/bundledSamples.js"),
    ]);
    const all: SceneManifest[] = [
      gameSamples.LOST_COLORS_SAMPLE,
      gameSamples.EXPLORE_SAMPLE,
      ...sceneSamples.SAMPLE_LEVELS,
    ];
    return all.find((sample) => sample.levelId === levelId) ?? null;
  } catch {
    return null;
  }
}

async function resolvePlayRoute(levelId: string, signedIn: boolean): Promise<Screen> {
  const sample = await findBundledSample(levelId);
  if (sample) return { name: "play", manifest: sample, publishable: false, unsaved: { kind: "sample" } };
  if (!signedIn) return { name: "start", signInPrompt: { returnTo: pathForPlay(levelId), label: "this world" } };
  try {
    const manifest = await getLevel(levelId);
    return { name: "play", manifest, publishable: true };
  } catch {
    return { name: "worlds" };
  }
}

/** A completed run's screenshot/highlight are captured live and were never
 * persisted, so there is nothing to rebuild a Finish screen from on a cold
 * load — the useful fallback is the playable level itself, not a broken
 * completion screen. Finish is only ever reached in-app, from `onComplete`. */
async function resolveFinishRoute(levelId: string, signedIn: boolean): Promise<Screen> {
  return resolvePlayRoute(levelId, signedIn);
}

async function resolveEditRoute(levelId: string, signedIn: boolean): Promise<Screen> {
  if (!signedIn) return { name: "start", signInPrompt: { returnTo: pathForEdit(levelId), label: "the course editor" } };
  try {
    const manifest = await getLevel(levelId);
    return { name: "preparation", source: { kind: "manifest", manifest }, isNew: false };
  } catch {
    return { name: "worlds" };
  }
}

async function resolveSharePlayRoute(shareId: string): Promise<Screen> {
  try {
    const publication = await getSharedLevel(shareId);
    return { name: "play", manifest: publishedManifestForPlay(publication), publishable: false, publication };
  } catch {
    return { name: "friend", shareId };
  }
}

/** Single entry point for turning a URL into a `Screen`, used for the
 * initial load and for every `popstate` (back/forward). Synchronous where
 * possible; async only for routes that need a fresh fetch on a cold load. */
function resolveScreen(pathname: string, signedIn: boolean): Screen | Promise<Screen> {
  const route = parseRoute(pathname);
  switch (route.kind) {
    case "edit":
      return resolveEditRoute(route.levelId, signedIn);
    case "play":
      return resolvePlayRoute(route.levelId, signedIn);
    case "finish":
      return resolveFinishRoute(route.levelId, signedIn);
    case "share-play":
      return resolveSharePlayRoute(route.shareId);
    default:
      return resolveSyncScreen(route, signedIn) ?? { name: "start" };
  }
}

function pathForScreen(screen: Screen): string {
  switch (screen.name) {
    case "resolving":
      return typeof window === "undefined" ? pathForStart() : window.location.pathname;
    case "start":
      return screen.signInPrompt?.returnTo ?? pathForStart();
    case "worlds":
      return pathForWorlds();
    case "samples":
      return pathForSamples();
    case "account":
      return pathForAccount();
    case "auth-callback":
      return "/auth/callback";
    case "friend":
      return sharePath(screen.shareId);
    case "photos":
      return pathForCreate();
    case "generation":
      return pathForGenerating(screen.jobId);
    case "preparation":
      if (screen.source.kind === "manifest" && !screen.isNew) return pathForEdit(screen.source.manifest.levelId);
      if (screen.source.kind === "asset") return pathForPrepareAsset(screen.source.assetId);
      return pathForPrepareNew();
    case "play":
      return screen.publication ? pathForSharePlay(screen.publication.shareId) : pathForPlay(screen.manifest.levelId);
    case "finish":
      // Finish is deliberately never a resolvable cold-load target (see
      // resolveFinishRoute); the URL only needs to be *a* stable-looking
      // path for this run, not one a refresh can rebuild state from.
      return `/finish/${encodeURIComponent(screen.manifest.levelId)}`;
    default:
      return pathForStart();
  }
}

function challengeFor(result: GameCompletionResult): PublishedChallenge {
  const target = result.bestMilliseconds ?? result.elapsedMilliseconds;
  return result.mode === "race" && target !== null && target > 0
    ? { kind: "race", targetMilliseconds: target, verification: "personal-unverified" }
    : { kind: "completion" };
}

/**
 * Top-level router between start/photos/generation/preparation/play/finish.
 * Owns navigation only — each screen owns its own data fetching and
 * composes the scene/editor/game modules per docs/CONTRACTS.md.
 *
 * Every screen also has a real pathname (see `./ui/routing.ts`): `go()`
 * below is the only way screens change so every transition stays in sync
 * with `history.pushState`, and a `popstate` listener re-resolves the
 * screen from the URL so back/forward and a direct load/refresh land on
 * the same state instead of only ever `/`.
 */
export function App() {
  // Every navigation attempt — the initial load below, each `popstate`, and
  // every in-app `go()` — begins a new token here. A route's async
  // resolution (edit/play/finish/share-play; see `resolveScreen`) may take
  // a while, and the user is free to navigate again before it finishes: the
  // stale attempt's eventual result (success or its own fallback — routes
  // never reject, they resolve to a fallback `Screen` on failure) must never
  // be applied once superseded, whichever order the promises settle in.
  const navigationGuardRef = useRef(createNavigationGuard());
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const [signingIn, setSigningIn] = useState(false);

  // Nothing resolves until sign-in has settled: a private route (edit, a
  // saved world) needs to know whether to fetch or to ask for sign-in.
  const [screen, setScreenState] = useState<Screen>({ name: "resolving" });
  // Every navigation (in-app `go`, back/forward, a route resolving) installs
  // a new `Screen` object, so identity with the screen an async action began
  // on is how that action knows the player hasn't moved on. Updated here,
  // synchronously, rather than after React re-renders, so there's no window
  // where a navigation has happened but the ref still says otherwise.
  const currentScreenRef = useRef(screen);
  const setScreen = useCallback((next: Screen) => {
    currentScreenRef.current = next;
    setScreenState(next);
  }, []);
  // Also follow whatever screen React actually committed, so the ref can
  // never be left pointing at a screen the player is no longer on.
  useLayoutEffect(() => {
    currentScreenRef.current = screen;
  }, [screen]);
  // A draft saved from Finish, keyed by the draft manifest object that
  // `unsaved` carries through Replay and Race. The pending save is shared so
  // a later Finish of the same draft (e.g. the player replayed while it was
  // saving) reuses it instead of creating a second stored copy.
  const draftSavesRef = useRef(new WeakMap<SceneManifest, Promise<SceneManifest>>());
  const savedDraftsRef = useRef(new WeakMap<SceneManifest, SceneManifest>());
  const saveDraftOnce = useCallback((draft: SceneManifest): Promise<SceneManifest> => {
    const pending = draftSavesRef.current.get(draft);
    if (pending) return pending;
    // The reload-recovery record belongs to this draft only if nothing has
    // replaced it by the time the save lands — a new creation started in
    // the meantime must keep its own.
    const sourceAtSave = JSON.stringify(loadActiveSource());
    const save = createLevel(draft).then(
      (saved) => {
        savedDraftsRef.current.set(draft, saved);
        if (JSON.stringify(loadActiveSource()) === sourceAtSave) clearActiveSource();
        return saved;
      },
      (error: unknown) => {
        draftSavesRef.current.delete(draft);
        throw error;
      },
    );
    draftSavesRef.current.set(draft, save);
    return save;
  }, []);

  const go = useCallback((next: Screen, options?: { replace?: boolean }) => {
    // Supersede any still-pending async resolution from an earlier
    // navigation — its result must be dropped whenever it eventually lands.
    navigationGuardRef.current.begin();
    setScreen(next);
    navigateTo(pathForScreen(next), options?.replace ?? false);
  }, []);

  // Turns a URL into a screen (initial load, back/forward, a post-sign-in
  // destination). Async routes show "resolving" and apply their result only
  // if nothing else has navigated since; the URL is then normalised.
  const openPath = useCallback((path: string, options: { replace: boolean; signedIn?: boolean }) => {
    const token = navigationGuardRef.current.begin();
    const result = resolveScreen(path, options.signedIn ?? signedInRef.current);
    if (result instanceof Promise) {
      setScreen({ name: "resolving" });
      if (!options.replace) navigateTo(path);
      void result.then((resolved) => {
        if (!navigationGuardRef.current.isCurrent(token)) return;
        setScreen(resolved);
        navigateTo(pathForScreen(resolved), true);
      });
      return;
    }
    setScreen(result);
    navigateTo(pathForScreen(result), options.replace);
  }, []);

  const resolvedInitialRef = useRef(false);
  useEffect(() => {
    if (auth.status === "loading" || resolvedInitialRef.current) return;
    resolvedInitialRef.current = true;
    openPath(window.location.pathname, { replace: true });
  }, [auth.status, openPath]);

  useEffect(() => {
    function onPopState() {
      openPath(window.location.pathname, { replace: true });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [openPath]);

  // Back from Google: once the session is in, continue to where they were
  // going; if it failed or was cancelled, the landing shows why.
  useEffect(() => {
    if (screen.name !== "auth-callback" || auth.status === "loading") return;
    if (auth.status === "signed-in") openPath(takeReturnTo(), { replace: true, signedIn: true });
    else go({ name: "start" }, { replace: true });
  }, [auth.status, go, openPath, screen]);

  /** Signs in (instantly with the local stub; via Google otherwise, which
   * leaves the page and comes back through /auth/callback), then opens
   * `returnTo`. */
  const signInThen = useCallback(async (returnTo: string, then?: () => void) => {
    setSigningIn(true);
    try {
      const destination = await auth.signIn(returnTo);
      if (destination === null) return;
      if (then) then();
      else openPath(destination, { replace: false, signedIn: true });
    } finally {
      setSigningIn(false);
    }
  }, [auth, openPath]);

  /** Runs an account-only action now, or after signing in. */
  const withAccount = useCallback((returnTo: string, action: () => void) => {
    if (signedInRef.current) action();
    else void signInThen(returnTo, action);
  }, [signInThen]);

  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    go({ name: "start" });
  }, [auth, go]);

  const postcardLevelId = screen.name === "finish" && screen.publishable ? screen.manifest.levelId : null;
  const existingPostcard = screen.name === "finish"
    ? screen.manifest.media?.video.find((asset) => asset.kind === "animated-postcard") ?? null
    : null;
  const postcard = usePostcard(
    postcardLevelId,
    screen.name === "finish" ? screen.media.screenshot : null,
    existingPostcard,
  );

  // "Home" is the dashboard once signed in, the landing otherwise.
  const goStart = useCallback(() => go(signedInRef.current ? { name: "worlds" } : { name: "start" }), [go]);

  // The creation journey's only exit back to Start happens from its very
  // first step (CaptureScreen's Back), before any photo or job exists — so
  // nothing durable is ever lost here. But `persist()` already wrote this
  // still-empty record as the active creation, and nothing else clears that
  // pointer: without this, `resolveSyncScreen`'s "worlds" case would
  // find it on the very next visit to "/" and silently reopen Create instead
  // of showing the landing page the user just backed out to. Clearing only
  // the pointer (not the record) still leaves it resumable as a Draft card
  // via My worlds if one was ever actually created — but `initialRecord()`
  // mints and persists a fresh record on every mount when nothing is
  // active, so repeating "open Create, back out immediately" would
  // otherwise leave one permanent empty "Untitled world" draft per cycle.
  // Pruning it here when (and only when) it's still provably untouched
  // avoids that clutter without ever discarding a draft that holds real
  // user work (a photo, a job, or a config edit).
  const handleCreationBack = useCallback(() => {
    const creation = loadActiveCreation();
    if (creation && isUntouchedCreationRecord(creation)) removeCreationRecord(creation.id);
    clearActiveCreationId();
    goStart();
  }, [goStart]);

  const handleJobStarted = useCallback((jobId: string) => {
    // PhotosScreen already persisted the ActiveSource record (kind "job",
    // with its source photos) and cleared the PendingSubmission the moment
    // the POST response confirmed a durable job id — navigation is all
    // that's left.
    go({ name: "generation", jobId });
  }, [go]);

  const handleJobReady = useCallback((job: GenerationJob) => {
    const current = loadActiveSource();
    const sourcePhotos = current?.kind === "job" ? current.photos : [];
    if (!job.resultAssetId) {
      clearActiveSource();
      go({ name: "start" });
      return;
    }
    // Update the SAME record in place rather than clearing it — it stays
    // durable until the level is saved or the user explicitly leaves, so a
    // reload of a ready job returns straight to Preparation from this same
    // persisted asset instead of losing which source photos it came from
    // (AssetReference itself carries no photo refs).
    saveActiveSource({ kind: "job", jobId: job.id, photos: sourcePhotos, resultAssetId: job.resultAssetId });
    go({
      name: "preparation",
      source:
        sourcePhotos.length > 0
          ? { kind: "asset", assetId: job.resultAssetId, sourcePhotos }
          : { kind: "asset", assetId: job.resultAssetId },
      isNew: true,
    });
  }, [go]);

  const handleJobCancelled = useCallback(() => {
    // Leaving progress never cancels or forgets durable work. My worlds can
    // reopen the same application job without another submission.
    go({ name: "start" });
  }, [go]);

  const handleSavePreparedLevel = useCallback(
    async (manifest: SceneManifest) => {
      if (screen.name !== "preparation") {
        throw new Error("Level saving is only available from the preparation screen.");
      }
      const saved = screen.isNew ? await createLevel(manifest) : await saveLevel(manifest.levelId, manifest);
      // The source photos are now durable inside the saved SceneManifest —
      // the transient reload-recovery record is no longer needed.
      clearActiveSource();
      go({ name: "preparation", source: { kind: "manifest", manifest: saved }, isNew: false }, { replace: true });
      return saved;
    },
    [screen, go],
  );

  const handlePreparationBack = useCallback(() => {
    // Only ever set for an unsaved asset-sourced preparation; a no-op
    // otherwise. Leaving without saving is a deliberate abandonment.
    clearActiveSource();
    go({ name: "start" });
  }, [go]);

  const landing = (prompt: SignInPrompt | null) => (
    <StartScreen
      onPlaySample={(manifest) => go({ name: "play", manifest, publishable: false, unsaved: { kind: "sample" } })}
      onEditSample={(manifest) => withAccount(pathForSamples(), () =>
        go({ name: "preparation", source: { kind: "manifest", manifest }, isNew: true, fromSample: true }))}
      onCreateFromPhotos={() => withAccount(pathForCreate(), () => go({ name: "photos" }))}
      signedIn={signedIn}
      authMode={auth.mode}
      onSignIn={() => { void signInThen(prompt?.returnTo ?? pathForWorlds()); }}
      onOpenDashboard={() => go({ name: "worlds" })}
      signingIn={signingIn}
      signInPrompt={prompt?.label ?? null}
      onDismissSignInPrompt={() => go({ name: "start" }, { replace: true })}
      authError={auth.error}
    />
  );

  // Account-only screens: wait for sign-in to settle, then either show the
  // screen or the landing with a prompt (the URL keeps where they meant to go).
  const needs = accountLabel(screen);
  if (needs && !signedIn) {
    if (auth.status === "loading") return <LoadingScreen stage="Loading…" />;
    return landing({ returnTo: pathForScreen(screen), label: needs });
  }

  const shell = (active: DashboardSection, content: ReactNode) => (
    <DashboardShell
      active={active}
      user={auth.user!}
      onNavigate={(section) => go(
        section === "worlds" ? { name: "worlds" }
          : section === "create" ? { name: "photos" }
          : section === "samples" ? { name: "samples" }
          : { name: "account" },
      )}
      onHome={() => go({ name: "start" })}
      onSignOut={() => { void handleSignOut(); }}
    >
      {content}
    </DashboardShell>
  );

  switch (screen.name) {
    case "resolving":
      return <LoadingScreen stage="Loading…" />;

    case "auth-callback":
      return <LoadingScreen stage="Signing you in…" />;

    case "start":
      return landing(screen.signInPrompt ?? null);

    case "worlds":
      return shell("worlds", (
        <MyWorldsScreen
          onPlaySavedLevel={(manifest) =>
            manifest.courseValidation.status === "failed"
              ? go({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false })
              : go({ name: "play", manifest, publishable: true })
          }
          onEditSavedLevel={(manifest) =>
            go({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false })
          }
          onResumeDraft={(manifest, isPersisted) =>
            go({ name: "preparation", source: { kind: "manifest", manifest }, isNew: !isPersisted })
          }
          onCreateFromPhotos={() => go({ name: "photos" })}
          onBrowseSamples={() => go({ name: "samples" })}
          onImportGlbReady={(assetId) => {
            saveActiveSource({ kind: "import", assetId });
            go({ name: "preparation", source: { kind: "asset", assetId }, isNew: true });
          }}
          onImportLevelBundleReady={(manifest) => {
            clearActiveSource();
            clearPendingSubmission();
            go({ name: "preparation", source: { kind: "manifest", manifest }, isNew: false });
          }}
          additionalWorldItems={loadCreationWorldItems()}
          onResumePendingWorld={(creationId) => {
            setActiveCreationId(creationId);
            go({ name: "photos" });
          }}
          onRetryFailedWorld={(creationId) => {
            setActiveCreationId(creationId);
            go({ name: "photos" });
          }}
        />
      ));

    case "samples":
      return shell("samples", (
        <BorrowScreen
          onPlaySample={(manifest) => go({ name: "play", manifest, publishable: false, unsaved: { kind: "sample" } })}
          onEditSample={(manifest) =>
            go({ name: "preparation", source: { kind: "manifest", manifest }, isNew: true, fromSample: true })
          }
          onCreateFromPhotos={() => go({ name: "photos" })}
        />
      ));

    case "account":
      return shell("account", <AccountScreen user={auth.user!} mode={auth.mode} onSignOut={() => { void handleSignOut(); }} />);

    case "friend":
      return (
        <FriendLandingScreen
          shareId={screen.shareId}
          onPlay={(publication) =>
            go({
              name: "play",
              manifest: publishedManifestForPlay(publication),
              publishable: false,
              publication,
            })
          }
          onHome={goStart}
        />
      );

    case "photos":
      return shell("create", <PhotosScreen onJobStarted={handleJobStarted} onBack={handleCreationBack} />);

    case "generation":
      return shell("create", (
        <GenerationScreen jobId={screen.jobId} onReady={handleJobReady} onCancel={handleJobCancelled} />
      ));

    case "preparation":
      return (
        <PreparationScreen
          source={screen.source}
          isNew={screen.isNew}
          onPlay={(manifest) =>
            go(
              screen.isNew
                ? {
                    name: "play",
                    manifest,
                    publishable: false,
                    unsaved: screen.fromSample ? { kind: "sample" } : { kind: "draft", manifest },
                  }
                : { name: "play", manifest, publishable: true },
            )
          }
          onSave={handleSavePreparedLevel}
          onExport={(manifest) => downloadLevelBundle(manifest.levelId, manifest.name)}
          onBack={handlePreparationBack}
        />
      );

    case "play":
      return (
        <PlayScreen
          manifest={screen.manifest}
          onExit={() =>
            screen.publication
              ? go({ name: "friend", shareId: screen.publication.shareId })
              : goStart()
          }
          // A generated adventure is a new private, unsaved draft. Shared
          // challenges keep their fixed course, so they cannot regenerate.
          {...(screen.publication ? {} : {
            onAdventurePrepared: (manifest: SceneManifest) => {
              if (currentScreenRef.current !== screen) return;
              go({ name: "play", manifest, publishable: false, unsaved: { kind: "draft", manifest } }, { replace: true });
            },
          })}
          // Changing the look is presentation only: the run finishes against
          // the same world, so save, share and publication identity never move.
          onComplete={(result, media) => {
            if (currentScreenRef.current !== screen) return;
            go(
              screen.publication
                ? {
                    name: "finish",
                    manifest: screen.manifest,
                    result,
                    media,
                    publishable: false,
                    publication: screen.publication,
                  }
                : {
                    name: "finish",
                    manifest: screen.manifest,
                    result,
                    media,
                    publishable: screen.publishable,
                    ...(screen.unsaved ? { unsaved: screen.unsaved } : {}),
                  },
            );
          }}
          {...(screen.publication ? { publishedVersionId: screen.publication.versionId } : {})}
        />
      );

    case "finish": {
      const unsaved = screen.unsaved ? { unsaved: screen.unsaved } : {};
      const draft = screen.unsaved?.kind === "draft" ? screen.unsaved.manifest : null;
      const savedDraft = draft ? savedDraftsRef.current.get(draft) ?? null : null;
      return (
        <FinishScreen
          manifest={screen.manifest}
          result={screen.result}
          worldPostcard={screen.media.screenshot?.blob ?? null}
          onReplay={() =>
            go(
              screen.publication
                ? {
                    name: "play",
                    manifest: screen.manifest,
                    publishable: false,
                    publication: screen.publication,
                  }
                : { name: "play", manifest: screen.manifest, publishable: screen.publishable, ...unsaved },
            )
          }
          {...(!screen.publication
            ? {
                onTryRace: () =>
                  go({
                    name: "play",
                    manifest: createRaceVariant(screen.manifest),
                    publishable: screen.publishable,
                    ...unsaved,
                  }),
              }
            : {})}
          {...(screen.publication
            ? { existingShareUrl: new URL(sharePath(screen.publication.shareId), window.location.origin).toString() }
            : screen.publishable
              ? { onShare: () => publishLevel(screen.manifest.levelId, challengeFor(screen.result), false) }
              : savedDraft
                // Saved from an earlier Finish of this same draft (the player
                // left while it was saving): share the stored copy.
                ? { onShare: () => publishLevel(savedDraft.levelId, challengeFor(screen.result), false) }
                : draft
                ? {
                    shareUnavailableReason: "unsaved-draft" as const,
                    // Only on the player's explicit click: the same create
                    // call Preparation's Save makes, then the ordinary
                    // publish. Finish becomes a normal publishable run as
                    // soon as the save lands, so a failed publish is retried
                    // with plain Share rather than saving a second copy.
                    onSaveAndShare: async () => {
                      const saved = await saveDraftOnce(draft);
                      // Only if the player is still on this Finish: if they
                      // left (Play again, Race, Back, anything) while it
                      // saved, don't pull them back or rewrite their
                      // history — the publish they asked for still runs.
                      if (currentScreenRef.current === screen) {
                        go(
                          {
                            name: "finish",
                            manifest: screen.manifest === draft ? saved : createRaceVariant(saved),
                            result: screen.result,
                            media: screen.media,
                            publishable: true,
                          },
                          { replace: true },
                        );
                      }
                      return publishLevel(saved.levelId, challengeFor(screen.result), false);
                    },
                  }
                : { shareUnavailableReason: screen.unsaved?.kind === "sample" ? "sample-world" as const : "unknown" as const })}
          onCreateAnother={screen.publication ? goStart : () => go({ name: "photos" })}
          postcardState={postcard.state}
          postcardVideo={postcard.video ?? existingPostcard}
          postcardError={postcard.error ?? screen.media.screenshotError}
          {...(postcard.canCreate && screen.publishable && screen.media.screenshot
            ? { onCreateAnimatedPostcard: () => { void postcard.create(); } }
            : {})}
          {...(postcard.state === "failed" && postcard.canRetry ? { onRetryAnimatedPostcard: () => { void postcard.retry(); } } : {})}
          gameplayHighlight={screen.media.highlight}
          recordingSupported={screen.media.recordingSupported}
          recordingError={screen.media.recordingError}
          {...(screen.media.highlight
            ? { onDownloadGameplayHighlight: () => downloadGameplayHighlight(screen.media.highlight!, screen.manifest.name) }
            : {})}
        />
      );
    }

    default:
      return null;
  }
}
