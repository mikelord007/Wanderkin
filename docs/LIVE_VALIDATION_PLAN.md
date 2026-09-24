# ObjectQuest v2 live-validation plan

Date refreshed: **2026-09-24**  
Budget owner: ObjectQuest v2 orchestrator  
Status: **planned and dry-run tested; no paid call made by this worker**

This is the exact batch to present for spend authorisation. It uses one bundled
representative source, `public/samples/photo-4.jpg`, and only ObjectQuest's
localhost API. The batch maximum is **$1.4259** with application retries set to
zero. Authorise **$1.50** to leave $0.0741 of guard headroom; the runner will
still pass each request its own catalog estimate and will abort before its
running reservation crosses `--max-usd`.

## Refreshed catalog, health, SLA, and routing

Read-only `describe_capability`, forced-refresh `get_pricing`,
`cap_test_report(7d)`, and `cap_route` calls were made on 2026-09-24. All nine
entries were available/active. Prices came back as static-registry/static-
fallback values with `price_drift: false`; they are the current displayed
rates, not provider-metered evidence from our own execution. Health is seven-day
server history, not an ObjectQuest success.

| Capability | Price basis | Historical health | SLA used | Fallback policy for this run |
| --- | ---: | --- | --- | --- |
| `bg-remove` | $0.00105/image | 5/5 (100%); `NEEDS_METADATA` | observed p50 1.288s / p95 2.046s | Advertised `ideogram-bg-remove`; any fallback fails the named-capability acceptance. |
| `kontext-edit` | $0.042/image | 257/257 (100%); `READY` | observed p50 9.930s / p95 18.200s | Advertised `flux-fill -> gemini-image` is `REVIEW` due input mismatch. App contract has no automatic fallback; `gpt-image-edit` is a separate explicit call. |
| `gpt-image-edit` | $0.22995/image | 108/111 (97.3%); `NEEDS_METADATA` | observed p50 88.943s / p95 114.966s; provider abort 310s | None. This is the one extra execution needed to substantiate the alternate claim. |
| `rodin-i3d` | $0.42/call | 3/4 (75%; one parameter rejection); `NEEDS_METADATA` | observed p50 170.211s / p95 179.492s; conservative catalog p95 300s; provider abort 700s | `tripo-i3d -> triposplat` is input-compatible, but a fallback does not prove Rodin and fails this batch. |
| `gemini-text` | $0.0000788/1,000 tokens | 280/283 (98.9%); `NEEDS_METADATA` | observed p50 2.922s / p95 6.734s | None; invalid quest JSON follows the product's single corrective request only in the merged quest orchestrator. This fixed batch does not auto-retry it. |
| `music` | $0.0315/track | 177/179 (98.9%); `NEEDS_METADATA` | observed p50 59.878s / p95 108.319s; provider abort 700s | None. |
| `mirelo-sfx` | $0.0105/generated second | 22/22 (100%); `NEEDS_METADATA` | observed p50 3.948s / p95 11.348s | Provider advertises `music`; ObjectQuest treats that as semantically incompatible and a fallback fails acceptance. |
| `chatterbox-tts` | $0.02625/1,000 characters | 61/62 (98.4%); `READY` | observed p50 26.832s / p95 138.879s | `gemini-tts -> inworld-tts -> grok-tts`; fallback is recorded but does not prove Chatterbox. |
| `pixverse-i2v` | $0.06825/generated second | 113/121 (93.4%); `READY` | observed p50 47.476s / p95 88.055s; provider abort 240s | `ltx-i2v -> seedance-mini-i2v`; fallback remains an animation but fails the named Pixverse claim. |

The provider-wide healthcheck requires an admin role and was unavailable. That
does not change the per-capability read-only evidence above. `READY` means
metadata completeness plus performance; `NEEDS_METADATA` is not an execution
failure. Unknown provider-reported cost after a job remains unknown, never zero.

## Exact authorised batch

Every row is an ObjectQuest normalized `GenerationRequest` sent to
`POST /api/jobs/generate`, except the style preview, which uses
`POST /api/jobs/previews` and is then approved through the preview-cache route.
All requests use world id `live-validation-photo4-20260924` and deterministic
`oq-live-20260924-*` idempotency keys. With
`LIVEPEER_MAX_AUTOMATIC_RETRIES=0`, the worst case from application retries is
exactly one catalog unit per row.

| # | App request / exact input | Expected duration | Unit price | Max with app retries | Evidence produced |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | Upload bundled `photo-4.jpg`; `image-edit/bg-remove`, purpose `object-cutout`, preserve sofa/desk/laptop/cushions/supports, PNG | p95 2.046s | $0.00105/image | **$0.0011** | cutout job/provenance and content-addressed image hash |
| 2 | `image-edit/kontext-edit` from `$cutoutAssetId`, purpose `style-preview`, Cartoon direction, PNG; approve cache record | p95 18.200s | $0.042/image | **$0.0420** | approved preview job, cache key, image hash |
| 3 | `image-edit/gpt-image-edit` from the same cutout, restrained hand-painted alternate | p95 114.966s | $0.22995/image | **$0.2300** | alternate job/provenance and image hash |
| 4 | `image-to-3d/rodin-i3d` from `sourceImageAssetIds: [$cutoutAssetId]`; approved preview only as `styleReferenceAssetId`; faithful room-corner prompt | conservative p95 300s | $0.42/call | **$0.4200** | validated/stored GLB, provider and app job ids, GLB hash |
| 5 | `text/gemini-text`, `quest-json`, max 1,200 chars; exact constrained Collect-mode prompt printed by dry-run | p95 6.734s | $0.0000788/1k tokens | **$0.0001** | structured quest JSON and canonical text hash |
| 6 | `music/music`, 60s instrumental loop, Cartoon miniature room-corner prompt | p95 108.319s | $0.0315/track | **$0.0315** | soundtrack audio hash and duration |
| 7 | `sfx/mirelo-sfx`, 20s looping indoor ambience | p95 11.348s | $0.0105/s | **$0.2100** | ambience audio hash and duration |
| 8 | Mirelo fragment-pickup, 1s | p95 11.348s | $0.0105/s | **$0.0105** | SFX audio hash |
| 9 | Mirelo portal-activate, 2s | p95 11.348s | $0.0105/s | **$0.0210** | SFX audio hash |
| 10 | Mirelo checkpoint, 1s | p95 11.348s | $0.0105/s | **$0.0105** | SFX audio hash |
| 11 | Mirelo fall-respawn, 2s | p95 11.348s | $0.0105/s | **$0.0210** | SFX audio hash |
| 12 | Mirelo race-start, 2s | p95 11.348s | $0.0105/s | **$0.0210** | SFX audio hash |
| 13 | Mirelo race-finish, 3s | p95 11.348s | $0.0105/s | **$0.0315** | SFX audio hash |
| 14 | Mirelo completion, 3s | p95 11.348s | $0.0105/s | **$0.0315** | SFX audio hash |
| 15 | `tts/chatterbox-tts`, English, 107-character bundled validation narration | p95 138.879s | $0.02625/1k chars | **$0.0029** | narration WAV/audio hash and transcript provenance |
| 16 | `video/pixverse-i2v` from approved preview, 5s slow-dolly animated postcard, explicitly `animated-postcard` | p95 88.055s | $0.06825/s | **$0.3413** | MP4 hash, duration/dimensions, generated-animation label |
|  | **Maximum authorised batch** |  |  | **$1.4259** | one appended evidence run plus app spend summary |

There are seven event SFX calls (rows 8–14) plus the ambience call (row 7).
The $0.2300 GPT edit is intentionally not a production-path dependency; it is
the smallest single extra call that executes the claimed alternate. The
postcard is optional to the playable world but included in this authorisation
so the optional Pixverse claim can be supported. Nothing pushes the total over
$10.

## Budget configuration and ledger

Set these values before starting the isolated API:

```text
PORT=8799
STORAGE_DIR=./storage/live-validation-2026-09-24
LIVEPEER_MAX_REQUEST_USD=0.50
LIVEPEER_MAX_WORLD_USD=1.50
LIVEPEER_MAX_AUTOMATIC_RETRIES=0
```

`LIVEPEER_API_KEY` is deliberately not specified here: use only the already
authorised server-side credential/keyless arrangement and never copy it into a
command, log, or committed file. The ledger is therefore exactly
`./storage/live-validation-2026-09-24/spend-ledger.json`. The $0.50 per-request
ceiling admits the $0.42 Rodin call and rejects larger requests. The $1.50
world ceiling plus runner `--max-usd 1.50` bounds this known-price batch. Zero
retries is essential: changing it changes the authorised maximum.

Afterward:

```powershell
Get-Content ./storage/live-validation-2026-09-24/spend-ledger.json | ConvertFrom-Json | ConvertTo-Json -Depth 20
Invoke-RestMethod http://127.0.0.1:8799/api/jobs/spend/live-validation-photo4-20260924 | ConvertTo-Json -Depth 10
```

## Dry-run verification

An isolated ObjectQuest API was started on port 8799 with the values above.
`npx tsx scripts/live-validation/run.ts --dry-run --api http://127.0.0.1:8799 --max-usd 1.50`
returned exit code 0 and printed:

```text
ObjectQuest live validation DRY RUN
API: http://127.0.0.1:8799
Input: C:\Users\manuj\code_barely_runs\Objectquest_worktrees\weekly-river\public\samples\photo-4.jpg
World: live-validation-photo4-20260924
Guard: $1.5000; planned: $1.4259; retries: 0 required
01. cutout -> POST /api/jobs/generate | bg-remove | $0.0011
02. style-preview -> POST /api/jobs/previews | kontext-edit | $0.0420
03. alternate-edit -> POST /api/jobs/generate | gpt-image-edit | $0.2300
04. mesh -> POST /api/jobs/generate | rodin-i3d | $0.4200
05. quest -> POST /api/jobs/generate | gemini-text | $0.0001
06. music -> POST /api/jobs/generate | music | $0.0315
07. ambience -> POST /api/jobs/generate | mirelo-sfx | $0.2100
08. fragment-pickup -> POST /api/jobs/generate | mirelo-sfx | $0.0105
09. portal-activate -> POST /api/jobs/generate | mirelo-sfx | $0.0210
10. checkpoint -> POST /api/jobs/generate | mirelo-sfx | $0.0105
11. fall-respawn -> POST /api/jobs/generate | mirelo-sfx | $0.0210
12. race-start -> POST /api/jobs/generate | mirelo-sfx | $0.0210
13. race-finish -> POST /api/jobs/generate | mirelo-sfx | $0.0315
14. completion -> POST /api/jobs/generate | mirelo-sfx | $0.0315
15. narration -> POST /api/jobs/generate | chatterbox-tts | $0.0029
16. postcard -> POST /api/jobs/generate | pixverse-i2v | $0.3413
Then: approve preview -> save draft level -> POST publish (or record explicit repair-required response). No billable request was submitted.
```

The actual dry-run also prints the complete normalized JSON envelope after each
line. It performed only `GET /api/health`; no upload or generation route was
called. The isolated server was then stopped without touching ports 5173/8787.

## Runbook and evidence behavior

See `scripts/live-validation/README.md`. The runner reserves each estimate
before submission, stops on a failed job or any provider fallback, and appends
partial evidence before stopping when a submitted job returns a terminal
failure/fallback. Completed evidence is written to
`docs/evidence/live-validation-<date>.json` with application/provider job ids,
served capability/model, timings, reported cost or explicit null, and artifact
hashes. A paid-run evidence file must be reviewed before any later commit.

The runner saves a level from the generated asset, quest, and media, but marks
its course `unvalidated`. It attempts publish. A 422 becomes an explicit
`repair-required` result rather than a fabricated usability claim. After
browser repair and traversal, publish without generation using
`--publish-level-id live-validation-photo4-20260924 --max-usd 0`.

## Live-run acceptance and failure rules

The evidence report must keep these layers separate:

1. **Catalog availability:** the dated read-only rows above. This alone proves
   neither execution nor quality.
2. **Historical health:** provider seven-day samples above. These are not our
   jobs.
3. **Our execution:** every named capability has one ready application job,
   provider job id where asynchronous, expected media kind, no fallback, stored
   immutable artifact, and hash. Reported cost may be null; the ledger estimate
   remains the bounded evidence.
4. **Visual/audio quality:** in-browser review confirms the cutout preserves the
   recognizable sofa/desk/laptop arrangement; Cartoon preview visibly changes
   the direction while preserving identity; mesh remains recognizable; music,
   ambience, all seven cues, and narration are audible after a user gesture;
   the postcard is visibly labelled generated **animation**, never gameplay
   capture.
5. **Gameplay usability:** the generated mesh loads; the course can be
   completed from spawn through all required collectibles/checkpoints to the
   portal, or the editor presents and completes the explicit helper/placement
   repair path. Only the repaired, traversed course may be marked validated and
   published.

Failure includes: unavailable/degraded at run time; request rejection; timeout
without safe reconciliation; wrong/empty media; unexpected fallback; missing
served provenance; malformed quest JSON or mechanics outside the constrained
mode; unrecognizable/seriously truncated object; style preview not materially
styled; inaudible or semantically wrong audio after gesture; video presented as
gameplay; a crash or loss of the already-ready level when optional media fails;
or an unreachable course without a working repair path. A good-looking GLB is
not a gameplay pass, and a playable course is not proof of visual fidelity.

## Known integration gaps before the paid run

- The current main branch exposes the generic normalized generation routes but
  not the quest/audio orchestrator routes present on `worktree/amber-pond`.
  The runner uses those orchestrators' exact request shapes through
  `/api/jobs/generate`; after that branch lands, exercise `/api/quests` and
  `/api/audio` separately if end-to-end route coverage is required.
- `worktree/vivid-elk` currently contains deterministic gameplay screenshot
  capture but no landed Pixverse postcard request route. The runner therefore
  uses the app's normalized `video` job route with an approved preview as the
  source. A later postcard-specific route should replace this in production.
- The app has no non-billable request-validation endpoint. Dry-run can verify
  health and print locally typechecked request templates but cannot make the
  server validate generation bodies without submitting them.
- Automatic scene preparation/course generation is browser-side. The script
  cannot honestly promote a new mesh to playable; it records the publication
  rejection and repair path until a human browser traversal validates it.
- The provider-wide healthcheck requires admin. Per-capability discovery and
  history were available and are recorded instead.
