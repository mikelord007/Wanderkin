# Server security and storage policy

ObjectQuest uses a deliberately small protection layer suited to one Node API
instance. Rate buckets, provider concurrency accounting, and the decoded-image
memory budget are in process. Durable ownership and spend data live under
`STORAGE_DIR`. Do not run multiple API replicas against one storage directory;
use shared transactional storage and distributed limits before scaling out.

## Owner tokens and private resources

The first successful write issues a random 256-bit owner token in both:

- `Set-Cookie: objectquest_owner=...; HttpOnly; SameSite=Lax; Path=/`
- `X-ObjectQuest-Owner: ...` for non-browser API clients

Production cookies add `Secure` by default. Browsers on the supported
same-origin deployment send the cookie automatically, so no client code change
is required. API clients can send `X-ObjectQuest-Owner` on later requests. Only
a SHA-256 token digest is stored in `ownership.json`; the server cannot recover
a lost raw token.

Photos, screenshots, imported/generated assets, jobs, preview/workflow records,
world spend, and private levels require a matching token. Unauthorized and
missing records both return 404 where practical. Private bytes use
`Cache-Control: private, no-store`. Bundled files below `public/` remain public.

Uploaded photos and screenshots are content-addressed by SHA-256 within that
owner boundary. Re-uploading identical bytes with the same owner token returns
the existing photo reference (HTTP 200) and does not create another file;
identical bytes uploaded by a different owner create a separate private record.

Publishing creates an immutable public snapshot. Workflow data is removed and
source photos are omitted unless `includesSourcePhotos: true` is explicitly
requested. Assets required to play a published version become public; source
photos become public only for that explicit opt-in. A later private edit does
not mutate an existing share.

### Legacy-open migration mode

`OBJECTQUEST_LEGACY_OPEN=false` is the production setting and the value in
`.env.example`. When set to `true`, unowned records from storage created before
owner-token support remain readable. New records are intentionally left
unowned while this migration mode is active. The code default is `false` when
`NODE_ENV=production` and `true` otherwise to preserve local fixtures and old
development stores. Do not enable this on an internet-facing deployment.

In legacy-open mode, content deduplication is limited to ownerless photos:
identical ownerless bytes reuse the existing reference, while owned records are
never folded into that open scope.

Changing an existing open store to strict mode makes its unowned private
records inaccessible; back up the complete storage directory and plan token
ownership migration before switching.

## Rate and concurrency limits

Billable submission/retry routes (`jobs`, previews, quests, audio, and
postcards) and upload routes (`uploads` and `screenshots`) use fixed-window
limits keyed by client IP plus the optional owner token. A breach returns HTTP
429 with `{ "message": "..." }` and `Retry-After`.

Provider submissions also have a global in-flight cap. Capacity checks and job
creation are serialized in process so simultaneous requests cannot both take
the final slot. The cap also returns 429 with `Retry-After`; polling an existing
provider job does not create a new slot.

`TRUST_PROXY_HOPS` must remain `0` unless a trusted reverse proxy overwrites
forwarding headers. A client-controlled `X-Forwarded-For` must never select its
own rate-limit identity.

## Spend enforcement and diagnostics

The spend ledger reserves cost before any provider upload/submission and
enforces per-request, per-world, global lifetime, and rolling 24-hour ceilings.
Provider-reported cost replaces the estimate when available. Unknown estimates
reserve the capability list price; a capability without a known list price
conservatively reserves the request ceiling. Unknown cost is never treated as
zero.

`GET /api/admin/spend` reports lifetime and rolling totals. It does not exist
(404) unless `DIAGNOSTICS_TOKEN` is non-empty. When enabled, send either
`Authorization: Bearer <token>` or `X-Admin-Token: <token>`; responses are
`no-store`. Keep this token separate from provider and owner tokens.

## Upload protections

Photo and screenshot uploads share all controls:

- JPEG, PNG, or WebP magic bytes; 512 bytes through 20 MiB per file.
- At most 10 photos per photo request and one screenshot per screenshot request.
- Header-inspected width, height, and decoded pixel count before any decode.
- A process-wide reservation of `width * height * 4` bytes while the request is
  processed, bounding concurrent worst-case RGBA memory.
- Per-client upload rate limiting and owner assignment.

Header parsing supports baseline/progressive JPEG, PNG, and VP8/VP8L/VP8X WebP.
An image whose dimensions cannot be safely determined is rejected.

## Environment defaults

| Variable | Default | Purpose |
| --- | ---: | --- |
| `BILLABLE_RATE_LIMIT` | `10` | Billable requests per client/window |
| `UPLOAD_RATE_LIMIT` | `30` | Upload requests per client/window |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Fixed rate window |
| `TRUST_PROXY_HOPS` | `0` | Explicit trusted proxy hop count |
| `PROVIDER_MAX_IN_FLIGHT` | `4` | Global active provider jobs |
| `PROVIDER_CONCURRENCY_RETRY_SECONDS` | `15` | Capacity `Retry-After` |
| `LIVEPEER_MAX_REQUEST_USD` | `2` | One request ceiling |
| `LIVEPEER_MAX_WORLD_USD` | `8` | One world ceiling |
| `LIVEPEER_MAX_GLOBAL_USD` | `100` | Lifetime ledger ceiling |
| `LIVEPEER_MAX_DAILY_USD` | `20` | Rolling 24-hour ceiling |
| `DIAGNOSTICS_TOKEN` | empty | Enables spend diagnostics when set |
| `OBJECTQUEST_LEGACY_OPEN` | production: `false`; otherwise `true` | Unowned-record migration mode |
| `OBJECTQUEST_SECURE_COOKIE` | production: `true`; otherwise `false` | Add `Secure` to owner cookie |
| `UPLOAD_MAX_IMAGE_WIDTH` | `12000` | Maximum decoded width |
| `UPLOAD_MAX_IMAGE_HEIGHT` | `12000` | Maximum decoded height |
| `UPLOAD_MAX_IMAGE_PIXELS` | `40000000` | Maximum pixels per image |
| `UPLOAD_DECODE_BUDGET_BYTES` | `268435456` | Aggregate in-process RGBA budget |

Invalid environment values fall back to these safe bounds. Keep
`LIVEPEER_MAX_AUTOMATIC_RETRIES` at its default `3` or lower for public demos.

## Retention and opt-in garbage collection

Retention policy:

- Published versions, levels, source photos, playable GLBs, and referenced
  generated media are retained until an operator deliberately removes the
  owning world/publication under a future lifecycle workflow.
- Failed jobs should be retained for 30 days for diagnosis, then removed.
- Unreferenced generated images/audio/video may be removed after a dry-run
  review. A reference from levels, publications, previews, or retained jobs
  keeps the asset.
- `spend-ledger.json` is retained for the lifetime of the deployment because
  the global cap depends on historical spend.
- `ownership.json` and all JSON indexes are part of the backup/restore unit.

The API performs no automatic deletion. Run GC only in a maintenance window
with the API stopped; its stores cache JSON in memory and could otherwise
overwrite an external cleanup.

Dry run (default):

```powershell
npx tsx scripts/storage-gc.ts --storage-dir .\storage --failed-job-days 30
```

After reviewing the JSON report and taking a backup:

```powershell
npx tsx scripts/storage-gc.ts --storage-dir .\storage --failed-job-days 30 --apply
```

The script refuses filesystem-root targets, validates generated filenames,
updates indexes atomically, ignores already-missing files, and never deletes
photos, playable GLBs, levels, publications, ownership data, or spend history.

## Operational limits

These controls are appropriate for the documented single-replica deployment,
not a substitute for an edge body limit, durable shared rate limiter,
transactional database, account recovery, secret rotation, audit log, malware
scanning, or storage quota. Keep the API and client on one HTTPS origin, mount
and back up the complete `STORAGE_DIR`, and monitor disk bytes/inodes.
