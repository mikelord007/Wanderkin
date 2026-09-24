import { BRAND_SLUG } from "../brand.js";

export type GameplayRecorderState = "idle" | "recording" | "stopping" | "ready" | "error";

export interface GameplayHighlight {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
  createdAt: string;
}

interface RecorderEnvironment {
  createCanvas(): HTMLCanvasElement;
  createRecorder(stream: MediaStream, options: MediaRecorderOptions): MediaRecorder;
  isTypeSupported(mimeType: string): boolean;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
  now(): number;
}

const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;
const RECORDING_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  // Chromium only exposes this on platforms where its MediaRecorder build
  // can really encode MP4. WebM remains the portable default.
  "video/mp4",
];

function browserEnvironment(): RecorderEnvironment {
  return {
    createCanvas: () => document.createElement("canvas"),
    createRecorder: (stream, options) => new MediaRecorder(stream, options),
    isTypeSupported: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    now: () => performance.now(),
  };
}

export function supportedGameplayRecordingMimeType(
  environment: Pick<RecorderEnvironment, "isTypeSupported"> = browserEnvironment(),
): string | null {
  return RECORDING_MIME_TYPES.find((type) => environment.isTypeSupported(type)) ?? null;
}

export function supportsGameplayRecording(source?: HTMLCanvasElement): boolean {
  return typeof MediaRecorder !== "undefined"
    && typeof HTMLCanvasElement !== "undefined"
    && typeof HTMLCanvasElement.prototype.captureStream === "function"
    && (!source || typeof source.captureStream === "function")
    && supportedGameplayRecordingMimeType() !== null;
}

function displayTime(milliseconds: number): string {
  const safe = Math.max(0, milliseconds);
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const tenths = Math.floor((safe % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function coverRect(source: HTMLCanvasElement) {
  const sourceRatio = source.width / source.height;
  const targetRatio = OUTPUT_WIDTH / OUTPUT_HEIGHT;
  if (sourceRatio > targetRatio) {
    const width = source.height * targetRatio;
    return { sx: (source.width - width) / 2, sy: 0, sw: width, sh: source.height };
  }
  const height = source.width / targetRatio;
  return { sx: 0, sy: (source.height - height) / 2, sw: source.width, sh: height };
}

export class GameplayRecorder {
  state: GameplayRecorderState = "idle";
  error: Error | null = null;

  private readonly environment: RecorderEnvironment;
  private recorder: MediaRecorder | null = null;
  private output: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private frameHandle: number | null = null;
  private hasAudio = false;
  private mimeType = "";
  private stopPromise: Promise<GameplayHighlight> | null = null;
  private resolveStop: ((highlight: GameplayHighlight) => void) | null = null;
  private rejectStop: ((error: Error) => void) | null = null;

  constructor(
    private readonly source: HTMLCanvasElement,
    private readonly title: string,
    private readonly onStateChange?: (state: GameplayRecorderState) => void,
    environment: RecorderEnvironment = browserEnvironment(),
  ) {
    this.environment = environment;
  }

  start(audioStream?: MediaStream): void {
    if (this.state !== "idle") throw new Error(`Cannot start a recorder in the ${this.state} state.`);
    const mimeType = supportedGameplayRecordingMimeType(this.environment);
    if (!mimeType || typeof this.source.captureStream !== "function") {
      this.fail(new Error("Gameplay recording is not supported by this browser."));
      return;
    }
    const output = this.environment.createCanvas();
    output.width = OUTPUT_WIDTH;
    output.height = OUTPUT_HEIGHT;
    const context = output.getContext("2d");
    if (!context) {
      this.fail(new Error("This browser cannot composite gameplay recording frames."));
      return;
    }
    const stream = output.captureStream(30);
    const audioTracks = audioStream?.getAudioTracks() ?? [];
    for (const track of audioTracks) stream.addTrack(track);

    try {
      const recorder = this.environment.createRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
      this.output = output;
      this.context = context;
      this.recorder = recorder;
      this.mimeType = mimeType;
      this.hasAudio = audioTracks.length > 0;
      this.chunks = [];
      this.startedAt = this.environment.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        const cause = "error" in event && event.error instanceof Error
          ? event.error
          : new Error("The browser stopped the gameplay recording unexpectedly.");
        this.fail(cause);
      };
      recorder.onstop = () => this.finish();
      this.setState("recording");
      this.drawFrame(false);
      recorder.start(1000);
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      this.fail(error instanceof Error ? error : new Error("Gameplay recording could not start."));
    }
  }

  stop(): Promise<GameplayHighlight> {
    if (this.state === "ready" && this.stopPromise) return this.stopPromise;
    if (this.state !== "recording" || !this.recorder) {
      return Promise.reject(new Error(`Cannot stop a recorder in the ${this.state} state.`));
    }
    this.setState("stopping");
    if (this.frameHandle !== null) this.environment.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    this.drawFrame(true);
    this.stopPromise = new Promise<GameplayHighlight>((resolve, reject) => {
      this.resolveStop = resolve;
      this.rejectStop = reject;
    });
    this.recorder.requestData();
    this.recorder.stop();
    return this.stopPromise;
  }

  dispose(): void {
    if (this.frameHandle !== null) this.environment.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    if (this.recorder?.state === "recording") this.recorder.stop();
    for (const track of this.recorder?.stream.getTracks() ?? []) track.stop();
  }

  private drawFrame(final: boolean): void {
    const context = this.context;
    if (!context) return;
    const crop = coverRect(this.source);
    context.drawImage(this.source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    const topShade = context.createLinearGradient(0, 0, 0, 160);
    topShade.addColorStop(0, "rgba(5,9,18,.75)");
    topShade.addColorStop(1, "rgba(5,9,18,0)");
    context.fillStyle = topShade;
    context.fillRect(0, 0, OUTPUT_WIDTH, 170);
    const bottomShade = context.createLinearGradient(0, 530, 0, OUTPUT_HEIGHT);
    bottomShade.addColorStop(0, "rgba(5,9,18,0)");
    bottomShade.addColorStop(1, "rgba(5,9,18,.82)");
    context.fillStyle = bottomShade;
    context.fillRect(0, 520, OUTPUT_WIDTH, 200);

    context.fillStyle = "#ffffff";
    context.font = "800 30px system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText(this.title.slice(0, 58), 42, 58, 860);
    context.fillStyle = final ? "#7ee6a5" : "#ffdf70";
    context.font = "800 16px system-ui, sans-serif";
    context.fillText(final ? "ADVENTURE COMPLETE · ACTUAL GAMEPLAY" : "ACTUAL GAMEPLAY", 44, 88);
    context.fillStyle = "#ffffff";
    context.font = "800 30px ui-monospace, monospace";
    context.textAlign = "right";
    context.fillText(displayTime(this.environment.now() - this.startedAt), OUTPUT_WIDTH - 42, OUTPUT_HEIGHT - 42);

    if (this.state === "recording") {
      this.frameHandle = this.environment.requestFrame(() => this.drawFrame(false));
    }
  }

  private finish(): void {
    const durationSeconds = Math.max(0, (this.environment.now() - this.startedAt) / 1000);
    const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || this.mimeType });
    for (const track of this.recorder?.stream.getTracks() ?? []) track.stop();
    if (blob.size === 0) {
      this.fail(new Error("The browser produced an empty gameplay recording."));
      return;
    }
    const highlight: GameplayHighlight = {
      blob,
      mimeType: blob.type || this.mimeType,
      durationSeconds,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      hasAudio: this.hasAudio,
      createdAt: new Date().toISOString(),
    };
    this.setState("ready");
    this.resolveStop?.(highlight);
    this.resolveStop = null;
    this.rejectStop = null;
  }

  private fail(error: Error): void {
    this.error = error;
    this.setState("error");
    this.rejectStop?.(error);
    this.resolveStop = null;
    this.rejectStop = null;
  }

  private setState(state: GameplayRecorderState): void {
    this.state = state;
    this.onStateChange?.(state);
  }
}

export function downloadGameplayHighlight(highlight: GameplayHighlight, worldName: string): void {
  const extension = highlight.mimeType.includes("mp4") ? "mp4" : "webm";
  const stem = worldName.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  const url = URL.createObjectURL(highlight.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${stem || BRAND_SLUG}-gameplay-highlight.${extension}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
