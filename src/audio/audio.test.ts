import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LevelMedia } from "@shared/index.js";
import { BUNDLED_AUDIO_URLS, EFFECT_CUES, resolveAudioUrls } from "./assets.js";
import { loadAudioSettings, saveAudioSettings } from "./settings.js";
import { GameAudioEngine } from "./engine.js";
import { LOST_COLORS_BUNDLED_MEDIA } from "./bundledMedia.js";

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

describe("client audio", () => {
  it("persists mute and independent bus settings", () => {
    const storage = new MemoryStorage();
    saveAudioSettings({ master: 62, music: 21, effects: 73, voice: 88, muted: true }, storage);
    expect(loadAudioSettings(storage)).toEqual({ master: 62, music: 21, effects: 73, voice: 88, muted: true });
  });

  it("clamps corrupt persisted volume values", () => {
    const storage = new MemoryStorage();
    storage.setItem("objectquest:audio-settings:v1", JSON.stringify({ master: 900, music: -4, effects: "loud", voice: 20, muted: false }));
    expect(loadAudioSettings(storage)).toMatchObject({ master: 100, music: 0, effects: 75, voice: 20 });
  });

  it("uses generated assets where present and bundled fallbacks for missing optional cues", () => {
    const sfx = EFFECT_CUES.slice(0, 2).map((cue, index) => ({ schemaVersion: 1 as const, mediaType: "audio" as const, kind: "sfx" as const, id: cue, url: `/generated/${cue}.wav`, sha256: String(index + 1).repeat(64), sizeBytes: 20, mimeType: "audio/wav", durationSeconds: 1, provenance, loop: false, defaultGain: 1 }));
    const media: LevelMedia = { audio: sfx, video: [] };
    const urls = resolveAudioUrls(media);
    expect(urls["fragment-pickup"]).toBe("/generated/fragment-pickup.wav");
    expect(urls["portal-activate"]).toBe("/generated/portal-activate.wav");
    expect(urls.checkpoint).toBe(BUNDLED_AUDIO_URLS.checkpoint);
  });

  it("never repeats narration for the same world after respawn/restart events", async () => {
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
      { master: 80, music: 50, effects: 75, voice: 90, muted: false },
      () => context,
      async () => new Response(new Uint8Array([1])),
    );
    await engine.unlockAndStart();
    const loopStarts = starts;
    await engine.playNarrationOnce("world-1");
    await engine.playNarrationOnce("world-1");
    expect(starts - loopStarts).toBe(1);
    engine.stop();
  });

  it("ships bundled WAV bytes that match the recorded provenance hash/size", () => {
    for (const asset of LOST_COLORS_BUNDLED_MEDIA.audio) {
      const bytes = readFileSync(path.join(process.cwd(), "public", asset.url.replace(/^\//, "")));
      expect(bytes.byteLength, asset.url).toBe(asset.sizeBytes);
      expect(createHash("sha256").update(bytes).digest("hex"), asset.url).toBe(asset.sha256);
    }
  });

  it("generates the looping ambience bed as broadband noise, not a pitched tone", () => {
    // Regression guard for the "metallic hum" defect: the generator's noise function
    // used to be a one-step LCG applied directly to the sample index, which is linear
    // in `i` and produced a near-periodic ~2 kHz sawtooth instead of real noise. A
    // proper noise source has near-zero autocorrelation at every nonzero lag; a
    // periodic/tonal artifact shows up as a strong peak.
    const ambience = LOST_COLORS_BUNDLED_MEDIA.audio.find((asset) => asset.kind === "ambience")!;
    const bytes = readFileSync(path.join(process.cwd(), "public", ambience.url.replace(/^\//, "")));
    const dataStart = 44; // fixed PCM16 mono header written by scripts/generate-bundled-audio.mjs
    const sampleCount = (bytes.byteLength - dataStart) / 2;
    const samples = new Float64Array(sampleCount);
    for (let i = 0; i < sampleCount; i += 1) samples[i] = bytes.readInt16LE(dataStart + i * 2) / 32768;

    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const denominator = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0);
    let maxAbsCorrelation = 0;
    for (let lag = 1; lag <= 500; lag += 1) {
      let accumulator = 0;
      for (let i = 0; i < samples.length - lag; i += 1) accumulator += (samples[i]! - mean) * (samples[i + lag]! - mean);
      maxAbsCorrelation = Math.max(maxAbsCorrelation, Math.abs(accumulator / denominator));
    }
    expect(maxAbsCorrelation).toBeLessThan(0.5);
  });
});
