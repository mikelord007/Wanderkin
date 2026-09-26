import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LevelMedia } from "@shared/index.js";
import { BUNDLED_AUDIO_URLS, EFFECT_CUES, lookAmbienceUrl, resolveAudioUrls, type EffectCue } from "./assets.js";
import { loadAudioSettings, saveAudioSettings } from "./settings.js";
import { GameAudioEngine, trimAndNormalize } from "./engine.js";
import { LOST_COLORS_BUNDLED_MEDIA } from "./bundledMedia.js";
import { handleEvent } from "./useGameAudio.js";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const provenance = { providerId: "fixture", requestedCapability: "music", servedCapability: "music", servedModel: null, applicationJobId: "job", providerJobId: "provider", timings: { requestedAt: "2026-09-24T00:00:00.000Z" }, reportedCost: null } as const;

/** Media as saved before narration was removed: the bundled set plus a voice line. */
const LEGACY_NARRATED_MEDIA: LevelMedia = {
  audio: [
    ...LOST_COLORS_BUNDLED_MEDIA.audio,
    { schemaVersion: 1, mediaType: "audio", kind: "narration", id: "bundled-narration", url: "/audio/narration-intro.wav", sha256: "9".repeat(64), sizeBytes: 17644, mimeType: "audio/wav", durationSeconds: 1.1, provenance, loop: false, defaultGain: .72, transcript: "Welcome to Teacup Island." },
  ],
  video: [],
};

describe("client audio", () => {
  it("persists mute and independent bus settings", () => {
    const storage = new MemoryStorage();
    saveAudioSettings({ master: 62, music: 21, effects: 73, muted: true }, storage);
    expect(loadAudioSettings(storage)).toEqual({ master: 62, music: 21, effects: 73, muted: true });
  });

  it("clamps corrupt persisted volume values and drops the retired voice level", () => {
    const storage = new MemoryStorage();
    storage.setItem("objectquest:audio-settings:v1", JSON.stringify({ master: 900, music: -4, effects: "loud", voice: 20, muted: false }));
    expect(loadAudioSettings(storage)).toEqual({ master: 100, music: 0, effects: 75, muted: false });
  });

  it("uses generated assets where present and bundled fallbacks for missing optional cues", () => {
    const sfx = EFFECT_CUES.slice(0, 2).map((cue, index) => ({ schemaVersion: 1 as const, mediaType: "audio" as const, kind: "sfx" as const, id: cue, url: `/generated/${cue}.wav`, sha256: String(index + 1).repeat(64), sizeBytes: 20, mimeType: "audio/wav", durationSeconds: 1, provenance, loop: false, defaultGain: 1 }));
    const media: LevelMedia = { audio: sfx, video: [] };
    const urls = resolveAudioUrls(media);
    expect(urls["fragment-pickup"]).toBe("/generated/fragment-pickup.wav");
    expect(urls["portal-activate"]).toBe("/generated/portal-activate.wav");
    expect(urls.checkpoint).toBe(BUNDLED_AUDIO_URLS.checkpoint);
  });

  it("ignores a narration asset carried by an older manifest", () => {
    const narration = { schemaVersion: 1 as const, mediaType: "audio" as const, kind: "narration" as const, id: "old-voice", url: "/generated/old-voice.wav", sha256: "9".repeat(64), sizeBytes: 20, mimeType: "audio/wav", durationSeconds: 2, provenance, loop: false, defaultGain: 1, transcript: "Welcome back." };
    const urls = resolveAudioUrls({ audio: [narration], video: [] });
    expect(urls).toEqual(BUNDLED_AUDIO_URLS);
    expect(Object.values(urls)).not.toContain(narration.url);
  });

  it("plays only music, ambience and event cues — the intro and every other event trigger no voice", async () => {
    const fetched: string[] = [];
    let starts = 0;
    const samples = new Float32Array([.2, .1]);
    const buffer = { length: 2, numberOfChannels: 1, sampleRate: 8000, duration: 1, getChannelData: () => samples } as unknown as AudioBuffer;
    const context = {
      state: "running",
      destination: {},
      resume: async () => undefined,
      close: async () => undefined,
      createGain: () => ({ gain: { value: 1 }, connect: () => undefined }),
      createBufferSource: () => ({ connect: () => undefined, start: () => { starts += 1; }, stop: () => undefined, loop: false, loopStart: 0, loopEnd: 0, buffer: null }),
      decodeAudioData: async () => buffer,
      createBuffer: () => buffer,
    } as unknown as AudioContext;
    const engine = new GameAudioEngine(
      { master: 80, music: 50, effects: 75, muted: false },
      () => context,
      async (url) => { fetched.push(String(url)); return new Response(new Uint8Array([1])); },
    );
    engine.configure(LEGACY_NARRATED_MEDIA);
    await engine.unlockAndStart();
    expect(starts).toBe(2);
    const played: string[] = [];
    const recorder = { play: async (cue: EffectCue) => { played.push(cue); } };
    handleEvent(recorder, { type: "introShown", worldId: "world-1" });
    expect(played).toEqual([]);
    handleEvent(recorder, { type: "respawned", reason: "fell", checkpointId: null });
    handleEvent(recorder, { type: "introShown", worldId: "world-1" });
    expect(played).toEqual(["fall-respawn"]);
    for (const cue of EFFECT_CUES) await engine.play(cue);
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.some((url) => /narration|old-voice/.test(url))).toBe(false);
    engine.stop();
  });

  it("ships bundled WAV bytes that match the recorded provenance hash/size", () => {
    for (const asset of LOST_COLORS_BUNDLED_MEDIA.audio) {
      const bytes = readFileSync(path.join(process.cwd(), "public", asset.url.replace(/^\//, "")));
      expect(bytes.byteLength, asset.url).toBe(asset.sizeBytes);
      expect(createHash("sha256").update(bytes).digest("hex"), asset.url).toBe(asset.sha256);
    }
  });

  it("generates the looping ambience bed without a pitched tone", () => {
    // Regression guard for the "metallic hum" defect: the generator's noise function
    // used to be a one-step LCG applied directly to the sample index, which produced a
    // near-periodic ~2 kHz sawtooth. A tone shows up as a narrow spectral line far above
    // its neighbouring bins; wind noise has a smooth spectrum.
    const ambience = readBundledPcm("ambience");
    const power = welchPower(ambience.samples);
    let worstLine = 0;
    for (let bin = 1; bin < power.length - 1; bin += 1) {
      const neighbours: number[] = [];
      for (let offset = -16; offset <= 16; offset += 1) {
        const other = bin + offset;
        if (offset !== 0 && other >= 1 && other < power.length) neighbours.push(power[other]!);
      }
      neighbours.sort((a, b) => a - b);
      worstLine = Math.max(worstLine, power[bin]! / neighbours[Math.floor(neighbours.length / 2)]!);
    }
    expect(worstLine).toBeLessThan(8);
  });

  it("plays the ambience bed as low wind under the music, not broadband static", () => {
    // Regression guard for the "static noise" defect: the breeze bed was flat white noise
    // (half its energy above 2 kHz) and the engine's normalization boosted it to the same
    // loudness as the music. Measured after the real trimAndNormalize so the engine's
    // gain is included; both loops share the music bus, so bus gain cancels out.
    const music = throughEngine(readBundledPcm("music"));
    const ambience = throughEngine(readBundledPcm("ambience"));
    expect(bandShare(ambience, 2000), "ambience energy above 2 kHz").toBeLessThan(0.05);
    const hissDb = (clip: Pcm) => 10 * Math.log10(meanSquare(clip.samples) * bandShare(clip, 2000, 8000));
    expect(hissDb(ambience) - hissDb(music), "ambience 2-8 kHz level above the music's").toBeLessThanOrEqual(6);
    const rmsDb = (clip: Pcm) => 10 * Math.log10(meanSquare(clip.samples));
    expect(rmsDb(music) - rmsDb(ambience), "ambience headroom under the music (dB)").toBeGreaterThanOrEqual(8);
  });

  it("plays steady low-passed rain as the Monsoon look's ambience, well under the music", () => {
    expect(lookAmbienceUrl("monsoon")).toBe("/audio/monsoon-rain.wav");
    expect(lookAmbienceUrl("alpine")).toBeNull();
    expect(lookAmbienceUrl(null)).toBeNull();
    const bytes = readFileSync(path.join(process.cwd(), "public/audio/monsoon-rain.wav"));
    expect(bytes.byteLength).toBeLessThan(100_000);
    const rain = throughEngine(readPcm(bytes));
    const music = throughEngine(readBundledPcm("music"));
    // Rain hiss, low-passed: little energy up high, no pitched line anywhere.
    expect(bandShare(rain, 3000), "rain energy above 3 kHz").toBeLessThan(0.12);
    const power = welchPower(rain.samples);
    let worstLine = 0;
    for (let bin = 1; bin < power.length - 1; bin += 1) {
      const neighbours: number[] = [];
      for (let offset = -16; offset <= 16; offset += 1) {
        const other = bin + offset;
        if (offset !== 0 && other >= 1 && other < power.length) neighbours.push(power[other]!);
      }
      neighbours.sort((a, b) => a - b);
      worstLine = Math.max(worstLine, power[bin]! / neighbours[Math.floor(neighbours.length / 2)]!);
    }
    expect(worstLine).toBeLessThan(8);
    const rmsDb = (clip: Pcm) => 10 * Math.log10(meanSquare(clip.samples));
    expect(rmsDb(music) - rmsDb(rain), "rain headroom under the music (dB)").toBeGreaterThanOrEqual(8);
  });

  it("swaps the running ambience loop for a look's own and back, without restarting the music", async () => {
    const started: string[] = [];
    const stopped: string[] = [];
    // Silent buffers pass through trimAndNormalize untouched, so each keeps its url tag.
    const samples = new Float32Array([0, 0]);
    const buffers = new Map<string, AudioBuffer>();
    const context = {
      state: "running",
      destination: {},
      resume: async () => undefined,
      close: async () => undefined,
      createGain: () => ({ gain: { value: 1 }, connect: () => undefined }),
      createBufferSource: () => {
        const source = { buffer: null as AudioBuffer | null, connect: () => undefined, loop: false, loopStart: 0, loopEnd: 0,
          start: () => { started.push(String((source.buffer as unknown as { url: string }).url)); },
          stop: () => { stopped.push(String((source.buffer as unknown as { url: string }).url)); } };
        return source;
      },
      decodeAudioData: async (data: ArrayBuffer) => buffers.get(new TextDecoder().decode(data))!,
      createBuffer: () => ({ length: 2, numberOfChannels: 1, sampleRate: 8000, duration: 1, getChannelData: () => samples }),
    } as unknown as AudioContext;
    const engine = new GameAudioEngine(
      { master: 80, music: 50, effects: 75, muted: false },
      () => context,
      async (url) => {
        const key = String(url);
        buffers.set(key, { url: key, length: 2, numberOfChannels: 1, sampleRate: 8000, duration: 1, getChannelData: () => samples } as unknown as AudioBuffer);
        return new Response(key);
      },
    );
    await engine.unlockAndStart();
    expect(started.sort()).toEqual([BUNDLED_AUDIO_URLS.ambience, BUNDLED_AUDIO_URLS.music].sort());
    engine.setAmbienceOverride(lookAmbienceUrl("monsoon"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stopped).toEqual([BUNDLED_AUDIO_URLS.ambience]);
    expect(started.at(-1)).toBe("/audio/monsoon-rain.wav");
    expect(engine.diagnostics().activeLoops.slice().sort()).toEqual(["ambience", "music"]);
    // The world's media reconfigured mid-look keeps the look's loop.
    engine.configure(undefined);
    engine.setAmbienceOverride(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stopped).toEqual([BUNDLED_AUDIO_URLS.ambience, "/audio/monsoon-rain.wav"]);
    expect(started.at(-1)).toBe(BUNDLED_AUDIO_URLS.ambience);
    expect(started.filter((url) => url === BUNDLED_AUDIO_URLS.music)).toHaveLength(1);
    engine.stop();
  });
});

interface Pcm { samples: Float32Array; sampleRate: number }

function readPcm(bytes: Buffer): Pcm {
  const samples = new Float32Array((bytes.byteLength - 44) / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = bytes.readInt16LE(44 + i * 2) / 32768;
  return { samples, sampleRate: bytes.readUInt32LE(24) };
}

function readBundledPcm(kind: "music" | "ambience"): Pcm {
  const asset = LOST_COLORS_BUNDLED_MEDIA.audio.find((entry) => entry.kind === kind)!;
  const bytes = readFileSync(path.join(process.cwd(), "public", asset.url.replace(/^\//, "")));
  const dataStart = 44; // fixed PCM16 mono header written by scripts/generate-bundled-audio.mjs
  const samples = new Float32Array((bytes.byteLength - dataStart) / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = bytes.readInt16LE(dataStart + i * 2) / 32768;
  return { samples, sampleRate: bytes.readUInt32LE(24) };
}

function fakeBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  return { numberOfChannels: 1, length: samples.length, sampleRate, duration: samples.length / sampleRate, getChannelData: () => samples } as unknown as AudioBuffer;
}

function throughEngine(clip: Pcm): Pcm {
  const context = { createBuffer: (_channels: number, length: number, sampleRate: number) => fakeBuffer(new Float32Array(length), sampleRate) } as unknown as BaseAudioContext;
  const output = trimAndNormalize(context, fakeBuffer(clip.samples, clip.sampleRate));
  return { samples: output.getChannelData(0), sampleRate: output.sampleRate };
}

const meanSquare = (samples: Float32Array) => samples.reduce((sum, value) => sum + value * value, 0) / samples.length;

/** Welch power spectrum: Hann window, 50% overlap, bins 0..size/2. */
function welchPower(samples: Float32Array, size = 1024): Float64Array {
  const power = new Float64Array(size / 2 + 1);
  let segments = 0;
  for (let start = 0; start + size <= samples.length; start += size / 2) {
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i += 1) re[i] = samples[start + i]! * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    fft(re, im);
    for (let bin = 0; bin <= size / 2; bin += 1) power[bin]! += re[bin]! ** 2 + im[bin]! ** 2;
    segments += 1;
  }
  return power.map((value) => value / Math.max(1, segments));
}

/** Share of spectral energy (excluding DC) in [low, high) Hz. */
function bandShare(clip: Pcm, low: number, high = Infinity): number {
  const power = welchPower(clip.samples);
  let band = 0;
  let total = 0;
  for (let bin = 1; bin < power.length; bin += 1) {
    const frequency = bin * clip.sampleRate / ((power.length - 1) * 2);
    total += power[bin]!;
    if (frequency >= low && frequency < high) band += power[bin]!;
  }
  return band / total;
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j]!, re[i]!]; [im[i], im[j]] = [im[j]!, im[i]!]; }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = -2 * Math.PI / length;
    for (let start = 0; start < n; start += length) {
      for (let k = 0; k < length / 2; k += 1) {
        const cos = Math.cos(angle * k);
        const sin = Math.sin(angle * k);
        const a = start + k;
        const b = a + length / 2;
        const tr = re[b]! * cos - im[b]! * sin;
        const ti = re[b]! * sin + im[b]! * cos;
        re[b] = re[a]! - tr; im[b] = im[a]! - ti;
        re[a] = re[a]! + tr; im[a] = im[a]! + ti;
      }
    }
  }
}
