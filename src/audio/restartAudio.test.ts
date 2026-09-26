import { describe, expect, it } from "vitest";
import { BUNDLED_AUDIO_URLS } from "./assets.js";
import { GameAudioEngine } from "./engine.js";
import { handleEvent } from "./useGameAudio.js";
import { GameplayEventBus } from "../game/events.js";
import { GameplaySession } from "../game/modes/session.js";
import { LOST_COLORS_SAMPLE } from "../game/bundledSamples.js";

/** An engine on a fake AudioContext that records the url of every sound it
 * starts, and whose state the test can change the way a browser does. */
function recordingEngine(options: { failFirstFetchOf?: string; gestures?: EventTarget } = {}) {
  const started: string[] = [];
  const buffers = new Map<string, AudioBuffer>();
  let contexts = 0;
  let resumes = 0;
  let failed = false;
  const context = {
    state: "running" as AudioContextState | "interrupted",
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: async () => { resumes += 1; context.state = "running"; },
    close: async () => undefined,
    createGain: () => ({ gain: { value: 1, cancelScheduledValues: () => undefined, setValueAtTime: () => undefined, setTargetAtTime: () => undefined }, connect: () => undefined }),
    createBufferSource: () => {
      const source = { buffer: null as AudioBuffer | null, connect: () => undefined, loop: false, loopStart: 0, loopEnd: 0,
        start: () => { started.push((source.buffer as unknown as { url: string }).url); }, stop: () => undefined };
      return source;
    },
    decodeAudioData: async (data: ArrayBuffer) => buffers.get(new TextDecoder().decode(data))!,
  };
  const engine = new GameAudioEngine(
    { master: 80, music: 50, effects: 75, muted: false },
    () => { contexts += 1; return context as unknown as AudioContext; },
    async (url) => {
      const key = String(url);
      if (key === options.failFirstFetchOf && !failed) { failed = true; throw new TypeError("network"); }
      // A silent buffer passes through trimAndNormalize unchanged, keeping its url tag.
      buffers.set(key, { url: key, length: 2, numberOfChannels: 1, sampleRate: 8000, duration: 1, getChannelData: () => new Float32Array(2) } as unknown as AudioBuffer);
      return new Response(key);
    },
    options.gestures ?? null,
  );
  return { engine, started, context, stats: { get contexts() { return contexts; }, get resumes() { return resumes; } } };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const COLLECT = BUNDLED_AUDIO_URLS["fragment-pickup"];
const count = (started: string[], url: string) => started.filter((item) => item === url).length;

function world() {
  const bus = new GameplayEventBus();
  const { engine, started } = recordingEngine();
  bus.on("*", (event) => handleEvent(engine, event));
  const session = new GameplaySession({ experience: LOST_COLORS_SAMPLE.experience!, worldId: "lost-colors", eventBus: bus });
  const fragments = LOST_COLORS_SAMPLE.experience!.collectibles.map((item) => item.id);
  return { bus, engine, started, session, fragments };
}

describe("game audio across a restart", () => {
  it("plays the collect sound again after the pause card's Restart", async () => {
    const { engine, started, session, fragments } = world();
    await engine.unlockAndStart();
    session.start();
    expect(session.collectFragment(fragments[0]!)).toBe(true);
    await settle();
    expect(count(started, COLLECT)).toBe(1);

    session.setPaused(true);
    session.restart();
    expect(session.collectFragment(fragments[0]!)).toBe(true);
    await settle();
    expect(count(started, COLLECT)).toBe(2);
  });

  it("plays the collect sound again after finishing and choosing Play again", async () => {
    const { engine, started, session, fragments } = world();
    await engine.unlockAndStart();
    session.start();
    for (const id of fragments) session.collectFragment(id);
    const portal = LOST_COLORS_SAMPLE.experience!.finishPortal!;
    session.enterPortal(portal.id);
    await settle();
    expect(session.snapshot.completed).toBe(true);
    const before = count(started, COLLECT);

    session.restart();
    session.collectFragment(fragments[0]!);
    await settle();
    expect(count(started, COLLECT)).toBe(before + 1);
  });
});

describe("game audio when the browser suspends it", () => {
  for (const state of ["suspended", "interrupted"] as const) {
    it(`resumes a ${state} context before the next collect sound, and the music with it`, async () => {
      const { engine, started, context, stats } = recordingEngine();
      await engine.unlockAndStart();
      context.state = state; // Tab or app switch, Safari interruption, device change…
      await engine.play("fragment-pickup");
      expect(stats.resumes).toBeGreaterThan(0);
      expect(context.state).toBe("running");
      expect(started).toContain(COLLECT);
    });
  }

  it("resumes on the player's next click or keypress, e.g. Restart or Resume on the pause card", async () => {
    const gestures = new EventTarget();
    const { engine, context, stats } = recordingEngine({ gestures });
    await engine.unlockAndStart();
    const before = stats.resumes;
    context.state = "suspended";
    gestures.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(stats.resumes).toBe(before + 1);
    context.state = "suspended";
    gestures.dispatchEvent(new Event("keydown"));
    await settle();
    expect(stats.resumes).toBe(before + 2);
    // A running context is left alone.
    gestures.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(stats.resumes).toBe(before + 2);
  });

  it("stops listening for gestures and never builds a new context once stopped", async () => {
    const gestures = new EventTarget();
    const { engine, stats } = recordingEngine({ gestures });
    await engine.unlockAndStart();
    const pending = engine.play("fragment-pickup");
    engine.stop();
    await pending;
    await engine.play("fragment-pickup");
    gestures.dispatchEvent(new Event("pointerdown"));
    await settle();
    expect(stats.contexts).toBe(1);
    expect(engine.diagnostics().unlocked).toBe(false);
  });

  it("retries a collect sound whose first download failed instead of staying silent", async () => {
    const { engine, started } = recordingEngine({ failFirstFetchOf: COLLECT });
    await engine.unlockAndStart();
    await engine.play("fragment-pickup");
    expect(count(started, COLLECT)).toBe(0);
    await engine.play("fragment-pickup");
    expect(count(started, COLLECT)).toBe(1);
  });
});
