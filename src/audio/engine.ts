import type { AudioSettings } from "../ui/components/index.js";
import { resolveAudioUrls, type AudioCue } from "./assets.js";
import type { LevelMedia } from "@shared/index.js";

type Bus = "music" | "effects" | "voice";

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
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly loops = new Map<AudioCue, AudioBufferSourceNode>();
  private readonly narrationPlayed = new Set<string>();
  private urls = resolveAudioUrls();
  private unlocked = false;

  constructor(
    private settings: AudioSettings,
    private readonly contextFactory: () => AudioContext = () => new AudioContext(),
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  configure(media?: LevelMedia): void { this.urls = resolveAudioUrls(media); }

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
    this.buses.voice.gain.value = settings.voice / 100;
  }

  async unlockAndStart(): Promise<void> {
    this.unlocked = true;
    const context = this.ensureContext();
    if (context.state === "suspended") await context.resume();
    await Promise.all([this.startLoop("music"), this.startLoop("ambience")]);
  }

  async play(cue: Exclude<AudioCue, "music" | "ambience" | "narration">): Promise<void> {
    await this.playOneShot(cue, "effects");
  }

  async playNarrationOnce(worldId: string): Promise<void> {
    if (this.narrationPlayed.has(worldId)) return;
    this.narrationPlayed.add(worldId);
    await this.playOneShot("narration", "voice");
  }

  stop(): void {
    for (const source of this.loops.values()) { try { source.stop(); } catch { /* already stopped */ } }
    this.loops.clear();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.buses = null;
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = this.contextFactory();
    const master = context.createGain();
    const music = context.createGain();
    const effects = context.createGain();
    const voice = context.createGain();
    music.connect(master); effects.connect(master); voice.connect(master); master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.buses = { music, effects, voice };
    this.setSettings(this.settings);
    return context;
  }

  private async startLoop(cue: "music" | "ambience"): Promise<void> {
    if (!this.unlocked || this.loops.has(cue)) return;
    const context = this.ensureContext();
    const buffer = await this.load(this.urls[cue]);
    if (!buffer || !this.unlocked || this.loops.has(cue)) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = Math.min(0.02, buffer.duration / 4);
    source.loopEnd = Math.max(source.loopStart, buffer.duration - Math.min(0.02, buffer.duration / 4));
    source.connect(this.buses!.music);
    source.start();
    this.loops.set(cue, source);
  }

  private async playOneShot(cue: AudioCue, bus: Bus): Promise<void> {
    if (!this.unlocked) return;
    const context = this.ensureContext();
    const buffer = await this.load(this.urls[cue]);
    if (!buffer || !this.unlocked) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.buses![bus]);
    source.start();
  }

  private load(url: string): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(url);
    if (existing) return existing;
    const pending = (async () => {
      try {
        const response = await this.fetcher(url);
        if (!response.ok) return null;
        const decoded = await this.ensureContext().decodeAudioData(await response.arrayBuffer());
        return trimAndNormalize(this.ensureContext(), decoded);
      } catch { return null; }
    })();
    this.buffers.set(url, pending);
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
