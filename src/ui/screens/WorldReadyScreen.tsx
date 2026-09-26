import { lazy, Suspense, useState } from "react";
import type { SceneManifest, StyleId } from "@shared/index.js";
import { AudioControls, Button, Card, DEFAULT_AUDIO_SETTINGS, Sheet, type AudioSettings } from "../components/index.js";
import { CreationFrame } from "./CreationFrame.js";

const Preview3D = lazy(() => import("../../editor/Preview3D.js").then(module => ({ default: module.Preview3D })));

function statusFor(manifest: SceneManifest): { label: string; kind: "prepared" | "checked" | "needs"; issue?: string } {
  const validation = manifest.courseValidation;
  if (validation.status === "validated") return { label: "Checked", kind: "checked" };
  if (validation.status === "failed") return { label: "Needs adjustment", kind: "needs", issue: validation.uncertaintyNotes ?? validation.evidence ?? "Move a checkpoint closer to the previous platform." };
  return { label: "Prepared", kind: "prepared" };
}

export function WorldReadyScreen({ manifest, onEnter, onAdjustCourse, onBack }: {
  manifest: SceneManifest;
  onEnter: () => void;
  onAdjustCourse: (issue?: string) => void;
  onBack: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audio, setAudio] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS);
  const [previewFailures, setPreviewFailures] = useState(0);
  const status = statusFor(manifest);
  const style = manifest.experience?.style.id ?? "cartoon";
  const mode = manifest.experience?.mode.kind ?? "explore";
  const mission = manifest.experience?.quest.objective ?? (mode === "race" ? "Reach every checkpoint and find the finish." : mode === "collect" ? "Find the lost colors and unlock the portal." : "Explore this little world and discover its path.");

  return <CreationFrame activeStep={4} eyebrow="Your world is ready" title={`Welcome to ${manifest.name}.`} onBack={onBack} style={style as StyleId}>
    <section className="oq-world-ready">
      <Card className="oq-world-ready__scene">
        {previewFailures ? <div className="oq-world-ready__missing" role="alert"><strong>The world preview could not load.</strong><p>Your course is still saved.</p><Button onClick={() => setPreviewFailures(0)}>Retry loading</Button><Button variant="ghost" onClick={onBack}>My worlds</Button></div> :
          <Suspense fallback={<div className="oq-world-ready__loading" role="status">Preparing your course…</div>}>
            <Preview3D key={`${manifest.levelId}-${previewFailures}`} manifest={manifest} selectedEntityId={null} placementMode={null} onSurfaceClick={() => undefined} onLoadError={() => setPreviewFailures(count => count + 1)} onBoundsReport={() => undefined} />
          </Suspense>}
      </Card>
      <Card className="oq-world-ready__mission oq-kit-stack">
        <span className="oq-world-ready__badge" data-kind={status.kind}>{status.label}</span>
        <div><p className="oq-kit-eyebrow">Your mission</p><h2>{mission}</h2></div>
        <p className="oq-kit-muted">{mode === "race" ? "Race mode" : mode === "collect" ? "Collect mode" : "Explore mode"} · Keyboard and mouse</p>
        {status.issue ? <div className="oq-world-ready__issue" role="alert"><strong>This course needs a small repair.</strong><p>{status.issue}</p></div> : null}
        <div className="oq-world-ready__actions">
          {status.kind === "needs" ? <Button onClick={() => onAdjustCourse(status.issue)}>Adjust course</Button> : <Button onClick={onEnter}>Enter world</Button>}
          {status.kind !== "needs" ? <Button variant="secondary" onClick={() => onAdjustCourse()}>Adjust course</Button> : null}
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>World settings</Button>
        </div>
        <p className="oq-kit-muted">Move with WASD or arrow keys. Jump with Space. Sound begins only after you choose to play it.</p>
      </Card>
    </section>
    <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="World settings">
      <p><strong>Look:</strong> {style === "hand-painted" ? "Hand-painted" : style === "watercolor" ? "Watercolor" : "Cartoon"}</p>
      <AudioControls value={audio} onChange={setAudio} />
      <Button onClick={() => setSettingsOpen(false)}>Done</Button>
    </Sheet>
  </CreationFrame>;
}

