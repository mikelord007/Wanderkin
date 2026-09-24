# Production readiness review

Date: 2026-09-24. This review describes the integrated code as it exists; it
does not treat mocked tests, catalog discovery, or documentation as production
validation. Recommended actions are intentionally not product-code fixes in
this delivery workstream.

## Concern review

### Asset persistence and expiration

**Today.** The API stores jobs, spend records, preview cache, photos, GLBs,
generated media, levels, and publications below one configured filesystem root
([`server/index.ts`](../server/index.ts),
[`server/persistence/assetStore.ts`](../server/persistence/assetStore.ts),
[`server/persistence/generatedAssetStore.ts`](../server/persistence/generatedAssetStore.ts)).
Indexes use atomic file replacement and in-process queues
([`server/persistence/jsonStore.ts`](../server/persistence/jsonStore.ts)). Stored
media responses use a one-year immutable browser cache. There is no expiry,
quota, garbage collector, reference count, or restore migration.

**Gap.** Ephemeral hosting loses every generated world; unbounded retained
uploads/media can exhaust a durable volume. JSON indexes and their files can
also drift if backup or deletion is partial. Multiple API replicas sharing the
directory can race because locking is process-local.

**Action.** Mount and back up the complete `STORAGE_DIR`, run one API replica,
monitor bytes/inodes, and define retention plus referenced-asset garbage
collection before broad public use. Test whole-volume restore on the release
schema.

### Shared-link routing

**Today.** The client recognizes `/share/:shareId` at startup and fetches an
immutable publication ([`src/ui/shareRouting.ts`](../src/ui/shareRouting.ts),
[`src/App.tsx`](../src/App.tsx)). Publishing deep-copies the playable manifest;
later private edits do not mutate the share version
([`server/publications.ts`](../server/publications.ts)).

**Gap.** The Node API does not serve the static client or an SPA fallback.
Direct share loads return 404 unless the edge falls back non-API routes to
`index.html`. Share IDs have no revocation/delete path, and there is no link
expiry or access policy.

**Action.** Use the same-origin proxy rules in [`deploy/Caddyfile`](../deploy/Caddyfile),
test a direct share URL and refresh in production, then add explicit
unpublish/revocation and optional expiry before users need link lifecycle
control.

### Server credentials

**Today.** Livepeer endpoint, API key, storage path, and budget settings are
read only in the server environment ([`server/env.ts`](../server/env.ts)). The
browser uses relative ObjectQuest API URLs and provider error messages are
sanitized before being returned ([`server/jobs/store.ts`](../server/jobs/store.ts),
[`server/util/sanitize.ts`](../server/util/sanitize.ts)). Empty
`LIVEPEER_API_KEY` selects keyless operation.

**Gap.** There is no startup assertion for a production secret mode, no secret
rotation procedure, and no authentication/authorization on ObjectQuest API
routes. Anyone who can reach a public instance can attempt billable requests.

**Action.** Inject secrets through the deployment platform, restrict operator
access and logs, choose keyless versus API-key mode explicitly, test rotation,
and add user/session authorization or a demo access gate before public paid
generation is enabled.

### Upload constraints

**Today.** Photo uploads allow at most 10 files and 20 MiB per file, with a
512-byte minimum and JPEG/PNG/WebP magic-byte validation
([`server/routes/uploads.ts`](../server/routes/uploads.ts),
[`server/persistence/validate.ts`](../server/persistence/validate.ts)). GLBs are
capped at 150 MiB and structurally checked. Generated image/audio/video limits
are 25/75/200 MiB, JSON bodies are 10 MiB, and portable bundle bodies are 220
MiB ([`server/persistence/generatedAssetStore.ts`](../server/persistence/generatedAssetStore.ts),
[`server/levels.ts`](../server/levels.ts)). Remote provider downloads have a
total timeout, redirect cap, URL safety checks, and byte cap
([`server/persistence/fetchSafe.ts`](../server/persistence/fetchSafe.ts)).

The creation client additionally decodes images with orientation handling and
rejects dimensions outside 128–12,000 pixels per side
([`src/ui/imageValidation.ts`](../src/ui/imageValidation.ts)).

**Gap.** The decoded-dimension check is client-side only and can be bypassed by
a direct API caller; the server has no decoded pixel cap. Multer buffers each
upload in memory, so 10 maximum-sized files can create substantial per-request
memory pressure. There is no aggregate/user quota or reverse-proxy body policy.

**Action.** Decode with a bounded image library before persistence, enforce
pixel/dimension and aggregate-request limits, stream large inputs to bounded
temporary storage, and configure an edge limit consistent with the bundle and
media routes.

### CORS and media loading

**Today.** API and asset URLs are relative and the server emits no CORS
headers ([`src/ui/api.ts`](../src/ui/api.ts),
[`server/index.ts`](../server/index.ts)). Stored photos, GLBs, images, audio,
and video are served from `/api/*` with validated filenames and explicit media
types. This is correct for the supported same-origin deployment.

**Gap.** A separate client origin will fail without a deliberate API base URL
and CORS policy. Cross-origin media can taint canvases or break capture/export.
No production proxy has yet been validated for byte ranges, content types,
cache behavior, or maximum bodies.

**Action.** Keep one HTTPS origin, proxy `/api/*` without path stripping, and
test GLB textures, audio/video seek, screenshot/capture, downloads, and CSP.
If origins must split, implement an allowlisted CORS design and credential
model rather than using a wildcard.

### Job polling across refreshes

**Today.** The client persists an idempotency key before submission and then a
durable job ID in `localStorage`; reload resumes the same submission or poll
instead of creating a new job ([`src/ui/jobStorage.ts`](../src/ui/jobStorage.ts)).
Polling backs off from 1.2 to 15 seconds and stops on terminal states
([`src/ui/jobPoller.ts`](../src/ui/jobPoller.ts)). Server job records retain the
original request and provider upload URLs; startup resumes incomplete work
([`server/jobs/store.ts`](../server/jobs/store.ts),
[`server/jobs/manager.ts`](../server/jobs/manager.ts)).

**Gap.** Browser recovery depends on writable local storage on the same origin
and device. Private browsing, cleared data, an origin change, or a different
device loses the client pointer even though the job remains on the server.
There is no authenticated account-level job discovery, and ambiguous provider
state can remain operationally hard to reconcile.

**Action.** Preserve the origin, volume, and idempotency semantics for the
demo. Before multi-device use, add authenticated My Worlds/job discovery and
an operator view for stuck jobs; test refresh and API restart during each job
stage.

### Rate and spend controls

**Today.** Estimated cost is reserved before dispatch, with configurable
positive per-request and per-world ceilings; final reported cost is reconciled
when available ([`server/jobs/spendLedger.ts`](../server/jobs/spendLedger.ts),
[`server/env.ts`](../server/env.ts)). Retry count is capped from zero to five,
idempotency prevents duplicate logical submissions, and unknown cost remains
marked unknown.

**Gap.** There is no IP/user rate limit, authentication, concurrency limit,
global/day cap, storage quota, or transactional lock across replicas. A caller
can mint world IDs to evade a per-world ceiling. Estimated pricing can be
stale, and keyless/provider account allowance is not the same as the local
ledger.

**Action.** Put authentication and edge request throttling ahead of billable
routes; add per-principal concurrency and daily/global budgets, alerts, and a
kill switch. Keep one API replica until the ledger uses transactional shared
storage, and refresh price/health immediately before an authorized demo run.

### Public/private asset boundaries

**Today.** Private level manifests retain creation workflow and source photos.
Published snapshots remove workflow data and omit source photos unless the
publisher explicitly opts in ([`shared/publishing.ts`](../shared/publishing.ts),
[`server/publications.ts`](../server/publications.ts)). File routes validate
filenames, preventing directory traversal.

**Gap.** The API has no user identity or access checks. Level, job, asset, and
photo metadata/files are reachable by identifier, and photo/file routes use
public immutable caching. Omitting photo references from a publication is data
minimization, not an authorization boundary; possession or leakage of a URL
still grants access.

**Action.** Treat the current deployment as a controlled demo. Before accepting
sensitive photos, add ownership/authentication, private object storage or
authorized download routes, explicit publication asset copying, revocation,
and a cache policy appropriate to private content.

### Mobile browser behavior

**Today.** The creation flow now provides drag-and-drop, a constrained image
picker, and a dedicated camera action using the environment-facing camera when
available, with a clear upload fallback on permission failure
([`src/ui/screens/CaptureScreen.tsx`](../src/ui/screens/CaptureScreen.tsx)).
Client decoding honors image orientation. Gameplay explicitly states that
keyboard and mouse are supported and touch controls are unavailable
([`src/game/hud/Hud.tsx`](../src/game/hud/Hud.tsx)). The runtime relies on
pointer lock for mouse camera control
([`src/game/input/inputController.ts`](../src/game/input/inputController.ts)).

**Gap.** There is no touch gameplay and no claim-backed mobile browser
completion. Mobile memory limits may be stressed by large uploads and generated
meshes; iOS camera lifecycle, media playback, background/resume, and WebGL
recovery have not been production verified.

**Action.** Keep the demo's playable path on a desktop browser and retain the
honest touch notice. Run the mobile-layout/browser matrix, cap/resize images
before upload, test orientation and audio gesture rules, and implement plus
verify touch controls before advertising mobile play.

## Release assessment

The architecture is deployable for a controlled, single-replica hackathon
demo once a dedicated origin and durable volume are authorized. It is not yet
appropriate for anonymous public paid generation or sensitive uploads. The
highest-priority gaps are API authentication/rate limiting, true private asset
authorization, decoded-image/aggregate upload limits, storage lifecycle, and
production browser validation of the final origin.
