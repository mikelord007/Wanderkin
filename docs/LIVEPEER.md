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
| `LIVEPEER_MCP_ENDPOINT` | `https://agent.livepeer.org/api/mcp/full` | Server-only; never sent to the browser bundle. |
| `LIVEPEER_API_KEY` | empty | Optional bearer token. Not exercised against a real key — the reference workspace's successful 2026-09-17 test used the **keyless demo path** with no `Authorization` header at all (see `mcpClient.ts`). |
| `PORT` | `8787` | Node API port. |
| `STORAGE_DIR` | `./storage` | Durable jobs/photos/assets JSON + file storage. Created on first write. |

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
serves stale/hardcoded capability data as if it were current.

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
  the original call did land. A background poller (`setInterval`, ~4s tick,
  per-job exponential backoff 5s→60s) also advances jobs without waiting for
  a client `GET`.

## Upload / download safety

- Photos: magic-byte sniffed (JPEG/PNG/WebP only — the declared MIME/
  extension is never trusted), 512B–20MB.
- Imported/generated GLBs: binary glTF header validated (magic `glTF`,
  version 2, declared length matches actual file size), up to 150MB.
- Provider result downloads (`server/persistence/fetchSafe.ts`): https-only,
  DNS-resolved and rejected if the address is loopback/link-local
  (including the `169.254.169.254` cloud metadata address)/RFC1918/CGNAT,
  redirects re-validated rather than followed blindly, and the response body
  is aborted mid-stream if it exceeds the byte cap rather than buffered
  unbounded.
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
  this worker. All adapter/job-manager/mcpClient tests (52 total —
  `npx vitest run`) use fixtures modeled on the reference workspace's actual
  completed responses (`outputs/room-corner-comparison/rodin-response.json`,
  `tripo-response.json`) and a fake/mocked transport
  (`server/livepeer/{adapter,mcpClient}.test.ts`, `server/jobs/manager.test.ts`)
  — never a live network call. The one bounded real-generation smoke test is
  reserved for Astra to coordinate through the fully integrated app.
- `LIVEPEER_API_KEY` / authenticated (non-keyless) access was not exercised.

## Known gaps / follow-ups

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
- No HTTP-level route tests (e.g. via `supertest`) — this worktree has no
  test HTTP client dependency installed, and adding one is a root-config
  decision outside this worker's scope. Route logic is covered indirectly
  through `JobManager`/`LivepeerAdapter` unit tests (which route handlers
  delegate to almost immediately) plus manual read-through of the
  request/response shapes against `src/ui/api.ts`.
