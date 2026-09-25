import { useEffect, useState } from "react";
import type { SceneManifest } from "@shared/index.js";
import { Button, EmptyState, Icon } from "../components/index.js";
import "../theme/welcome.css";

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

/** The bundled samples, loaded on demand (they pull in the game modules). */
export function useSampleLevels(): { samples: SceneManifest[] | null; error: string | null } {
  const [samples, setSamples] = useState<SceneManifest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([import("../../scene/samples.js"), import("../../game/bundledSamples.js")])
      .then(([sceneSamples, gameSamples]) => {
        if (!cancelled) setSamples([gameSamples.LOST_COLORS_SAMPLE, gameSamples.EXPLORE_SAMPLE, ...sceneSamples.SAMPLE_LEVELS]);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Bundled samples are unavailable.");
      });
    return () => { cancelled = true; };
  }, []);
  return { samples, error };
}

/** Worlds to borrow: one featured world across the top, then the rest.
 * Image first, then title, mode and Play; Edit course stays quiet. Used on
 * the public landing and on the dashboard's Borrow a sample page. */
export function SampleWorlds({ samples, error, onPlaySample, onEditSample, onCreateFromPhotos }: {
  samples: SceneManifest[] | null;
  error: string | null;
  onPlaySample: (manifest: SceneManifest) => void;
  onEditSample?: (manifest: SceneManifest) => void;
  onCreateFromPhotos: () => void;
}) {
  if (error) return <p role="alert" className="oq-kit-error">The samples couldn’t load. Refresh to try again.</p>;
  if (!samples) return <p role="status" className="oq-kit-muted">Opening the sample collection…</p>;
  if (samples.length === 0) {
    return <EmptyState title="No samples available" description="You can still start a world from your own photo." action={<Button onClick={onCreateFromPhotos}>Create my world</Button>} />;
  }
  return <div className="wk-worlds__grid">{samples.map((manifest, index) => {
    const art = SAMPLE_ART[manifest.levelId];
    return <article key={manifest.levelId} className={`wk-world${index === 0 ? " wk-world--featured" : ""}`}>
      <div className="wk-world__media">
        <img src={art?.src ?? `/samples/photo-${manifest.assets[0]?.url.includes("rodin") ? 4 : 2}.jpg`} alt={art?.alt ?? ""} loading="lazy" />
        <span className="wk-world__mode">{sampleModeLabel(manifest)}</span>
      </div>
      <div className="wk-world__body">
        <h3>{sampleTitle(manifest)}</h3>
        <p className="wk-world__meta">{sampleSummary(manifest)}{art?.look ? <span> · Shown in the {art.look} look</span> : null}</p>
        <div className="wk-world__actions">
          <Button onClick={() => onPlaySample(manifest)}><Icon name="play" />Play now</Button>
          {onEditSample ? <Button variant="ghost" onClick={() => onEditSample(manifest)}>Edit course</Button> : null}
        </div>
      </div>
    </article>;
  })}</div>;
}
