import { describe, expect, it } from "vitest";
import { BUNDLED_AUDIO_URLS } from "./assets.js";
import { AUDIO_REPORT_GLOBAL, GameAudioEngine, installAudioReport } from "./engine.js";

function engineWith(options: { resume?: () => Promise<void>; state?: string } = {}) {
  const buffers = new Map<string, AudioBuffer>();
  const started: string[] = [];
  const context = {
    state: options.state ?? "running",
    currentTime: 0,
    destination: {},
    resume: options.resume ?? (async () => undefined),
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
    () => context as unknown as AudioContext,
    async (url) => {
      const key = String(url);
      buffers.set(key, { url: key, length: 2, numberOfChannels: 1, sampleRate: 8000, duration: 1, getChannelData: () => new Float32Array(2) } as unknown as AudioBuffer);
      return new Response(key);
    },
    null,
  );
  return { engine, started, context };
}

describe("audio report for the console", () => {
  it("traces a pickup from the gameplay event to the sound starting, with the context state and bus gains", async () => {
    const { engine } = engineWith();
    await engine.unlockAndStart();
    engine.noteGameplayEvent("fragmentCollected");
    await engine.play("fragment-pickup");
    const report = engine.report();
    expect(report).toMatchObject({ unlocked: true, contextState: "running", settings: { master: 80, music: 50, effects: 75, muted: false } });
    expect(report.gains).toEqual({ master: 0.8, music: 0.5, effects: 0.75, duck: 1 });
    expect(report.urls["fragment-pickup"]).toBe(BUNDLED_AUDIO_URLS["fragment-pickup"]);
    const tail = report.events.slice(-3).map((entry) => `${entry.what}${entry.cue ? ` ${entry.cue}` : ""}`);
    expect(tail).toEqual(["event fragmentCollected", "loaded fragment-pickup", "started fragment-pickup"]);
    expect(report.events.at(-1)).toMatchObject({ context: "running" });
  });

  it("says why a pickup made no sound", async () => {
    const { engine } = engineWith();
    await engine.play("fragment-pickup");
    expect(engine.report().events.at(-1)).toMatchObject({ what: "skipped", cue: "fragment-pickup", detail: "audio not unlocked by Play" });
  });

  it("keeps only the last 20 entries", async () => {
    const { engine } = engineWith();
    await engine.unlockAndStart();
    for (let index = 0; index < 30; index += 1) engine.noteGameplayEvent(`event-${index}`);
    const events = engine.report().events;
    expect(events).toHaveLength(20);
    expect(events.at(-1)).toMatchObject({ what: "event", cue: "event-29" });
  });

  it("is installed on the page as a function the player can call from the console, and removed again", () => {
    const { engine } = engineWith();
    const page: Record<string, unknown> = {};
    const remove = installAudioReport(engine, page);
    expect(typeof page[AUDIO_REPORT_GLOBAL]).toBe("function");
    expect((page[AUDIO_REPORT_GLOBAL] as () => unknown)()).toMatchObject({ unlocked: false });
    remove();
    expect(page[AUDIO_REPORT_GLOBAL]).toBeUndefined();
  });
});

describe("resume is best effort", () => {
  it("never lets a resume that never settles hold up Play or a pickup", async () => {
    const { engine, started } = engineWith({ state: "suspended", resume: () => new Promise<void>(() => undefined) });
    await engine.unlockAndStart();
    expect(started.sort()).toEqual([BUNDLED_AUDIO_URLS.ambience, BUNDLED_AUDIO_URLS.music].sort());
    await engine.play("fragment-pickup");
    expect(started).toContain(BUNDLED_AUDIO_URLS["fragment-pickup"]);
    expect(engine.report().events.some((entry) => entry.what === "resume" && entry.detail === "timed out")).toBe(true);
  });

  it("records a refused resume instead of failing", async () => {
    const { engine, started } = engineWith({ state: "suspended", resume: async () => { throw new Error("NotAllowedError"); } });
    await engine.unlockAndStart();
    await engine.play("fragment-pickup");
    expect(started).toContain(BUNDLED_AUDIO_URLS["fragment-pickup"]);
    expect(engine.report().events.some((entry) => entry.what === "resume" && entry.detail === "refused")).toBe(true);
  });
});
