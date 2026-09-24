# ObjectQuest v2 live-validation result — 2026-09-24

Status: **stopped safely after row 2 failed; partial evidence only**.

## Dry-run checkpoint

- Isolated API: `http://127.0.0.1:18799`
- Storage: `./storage/live-validation-2026-09-24`
- Server limits: `$0.50` per request, `$3.00` per world, zero automatic retries
- Runner command: `npx tsx scripts/live-validation/run.ts --dry-run --api http://127.0.0.1:18799 --max-usd 3`
- Planned rows: 16, including the `gpt-image-edit` alternate and five-second `pixverse-i2v` postcard
- Planned maximum: **$1.4259**
- Runner exit: 0
- Submission check: `/api/jobs/spend/live-validation-photo4-20260924` returned `knownUsd: 0`, `unknownEntries: 0`, `entries: 0`; neither `spend-ledger.json` nor `jobs.json` existed after the dry run.

No billable request was submitted during this checkpoint.

## Paid-run outcome

The one authorized batch was started with:

```text
npx tsx scripts/live-validation/run.ts --api http://127.0.0.1:18799 --max-usd 3
```

The runner submitted rows 1 and 2, then stopped at the required terminal
failure boundary. Its complete console output was:

```text
Validation stopped at style-preview: Generated image bytes do not match expected image/png.. Partial evidence: C:\Users\manuj\code_barely_runs\Objectquest_worktrees\sudden-stone\docs\evidence\live-validation-2026-09-24.json
```

The failed preview was marked `retryable: true` and the ledger had ample
room. The one authorized manual retry called the app's retry route once. Since
the job already had provider ID `mjob_d3d1797a1657`, the job manager reconciled
that same provider job rather than submitting another generation. It failed
again with the same PNG magic-byte validation error. `retryCount` remained 0,
the provider job ID did not change, and no further retry was attempted.

## Per-row execution record

| # | Row | Application job | Provider job | Served capability / model | Status and timing | Reported cost | Artifact |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | Cutout | `job_737935e2-c54b-4c18-a6a6-782a7a4c69c8` | `mjob_a2426904c928` | `bg-remove` / `fal-ai/birefnet` | **Ready**, no fallback. Queue 2,829 ms; execution 6,965 ms; provider total 9,794 ms; runner wall 15,792 ms. | `null` (unknown) | PNG, 193,234 bytes, SHA-256 `6d0b4d2c18d6dd58aa1a7754cebc710b7872094295457c538666205c0da404f9` |
| 2 | Cartoon style preview | `job_ef2fde65-65e2-4d16-b8df-e75d53c93d85` | `mjob_d3d1797a1657` | `kontext-edit` / `fal-ai/flux-pro/kontext` | **Failed**, no fallback: returned bytes did not match requested `image/png`. Initial provider total 20,725 ms; the single reconciliation retry retained the same job and ended with provider total 91,898 ms. | `null` (unknown) | None |
| 3 | GPT image-edit alternate | — | — | — | Not submitted after runner stop. | — | — |
| 4 | Rodin mesh | — | — | — | Not submitted after runner stop. | — | — |
| 5 | Quest | — | — | — | Not submitted after runner stop. | — | — |
| 6 | Music | — | — | — | Not submitted after runner stop. | — | — |
| 7 | Ambience | — | — | — | Not submitted after runner stop. | — | — |
| 8 | Fragment-pickup SFX | — | — | — | Not submitted after runner stop. | — | — |
| 9 | Portal-activate SFX | — | — | — | Not submitted after runner stop. | — | — |
| 10 | Checkpoint SFX | — | — | — | Not submitted after runner stop. | — | — |
| 11 | Fall/respawn SFX | — | — | — | Not submitted after runner stop. | — | — |
| 12 | Race-start SFX | — | — | — | Not submitted after runner stop. | — | — |
| 13 | Race-finish SFX | — | — | — | Not submitted after runner stop. | — | — |
| 14 | Completion SFX | — | — | — | Not submitted after runner stop. | — | — |
| 15 | Narration | — | — | — | Not submitted after runner stop. | — | — |
| 16 | Animated postcard | — | — | — | Not submitted after runner stop. | — | — |

No fallback fired on either submitted job.

## Spend

- Ledger estimate: **$0.0431** across two entries (`$0.0011` cutout +
  `$0.0420` style preview).
- Runner reservation at stop: **$0.0431**.
- Provider-reported cost: both entries are `null`; the reported total is
  therefore **unknown**, not `$0.00`.
- The reconciliation retry did not add a ledger entry or change the estimate.
- Authorized but unspent planned remainder: **$1.3828**.

## Browser and quality findings

Real Chrome successfully loaded the stored cutout from the isolated API. The
sofa, desk, laptop, cushions, desk drawer/leg, and sofa supports remain
recognizable and in their original arrangement. The cutout removes the room
walls/floor as intended. Fine edges are somewhat soft around the sofa and
desk, but the primary object group is preserved.

- Screenshot: `test-results/live-validation/cutout-chrome.png`
- Screenshot size: 36,575 bytes
- Screenshot SHA-256: `4d4073f495391e5796cd64f88b69576895b490053fdc5480bd309ab57920f614`

The style preview could not be displayed because the app rejected the
provider result before storing an artifact. With no approved preview, the
runner correctly did not submit the mesh or any downstream quest/audio/video
jobs and did not save a level. `GET /api/levels` returned an empty list.

Consequently these requested checks were **not verified**:

- Cartoon styling quality and identity preservation;
- generated mesh recognizability/loading;
- quest title, intro, and objective;
- music, ambience, SFX, narration, audio diagnostics, and subtitles;
- generated-animation postcard labeling or MP4 playback;
- course traversal, guided repair, validation, or publication;
- a fresh-context `/share/<id>` run without generation or source photos.

The course was neither found completable nor repaired: no generated world
existed to traverse. No share ID or share link was created.

## Defect

**Reproduction:** submit the authorized `kontext-edit` style-preview request
for the successful cutout, requesting `outputMimeType: image/png`, through
`POST /api/jobs/previews`; poll application job
`job_ef2fde65-65e2-4d16-b8df-e75d53c93d85` to terminal state. Reconcile once
through `POST /api/jobs/:id/retry`.

**Expected:** the provider result downloads as valid PNG bytes, is stored as
an immutable generated image, and can be approved in the preview cache.

**Actual:** both the initial finalization and the one reconciliation retry
failed with `Generated image bytes do not match expected image/png.` The job
retained served capability `kontext-edit`, served model
`fal-ai/flux-pro/kontext`, provider ID `mjob_d3d1797a1657`, no fallback, and
`reportedCost: null`; no preview artifact was stored.

## Five-layer distinction

1. **Catalog availability:** the 2026-09-24 plan snapshot listed all requested
   capabilities as available/active. Immediately before spending, the app's
   live capability endpoint reconfirmed `rodin-i3d` and `tripo-mv3d`; that
   endpoint exposes only the 3D descriptors.
2. **Historical health:** the plan's seven-day provider history remains
   contextual evidence only; it is not this ObjectQuest run.
3. **Our execution:** ObjectQuest executed `bg-remove` successfully and
   executed `kontext-edit` to a terminal app-side media-validation failure.
   Rows 3–16 were not executed. Neither submitted row used a fallback.
4. **Visual quality:** human inspection in real Chrome supports only the
   cutout-preservation finding above. There is no preview, mesh, audio, or
   video quality evidence from this run.
5. **Gameplay usability:** not established. No level was saved, traversed,
   repaired, published, or opened through a share link.

## Evidence hashes

- Runner evidence JSON: SHA-256
  `ddcf2a7521c3260949d10b2c3b688d71c225eb07c1f5f8661547f53c7cb79ff7`
  (2,425 bytes).
- Full runner console log: SHA-256
  `af9a316e22346f08b671ff97c8017bdc80862fd8bd71f258110d418c2292db6a`
  (225 bytes; local ignored path `test-results/live-validation/paid-run.log`).
- Successful cutout artifact: SHA-256
  `6d0b4d2c18d6dd58aa1a7754cebc710b7872094295457c538666205c0da404f9`
  (193,234 bytes; retained only in ignored validation storage).
- Chrome screenshot: SHA-256
  `4d4073f495391e5796cd64f88b69576895b490053fdc5480bd309ab57920f614`
  (36,575 bytes).

## Cleanup and local-state integrity

- Final spend endpoint: `knownUsd: 0.0431`, `unknownEntries: 0`,
  `entries: 2`.
- Final saved-level count: 0.
- Ignored spend ledger SHA-256:
  `3390d5ad288bdadbc173306436504f83119c9744c8c711a5341683b680ecb8e8`.
- Ignored durable jobs index SHA-256:
  `2184d6f6978b429ae528e90e28b7cfec6dca1c2c959a680078e6edf1fd8cae18`.
- The generated PNG, storage directory, durable jobs/ledger, and runner log
  remain uncommitted under ignored paths.
- No Vite client was started because the runner stopped before it created a
  level; the successful cutout was checked directly from the isolated API in
  real Chrome.
- The Chrome validation tab was closed, the isolated API was stopped, and
  port 18799 was confirmed no longer listening.

Checkpoint commits before this final document update:

- `1a57e0e5dee60d150218bdcec62e120b79e8f820` — dry-run confirmation.
- `a2142c36bb2b01495390b3ac109523696c054e1f` — runner evidence JSON.
- `1bed190a0545b88f817b9a6e996d8fdfd1790302` — browser findings and
  screenshot.
