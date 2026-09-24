import { useEffect, useState } from "react";
import type { SceneManifest, VideoAssetReference } from "@shared/index.js";
import { Button } from "../ui/components/Button.js";
import type { GameplayHighlight } from "./recorder.js";
import type { PostcardViewState } from "./usePostcard.js";
import { POSTCARD_UNAVAILABLE_MESSAGE, usePostcard } from "./usePostcard.js";
import "./media.css";

export interface CompletionMediaCardsProps {
  postcardState: PostcardViewState;
  postcardVideo: VideoAssetReference | null;
  postcardError: string | null;
  canCreatePostcard: boolean;
  onCreatePostcard?: () => void;
  onRetryPostcard?: () => void;
  highlight: GameplayHighlight | null;
  recordingSupported: boolean;
  recordingError: string | null;
  onDownloadHighlight?: () => void;
}

function HighlightPreview({ highlight }: { highlight: GameplayHighlight }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(highlight.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [highlight]);
  return url ? <video controls preload="metadata" src={url} aria-label="Actual gameplay highlight preview" /> : null;
}

export function CompletionMediaCards(props: CompletionMediaCardsProps) {
  const postcardBusy = props.postcardState === "loading" || props.postcardState === "submitting" || props.postcardState === "pending";
  return (
    <section className="oq-media-cards" aria-label="Optional completion media">
      <article className="oq-media-card">
        <p className="oq-media-card__label">Generated animation</p>
        <h2>Animated postcard</h2>
        {props.postcardVideo ? (
          <>
            <video controls loop muted playsInline preload="metadata" poster={props.postcardVideo.posterUrl} src={props.postcardVideo.url} aria-label="Generated animated postcard preview" />
            <a className="oq-kit-button oq-kit-button--secondary" href={props.postcardVideo.url} download>Download animated postcard</a>
          </>
        ) : postcardBusy ? (
          <p role="status">{props.postcardState === "pending" ? "Animating your postcard… You can replay or share while it works." : "Preparing your postcard…"}</p>
        ) : (
          <>
            <p>A short AI-generated animation inspired by this world screenshot. It is not gameplay footage.</p>
            {props.postcardError ? <p className="oq-error-text" role="alert">{props.postcardError}</p> : null}
            {props.postcardState === "failed" && props.onRetryPostcard
              ? <Button variant="secondary" onClick={props.onRetryPostcard}>Retry animated postcard</Button>
              : props.canCreatePostcard && props.onCreatePostcard
                ? <Button variant="secondary" onClick={props.onCreatePostcard}>Create animated postcard</Button>
                : <p className="oq-media-card__note">{POSTCARD_UNAVAILABLE_MESSAGE}</p>}
          </>
        )}
      </article>

      <article className="oq-media-card">
        <p className="oq-media-card__label">Actual gameplay</p>
        <h2>Gameplay highlight</h2>
        {props.highlight ? (
          <>
            <HighlightPreview highlight={props.highlight} />
            <p className="oq-media-card__note">
              {props.highlight.hasAudio ? "Includes available game audio." : "Video-only capture; no audio track was available."}
            </p>
            {props.onDownloadHighlight ? <Button variant="secondary" onClick={props.onDownloadHighlight}>Download gameplay highlight</Button> : null}
          </>
        ) : (
          <>
            <p>{props.recordingSupported ? "No gameplay recording for this run." : "Gameplay recording isn’t supported by this browser."}</p>
            {props.recordingError ? <p className="oq-error-text" role="alert">{props.recordingError}</p> : null}
          </>
        )}
      </article>
    </section>
  );
}

export function SavedPostcard({ video }: { video: VideoAssetReference }) {
  return (
    <div className="oq-saved-postcard">
      <p className="oq-media-card__label">Generated animation · Animated postcard</p>
      <video controls loop muted playsInline preload="metadata" poster={video.posterUrl} src={video.url} aria-label="Generated animated postcard preview" />
      <a className="oq-kit-button oq-kit-button--ghost" href={video.url} download>Download postcard</a>
    </div>
  );
}

export function WorldPostcardPanel({ manifest }: { manifest: SceneManifest }) {
  const existing = manifest.media?.video.find((asset) => asset.kind === "animated-postcard") ?? null;
  const postcard = usePostcard(manifest.levelId, null, existing);
  if (postcard.video) return <SavedPostcard video={postcard.video} />;
  if (postcard.state === "pending" || postcard.state === "submitting") {
    return <div className="oq-saved-postcard"><p className="oq-media-card__label">Generated animation · Animated postcard</p><p role="status">Animation in progress. Playing and editing remain available.</p></div>;
  }
  if (postcard.state === "failed") {
    return <div className="oq-saved-postcard"><p className="oq-media-card__label">Animated postcard needs attention</p><p className="oq-kit-error" role="alert">{postcard.error ?? "The optional animation failed."}</p>{postcard.canRetry ? <Button variant="ghost" onClick={() => void postcard.retry()}>Retry postcard</Button> : <p>{POSTCARD_UNAVAILABLE_MESSAGE}</p>}</div>;
  }
  return null;
}
