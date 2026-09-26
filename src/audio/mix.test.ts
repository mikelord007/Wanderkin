import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AudioAssetReference, LevelMedia } from "@shared/index.js";
import { DEFAULT_BED_GAIN, resolveLoopGains } from "./assets.js";
import { LOST_COLORS_BUNDLED_MEDIA } from "./bundledMedia.js";
import { DUCK_GAIN, duckGainAt, duckSchedule, loudSeconds } from "./mix.js";
import { GameAudioEngine } from "./engine.js";

const db = (gain: number) => 20 * Math.log10(gain);

function wavSamples(url: string) {
  const bytes = readFileSync(path.join(process.cwd(), "public", url.replace(/^\//, "")));
  const rate = bytes.readUInt32LE(24);
  const samples = new Float32Array(bytes.readUInt32LE(40) / 2);
  for (let i = 0; i < samples.length; i += 1) samples[i] = bytes.readInt16LE(44 + i * 2) / 32768;
  return { length: samples.length, numberOfChannels: 1, sampleRate: rate, getChannelData: () => samples };
}

describe("music level", () => {
  it("plays a loop with no authored level 6 dB down, under the one-shots", () => {
    expect(db(DEFAULT_BED_GAIN)).toBeCloseTo(-6, 0);
    expect(resolveLoopGains()).toEqual({ music: DEFAULT_BED_GAIN, ambience: DEFAULT_BED_GAIN });
  });

  it("honours the world's own soundtrack's authored gain", () => {
    const generated = { kind: "music", defaultGain: 0.7, url: "/api/generated-assets/files/m.mp3" } as AudioAssetReference;
    expect(resolveLoopGains({ audio: [generated], video: [] } as LevelMedia)).toEqual({ music: 0.7, ambience: DEFAULT_BED_GAIN });
    expect(resolveLoopGains(LOST_COLORS_BUNDLED_MEDIA)).toEqual({ music: 0.48, ambience: 0.28 });
  });

  it("never boosts a loop above its normalised level or trusts a broken gain", () => {
    const loud = { kind: "music", defaultGain: 3 } as AudioAssetReference;
    const broken = { kind: "ambience", defaultGain: Number.NaN } as AudioAssetReference;
    expect(resolveLoopGains({ audio: [loud, broken], video: [] } as LevelMedia)).toEqual({ music: 1, ambience: DEFAULT_BED_GAIN });
  });
});

describe("music duck under the collect sound", () => {
  it("dips the music 6 dB fast, holds, then comes back within about 250 ms", () => {
    const steps = duckSchedule(10, 12);
    expect(db(DUCK_GAIN)).toBeCloseTo(-6, 0);
    // Down to within 1 dB of the dip in 50 ms.
    expect(db(duckGainAt(steps, 10.05, 1))).toBeLessThan(db(DUCK_GAIN) + 1);
    // Held through the cue's loud part.
    expect(db(duckGainAt(steps, 11.99, 1))).toBeCloseTo(db(DUCK_GAIN), 1);
    // Back within 0.5 dB of full level 250 ms after the hold ends.
    expect(db(duckGainAt(steps, 12.25, 1))).toBeGreaterThan(-0.5);
  });

  it("holds through the restored collect sound's sparkle, not just its quiet start", () => {
    const seconds = loudSeconds(wavSamples("/audio/fragment-pickup.wav"));
    expect(seconds).toBeGreaterThan(1.6);
    expect(seconds).toBeLessThan(2.85);
  });

  it("is what the engine does: the collect sound ducks the music bed, other sounds don't, and the sliders keep their meaning", async () => {
    type Node = { name: string; gain: { value: number; calls: string[] }; to: Node[]; connect(to: Node): void };
    const nodes: Node[] = [];
    const tagged = new Map<string, { url: string }>();
    const context = {
      state: "running",
      currentTime: 5,
      destination: { name: "destination" },
      resume: async () => undefined,
      close: async () => undefined,
      createGain: () => {
        const calls: string[] = [];
        const node: Node = {
          name: `gain${nodes.length}`,
          gain: Object.assign({ value: 1, calls }, {
            cancelScheduledValues: (at: number) => { calls.push(`cancel@${at}`); },
            setValueAtTime: (value: number, at: number) => { calls.push(`set ${value}@${at}`); },
            setTargetAtTime: (value: number, at: number, tc: number) => { calls.push(`target ${value}@${at.toFixed(2)}/${tc}`); },
          }),
          to: [],
          connect(to: Node) { node.to.push(to); },
        };
        nodes.push(node);
        return node;
      },
      createBufferSource: () => {
        const source = { buffer: null as unknown, to: [] as Node[], loop: false, loopStart: 0, loopEnd: 0, connect(to: Node) { source.to.push(to); }, start: () => undefined, stop: () => undefined };
        sources.push(source);
        return source;
      },
      decodeAudioData: async (data: ArrayBuffer) => tagged.get(new TextDecoder().decode(data)),
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { length, numberOfChannels: channels, sampleRate, duration: length / sampleRate, getChannelData: (channel: number) => data[channel]! };
      },
    };
    const sources: { buffer: unknown; to: Node[] }[] = [];
    const collect = wavSamples("/audio/fragment-pickup.wav");
    const engine = new GameAudioEngine(
      { master: 80, music: 50, effects: 75, muted: false },
      () => context as unknown as AudioContext,
      async (url) => {
        const key = String(url);
        // A silent 2-sample buffer passes through trimAndNormalize unchanged; the collect cue is real.
        tagged.set(key, key.endsWith("fragment-pickup.wav")
          ? Object.assign(collect, { url: key, duration: collect.length / collect.sampleRate })
          : { url: key, length: 2, numberOfChannels: 1, sampleRate: 8000, duration: 1, getChannelData: () => new Float32Array(2) } as never);
        return new Response(key);
      },
      null,
    );
    const generated = { kind: "music", defaultGain: 0.7, url: "/api/generated-assets/files/m.mp3" } as AudioAssetReference;
    engine.configure({ audio: [generated], video: [] } as LevelMedia);
    await engine.unlockAndStart();
    const [master, musicBus, effectsBus, duck] = nodes as [Node, Node, Node, Node];
    // Sliders: master 80, music 50, effects 75 — unchanged by levels or the duck.
    expect([master.gain.value, musicBus.gain.value, effectsBus.gain.value]).toEqual([0.8, 0.5, 0.75]);
    expect(musicBus.to).toEqual([duck]);
    expect(duck.to).toEqual([master]);
    // The generated soundtrack plays at its authored 0.7, the bundled breeze at the bed level.
    const levelOf = (url: string) => sources.find((source) => (source.buffer as { url: string }).url === url)!.to[0]!;
    expect(levelOf("/api/generated-assets/files/m.mp3").gain.value).toBe(0.7);
    expect(levelOf("/audio/gentle-breeze.wav").gain.value).toBe(DEFAULT_BED_GAIN);
    expect(levelOf("/audio/gentle-breeze.wav").to).toEqual([musicBus]);

    await engine.play("checkpoint");
    expect(duck.gain.calls).toEqual([]);
    await engine.play("fragment-pickup");
    expect(duck.gain.calls.slice(0, 3)).toEqual(["cancel@5", "set 1@5", `target ${DUCK_GAIN}@5.00/0.012`]);
    // Released after the cue's loud part (measured on the engine's trimmed copy).
    const release = /^target 1@([\d.]+)\/0\.06$/.exec(duck.gain.calls[3] ?? "");
    expect(Number(release?.[1])).toBeCloseTo(5 + loudSeconds(collect), 1);
    expect(duck.gain.calls).toHaveLength(4);
    expect(musicBus.gain.value).toBe(0.5);
    engine.stop();
  });

  it("holds at least 300 ms even for a very short cue", () => {
    const click = new Float32Array(800);
    click[10] = 1;
    expect(loudSeconds({ length: click.length, numberOfChannels: 1, sampleRate: 8000, getChannelData: () => click })).toBeGreaterThanOrEqual(0.3);
  });
});
