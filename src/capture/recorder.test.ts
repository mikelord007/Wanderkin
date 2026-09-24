import { describe, expect, it, vi } from "vitest";
import { GameplayRecorder, supportedGameplayRecordingMimeType } from "./recorder.js";

class FakeMediaRecorder {
  state: RecordingState = "inactive";
  stream: MediaStream;
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(stream: MediaStream, options: MediaRecorderOptions) {
    this.stream = stream;
    this.mimeType = options.mimeType ?? "video/webm";
  }

  start() { this.state = "recording"; }
  requestData() {
    this.ondataavailable?.({ data: new Blob(["real-frames"], { type: this.mimeType }) } as BlobEvent);
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

function harness() {
  let now = 1_000;
  const track = { stop: vi.fn() };
  const stream = {
    addTrack: vi.fn(),
    getTracks: vi.fn(() => [track]),
  } as unknown as MediaStream;
  const gradient = { addColorStop: vi.fn() };
  const context = {
    drawImage: vi.fn(), createLinearGradient: vi.fn(() => gradient), fillRect: vi.fn(), fillText: vi.fn(),
    fillStyle: "", font: "", textAlign: "",
  } as unknown as CanvasRenderingContext2D;
  const output = { width: 0, height: 0, getContext: vi.fn(() => context), captureStream: vi.fn(() => stream) } as unknown as HTMLCanvasElement;
  const source = { width: 1600, height: 900, captureStream: vi.fn() } as unknown as HTMLCanvasElement;
  const states: string[] = [];
  const recorder = new GameplayRecorder(source, "Fixture World", (state) => states.push(state), {
    createCanvas: () => output,
    createRecorder: (nextStream, options) => new FakeMediaRecorder(nextStream, options) as unknown as MediaRecorder,
    isTypeSupported: (type) => type === "video/webm",
    requestFrame: vi.fn(() => 7),
    cancelFrame: vi.fn(),
    now: () => now,
  });
  return { recorder, states, context, stream, advance: (milliseconds: number) => { now += milliseconds; } };
}

describe("GameplayRecorder", () => {
  it("moves through idle, recording, stopping, and ready with a non-empty WebM", async () => {
    const subject = harness();
    subject.recorder.start();
    expect(subject.recorder.state).toBe("recording");
    subject.advance(3_450);
    const highlight = await subject.recorder.stop();

    expect(subject.states).toEqual(["recording", "stopping", "ready"]);
    expect(highlight).toMatchObject({ mimeType: "video/webm", durationSeconds: 3.45, width: 1280, height: 720, hasAudio: false });
    expect(highlight.blob.size).toBeGreaterThan(0);
    expect(subject.context.fillText).toHaveBeenCalledWith("ADVENTURE COMPLETE · ACTUAL GAMEPLAY", 44, 88);
  });

  it("adds available audio tracks without requiring them", async () => {
    const subject = harness();
    const audioTrack = {} as MediaStreamTrack;
    subject.recorder.start({ getAudioTracks: () => [audioTrack] } as MediaStream);
    const highlight = await subject.recorder.stop();
    expect(subject.stream.addTrack).toHaveBeenCalledWith(audioTrack);
    expect(highlight.hasAudio).toBe(true);
  });

  it("rejects invalid state transitions", async () => {
    const subject = harness();
    await expect(subject.recorder.stop()).rejects.toThrow(/idle state/);
    subject.recorder.start();
    expect(() => subject.recorder.start()).toThrow(/recording state/);
  });

  it("reports unsupported encoders", () => {
    expect(supportedGameplayRecordingMimeType({ isTypeSupported: () => false })).toBeNull();
  });
});
