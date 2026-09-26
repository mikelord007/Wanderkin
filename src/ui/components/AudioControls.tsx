import { useId } from "react";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";
export interface AudioSettings { master: number; music: number; effects: number; muted: boolean; }
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: 80, music: 50, effects: 75, muted: false };
const channels = ["master", "music", "effects"] as const;
const labels = { master: "Master", music: "Music", effects: "Effects" };
/** Percentage values. Playback engine and persistence remain the caller's responsibility. */
export function AudioControls({ value, onChange }: { value: AudioSettings; onChange: (value: AudioSettings) => void }) {
  const id = useId();
  return <fieldset className="oq-kit-audio">
    <legend>Sound</legend>
    <Button variant="secondary" aria-pressed={value.muted} onClick={() => onChange({ ...value, muted: !value.muted })}>
      <Icon name="sound" />{value.muted ? "Unmute sound" : "Mute sound"}
    </Button>
    {channels.map(channel => <div className="oq-kit-audio__channel" key={channel}>
      <label htmlFor={`${id}-${channel}`}>{labels[channel]}</label>
      <output htmlFor={`${id}-${channel}`}>{value[channel]}%</output>
      <input id={`${id}-${channel}`} type="range" min={0} max={100} step={1} value={value[channel]}
        aria-valuetext={`${value[channel]} percent${value.muted ? ", sound muted" : ""}`}
        onChange={event => onChange({ ...value, [channel]: Number(event.target.value) })} />
    </div>)}
    <p className="oq-kit-muted">{value.muted ? "Sound is muted. Your volume settings are kept." : "Sound starts when you choose to play."}</p>
  </fieldset>;
}
