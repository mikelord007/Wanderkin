# Livepeer integration (server-side)

Owner: Livepeer integration worker. Implements the provider adapter, durable
job lifecycle, photo/asset storage, and the `/api/capabilities`, `/api/uploads`,
`/api/jobs*`, `/api/assets*`, `/api/photos/files/*` routes described in
`docs/CONTRACTS.md`.

## Setup

1. Copy `.env.example` to `.env` (no secrets required for the keyless demo
   path — `LIVEPEER_API_KEY` may stay empty).
2. `npm install` (root).
3. `npm run dev` — starts the Vite client and this API together.

Environment variables (`server/env.ts`):

| Var | Default | Notes |
| --- | --- | --- |
| `LIVEPEER_MCP_ENDPOINT` | `https://agent.livepeer.org/api/mcp/full` | Server-only; never sent to the browser bundle. `server/env.ts` falls back to this exact known endpoint in code (not just in `.env.example`), so a checkout that never copied `.env` still works. |
| `LIVEPEER_API_KEY` | empty | Optional bearer token. Not exercised against a real key — the reference workspace's successful 2026-09-17 test used the **keyless demo path** with no `Authorization` header at all (see `mcpClient.ts`). |
| `PORT` | `8787` | Node API port. |
| `STORAGE_DIR` | `./storage` | Durable jobs/photos/assets JSON + file storage. Created on first write. |
| `LIVEPEER_MAX_REQUEST_USD` | `2` | Hard server-side estimate ceiling for one generation request; callers may only tighten it. |
| `LIVEPEER_MAX_WORLD_USD` | `8` | Hard cumulative known-spend ceiling for one supplied `worldId`. |
| `LIVEPEER_MAX_AUTOMATIC_RETRIES` | `3` | Retry bound, constrained to 0–5. |

## V2 common generation API

The normalized request and result unions are in `shared/generation.ts`; job
provenance is exactly `shared/provenance.ts`. The server does not expose raw
provider responses, signed URLs, or credentials.

```ts
jobManager.submitGenerationOrReconcile(
  request: GenerationRequest,
  options?: { worldId?: string; requestLimitOverrideUsd?: number },
): Promise<SubmitOutcome>
```

HTTP:

- `POST /api/jobs/generate` with
  `{request: GenerationRequest, worldId?: string, maxCostUsd?: number}` and an
  `Idempotency-Key` header equal to `request.idempotencyKey`.
- `GET /api/jobs/:id` and `POST /api/jobs/:id/retry` work for both legacy and
  v2 jobs.
- `GET /api/jobs/spend/:worldId` returns known spend plus an explicit count
  of unknown-cost ledger entries.
- `POST /api/jobs/previews` submits or reuses an image-edit style preview.
- `GET /api/jobs/preview-cache/:sha256` reads its cache entry.
- `POST /api/jobs/preview-cache/:sha256/approve` with `{jobId}` marks a ready
  preview approved. A later request with identical capability, source image,
  instruction, and MIME type returns the approved job without submission.
- `GET /api/generated-assets/:id` returns generated image/audio/video
  metadata and provenance; immutable bytes are under
  `/api/generated-assets/files/:sha256.ext`.

`bg-remove` is represented by the shared `image-edit` request kind with
capability `bg-remove`, purpose `object-cutout`, and an explicit removal
instruction. `pixverse-i2v` uses the shared `video` kind. The adapter supports
the shared kinds image-to-3d, image-edit, text, music, sfx, tts, and video;
the legacy `POST /api/jobs` Rodin/Tripo request remains unchanged.

The image-to-3D request accepts either original uploads, reviewed generated
images, or both:

```ts
{
  kind: "image-to-3d";
  photos?: readonly ProviderInputPhoto[];
  sourceImageAssetIds?: readonly string[];
  styleReferenceAssetId?: string;
  scenePrompt?: string;
  // plus the common schemaVersion/capability/idempotencyKey/purpose fields
}
```

At least one `photos` or `sourceImageAssetIds` entry is required, with five
combined inputs maximum. Original uploads are submitted first in their normal
capability order; generated inputs follow in `sourceImageAssetIds` order. A
generated input must be a size-bounded image produced by `bg-remove`,
`kontext-edit`, or `gpt-image-edit`. `styleReferenceAssetId` identifies the
approved visual direction for refresh/provenance consistency and is never
uploaded or sent in the provider payload. The route also rejects a style
reference that is repeated in `sourceImageAssetIds`, verifies its persisted
preview-cache approval, and prevents any approved preview from being used as a
3D provider input even if a caller places it directly in
`sourceImageAssetIds`.

The complete normalized request is stored on `GenerationJob`; generated input
ids and the style-reference id are also copied into `GenerationProvenance`.
The durable per-job upload URL cache remains keyed by the idempotency key, so a
retry or boot recovery rebuilds the same provider request without re-hosting
the bytes or substituting the style preview.

The spend ledger (`storage/spend-ledger.json`) reserves the catalog estimate
before submission and replaces it with provider-reported USD when supplied.
An unavailable estimate is persisted with status `unknown`; it is never
coerced to zero. A request whose known estimate would cross either limit is
rejected with HTTP 402 and `code: "budget_exceeded"` before upload or provider
submission.

Generated media is downloaded through the existing SSRF/redirect/size guard,
magic-byte checked, content-addressed, and stored independently. A failed
optional TTS/SFX/video job cannot mutate or invalidate an already-ready mesh.

## Wire protocol

`server/livepeer/mcpClient.ts` is a minimal stateless JSON-RPC client:
`POST {endpoint}` with `{jsonrpc:"2.0", method:"tools/call", params:{name, arguments}}`
and `Accept: application/json, text/event-stream`. No `initialize` handshake
is required — confirmed against the reference workspace's real, successful
run (`…/work/room-corner-rodin/run_test.py`), not guessed from documentation.

Tools used: `describe_capability` (discovery), `upload` (re-hosts a local
photo's bytes as a public HTTPS URL the provider can fetch), `run_capability`
(submits generation, always called with `async: true`), `get_create_media`
(status polling). Schemas were re-verified live via `describe_capability`
during this work (both `rodin-i3d` and `tripo-mv3d` confirmed
`availability: "available"`, `status: "active"` on 2026-09-18) rather than
assumed from the cached `work/livepeer-full-endpoint-tools.json` alone.
`GET /api/capabilities` triggers this same live `describe_capability` check
(5-minute in-process cache) on every request past the cache TTL — it never
serves stale/hardcoded capability data as if it were current. A capability
that can't be live-confirmed (network failure, not found, or the provider
itself reports it degraded) is **dropped from the result**, never returned
alongside a note claiming it's a fallback — the static descriptor list
(`server/livepeer/capabilities.ts`) is only ever the template for *what* to
check, never a value served in place of a real check. If nothing can be
confirmed at all, the route returns **503** with a plain
`{message: "..."}` body rather than silently serving stale data as current;
the bundled sample level and GLB import stay usable regardless (they don't
call this route).

### Successful-job model provenance

The read-only 2026-09-18 success response for provider job
`mjob_cfb2286bf2b5` reported `status: "done"`, `capability: "rodin-i3d"`,
and `fallback_fired: null`, but omitted any per-job `served_model_id` or
other model-id field. The adapter therefore does not claim that the job
response directly attested a model. It uses a direct `served_model_id` when
one is present; otherwise it calls live `describe_capability` for the
capability reported by that job and records the returned `model_id`. If the
job reports a fallback, that fallback capability is used for both
`capabilityUsed` and descriptor lookup. If live model evidence is missing,
the adapter leaves it missing—there is no static-catalog guess.

The client honors `Accept: application/json, text/event-stream` two ways:
a normal `application/json` body, or `text/event-stream` framed `data:`
lines (parsed and JSON-decoded, last parseable event wins). The abort/
timeout signal stays armed through full body decode, not just the initial
response headers — a stalled body is a timeout too, not a silent hang. A
tool's plain-text `content` fallback (used when a tool has no
`structuredContent`) is JSON-parsed when possible, falling back to the raw
string only if it isn't valid JSON.

## Job state machine (server-owned portion)

`queued → uploading → generating → downloading → ready | failed`

The server **never sets `preparing`** — per the build brief, browser-side
scene/geometry preparation is a separate later stage the Scene preparation
worker owns. `ready` here means only: the provider finished, we downloaded
and validated the GLB, and it's stored under our own durable
`/api/assets/files/:name` URL — `uiMessage` says "Model ready for
preparation," not "ready to play," since client-side scene/physics prep
still has to happen. Nothing about scene calibration, colliders, or course
generation happens server-side.

## Idempotency and durability

- `POST /api/jobs` requires an `Idempotency-Key` header.
  `JobManager.submitOrReconcile` is the **sole, atomic** entry point: it
  holds a per-idempotency-key in-process lock across the
  "does a job for this key already exist" check and the create, so two
  concurrent POSTs with the same key can never both submit (previously the
  route did a non-atomic find-then-create — fixed after review). A repeat
  request with the same key and the **same** capability/photos/scenePrompt
  returns the existing `GenerationJob` (`status: "reconciled"`, HTTP 200)
  without calling `submit` again. A repeat request with the same key but a
  **different** body returns HTTP 409 (`status: "conflict"`) rather than
  guessing which one was meant.
- The **same key** is also passed to Livepeer's own `run_capability`
  `idempotency_key`/`session_id` params. If our process crashes between
  submitting and persisting the response, a retry that lands via
  `POST /api/jobs/:id/retry` — or a boot-time recovery, see below — reuses
  that identical key, so even if the original request *did* reach the
  provider, Livepeer's 24h idempotency cache returns the original job
  instead of billing/running a second one.
- `retry` calls `adapter.submit` again only when the job has **no**
  `providerJobId` yet (it never reached the provider), up to `maxRetries`,
  and never when the last error was marked non-retryable. When a
  `providerJobId` **does** exist, `retry` always reconciles (polls) instead
  — including when our own record says `failed` (e.g. a download error, or
  a stale write): the terminal state is reset and the provider is checked
  again rather than trusting it, since a local failure doesn't prove the
  upstream job died. It still never starts a second generation for a job
  already in flight.
- All durable state (`storage/jobs.json`, `photos.json`, `assets.json`) is
  written via temp-file-then-rename (`server/persistence/jsonStore.ts`),
  guarded by an in-process async mutex per file, so a mid-write crash can't
  corrupt the file and concurrent requests can't interleave a
  read-modify-write. `JobManager` additionally holds a per-job-id lock
  around every state transition (poll/finalize/retry), so a GET-triggered
  poll and the background ticker (or two concurrent GETs) can't race,
  double-finalize, or lose each other's write — whichever acquires the lock
  second sees the already-updated record and short-circuits instead of
  redoing the work.
- On boot, `JobManager.resumeOnBoot()` loads persisted jobs and handles two
  cases: a job with a `providerJobId` gets an immediate poll scheduled
  (existing, in-flight generation — never resubmitted). A job with **no**
  `providerJobId` still in a non-terminal state (`queued`/`uploading` — the
  process crashed between accepting the request and hearing back from
  `submit`, so whether it reached the provider is ambiguous) is re-driven
  through `submitToProvider` reusing the exact same persisted idempotency
  key, relying on Livepeer's own idempotency cache to make that safe even if
  the original call did land — **but only within a confirmed retention
  window** (`CONFIRMED_IDEMPOTENCY_RETENTION_MS`, 23h — a safety margin
  under Livepeer's documented 24h `idempotency_key` cache). Past that
  window, the same idempotency key is no longer guaranteed to dedupe a
  request that actually landed, so auto-resubmitting risks starting a real
  second generation; instead the job is marked `failed`,
  `lastError.retryable: false`, `lastError.code:
  "idempotency_retention_expired"`, with an explicit "provider outcome
  unknown; cannot safely resubmit... manual reconciliation required"
  message — an honest "we don't know" rather than a guess. `retry()`'s own
  no-`providerJobId` resubmit path applies the identical bound. A background
  poller (`setInterval`, ~4s tick, per-job exponential backoff 5s→60s) also
  advances jobs without waiting for a client `GET`.
- Retries/resubmits for the **same job** send the provider a **byte-identical
  request**, not just the same `idempotency_key` string: `LivepeerAdapter`
  caches the photos' re-hosted `image_urls` durably (in the job's internal
  record, via `JobStoreUploadUrlCache`) after the first upload, and reuses
  them on any later attempt instead of re-uploading (the `upload` tool mints
  a fresh timestamped URL every call). This guards against the provider's
  idempotency matching fingerprinting the request body rather than trusting
  the key alone. `deterministicSeed(idempotencyKey)` (unchanged from the
  first version) already gave `seed`/`model_seed`/`texture_seed` the same
  stability.

## Upload / download safety

- Photos: magic-byte sniffed (JPEG/PNG/WebP only — the declared MIME/
  extension is never trusted), 512B–20MB.
- Imported/generated GLBs: binary glTF header validated (magic `glTF`,
  version 2, declared length matches actual file size), up to 150MB.
- Provider result downloads (`server/persistence/fetchSafe.ts`): https-only,
  DNS-resolved and rejected if the address is loopback/link-local
  (including the `169.254.169.254` cloud metadata address)/RFC1918/CGNAT,
  each redirect hop re-validated (never followed blindly) and capped at 5
  hops so a redirect loop is refused instead of hanging forever, one
  `AbortController`/timeout spans the *entire* call including every hop
  (not reset per redirect, so a chain can't keep extending its own
  deadline), and the response body is cancelled and the read aborted
  mid-stream if it exceeds the byte cap rather than buffered unbounded.
- Files are served back out at content-addressed URLs
  (`/api/assets/files/{sha256}.glb`, `/api/photos/files/{uuid}.{ext}`) with
  a strict filename pattern check, so a request can never escape the storage
  directory.

## Diagnostics stay private; client JSON is sanitized

`server/util/sanitize.ts`'s `sanitizeMessage` redacts `https?://` URLs
(provider result/upload URLs can carry signed-URL tokens in their query
string — see the obfuscated blob URLs in
`outputs/room-corner-comparison/rodin-response.json`) and caps length.
It's applied wherever an upstream/provider-derived string could reach a
`GenerationJob.lastError.message` — both at write time (`toJobError` in
`server/jobs/manager.ts`, and the direct `status.error?.message` branch in
`pollAndAdvance`) and again, as defense in depth, at the read boundary
(`toPublicJob` in `server/jobs/store.ts`, which every public-returning
method routes through). The raw error is still available server-side via
`JobInternal.lastProviderStatusRaw` for debugging/logs — it's just never
serialized into a client response. Route-level errors (400/404/409/500/502)
are all `{message: string}` — matching `src/ui/api.ts`'s `request()` helper,
which reads `body.message` — and a 500/502 never includes the raw
upstream/filesystem error text; it's logged server-side
(`logServerError`) and the client gets a generic, safe message instead.

## Capability/provider limitations

- **Rodin (`rodin-i3d`)**: 1–5 photos, caller-chosen order, optional scene
  prompt. `fallback_chain` observed live: `tripo-i3d`, `triposplat` — if it
  fires, `GenerationJob.fallbackFired`/`AssetProvenance.fallbackFired` record
  it; the client must not assume the requested model ran.
- **Tripo (`tripo-mv3d`)**: 2–4 photos, each assigned a distinct
  `front`/`left`/`back`/`right` view slot (not all four required — the real
  2026-09-17 test used only front+left). No scene-guidance prompt input;
  `scenePrompt` is silently ignored for this capability by the adapter (not
  sent to Tripo) — see `ProviderCapabilityDescriptor.supportsScenePrompt`.
- Neither capability reports numeric progress or supports cancellation
  through the routes this adapter exposes (`supportsProgressPercent: false`,
  `supportsCancellation: false` on both descriptors) — the MCP surface does
  expose a `cancel_job` tool, but no route/contract here calls it, so don't
  assume cancellation works end-to-end.
- `resultSizeBytes` on `ProviderStatusResult` is not populated — the
  provider's `get_create_media` response doesn't include a byte count before
  download; the real size is only known once we've downloaded and stored the
  asset (`AssetReference.sizeBytes`).

## GET /api/assets/:id: additive `photos` field

The stored/returned shape is `AssetReference & {photos?: PhotoReference[]}`
(`StoredAssetRecord` in `server/persistence/assetStore.ts`) — additive to
the shared contract, not a breaking change to it, so it's kept out of
`shared/*`. For a **generated** asset, `photos` is the ordered list of the
source `PhotoReference`s that were submitted to the provider for that job
(resolved from `JobInternal.originalRequest` via `PhotoStore` when the job
finalizes), so the preparation screen can recover the original photo set
after a page reload without the client needing to have cached it. Absent
(and never written) for a hand-imported asset via `POST /api/assets/import`,
which has no provenance either.

## What was and wasn't verified live

- Confirmed live (free, read-only): `describe_capability` for both
  `rodin-i3d` and `tripo-mv3d` — both `available`/`active` as of
  2026-09-18. Keyless `spend_cap`: $100 remaining / $0 spent (per lead's
  prior check); no cap was changed and no spend was made by this worker.
- **Not run**: no real `run_capability` (generation) call was submitted by
  this worker. All adapter/job-manager/mcpClient/fetchSafe tests (62 total —
  `npx vitest run`) use fixtures modeled on the reference workspace's actual
  completed responses (`outputs/room-corner-comparison/rodin-response.json`,
  `tripo-response.json`) and a fake/mocked transport
  (`server/livepeer/{adapter,mcpClient}.test.ts`, `server/jobs/manager.test.ts`)
  — never a live network call. The one bounded real-generation smoke test is
  reserved for Astra to coordinate through the fully integrated app.
- `LIVEPEER_API_KEY` / authenticated (non-keyless) access was not exercised.

## Known gaps / follow-ups

### 2026-09-24 image-edit output-format diagnosis

The first ObjectQuest v2 live `kontext-edit` preview requested PNG but the
provider completed successfully with a JPEG result. The durable provider
status for application job `job_ef2fde65-65e2-4d16-b8df-e75d53c93d85`
(`mjob_d3d1797a1657`) reports `state: "ready"`, no fallback, and a result URL
whose path ends in `.jpg`. Re-fetching that stored URL through
`downloadBounded` returned `Content-Type: image/jpeg`, 129,740 bytes, SHA-256
`adcd4f6a9c5ab0e6064d1e3656f906f5f5b9c4a22da704854b7c2c8fa0263c5e`, and
the first 16 bytes `ff d8 ff e0 00 10 4a 46 49 46 00 01 01 00 00 01` (a JFIF
JPEG header). The raw ready status reported `kontext-edit`, no fallback,
`fal-ai/flux-pro/kontext`, and no declared MIME metadata. The earlier
`style-spike-cartoon-reference.jpg` artifact has the same JFIF prefix, so this
is repeatable provider behaviour rather than an error body or magic-byte
misclassification.

The application failure was local: `GeneratedAssetStore.storeImage` correctly
sniffed the bytes as JPEG, then rejected them because the detected MIME did not
equal the request's preferred `outputMimeType`. Generated image finalization
now accepts JPEG, PNG, or WebP by magic bytes and persists the detected MIME,
dimensions, and extension. The requested output format remains an application
preference, but is neither sent as an unsupported Kontext field nor treated as
a post-condition.
Preview cache, generated 3D inputs, postcard screenshots, and browser image
URLs all consume the detected asset metadata rather than assuming `.png`.

- Worker 1's shared contracts intentionally have no separate
  `background-removal` kind; the exact server mapping is the `image-edit`
  profile documented above.
- `GenerationProvenance` has no game-asset-consumer field. The consuming slot
  is retained in `GenerationRequest.purpose` and the world budget key is kept
  in the spend ledger; no server-local provenance fork is emitted.
- `ImageTo3dGenerationRequest` does not expose Meshy rigging/animation option
  fields even though the live capability supports them. The gateway therefore
  submits only the base single-image Meshy contract and does not expose those
  paid add-ons until the shared request union is extended.
- TTS provider results do not currently expose a reliable duration in the
  normalized status, while `AudioAssetReference.durationSeconds` is required;
  persisted narration uses `0` to mean unknown duration. It is not presented
  as measured duration.

- `/api/levels`, `/api/levels/:id` (manifest persistence) are owned by the
  Level tools worker and are not registered in `server/index.ts` yet — see
  the `TODO(Level tools worker)` comment there.
- A job's original photo selection (ids + view slots) is kept in a
  server-only `JobInternal.originalRequest` field alongside the durable job
  record, specifically so `retry` can resubmit with full fidelity after a
  process restart without needing the shared `GenerationJob` shape to carry
  it (that shape only stores `photoOrder: number[]`, per `shared/job.ts`).
- `multer` (`^2.4.0`) + `@types/multer` were added to root
  `package.json`/`package-lock.json` in a separate commit, with Astra's
  explicit temporary sole-ownership grant for that one dependency addition
  (foundation worker idle, runtime at max concurrent workers). Full server
  tree typechecks clean now.
- Route coverage uses real Express listeners and native `fetch`; HTTP e2e
  coverage spawns the actual `server/index.ts` against a local fake MCP
  server, so no additional HTTP-test dependency or live generation is used.
