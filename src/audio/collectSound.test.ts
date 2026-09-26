import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENE_BIOME_IDS, type AudioAssetReference } from "@shared/index.js";
import { BUNDLED_AUDIO_URLS, lookAmbienceUrl, resolveAudioUrls } from "./assets.js";
import { LOST_COLORS_BUNDLED_MEDIA } from "./bundledMedia.js";
import { GameAudioEngine } from "./engine.js";
import { handleEvent } from "./useGameAudio.js";
import { GameplayEventBus } from "../game/events.js";

/** Mono or stereo 16-bit PCM WAV → first-channel samples in [-1, 1]. */
function readWav(url: string): { samples: Float32Array; rate: number } {
  const bytes = readFileSync(path.join(process.cwd(), "public", url.replace(/^\//, "")));
  let offset = 12;
  let rate = 0;
  let channels = 1;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      expect(bytes.readUInt16LE(offset + 8), "PCM").toBe(1);
      channels = bytes.readUInt16LE(offset + 10);
      rate = bytes.readUInt32LE(offset + 12);
      expect(bytes.readUInt16LE(offset + 22), "16-bit").toBe(16);
    }
    if (id === "data") {
      const frames = Math.floor(size / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) samples[i] = bytes.readInt16LE(offset + 8 + i * 2 * channels) / 32768;
      return { samples, rate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${url} has no data chunk`);
}

const COLLECT = BUNDLED_AUDIO_URLS["fragment-pickup"];

function fakeEngine() {
  const fetched: string[] = [];
  const started: string[] = [];
  const buffers = new Map<string, AudioBuffer>();
  const context = {
    state: "running",
    destination: {},
    resume: async () => undefined,
    close: async () => undefined,
    createGain: () => ({ gain: { value: 1, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, setTargetAtTime: () => undefined }, connect: () => undefined }),
    createBufferSource: () => {
      const source = { buffer: null as AudioBuffer | null, connect: () => undefined, loop: false, loopStart: 0, loopEnd: 0,
        start: () => { started.push((source.buffer as unknown as { url: string }).url); }, stop: () => undefined };
      return source;
    },
    decodeAudioData: async (data: ArrayBuffer) => buffers.get(new TextDecoder().decode(data))!,
  } as unknown as AudioContext;
  const engine = new GameAudioEngine(
    { master: 80, music: 50, effects: 75, muted: false },
    () => context,
    async (url) => {
      const key = String(url);
      fetched.push(key);
      // A silent buffer passes through trimAndNormalize unchanged, keeping its url tag.
      buffers.set(key, { url: key, length: 2, numberOfChannels: 1, sampleRate: 8000, duration: 1, getChannelData: () => new Float32Array(2) } as unknown as AudioBuffer);
      return new Response(key);
    },
  );
  return { engine, fetched, started };
}

describe("collect sound", () => {
  it("is the restored generated sparkle: clearly audible, bright, and not silent", () => {
    const { samples, rate } = readWav(COLLECT);
    // The generated sound keeps its sparkle up to 16 kHz; the old 8 kHz chime could not.
    expect(rate).toBeGreaterThanOrEqual(32000);
    const seconds = samples.length / rate;
    expect(seconds).toBeGreaterThan(2.5);
    expect(seconds).toBeLessThanOrEqual(3.1);
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    expect(peak).toBeGreaterThan(0.2);
    const window = Math.floor(rate * 0.3);
    let loudest = 0;
    for (let start = 0; start + window <= samples.length; start += Math.floor(window / 3)) {
      let sum = 0;
      for (let i = start; i < start + window; i += 1) sum += samples[i]! * samples[i]!;
      loudest = Math.max(loudest, sum / window);
    }
    expect(10 * Math.log10(loudest), "loudest 300 ms (dBFS)").toBeGreaterThan(-24);
  });

  it("records the generated sound's Mirelo provenance instead of calling it CC0", () => {
    const asset = LOST_COLORS_BUNDLED_MEDIA.audio.find((item) => item.url === COLLECT)!;
    expect(asset.provenance).toMatchObject({
      providerId: "livepeer-agent-mcp",
      servedCapability: "mirelo-sfx",
      servedModel: "Mirelo-AI/sfx1.6/text-to-audio",
      applicationJobId: "job_1474ebee-fa65-4d4b-b411-0f8babbabb87",
      providerJobId: "mjob_9b4d5aa5632c",
    });
    expect(asset.provenance.providerId).not.toMatch(/cc0/i);
  });

  it("is what a world plays on pickup even when it only carries its own generated music", () => {
    const music = { kind: "music", id: "m", url: "/api/generated-assets/files/m.mp3" } as AudioAssetReference;
    expect(resolveAudioUrls()["fragment-pickup"]).toBe(COLLECT);
    expect(resolveAudioUrls({ audio: [music], video: [] })["fragment-pickup"]).toBe(COLLECT);
  });

  it("plays on every fragment pickup event, in every look", async () => {
    for (const look of [null, ...SCENE_BIOME_IDS]) {
      const { engine, fetched, started } = fakeEngine();
      const bus = new GameplayEventBus();
      bus.on("*", (event) => handleEvent(engine, event));
      await engine.unlockAndStart();
      engine.setAmbienceOverride(lookAmbienceUrl(look));
      bus.emit({ type: "fragmentCollected", fragmentId: "f1", collected: 1, required: 3, restoration: 0.3, color: "#ff0" });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(fetched, `look ${look}`).toContain(COLLECT);
      expect(started, `look ${look}`).toContain(COLLECT);
      engine.stop();
    }
  });
});
