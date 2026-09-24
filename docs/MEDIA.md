# Completion media

ObjectQuest exposes two deliberately separate optional outputs after a run:

- **Animated postcard** — a generated five-second animation derived from a framed screenshot. It is always labelled generated animation and never gameplay.
- **Gameplay highlight** — frames recorded from the real game canvas by the browser. It is always labelled actual gameplay and has no provider cost.

Neither path blocks saving, replay, Race mode, publishing, or sharing the playable world. Their errors are isolated from the level and from each other.

## World screenshot

`src/capture/screenshot.ts` reads the last rendered game frame into a fixed 1280 × 720 2D canvas, crops it predictably, and adds a frame, title, selected style, atmosphere, and ObjectQuest mark. `GameView` creates its WebGL context with `preserveDrawingBuffer: true`, so the readback does not rely on an implementation-specific retained back buffer.

The browser sends only a bounded PNG to:

```text
POST /api/postcards/:levelId/screenshot
{ "imageBase64": "<base64 PNG>" }
```

The server validates the PNG signature and size, stores it through `GeneratedAssetStore`, and records local provenance as `browser-world-capture` with a $0 local-capture cost. This local screenshot is eligible only as a provider image input; it is not presented as generated media.

## Animated postcard lifecycle

The browser explicitly starts generation with:

```text
POST /api/postcards/:levelId
{ "screenshotAssetId": "<stored capture id>" }
```

`PostcardService` derives the prompt from the saved world name, style, and optional atmosphere. It submits the shared `video` request through Worker 2's `JobManager`; it never calls Livepeer directly. `GET /api/postcards/:levelId` resumes the same job, and `POST /api/postcards/:levelId/retry` asks the job manager to retry the same durable job.

The cache key is a SHA-256 fingerprint of the authored world: level identity and seed, calibration, playable assets, entities, spawn, checkpoints, and experience/style data. Media and workflow bookkeeping do not affect it. Repeated requests for an unchanged world return the same application job rather than starting another provider request.

When the job becomes ready, its `VideoAssetReference` is appended to `manifest.media.video` with:

- `kind: "animated-postcard"`
- `source: "generated-animation"`
- requested and served capability/model
- application and provider job IDs
- timings
- reported cost, or `null` when the provider does not report it

A pending or failed job does not modify playable assets. My Worlds polls the existing cache entry, shows independent progress/failure/retry state, and previews/downloads a ready postcard.

## Animated postcard availability

Fresh animated-postcard generation is temporarily unavailable. The current
`pixverse-i2v` wrapper does not expose the resolution and audio controls needed
to derive an enforceable maximum, and its quoted rate is a lower bound rather
than a cap. The server therefore returns the nonretryable
`cost_not_bounded` error before creating a job, reserving ledger spend,
uploading to the provider, or submitting generation. The client does not
capture or upload a new postcard screenshot while this guard is active.

Existing saved postcard videos remain playable and downloadable. A job that
already has a provider job ID may still be polled for its existing result; the
guard never starts a replacement generation.

## Actual gameplay highlight

`GameplayRecorder` creates a 1280 × 720 compositor canvas and draws the live WebGL canvas into it on animation frames. The compositor adds the world title, a running/final time, and an `ACTUAL GAMEPLAY` label before its stream reaches `MediaRecorder`. Completion stops and finalizes the active recorder before navigation to the result screen.

The normal export is WebM. Codec selection checks, in order:

1. WebM VP9/Opus
2. WebM VP8/Opus
3. generic WebM
4. MP4 only when the current browser advertises MediaRecorder MP4 support

Unsupported browsers get a visible notice and gameplay continues normally. A recording is held only for the current SPA run, exposed through an object URL for preview, and downloaded with a `.webm` or supported `.mp4` extension. No captured media is committed to the repository or uploaded to a provider.

`GameplayRecorder.start(audioStream)` accepts optional audio tracks. The current UI supplies no audio stream because Worker 6's in-progress audio engine has not been merged and does not yet expose a capture destination; current highlights are therefore explicitly labelled video-only. Integration only requires Worker 6 to expose a mixed `MediaStream` (or audio tracks) and pass it to the recorder. Recording does not request microphone or camera permission.

## UI boundaries

- `PlayScreen` owns the visible Start/Stop gameplay-capture control and captures the final screenshot before handing run media upward.
- `App` carries that ephemeral run media into completion and binds postcard/download callbacks.
- `FinishScreen` only gained optional media props/callbacks and renders the two independent cards.
- `StartScreen` adds a My Worlds postcard panel for cached progress, retry, preview, and download.

## Verification

Unit coverage includes postcard dedupe/cache behavior, failed-video isolation, persisted provenance/cost, prompt derivation, and the recorder state machine. Browser acceptance covers:

- B16: real Chrome `canvas.captureStream` + `MediaRecorder`, actual movement/completion, non-empty playable WebM preview and download, and zero provider video calls.
- B17: mocked successful image-to-video job, screenshot submission, reload/My Worlds recovery by the same job ID, generated-animation labeling, non-empty preview/download, and persisted provenance/cost. This is fixture evidence, not a live-provider claim.

Evidence screenshots are written (and intentionally ignored by git) to:

```text
test-results/worker8/B16-gameplay-highlight.png
test-results/worker8/B17-animated-postcard.png
```
