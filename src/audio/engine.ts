import type { AudioSettings } from "../ui/components/index.js";
import { DEFAULT_BED_GAIN, resolveAudioUrls, resolveLoopGains, type AudioCue } from "./assets.js";
import { duckSchedule, loudSeconds } from "./mix.js";
import { playGrappleBite } from "./synth.js";
import type { LevelMedia } from "@shared/index.js";

type Bus = "music" | "effects";
type Loop = "music" | "ambience";

/** The cue the music dips under, so a pickup is never lost in the music. */
const DUCKED_UNDER: AudioCue = "fragment-pickup";

/** Where the player's clicks and keypresses land (the page, in the browser). */
type GestureTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;
const GESTURES = ["pointerdown", "keydown"] as const;

export interface GameAudioDiagnostics {
  readonly unlocked: boolean;
  readonly contextState: AudioContextState | "uninitialized";
  readonly playing: boolean;
  readonly activeLoops: readonly AudioCue[];
}

export class GameAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<Bus, GainNode> | null = null;
  /** After the music bus (so the Music slider keeps its meaning): dips the
   * music under the collect sound. */
  private duck: GainNode | null = null;
  private duckUntil = 0;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly loudness = new WeakMap<AudioBuffer, number>();
  private readonly loops = new Map<AudioCue, AudioBufferSourceNode>();
  /** Each loop's own level: its asset's authored gain, else the bed level. */
  private readonly loopLevels = new Map<Loop, GainNode>();
  private urls = resolveAudioUrls();
  private levels = resolveLoopGains();
  private ambienceOverride: string | null = null;
  private unlocked = false;

  constructor(
    private settings: AudioSettings,
    private readonly contextFactory: () => AudioContext = () => new AudioContext(),
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly gestures: GestureTarget | null = typeof window === "undefined" ? null : window,
  ) {}

  /** A click or keypress (Restart, Resume, moving on) brings back audio the
   * browser suspended since Play: a tab or app switch, an interruption, a
   * new output device. Browsers only allow resuming from such a gesture. */
  private readonly onGesture = (): void => { void this.resumeIfSuspended(); };

  configure(media?: LevelMedia): void {
    const urls = { ...resolveAudioUrls(media) };
    const levels = { ...resolveLoopGains(media) };
    if (this.ambienceOverride) { urls.ambience = this.ambienceOverride; levels.ambience = DEFAULT_BED_GAIN; }
    this.urls = urls;
    this.setLevels(levels);
  }

  /**
   * Replaces the ambience loop while a look with its own ambience is shown
   * (null restores the world's). A playing loop switches over right away.
   */
  setAmbienceOverride(url: string | null, media?: LevelMedia): void {
    if (url === this.ambienceOverride) return;
    this.ambienceOverride = url;
    const next = url ?? resolveAudioUrls(media).ambience;
    // A look's own ambience has no authored level: it plays at the bed level.
    this.setLevels({ ...this.levels, ambience: url ? DEFAULT_BED_GAIN : resolveLoopGains(media).ambience });
    if (next === this.urls.ambience) return;
    this.urls = { ...this.urls, ambience: next };
    const playing = this.loops.get("ambience");
    if (!playing) return;
    try { playing.stop(); } catch { /* already stopped */ }
    this.loops.delete("ambience");
    void this.startLoop("ambience");
  }

  private setLevels(levels: Readonly<Record<Loop, number>>): void {
    this.levels = levels;
    for (const [loop, level] of this.loopLevels) level.gain.value = levels[loop];
  }

  diagnostics(): GameAudioDiagnostics {
    const contextState = this.context?.state ?? "uninitialized";
    return {
      unlocked: this.unlocked,
      contextState,
      playing: contextState === "running" && this.loops.size > 0,
      activeLoops: [...this.loops.keys()],
    };
  }

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
    if (!this.master || !this.buses) return;
    this.master.gain.value = settings.muted ? 0 : settings.master / 100;
    this.buses.music.gain.value = settings.music / 100;
    this.buses.effects.gain.value = settings.effects / 100;
  }

  async unlockAndStart(): Promise<void> {
    if (!this.unlocked) for (const type of GESTURES) this.gestures?.addEventListener(type, this.onGesture);
    this.unlocked = true;
    this.ensureContext();
    await this.resumeIfSuspended();
    await Promise.all([this.startLoop("music"), this.startLoop("ambience")]);
  }

  async play(cue: Exclude<AudioCue, "music" | "ambience">): Promise<void> {
    await this.playOneShot(cue, "effects");
  }

  /** The grappling hook biting: synthesised, so it needs no cue or asset. */
  playGrappleBite(): void {
    if (!this.unlocked) return;
    const context = this.ensureContext();
    playGrappleBite(context, this.buses!.effects);
  }

  stop(): void {
    // Stopped for good: nothing afterwards may build a new context or play.
    this.unlocked = false;
    for (const type of GESTURES) this.gestures?.removeEventListener(type, this.onGesture);
    for (const source of this.loops.values()) { try { source.stop(); } catch { /* already stopped */ } }
    this.loops.clear();
    this.loopLevels.clear();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.buses = null;
    this.duck = null;
    this.duckUntil = 0;
  }

  /** Resumes a context the browser suspended (or, in Safari, interrupted).
   * Outside a gesture the browser may refuse; the next gesture tries again. */
  private async resumeIfSuspended(): Promise<void> {
    const context = this.context;
    if (!this.unlocked || !context || context.state === "running" || context.state === "closed") return;
    try { await context.resume(); } catch { /* the next gesture tries again */ }
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = this.contextFactory();
    const master = context.createGain();
    const music = context.createGain();
    const effects = context.createGain();
    const duck = context.createGain();
    music.connect(duck); duck.connect(master); effects.connect(master); master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.buses = { music, effects };
    this.duck = duck;
    this.setSettings(this.settings);
    return context;
  }

  private async startLoop(cue: "music" | "ambience"): Promise<void> {
    if (!this.unlocked || this.loops.has(cue)) return;
    const context = this.ensureContext();
    const url = this.urls[cue];
    const buffer = await this.load(url);
    // A newer loop was chosen while this one loaded (a look switch): drop it.
    if (!buffer || !this.unlocked || this.loops.has(cue) || this.urls[cue] !== url) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = Math.min(0.02, buffer.duration / 4);
    source.loopEnd = Math.max(source.loopStart, buffer.duration - Math.min(0.02, buffer.duration / 4));
    // Loops are normalised like every sound, then set back to their own
    // level so the music is a bed under the one-shots, not level with them.
    let level = this.loopLevels.get(cue);
    if (!level) {
      level = context.createGain();
      level.connect(this.buses!.music);
      this.loopLevels.set(cue, level);
    }
    level.gain.value = this.levels[cue];
    source.connect(level);
    source.start();
    this.loops.set(cue, source);
  }

  private async playOneShot(cue: AudioCue, bus: Bus): Promise<void> {
    if (!this.unlocked) return;
    const context = this.ensureContext();
    void this.resumeIfSuspended();
    const buffer = await this.load(this.urls[cue]);
    if (!buffer || !this.unlocked) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.buses![bus]);
    source.start();
    if (cue === DUCKED_UNDER) this.duckMusic(context, buffer);
  }

  /** Dips the music 6 dB through the cue's loud part, then brings it back.
   * A pickup during the dip extends it rather than restarting it. */
  private duckMusic(context: AudioContext, buffer: AudioBuffer): void {
    const param = this.duck?.gain;
    if (!param) return;
    let loud = this.loudness.get(buffer);
    if (loud === undefined) { loud = loudSeconds(buffer); this.loudness.set(buffer, loud); }
    const now = context.currentTime;
    this.duckUntil = Math.max(this.duckUntil, now + loud);
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    for (const step of duckSchedule(now, this.duckUntil)) param.setTargetAtTime(step.value, step.at, step.timeConstant);
  }

  private load(url: string): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(url);
    if (existing) return existing;
    const context = this.ensureContext();
    const pending = (async () => {
      try {
        const response = await this.fetcher(url);
        // Stopped meanwhile: never build a new context for a dead engine.
        if (!response.ok || this.context !== context) return null;
        return trimAndNormalize(context, await context.decodeAudioData(await response.arrayBuffer()));
      } catch { return null; }
    })();
    this.buffers.set(url, pending);
    // A failed download is asked for again next time, not remembered as silence.
    void pending.then((buffer) => { if (!buffer && this.buffers.get(url) === pending) this.buffers.delete(url); });
    return pending;
  }
}

/** Removes long generated silence and normalizes conservative headroom. */
export function trimAndNormalize(context: BaseAudioContext, input: AudioBuffer): AudioBuffer {
  const threshold = 0.001;
  let first = input.length;
  let last = 0;
  let peak = 0;
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const data = input.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const level = Math.abs(data[index]!);
      if (level > threshold) { first = Math.min(first, index); last = Math.max(last, index); }
      peak = Math.max(peak, level);
    }
  }
  if (first >= input.length || last <= first) return input;
  const padding = Math.floor(input.sampleRate * 0.01);
  const start = Math.max(0, first - padding);
  const end = Math.min(input.length, last + padding + 1);
  const output = context.createBuffer(input.numberOfChannels, end - start, input.sampleRate);
  const gain = peak > 0 ? Math.min(4, 0.9 / peak) : 1;
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const source = input.getChannelData(channel).subarray(start, end);
    const target = output.getChannelData(channel);
    for (let index = 0; index < source.length; index += 1) target[index] = source[index]! * gain;
  }
  return output;
}
