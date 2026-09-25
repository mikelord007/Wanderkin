import { useState } from "react";
import type { PublishedLevelVersion, SceneManifest, VideoAssetReference } from "@shared/index.js";
import { Button } from "../components/Button.js";
import { Icon } from "../components/Icon.js";
import type { GameCompletionResult } from "../../game/types.js";
import { sharePath } from "../shareRouting.js";
import { CompletionMediaCards } from "../../capture/MediaCards.js";
import type { GameplayHighlight } from "../../capture/recorder.js";
import type { PostcardViewState } from "../../capture/usePostcard.js";
import "./finish-screen.css";

/**
 * Why the Share button has no `onShare` handler, so the disabled state can
 * explain itself instead of just reading "unavailable". Omitted entirely
 * (and `onSaveAndShare` unset) falls back to the pre-existing generic
 * message — additive, not a required prop.
 */
export type ShareUnavailableReason = "sample-world" | "unsaved-draft" | "unknown";

interface FinishScreenProps {
  manifest: SceneManifest;
  result: GameCompletionResult;
  onReplay: () => void;
  onTryRace?: () => void;
  onShare?: () => Promise<PublishedLevelVersion>;
  shareUnavailableReason?: ShareUnavailableReason;
  /** Save-then-share path for a freshly created, never-persisted draft. */
  onSaveAndShare?: () => Promise<PublishedLevelVersion>;
  /** Already has a live share link (e.g. replaying a published world) —
   * shown immediately instead of a disabled button with no explanation. */
  existingShareUrl?: string | null;
  onCreateAnother: () => void;
  postcardState?: PostcardViewState;
  postcardVideo?: VideoAssetReference | null;
  postcardError?: string | null;
  onCreateAnimatedPostcard?: () => void;
  onRetryAnimatedPostcard?: () => void;
  gameplayHighlight?: GameplayHighlight | null;
  recordingSupported?: boolean;
  recordingError?: string | null;
  onDownloadGameplayHighlight?: () => void;
}

function formatTime(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const tenths = Math.floor((milliseconds % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

export function FinishScreen({
  manifest, result, onReplay, onTryRace, onShare, shareUnavailableReason = "unknown",
  onSaveAndShare, existingShareUrl = null, onCreateAnother,
  postcardState = "none", postcardVideo = null, postcardError = null,
  onCreateAnimatedPostcard, onRetryAnimatedPostcard,
  gameplayHighlight = null, recordingSupported = false, recordingError = null,
  onDownloadGameplayHighlight,
}: FinishScreenProps) {
  const isCollect = manifest.experience?.mode.kind === "collect";
  const isRace = result.mode === "race";
  const [sharing, setSharing] = useState(false);
  const [savingAndSharing, setSavingAndSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(existingShareUrl);
  const [shareError, setShareError] = useState<string | null>(null);

  async function publishAndStore(publish: () => Promise<PublishedLevelVersion>, setBusy: (busy: boolean) => void) {
    setBusy(true);
    setShareError(null);
    try {
      const publication = await publish();
      const url = new URL(sharePath(publication.shareId), window.location.origin).toString();
      setShareUrl(url);
      await navigator.clipboard?.writeText(url).catch(() => undefined);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not publish this world.");
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!onShare) return;
    await publishAndStore(onShare, setSharing);
  }

  async function handleSaveAndShare() {
    if (!onSaveAndShare) return;
    await publishAndStore(onSaveAndShare, setSavingAndSharing);
  }

  async function handleCopyExistingLink() {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
  }

  const canShareAction = Boolean(onShare) || Boolean(shareUrl);
  const publishing = sharing || savingAndSharing;
  return (
    <main className="oq-finish" aria-labelledby="completion-title">
      <div className="oq-finish__glow" aria-hidden="true" />
      <section className="oq-finish__world" aria-label={`${manifest.name}, fully restored`}>
        <div className="oq-finish__island" aria-hidden="true">
          <span className="oq-finish__fragment oq-finish__fragment--red" />
          <span className="oq-finish__fragment oq-finish__fragment--yellow" />
          <span className="oq-finish__fragment oq-finish__fragment--blue" />
          <span className="oq-finish__portal" />
        </div>
        <p><Icon name="spark" /> World fully restored</p>
        <strong>{manifest.name}</strong>
      </section>

      <section className="oq-finish__card">
        <p className="oq-finish__eyebrow">Adventure complete</p>
        <h1 id="completion-title">{isCollect ? "You brought the colors back." : isRace ? "Race finished!" : "What a wonderful little adventure."}</h1>
        <p className="oq-finish__copy">
          {isCollect
            ? "Every fragment is home, the portal is glowing, and this tiny world is bright again."
            : `You completed ${manifest.name}. The same world is ready whenever you want another run.`}
        </p>
        {isRace && result.elapsedMilliseconds !== null ? (
          <dl className="oq-finish__results">
            <div><dt>Your time</dt><dd>{formatTime(result.elapsedMilliseconds)}</dd></div>
            <div><dt>Personal best</dt><dd>{formatTime(result.bestMilliseconds ?? result.elapsedMilliseconds)}</dd></div>
          </dl>
        ) : null}
        <div className="oq-finish__actions">
          <Button onClick={onReplay}><Icon name="play" />Play again</Button>
          {onTryRace ? <Button variant="secondary" onClick={onTryRace}>Try Race mode</Button> : null}
          <Button
            variant="secondary"
            onClick={onShare ? handleShare : shareUrl ? handleCopyExistingLink : undefined}
            // A save-and-share hands Finish a real `onShare` the moment the
            // save lands, while its publish is still running — stay locked
            // until that finishes so one click can't publish twice.
            disabled={!canShareAction || publishing}
            aria-describedby={canShareAction ? undefined : "finish-share-reason"}
            title={
              onShare || shareUrl
                ? undefined
                : shareUnavailableReason === "sample-world"
                  ? "Bundled sample worlds can't be shared"
                  : shareUnavailableReason === "unsaved-draft"
                    ? "Save this world first to get a share link"
                    : "Publish this world before sharing it"
            }
          >
            {publishing && canShareAction ? "Publishing…" : shareUrl ? "Copy share link again" : "Share this world"}
          </Button>
          <Button variant="ghost" onClick={onCreateAnother}>Create another world</Button>
        </div>
        {shareUrl ? (
          <p className="oq-finish__note" role="status">
            Share link ready: <a href={shareUrl}>{shareUrl}</a>
          </p>
        ) : null}
        {shareError ? <p className="oq-error-text" role="alert">{shareError}</p> : null}
        {!canShareAction ? (
          shareUnavailableReason === "sample-world" ? (
            <p className="oq-finish__note" id="finish-share-reason">This is a bundled example world, so it can’t be shared. Create your own world to get a link.</p>
          ) : shareUnavailableReason === "unsaved-draft" ? (
            <>
              <p className="oq-finish__note" id="finish-share-reason">This world hasn’t been saved yet, so there’s no link to share.</p>
              {onSaveAndShare ? (
                <Button variant="ghost" onClick={handleSaveAndShare} loading={savingAndSharing} loadingLabel="Saving & publishing…">
                  Save &amp; share this world
                </Button>
              ) : null}
            </>
          ) : (
            <p className="oq-finish__note" id="finish-share-reason">Publish this world to unlock a playable sharing link.</p>
          )
        ) : null}
        <p className="oq-finish__note">Replay and Race reuse this world’s existing assets — no new generation is started.</p>
        <CompletionMediaCards
          postcardState={postcardState}
          postcardVideo={postcardVideo}
          postcardError={postcardError}
          canCreatePostcard={Boolean(onCreateAnimatedPostcard)}
          {...(onCreateAnimatedPostcard ? { onCreatePostcard: onCreateAnimatedPostcard } : {})}
          {...(onRetryAnimatedPostcard ? { onRetryPostcard: onRetryAnimatedPostcard } : {})}
          highlight={gameplayHighlight}
          recordingSupported={recordingSupported}
          recordingError={recordingError}
          {...(onDownloadGameplayHighlight ? { onDownloadHighlight: onDownloadGameplayHighlight } : {})}
        />
      </section>
    </main>
  );
}
