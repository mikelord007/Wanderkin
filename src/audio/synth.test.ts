import { describe, expect, it } from "vitest";
import { GRAPPLE_BITE_SECONDS, playGrappleBite } from "./synth.js";
import { handleEvent } from "./useGameAudio.js";

function param() {
  const calls: string[] = [];
  return {
    value: 0,
    calls,
    setValueAtTime: (value: number) => { calls.push(`set:${value}`); },
    linearRampToValueAtTime: (value: number) => { calls.push(`lin:${value}`); },
    exponentialRampToValueAtTime: (value: number) => { calls.push(`exp:${value}`); },
  };
}

describe("synthesised effects", () => {
  it("bites when the grappling hook attaches, and plays no file cue for it", () => {
    const played: string[] = [];
    let bites = 0;
    const engine = { play: async (cue: string) => { played.push(cue); }, playGrappleBite: () => { bites += 1; } };
    handleEvent(engine, { type: "grappleAttached", anchorKind: "ledge", distance: 3 });
    expect(bites).toBe(1);
    expect(played).toEqual([]);
    // An engine without the synth (older callers) is simply silent.
    expect(() => handleEvent({ play: engine.play }, { type: "grappleAttached", anchorKind: "wall", distance: 1 })).not.toThrow();
  });

  it("plays the grapple bite into the given bus and stops every voice", () => {
    const destination = { name: "effects" };
    const connectedToBus: string[] = [];
    const stops: number[] = [];
    const node = (kind: string) => ({
      kind,
      gain: param(),
      frequency: param(),
      Q: param(),
      type: "",
      buffer: null as unknown,
      connect: (target: unknown) => { if (target === destination) connectedToBus.push(kind); },
      start: () => undefined,
      stop: (when: number) => { stops.push(when); },
    });
    const samples = new Float32Array(441);
    const context = {
      currentTime: 2,
      sampleRate: 44100,
      createBuffer: () => ({ getChannelData: () => samples }),
      createBufferSource: () => node("source"),
      createBiquadFilter: () => node("filter"),
      createGain: () => node("gain"),
      createOscillator: () => node("oscillator"),
    } as unknown as BaseAudioContext;

    playGrappleBite(context, destination as unknown as AudioNode);

    expect(connectedToBus).toEqual(["gain", "gain"]);
    expect(stops).toHaveLength(2);
    expect(Math.max(...stops)).toBeCloseTo(2 + GRAPPLE_BITE_SECONDS);
    // The noise is real signal, bounded, and decays to silence.
    expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
    expect(samples.every((value) => Math.abs(value) <= 1)).toBe(true);
    expect(Math.abs(samples[samples.length - 1]!)).toBeLessThan(0.01);
  });
});
