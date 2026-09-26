import { useState } from "react";
import { Button, Icon } from "../components/index.js";
import { LOOK_LABELS, MODE_LABELS, startedHint, type PendingWorld } from "../pendingWorlds.js";
import { WorldTile } from "./WorldTile.js";

/**
 * A world being built, in the same tile as a saved world. Three states:
 * - building: the source photo, a slim progress strip across its foot, the
 *   stage in progress and when it started; the card opens the full progress;
 * - done: the approved preview, and Play;
 * - failed: what went wrong, Retry, and Discard (asked twice).
 */
export function PendingWorldTile({ world, now, retrying = false, retryError, onOpen, onPlay, onRetry, onDiscard }: {
  world: PendingWorld;
  now: number;
  retrying?: boolean;
  retryError?: string | undefined;
  onOpen: () => void;
  onPlay: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const meta = `${LOOK_LABELS[world.style]} look · ${MODE_LABELS[world.mode]}`;
  const stepIndex = world.stages.findIndex((stage) => stage.id === world.currentStage.id) + 1;

  if (world.state === "done") {
    return <WorldTile status="ready" badge="New world" title={world.title} image={world.previewUrl ?? world.photoUrl ?? null}
      meta={`${meta} · Ready to play`}
      actions={<>
        <Button className="wk-tile__play" onClick={onPlay}><Icon name="play" />Play</Button>
        <span className="wk-tile__more"><Button variant="ghost" onClick={onOpen}>Details</Button></span>
      </>} />;
  }

  if (world.state === "failed") {
    return <WorldTile status="failed" badge="Needs attention" title={world.title} image={world.photoUrl ?? null} meta={meta}
      onOpen={onOpen} openLabel="see what happened"
      notice={<>
        <p className="oq-kit-error">{world.currentStage.label} didn’t finish. {world.error}</p>
        {retryError ? <p className="oq-kit-error" role="alert">{retryError}</p> : null}
      </>}
      actions={confirmingDiscard
        ? <div className="wk-tile__confirm" role="group" aria-label="Discard this world?">
            <span>Discard this world?</span>
            <Button variant="secondary" onClick={() => setConfirmingDiscard(false)}>Keep</Button>
            <Button variant="ghost" className="wk-tile__discard" onClick={onDiscard}>Discard</Button>
          </div>
        : <>
            <Button onClick={onRetry} loading={retrying} loadingLabel="Retrying…">Retry</Button>
            <span className="wk-tile__more"><Button variant="ghost" onClick={() => setConfirmingDiscard(true)}>Discard</Button></span>
          </>} />;
  }

  const percent = Math.round(world.progress * 100);
  return <WorldTile status="building" badge="Building" title={world.title} image={world.photoUrl ?? null} meta={meta}
    onOpen={onOpen} openLabel="view progress"
    overlay={<div className="wk-build-strip" role="progressbar" aria-label={`Building ${world.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${world.currentStage.label}, step ${stepIndex} of ${world.stages.length}`}>
      <span className="wk-build-strip__fill" style={{ width: `${percent}%` }} />
    </div>}
    notice={<div className="wk-build-status">
      <p className="wk-build-status__stage">{world.currentStage.label}<span> · Step {stepIndex} of {world.stages.length}</span></p>
      <p className="wk-build-status__time">{startedHint(world.startedAt, now)}. You can start another world meanwhile.</p>
    </div>}
    actions={<Button variant="secondary" onClick={onOpen}>View progress</Button>} />;
}
