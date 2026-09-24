import { useState } from "react";
import {
  AudioControls, Button, Card, ChoiceTiles, DEFAULT_AUDIO_SETTINGS, EmptyState, HUDChip, Icon,
  Logo, Modal, PlayFrame, ProgressPanel, Sheet, Stepper, STYLE_EXAMPLES, SubtitleBar, TextField,
  Toast, WORLD_STYLES, WorldStyleScope, type ProgressStage, type WorldStyle,
} from "../components/index.js";
import "./design-kit.css";

const stages: ProgressStage[] = [
  { id: "object", label: "Preparing your object", status: "complete" },
  { id: "shape", label: "Building its 3D shape", status: "active" },
  { id: "course", label: "Creating your course", status: "pending" },
  { id: "sound", label: "Adding its story and sound", status: "pending" },
];
function StyleGallery({ style, label }: { style: WorldStyle; label: string }) {
  const [look, setLook] = useState<WorldStyle>(style);
  const [adventure, setAdventure] = useState("collect");
  const [audio, setAudio] = useState(DEFAULT_AUDIO_SETTINGS);
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(true);
  const [fullPlay, setFullPlay] = useState(false);
  const [colors, setColors] = useState(0);
  const [atmosphere, setAtmosphere] = useState("");
  return <WorldStyleScope worldStyle={style} className="oq-kit-gallery" id={style}>
    <header className="oq-kit-gallery__header"><div><p className="oq-kit-eyebrow">World style</p><h2>{label}</h2></div>
      <div className="oq-kit-swatches" aria-label={`${label} palette`}><span title="Action" /><span title="Wash" /><span title="Ink" /></div>
    </header>
    <div className="oq-kit-stack">
      <Card className="oq-kit-stack"><h3>01 · Buttons & feedback</h3>
        <div className="oq-kit-row"><Button onClick={() => setToast(true)}><Icon name="spark" />Create my world</Button><Button variant="secondary" onClick={() => setFullPlay(true)}><Icon name="play" />Play a sample</Button><Button variant="ghost" onClick={() => setModal(true)}>World settings</Button></div>
        <div className="oq-kit-row"><Button loading loadingLabel="Building your world…">Build</Button><Button disabled>Unavailable</Button><Button variant="secondary" disabled>Disabled secondary</Button><Button variant="ghost" disabled>Disabled ghost</Button></div>
        {toast ? <Toast message="Your world is saved." onDismiss={() => setToast(false)} /> : <Button variant="ghost" onClick={() => setToast(true)}>Show saved toast</Button>}
      </Card>
      <Card className="oq-kit-stack"><h3>02 · Choices & fields</h3>
        <ChoiceTiles legend="Look" value={look} onChange={setLook} hint="Illustrative color swatches — not generated previews."
          options={WORLD_STYLES.map(s => {
            // The kit shows the same real style examples the Look step does, so
            // a swatch here can never drift from what someone actually picks.
            const example = STYLE_EXAMPLES.find(entry => entry.id === s.value);
            return { value: s.value, label: s.label, description: example?.description ?? "", image: example ? <img src={example.src} alt={example.alt} loading="lazy" /> : null };
          })} />
        <ChoiceTiles legend="Adventure" value={adventure} onChange={setAdventure} options={[
          { value: "explore", label: "Explore", description: "Wander at your own pace." },
          { value: "collect", label: "Collect", description: "Find the lost colors and unlock the portal." },
          { value: "race", label: "Race", description: "Reach the finish as fast as you can." },
        ]} />
        <TextField label="Atmosphere (optional)" placeholder="A floating island above the clouds" helperText="A few words are enough. You can leave this blank." value={atmosphere} onChange={e => setAtmosphere(e.target.value)} />
        <TextField label="World title" defaultValue="" error="Give your world a title before sharing it." />
        <TextField label="Saved reference" value="Your approved photo" readOnly helperText="Read-only field example." />
      </Card>
      <div className="oq-kit-grid">
        <ProgressPanel title="Your world is taking shape." detail="Stage-based progress · no estimated percentage" stages={stages} actions={<Button variant="secondary" onClick={() => setToast(true)}>My worlds</Button>} />
        <Card className="oq-kit-stack"><h3>03 · Repair & known progress</h3><Stepper stages={[...stages.slice(0, 1), { id: "sound", label: "Adding its story and sound", status: "error", detail: "Your course is safe. Try sound again when you’re ready." }]} />
          <ProgressPanel title="Downloading a saved world" detail="Known byte total example: 64%" stages={[]} percent={64} />
          <Button variant="secondary" onClick={() => setToast(true)}>Retry sound</Button>
        </Card>
      </div>
      <div className="oq-kit-grid"><Card className="oq-kit-stack"><h3>04 · Audio & overlays</h3><AudioControls value={audio} onChange={setAudio} />
        <div className="oq-kit-row"><Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button><Button variant="secondary" onClick={() => setSheet(true)}>Open sheet</Button></div>
      </Card><Card className="oq-kit-stack"><h3>05 · Empty state</h3><EmptyState icon={<Icon name="photo" />} title="Your first world starts with a photo" description="Find a familiar object. Give it a little adventure." action={<Button onClick={() => setToast(true)}>Create my world</Button>} />
        <p className="oq-kit-muted">Keyboard: Tab to controls, arrow keys to change choices and sliders, Escape to close overlays.</p>
      </Card></div>
      <div className="oq-kit-stack"><h3>06 · PlayFrame, HUD & subtitles</h3><p className="oq-kit-muted">Layout demonstration using an original sample photo as a backdrop. This is not gameplay.</p>
        <div className={fullPlay ? "oq-kit-demo-fullscreen" : ""}><PlayFrame embedded={!fullPlay}
          scene={<img src="/samples/photo-4.jpg" alt="Original desk and sofa photo; layout demonstration only" />}
          hud={<HUDChip announce>Colors found {colors}/3</HUDChip>}
          actions={<><Button variant="secondary" onClick={() => setSheet(true)}>Sound</Button><Button variant="secondary" onClick={() => setFullPlay(!fullPlay)}>{fullPlay ? "Exit preview" : "Full-screen preview"}</Button></>}
          subtitles={<SubtitleBar speaker="Your guide" text="Three colors are waiting to be found. Let’s bring this little world to life." />}
          controls={<Button onClick={() => setColors((colors + 1) % 4)}>Demo: find a color</Button>} />
        </div>
      </div>
    </div>
    <Modal open={modal} onClose={() => setModal(false)} title="A world worth keeping"><p>Your private world is saved. Sharing creates a playable version for your friends.</p><Button onClick={() => { setModal(false); setToast(true); }}>Keep exploring</Button></Modal>
    <Sheet open={sheet} onClose={() => setSheet(false)} title="World settings"><AudioControls value={audio} onChange={setAudio} /><Button onClick={() => setSheet(false)}>Done</Button></Sheet>
  </WorldStyleScope>;
}
export function DesignKit() {
  return <WorldStyleScope className="oq-kit-docs"><main className="oq-kit-container oq-kit-stack">
    <header className="oq-kit-docs__header"><a href="/"><Logo size={30} /></a><span className="oq-kit-eyebrow">Design system · v2</span></header>
    <div className="oq-kit-docs__intro"><p className="oq-kit-eyebrow">Pocket Wonder</p><h1>Small worlds.<br />A shared language.</h1><p className="oq-kit-muted">Every component, in every world style. A living kit for everyday adventures.</p></div>
    <nav className="oq-kit-row" aria-label="World style galleries">{WORLD_STYLES.map(s => <a key={s.value} href={`#${s.value}`} className="oq-kit-button oq-kit-button--secondary">{s.label}</a>)}</nav>
    {WORLD_STYLES.map(s => <StyleGallery key={s.value} style={s.value} label={s.label} />)}
    <footer className="oq-kit-muted">System fonts. Local icons. Real sample photography. Built for keyboard, touch, and reduced motion.</footer>
  </main></WorldStyleScope>;
}
