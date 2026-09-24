/**
 * Built-in HUD.
 *
 * `GameSnapshot` is a read-only report by contract, so it cannot carry
 * callbacks — which means anything the player must be able to *do* while
 * in the game (resume from pause, restart for a replay, retry a failed
 * asset download) has to live inside `GameView`. The product UI still owns
 * leaving the level and reacting to completion, via `onExit`/`onComplete`.
 */

import type { RefObject } from "react";
import type { GameLoadStage } from "../types.js";
import type { GameplaySessionSnapshot } from "../modes/session.js";
import "./hud.css";

export interface HudProps {
  stage: GameLoadStage;
  error: string | null;
  paused: boolean;
  completed: boolean;
  awaitingPointerLock: boolean;
  checkpointsCollected: number;
  checkpointsTotal: number;
  mantlePromptVisible: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  elapsedSeconds: number;
  warnings: readonly string[];
  levelName: string;
  objectiveArrowRef: RefObject<HTMLDivElement>;
  objectiveDistanceRef: RefObject<HTMLSpanElement>;
  onResume: () => void;
  onRestart: () => void;
  onRetry: () => void;
  onExit: () => void;
  onStart: () => void;
  onPause: () => void;
  modeState: GameplaySessionSnapshot | null;
  objective: string | undefined;
  introVisible: boolean;
  feedback: string | null;
}

const STAGE_LABELS: { stage: GameLoadStage; label: string }[] = [
  { stage: "downloading", label: "Downloading level assets" },
  { stage: "decoding", label: "Decoding geometry" },
  { stage: "building-physics", label: "Preparing collision and physics" },
  { stage: "starting", label: "Rendering first frame" },
];

const STAGE_ORDER: GameLoadStage[] = ["idle", "downloading", "decoding", "building-physics", "starting", "running"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function formatMilliseconds(milliseconds: number): string {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${totalTenths % 10}`;
}

function Controls() {
  return (
    <div className="oq-hud__controls">
      <dl>
        <dt>WASD</dt>
        <dd>Move</dd>
        <dt>Mouse</dt>
        <dd>Look</dd>
        <dt>Space</dt>
        <dd>Jump</dd>
        <dt>E</dt>
        <dd>Climb up</dd>
        <dt>R</dt>
        <dd>Back to checkpoint</dd>
        <dt>Esc</dt>
        <dd>Pause</dd>
      </dl>
      <p className="oq-hud__touch-notice">Keyboard and mouse are supported. Touch controls are not available yet.</p>
    </div>
  );
}

function ObjectivePanel({ props }: { props: HudProps }) {
  const state = props.modeState;
  if (!state) {
    return <div className="oq-hud__objective">
      <div className="oq-hud__objective-label">{props.completed ? "Course complete" : "Checkpoints"}</div>
      <div className="oq-hud__objective-count">{props.checkpointsCollected}<span> / {props.checkpointsTotal}</span></div>
    </div>;
  }
  if (state.mode === "collect") {
    return <div className="oq-hud__objective" role="status" aria-live="polite">
      <div className="oq-hud__objective-label">Lost Colors</div>
      <div className="oq-hud__objective-count">Colors found {state.requiredFragmentsCollected}<span> / {state.requiredFragmentsTotal}</span></div>
      <p>{state.portalActive ? "The portal is awake — step inside." : props.objective}</p>
    </div>;
  }
  if (state.mode === "explore") {
    return <div className="oq-hud__objective">
      <div className="oq-hud__objective-label">Explore</div>
      <div className="oq-hud__objective-count">{state.destinationsReached.size} places visited</div>
      <p>{props.objective}</p>
    </div>;
  }
  return <div className="oq-hud__objective">
    <div className="oq-hud__objective-label">Race · {state.reachedCheckpointIds.length}/{props.checkpointsTotal}</div>
    <div className="oq-hud__objective-count">{formatMilliseconds(state.race.elapsedMilliseconds)}</div>
    {state.race.bestMilliseconds !== null ? <p>Best {formatMilliseconds(state.race.bestMilliseconds)}</p> : null}
  </div>;
}

function LoadingCard({
  stage,
  downloadedBytes,
  totalBytes,
  levelName,
}: Pick<HudProps, "stage" | "downloadedBytes" | "totalBytes" | "levelName">) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  // A percentage is only shown when a real content length was reported;
  // otherwise the bar is honestly indeterminate.
  const hasKnownTotal = stage === "downloading" && totalBytes !== null && totalBytes > 0;
  const percent = hasKnownTotal ? Math.min(100, (downloadedBytes / totalBytes) * 100) : 0;

  return (
    <div className="oq-hud__card">
      <h2>Loading {levelName}</h2>
      <p>Play starts once the scene, physics and the first frame are all ready.</p>

      <div className={`oq-hud__bar${hasKnownTotal ? "" : " oq-hud__bar--indeterminate"}`}>
        <div className="oq-hud__bar-fill" style={hasKnownTotal ? { width: `${percent}%` } : undefined} />
      </div>

      <div className="oq-hud__bytes">
        {stage === "downloading"
          ? hasKnownTotal
            ? `${formatBytes(downloadedBytes)} of ${formatBytes(totalBytes)} (${percent.toFixed(0)}%)`
            : `${formatBytes(downloadedBytes)} downloaded — total size not reported by the server`
          : " "}
      </div>

      <div className="oq-hud__stages" style={{ marginTop: "1.1rem" }}>
        {STAGE_LABELS.map((entry) => {
          const index = STAGE_ORDER.indexOf(entry.stage);
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <div key={entry.stage} className={`oq-hud__stage oq-hud__stage--${state}`}>
              <span className="oq-hud__stage-dot" />
              <span>{entry.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Hud(props: HudProps) {
  const {
    stage,
    error,
    paused,
    completed,
    awaitingPointerLock,
    checkpointsCollected,
    checkpointsTotal,
    mantlePromptVisible,
    elapsedSeconds,
    warnings,
    objectiveArrowRef,
    objectiveDistanceRef,
  } = props;

  const ready = stage === "running";
  const loading = !ready && error === null;

  return (
    <div className="oq-hud">
      {ready ? (
        <>
          <ObjectivePanel props={props} />

          <button type="button" className="oq-hud__pause" onClick={props.onPause} aria-label="Pause game">Pause</button>

          <div className="oq-hud__pointer" ref={objectiveArrowRef}>
            <div className="oq-hud__pointer-arrow" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l6.5 15.5L12 15l-6.5 3.5L12 3z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="oq-hud__pointer-distance" ref={objectiveDistanceRef} />
          </div>

          {mantlePromptVisible && !paused && !completed ? (
            <div className="oq-hud__prompt">
              <span className="oq-hud__key">E</span>
              <span>Climb up</span>
            </div>
          ) : null}

          <Controls />
          {props.introVisible ? <div className="oq-hud__intro" role="status">
            <strong>Ready, tiny explorer?</strong>
            <span>Use WASD to move, Space to jump, and E to climb ledges.</span>
          </div> : null}
          {props.feedback ? <div className="oq-hud__feedback" role="status" aria-live="polite">{props.feedback}</div> : null}
          {props.modeState?.mode === "race" && props.modeState.race.phase === "countdown" ? (
            <div className="oq-hud__countdown" role="status" aria-live="assertive">
              {props.modeState.race.countdownSecondsRemaining || "Go!"}
            </div>
          ) : null}
        </>
      ) : null}

      {loading ? (
        <div className="oq-hud__overlay">
          <LoadingCard
            stage={stage}
            downloadedBytes={props.downloadedBytes}
            totalBytes={props.totalBytes}
            levelName={props.levelName}
          />
        </div>
      ) : null}

      {error !== null ? (
        <div className="oq-hud__overlay">
          <div className="oq-hud__card" role="alert">
            <h2>This level could not be loaded</h2>
            <p>{error}</p>
            <div className="oq-hud__actions">
              <button type="button" className="oq-hud__primary" onClick={props.onRetry}>
                Try again
              </button>
              <button type="button" onClick={props.onExit}>
                Back
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ready && completed ? (
        <div className="oq-hud__overlay">
          <div className="oq-hud__card">
            <div className="oq-hud__stat">{formatDuration(elapsedSeconds)}</div>
            <h2>Course complete</h2>
            <p>
              All {checkpointsTotal} checkpoints collected. Play it again for a faster run, or head back to
              the level.
            </p>
            <div className="oq-hud__actions">
              <button type="button" className="oq-hud__primary" onClick={props.onRestart}>
                Play again
              </button>
              <button type="button" onClick={props.onExit}>
                Back to level
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {ready && paused && !completed ? (
        <div className="oq-hud__overlay">
          <div className="oq-hud__card">
            <h2>Paused</h2>
            <p>
              {checkpointsCollected} of {checkpointsTotal} checkpoints collected.
            </p>
            <div className="oq-hud__actions">
              <button type="button" className="oq-hud__primary" onClick={props.onResume}>
                Resume
              </button>
              <button type="button" onClick={props.onRestart}>
                Restart course
              </button>
              <button type="button" onClick={props.onExit}>
                Leave level
              </button>
            </div>
            {warnings.length > 0 ? (
              <div className="oq-hud__warnings">
                <strong>Level data notes</strong>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {ready && awaitingPointerLock && !paused && !completed ? (
        <div
          className="oq-hud__overlay oq-hud__overlay--invite"
          onClick={props.onStart}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") props.onStart();
          }}
        >
          <div className="oq-hud__card">
            <h2>Click to play</h2>
            <p>
              Clicking captures the mouse for camera control. Press <strong>Esc</strong> at any time to
              pause and release it.
            </p>
            <div className="oq-hud__actions">
              <button type="button" className="oq-hud__primary" onClick={props.onStart}>
                Play
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
