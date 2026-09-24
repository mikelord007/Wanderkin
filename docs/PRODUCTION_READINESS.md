# Production readiness review

Snapshot: **2026-09-24**, integrated revision `e269fa9`. This is a code and
evidence review, not hosted-production proof. Mocked tests, bundled media,
catalog availability, real provider execution, human quality review, and
gameplay usability are kept distinct.

## Asset persistence, retention, and topology

**Implemented.** Jobs, spend, preview cache, ownership, photos, GLBs, generated
media, postcard cache, levels, and publications live below `STORAGE_DIR` using
atomic JSON replacement and process-local write queues
([`server/index.ts`](../server/index.ts),
[`server/persistence/jsonStore.ts`](../server/persistence/jsonStore.ts)).
[`scripts/storage-gc.ts`](../scripts/storage-gc.ts) provides safe-root checks,
a non-mutating default, reference-aware generated-asset cleanup, and explicit
failed-job retention when run with apply enabled; its dry-run/apply behavior is
covered by [`server/security/storageGc.test.ts`](../server/security/storageGc.test.ts).

**Remaining gap.** GC is opt-in, not scheduled. There is no automatic expiry,
per-owner storage quota, capacity alert, or tested backup/restore procedure.
Locks, rate buckets, concurrency accounting, and JSON stores are single-process;
multiple API replicas sharing a volume are unsupported.

**Production action.** Run one API instance, mount and back up the entire
volume, monitor bytes/inodes, schedule reviewed dry-run/apply GC, and test a
whole-volume restore before public launch.

## Shared links and public routing

**Implemented.** `/share/:shareId` loads an immutable publication. Later edits
create a new publication rather than mutating the old version
([`src/ui/shareRouting.ts`](../src/ui/shareRouting.ts),
[`server/publications.ts`](../server/publications.ts)). Publishing omits source
photos by default and explicitly makes only the referenced playable assets
public ([`server/levels.ts`](../server/levels.ts)). Isolated-browser publication
and version-bound race behavior have automated browser evidence.

**Remaining gap.** The API does not serve `dist/`; the edge must implement the
SPA fallback. Publications have no revocation, expiry, or deletion policy. No
direct share refresh has been verified on a deployed origin.

**Production action.** Apply [`deploy/Caddyfile`](../deploy/Caddyfile), route
`/api/*` before fallback, and verify a real direct `/share/<id>` load. Define
link lifecycle and asset-retention behavior.

## Credentials and owner boundary

**Implemented.** Provider credentials and budgets are server-only
([`server/env.ts`](../server/env.ts)). In production, opaque owner tokens are
issued through an HttpOnly, SameSite cookie/header; only token hashes are
stored. Private jobs, photos, assets, generated assets, and levels check that
boundary, while publication deliberately exposes its copied playable assets
([`server/security/owner.ts`](../server/security/owner.ts),
[`tests/e2e/http/security.test.ts`](../tests/e2e/http/security.test.ts)).
Diagnostics are absent unless a separate token is configured.

**Remaining gap.** An owner token is not an account system: it provides no
identity verification, cross-device recovery, logout/revocation UI, role
model, or administrative ownership repair. Legacy-open mode is intentionally a
migration mode and must remain false in production.

**Production action.** Keep secure cookies and legacy-open production defaults,
inject secrets through the platform manager, document rotation, and add a real
identity/recovery design before accepting broadly sensitive user content.

## Upload and remote-media constraints

**Implemented.** Uploads enforce file count/byte limits, JPEG/PNG/WebP magic,
server-side header-derived width/height/pixel limits, and a process-wide
worst-case RGBA decode budget
([`server/routes/uploads.ts`](../server/routes/uploads.ts),
[`server/security/imageDimensions.ts`](../server/security/imageDimensions.ts)).
Screenshot uploads use the same dimension/decode policy. Upload and billable
routes have separate fixed-window limits. GLB and generated image/audio/video
bytes are bounded and signature-validated; remote downloads enforce HTTPS,
public-address resolution, redirect/timeout, and streaming byte caps.

**Remaining gap.** Multer still buffers accepted files in memory. Limits are
per request/process, not per authenticated account or durable storage quota.
Header inspection bounds dimensions but is not a full hostile-codec decoder or
malware scan. Edge body limits have not been exercised on a deployed origin.

**Production action.** Align proxy limits, stream large bodies to bounded
temporary storage, monitor memory, and add per-account/storage quotas and a
production upload security policy.

## CORS and media loading

**Implemented.** Browser URLs are relative and generated photos, GLBs, audio,
and video are served under `/api/*`; no permissive CORS policy is enabled. This
matches the supported same-origin topology. Bundled audio now produced three
WAV requests with zero runtime errors in the final integrated B14 browser run.

**Remaining gap.** A split public API origin is unsupported without an explicit
client base URL, credential policy, and allowlisted CORS. Production proxy
behavior for range requests, media seeking/download, content types, canvas
capture, and cache headers remains unverified.

**Production action.** Keep one HTTPS origin and validate GLB textures,
audio/video seek, screenshot/gameplay capture, downloads, and CSP at the final
hostname.

## Durable jobs and refresh recovery

**Implemented.** The client stores pre-submit idempotency and durable job IDs,
My Worlds exposes pending/attention states, polling backs off, and server
startup resumes incomplete jobs without blind resubmission
([`src/ui/creationStorage.ts`](../src/ui/creationStorage.ts),
[`src/ui/jobPoller.ts`](../src/ui/jobPoller.ts),
[`server/jobs/store.ts`](../server/jobs/store.ts)). The live runner can reconcile
existing provider IDs without a new paid call.

**Remaining gap.** Recovery is bound to the same browser owner token and local
storage; cleared storage or a different device has no account-level discovery.
The quest row historically exposed an adapter-normalization failure after the
provider completed successfully. The scoped repair is now integrated and one
force-poll recovered the same job at zero new spend. No saved live-validation
level exists yet.

**Production action.** Preserve the verified no-resubmission recovery semantics,
then validate process restart, refresh, My Worlds recovery, save, and share on
the completed batch. Add account-level discovery before multi-device claims.

## Rate, concurrency, and spend controls

**Implemented.** Billable and upload routes use per-IP plus hashed-owner
fixed-window limits with `429`/`Retry-After`. Provider work has a global
in-flight ceiling. The durable ledger rejects estimated spend before submission
against per-request, per-world, global, and rolling-24-hour limits; automatic
retries are bounded and diagnostics are token-protected
([`server/security/rateLimit.ts`](../server/security/rateLimit.ts),
[`server/jobs/spendLedger.ts`](../server/jobs/spendLedger.ts),
[`server/jobs/manager.ts`](../server/jobs/manager.ts)). HTTP security coverage
exercises these controls.

**Remaining gap.** Rate and concurrency state is in memory and therefore
single-instance. Owner tokens are not verified accounts, estimates may be stale,
and provider-reported paid costs may be null. There is no external billing
reconciliation or operational alert/kill-switch service.

**Production action.** Use conservative budgets, one instance, trusted proxy
configuration, and provider price/health refresh before spending. Add durable
principal-based quotas and billing alerts for broader use.

## Quest, audio, and optional media

**Implemented.** Quest output is schema-validated with a bounded template
fallback. Music, ambience, seven event SFX cues, and narration are independent,
idempotent jobs; optional failures never block the playable mesh/course
([`server/quest`](../server/quest), [`server/audio`](../server/audio)). The
client has gesture-gated audio, four buses, mute persistence, subtitles,
one-shot narration, and bundled fallbacks ([`src/audio`](../src/audio)). Actual
gameplay highlight recording and generated-postcard screenshot/cache/retry/
preview/download flows are implemented ([`src/capture`](../src/capture),
[`server/postcards`](../server/postcards)). Unit, HTTP, and browser contracts
cover these paths without claiming provider quality.

**Remaining gap.** The current live batch has not executed music, ambience,
SFX, TTS, or image-to-video at this timestamp. The recovered row-5 quest is
schema-valid, but has not been reviewed in a playable world. Gameplay recording
support varies by browser, and generated postcard media has no real
quality/playback evidence yet.

**Production action.** Reuse rows 1–5, apply the contract/price/dry-run guards
to the authorized rows 6–16, and treat them as unverified until terminal
artifacts are recorded. Then hand the saved world to the user for listening,
visual, gameplay, persistence, and labeling acceptance.

## Mobile browsers

**Implemented.** Capture offers camera and upload fallbacks, orientation-aware
client decoding, responsive layouts, reduced-motion support, and an explicit
coarse-pointer notice that gameplay requires keyboard and mouse. Worker 11
verified welcome, capture, My Worlds, and friend landing at desktop and 375×812.

**Remaining gap.** Touch gameplay is not implemented. Mobile course completion,
iOS camera lifecycle/audio gesture behavior, background/resume, high-memory GLB
handling, and WebGL recovery remain unverified.

**Production action.** Keep the honest desktop-controls message and do not
advertise mobile play until touch controls and a target-device matrix pass.

## Release assessment

The code is suitable for a controlled, single-instance local/hackathon demo
with bundled fallbacks. It is not production-deployed, the current real
photo-to-play batch is incomplete, and user hands-on acceptance remains open.
The highest remaining gates are terminal evidence for live rows 6–16,
generated-world save/play/share, user quality/gameplay review, tested
backup/restore, and an authorized dedicated deployment origin.
