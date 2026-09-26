import { useEffect, useState } from "react";
import type { SceneManifest } from "@shared/index.js";
import { Button, EmptyState, Icon } from "../components/index.js";
import { lookName, manifestBiomeId } from "../../biome/lookCatalog.js";
import "../theme/welcome.css";

/** The owner's own in-game screenshots of each world, cropped to the card
 * (see public/samples/README.md). */
const SAMPLE_ART: Record<string, { src: string; alt: string }> = {
  "sample-desk-beach": { src: "/samples/desk/card.webp", alt: "In the game: the tiny explorer on white sand before a wooden desk as big as a building, with a lamp on top, among palm trees and rocks" },
  "sample-plane-snow": { src: "/samples/plane/card.webp", alt: "In the game: the tiny explorer in the snow in front of a giant airliner, among snowy pine trees and boulders" },
  "sample-boot-rain": { src: "/samples/shoe/card.webp", alt: "In the game: the tiny explorer on a rainy green marsh under a huge brown leather boot, among reeds and palms" },
  "sample-car-dunes": { src: "/samples/car/card.webp", alt: "In the game: the tiny explorer on desert sand beside the wheel of a towering red sports car, with cacti and rocks" },
};

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

/** The worlds to borrow, loaded on demand (they pull in the game modules).
 * The older bundled samples stay registered for their /play/ links but are
 * not offered here. */
export function useSampleLevels(): { samples: SceneManifest[] | null; error: string | null } {
  const [samples, setSamples] = useState<SceneManifest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("../../game/landingWorlds.js")
      .then(({ LANDING_WORLDS }) => {
        if (!cancelled) setSamples([...LANDING_WORLDS]);
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
        {art ? <img src={art.src} alt={art.alt} loading="lazy" /> : null}
        <span className="wk-world__mode">{sampleModeLabel(manifest)}</span>
      </div>
      <div className="wk-world__body">
        <h3>{manifest.name}</h3>
        <p className="wk-world__meta">{sampleSummary(manifest)}<span> · {lookName(manifestBiomeId(manifest))}</span></p>
        <div className="wk-world__actions">
          <Button onClick={() => onPlaySample(manifest)}><Icon name="play" />Play now</Button>
          {onEditSample ? <Button variant="ghost" onClick={() => onEditSample(manifest)}>Edit course</Button> : null}
        </div>
      </div>
    </article>;
  })}</div>;
}
