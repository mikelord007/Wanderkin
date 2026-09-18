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

## Job state machine (server-owned portion)

`queued → uploading → generating → downloading → ready | failed`

The server **never sets `preparing`** — per the build brief, browser-side
scene/geometry preparation is a separate later stage the Scene preparation
worker owns. `ready` here means only: the provider finished, we downloaded
and validated the GLB, and it's stored under our own durable
`/api/assets/files/:name` URL. Nothing about scene calibration, colliders, or
course generation happens server-side.

## Idempotency and durability

- `POST /api/jobs` requires an `Idempotency-Key` header. A repeat request
  with the same key returns the existing `GenerationJob` and never calls
  `submit` again — checked in `server/routes/jobs.ts` before any adapter
  call.
- The **same key** is also passed to Livepeer's own `run_capability`
  `idempotency_key`/`session_id` params. If our process crashes between
  submitting and persisting the response, a retry that lands via
  `POST /api/jobs/:id/retry` reuses that identical key, so even if the
  original request *did* reach the provider, Livepeer's 24h idempotency
  cache returns the original job instead of billing/running a second one.
- `retry` only calls `adapter.submit` again when the job has **no**
  `providerJobId` yet (it never reached the provider). Once a
  `providerJobId` exists, `retry` only reconciles (polls) — it can never
  start a second generation for a job already in flight.
- All durable state (`storage/jobs.json`, `photos.json`, `assets.json`) is
  written via temp-file-then-rename (`server/persistence/jsonStore.ts`), guarded
  by an in-process async mutex per file, so a mid-write crash can't corrupt
  the file and concurrent requests can't interleave a read-modify-write.
- On boot, `JobManager.resumeOnBoot()` loads persisted jobs and schedules an
  immediate poll for anything non-terminal with a `providerJobId` — a
  process restart reconciles in-flight jobs rather than losing track of
  them. A background poller (`setInterval`, ~4s tick, per-job exponential
  backoff 5s→60s) also advances jobs without waiting for a client `GET`.

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

## What was and wasn't verified live

- Confirmed live (free, read-only): `describe_capability` for both
  `rodin-i3d` and `tripo-mv3d` — both `available`/`active` as of
  2026-09-18. Keyless `spend_cap`: $100 remaining / $0 spent (per lead's
  prior check); no cap was changed and no spend was made by this worker.
- **Not run**: no real `run_capability` (generation) call was submitted by
  this worker. All adapter/job-manager tests use fixtures modeled on the
  reference workspace's actual completed responses
  (`outputs/room-corner-comparison/rodin-response.json`,
  `tripo-response.json`) and a fake MCP transport
  (`server/livepeer/adapter.test.ts`, `server/jobs/manager.test.ts`) — never
  a live network call. The one bounded real-generation smoke test is
  reserved for Astra to coordinate through the fully integrated app.
- `LIVEPEER_API_KEY` / authenticated (non-keyless) access was not exercised.

## Known gaps / follow-ups

- **`multer` dependency missing.** `POST /api/uploads` and
  `POST /api/assets/import` are implemented against `multer` for multipart
  parsing, but `multer`/`@types/multer` are not yet in the root
  `package.json` (root deps/lockfile are foundation-owned, not editable by
  this worker). Requested from Astra; until it lands, `npm run typecheck`
  and `npm run build` fail specifically on `server/routes/uploads.ts` and
  `server/routes/assets.ts` (multipart import + `req.file`/`req.files`
  typings) — every other server file typechecks cleanly and all
  `server/**/*.test.ts` pass (`npx vitest run server` — 35 tests). Once
  `multer` is added, no code changes here should be required.
- `/api/levels`, `/api/levels/:id` (manifest persistence) are owned by the
  Level tools worker and are not registered in `server/index.ts` yet — see
  the `TODO(Level tools worker)` comment there.
- A job's original photo selection (ids + view slots) is kept in a
  server-only `JobInternal.originalRequest` field alongside the durable job
  record, specifically so `retry` can resubmit with full fidelity after a
  process restart without needing the shared `GenerationJob` shape to carry
  it (that shape only stores `photoOrder: number[]`, per `shared/job.ts`).
