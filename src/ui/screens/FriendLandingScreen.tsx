import { lazy, Suspense, useEffect, useState } from "react";
import type { PublishedLevelVersion } from "@shared/index.js";
import { describeApiError, getSharedLevel } from "../api.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import "./friendLanding.css";

const Preview3D = lazy(() =>
  import("../../editor/Preview3D.js").then((mod) => ({ default: mod.Preview3D })),
);

interface FriendLandingScreenProps {
  shareId: string;
  onPlay: (publication: PublishedLevelVersion) => void;
  onHome: () => void;
}

export function FriendLandingScreen({ shareId, onPlay, onHome }: FriendLandingScreenProps) {
  const [publication, setPublication] = useState<PublishedLevelVersion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getSharedLevel(shareId)
      .then((result) => {
        if (!cancelled) setPublication(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(describeApiError(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  if (error) {
    return (
      <main className="oq-screen oq-friend">
        <section className="oq-panel oq-panel--error">
          <h1>This shared world isn’t available</h1>
          <p>{error}</p>
          <button type="button" className="oq-button oq-button--secondary" onClick={onHome}>Visit ObjectQuest</button>
        </section>
      </main>
    );
  }
  if (!publication) return <LoadingScreen stage="Opening the shared world…" />;

  const { manifest, challenge } = publication;
  const mode = manifest.experience.mode.kind;
  const modeLabel = mode === "collect" ? "Lost Colors" : mode[0]!.toUpperCase() + mode.slice(1);
  const challengeLabel =
    challenge.kind === "race"
      ? `Creator’s target: ${(challenge.targetMilliseconds / 1000).toFixed(2)} seconds · unverified`
      : "Complete the creator’s adventure";

  return (
    <main className="oq-screen oq-friend">
      <header className="oq-friend__brand">ObjectQuest</header>
      <section className="oq-panel oq-friend__card">
        <div className="oq-friend__copy">
          <p className="oq-friend__eyebrow">A friend shared a little world</p>
          <h1>{manifest.experience.quest.title || manifest.name}</h1>
          <p className="oq-subtitle">{manifest.experience.quest.intro}</p>
          <dl className="oq-friend__details">
            <div><dt>Adventure</dt><dd>{modeLabel}</dd></div>
            <div><dt>Challenge</dt><dd>{challengeLabel}</dd></div>
            <div><dt>Course version</dt><dd>{publication.versionId}</dd></div>
          </dl>
          <p className="oq-friend__privacy">This link opens the saved course directly. No photo upload or world generation is needed.</p>
          <button type="button" className="oq-button oq-button--primary oq-button--large" onClick={() => onPlay(publication)}>
            Play
          </button>
        </div>
        <div className="oq-friend__preview" aria-label="Shared world preview">
          {previewFailed ? (
            <div className="oq-friend__preview-fallback">The preview is unavailable, but you can still try to play the saved world.</div>
          ) : (
            <Suspense fallback={<LoadingScreen stage="Loading the world preview…" />}>
              <Preview3D
                manifest={manifest}
                selectedEntityId={null}
                placementMode={null}
                onSurfaceClick={() => undefined}
                onLoadError={() => setPreviewFailed(true)}
                onBoundsReport={() => undefined}
              />
            </Suspense>
          )}
        </div>
      </section>
    </main>
  );
}
