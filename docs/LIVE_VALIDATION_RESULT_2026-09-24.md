# ObjectQuest v2 live-validation result — 2026-09-24

Status: **rows 1–8 remain ready; the one authorized row-9 replacement and row
10 checkpoint are ready; recovery stopped without retry when row 11
fall-respawn suffered a second provider `runner_abandoned` failure; rows 12–15
remain unsubmitted and row 16 remains SKIPPED/BLOCKED**.

## One-off portal recovery — stopped at the next provider failure

At MAIN `c51c399b79dbe0fb53c87fbec9ad101a48f41697`, the recovery-only
dry-run proved exactly seven possible submissions: a byte-identical
three-second portal request with the sole change to versioned key
`oq-live-20260924-portal-activate-v2`, followed by the six unused original
keys for rows 10–15. It revalidated ready rows 1–8, the untouched original
failed portal job, the ten-entry `$0.9767` ledger, `$0.1919` recovery ceiling,
and zero retry/upload/level-save/publish/postcard paths.

The authorized replacement succeeded after 163,576 ms as application job
`job_e6ca6d26-95e4-4a57-9957-ccb339f7b898`, provider job
`mjob_30c95ec86443`, served capability/model `mirelo-sfx` /
`Mirelo-AI/sfx1.6/text-to-audio`, no fallback, and null reported cost. Its
266,318-byte RIFF/WAVE asset `44281ef7-112f-45e5-b135-3739dc8f1154`
matches SHA-256
`f66162797f8d0dc6bb8f2c114f9d6423be54c1cf157714e325b70c9605e5db30`.
The original failed portal job and reservation were not changed.

Checkpoint then succeeded after 22,844 ms as application job
`job_ad9d29da-c845-4942-a20e-73867b01e4dd`, provider job
`mjob_94a0a8679b31`, with the same named capability/model, no fallback, and
null reported cost. Its 266,318-byte RIFF/WAVE asset
`e57434dc-4764-471a-886d-0b3674d3d1b5` matches SHA-256
`a5157262e1820d3f122cd7fdf6c8701e5b89107fe4e0ba7d896a5d5a03470b8e`.

Fall-respawn then failed after 146,041 ms on its first and only submission:
application job `job_43353949-fb25-4589-93ea-e2b84b05cdaa`, provider job
`mjob_4a4a42d7fc56`. Its durable raw envelope again reports HTTP 200/entered,
`runner_abandoned`, no heartbeat for 143 seconds, no media produced,
`url:null`, `run_output:null`, `persisted:false`, no fallback, null served
model, `$0.0315` estimate with `release_pending`, no recorded release, and
null paid cost. This second independent abandonment shows a recurring Mirelo
provider-runner liveness problem in this execution window. The harness stopped;
race-start, race-finish, completion, and narration were never submitted. No
retry or second replacement was attempted.

The conservative ledger is now `$1.0712` across 13 entries; including the
earlier `$0.4620` spike gives `$1.5332`. Actual paid cost remains unknown. The
private hands-on level remains byte-identical at levels hash
`dbe0dfd604d6677b86f8d6f892b9440e7ca527530b693a24a25cac0f9f86554b`
with zero attached audio/video. Because the full semantic SFX set is still
incomplete, browser decode/playback and API attachment were intentionally not
performed; there is no shifted partial SFX mapping, new world, or publication.

## Corrected audio-only execution — stopped at first provider failure

Integrated MAIN `14083cfbc5344050add1de8194cf1db37ec14a07` restarted only
the isolated API on port 18799, from PID 35992 to PID 34496. The existing
client on 15173 and protected services on 5173/8787 retained their PIDs. API
boot left the durable jobs and ledger byte-identical at SHA-256
`b32d9fdbb4865b68d839588ead5c5ca1230534b174e2ed3ceb41709cdc331560`
and `21b4bf78146bd05c64f11365ac30e7b29ac9fd8d37b19feb8f18d866bb65e1fe`.

A local coordination harness reused the reviewed `buildPlan`, `BudgetGuard`,
and strict row-1–5 reuse assertion. Its two no-dispatch dry-runs verified the
exact five reusable application jobs and request bodies, the obsolete
60-second music job with no provider ID, the new `music-v2` key, rows 6–15's
exact `$0.4124` maximum, the retained `$0.7247` six-entry ledger, and zero
retry, level-save, publish, screenshot-upload, or postcard paths. The harness
then submitted rows sequentially and stopped before the next row on the first
unexpected terminal failure.

| Row | Result | Application / provider job | Served capability / model | Stored artifact |
| ---: | --- | --- | --- | --- |
| 6 music | **READY**, no fallback | `job_ce2d246a-37d5-4d9e-92cd-576714355ecd` / `mjob_8243e6646190` | `music` / `fal-ai/minimax-music/v2` | MP3/ID3, 566,219 bytes, SHA-256 `34a653013e7f37b890d2c43d7f810bd3fdfea985a316914833f0cdb490e8d96b` |
| 7 ambience | **READY**, no fallback | `job_70ab5853-fc2a-4ab5-9f4a-0e61fd97643c` / `mjob_0fd9e8e551e1` | `mirelo-sfx` / `Mirelo-AI/sfx1.6/text-to-audio` | RIFF/WAVE, 1,323,086 bytes, SHA-256 `7c2b71575426b362075ef0035bfc9a2b14e6887e5bda487ec5819e410d89643f` |
| 8 fragment-pickup | **READY**, no fallback | `job_1474ebee-fa65-4d4b-b411-0f8babbabb87` / `mjob_9b4d5aa5632c` | `mirelo-sfx` / `Mirelo-AI/sfx1.6/text-to-audio` | RIFF/WAVE, 266,318 bytes, SHA-256 `b79dd5c6f413025b5fe4086b2a57bb20df64ae74ad709171f6a530e430fe5092` |
| 9 portal-activate | **FAILED**, provider runner abandoned, no fallback | `job_0ea8326f-b76f-46d6-aba1-5b2d03a02a14` / `mjob_f9db028110fb` | requested `mirelo-sfx`; terminal capability/model `null` in the raw envelope | None |
| 10–15 | **NOT SUBMITTED** after stop | — | — | — |
| 16 postcard | **SKIPPED/BLOCKED** | no job | no request | no upload, reservation, or video |

The failed job used the exact reviewed three-second request and ended after
158,090 ms. ObjectQuest intentionally exposed the stable safe error
`provider_failed`, `retryable: false`, and the message “The provider rejected
the generation request. Check the selected model settings and try again.” The
preserved raw provider envelope is more specific: host `agent.livepeer.org`
entered with HTTP 200, then reported `runner_abandoned` after no heartbeat for
155 seconds; `url`, `run_output`, and served model were null, `persisted` was
false, and it explicitly stated that no media was produced. This rules out
output normalization, URL download, MIME validation, or app finalization as
the failure stage. It also shows a job-specific provider runner failure rather
than rejection of the prompt, duration, or Mirelo contract: the immediately
preceding three-second fragment request and 15-second ambience request both
succeeded on the same capability. Retry count and max retries remained 0, and
no retry or replacement request was made.

The raw cost fields are estimated `$0.0315`, disposition `release_pending`,
release record `null`, and paid cost `null`. The reservation therefore remains
in conservative accounting; neither release nor actual provider billing may
be inferred.

Rows 10–15 are independent durable requests and all six original idempotency
keys remain unused. The five remaining Mirelo cues retain the same valid
three-second contract, while narration uses the separate Chatterbox capability;
their reviewed combined ceiling is `$0.1604`. Completing only those rows would
raise the conservative batch/project totals to `$1.1371`/`$1.5991` without
altering row 9's honest failed state. A new row-9 generation would require a
new versioned key and a further `$0.0315` ceiling, producing conservative totals
of `$1.1686`/`$1.6306`. It is not authorized by this diagnosis. The current
retry route is a no-op because the job is nonretryable, and the terminal raw
envelope contains no output to recover.

Generation independence does not make partial attachment safe: gameplay maps
the seven generic SFX assets by array position. Attaching later SFX while
portal-activate is absent would shift cue meanings. Preserve all ready assets
in storage, but defer attachment until row 9 is recovered or an explicit
position-preserving fallback is designed and reviewed.

The ledger now conservatively records `$0.9767` across ten entries: the prior
`$0.7247` plus `$0.2520` for the three ready jobs and failed provider-backed
portal request. Including the earlier `$0.4620` style spike gives a current
conservative project total of `$1.4387`. This is reservation/estimate evidence,
not an actual billing statement.

The three ready files exist under ignored validation storage, match their
stored SHA-256 values, and have MP3/RIFF-WAVE magic matching their declared
MIME types. Full browser decode/playback was not claimed because the required
audio set did not complete. The existing private level
`live-validation-photo4-20260924-hands-on` remains the only saved level, with
zero attached audio/video; its `levels.json` hash stayed byte-identical at
`dbe0dfd604d6677b86f8d6f892b9440e7ca527530b693a24a25cac0f9f86554b`.
No partial attachment, geometry/placement/quest change, second world, or
publication occurred. This current saved-level fact supersedes the older
checkpoint sections below that correctly recorded no saved level at their
earlier timestamps.

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

## Initial paid-run outcome

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

## Resumed-run outcome

After `main` reached `ab80fae`, the validation runner gained an explicit
resume mode that reuses the stored source photo and reviewed cutout instead
of uploading again. The focused runner suite passed 7/7 and the full
client/server typecheck passed. Resume dry-run output classified rows 1–2 as
`RECONCILE/REUSE` at zero new spend and rows 3–16 as the only payable rows,
with a planned new-spend maximum of **$1.3828**.

The resumed command was:

```text
npx tsx scripts/live-validation/run.ts --api http://127.0.0.1:18799 --max-usd 3 --reuse-photo-id 632f0492-579a-46ff-8436-b7649035fd98 --reuse-cutout-asset-id e4bd9b09-4912-44e8-9b71-6f2a6ff6f2c0
```

Rows 1–2 reconciled without a new provider submission or ledger entry. The
previous Kontext provider output downloaded successfully as a real JPEG and
was stored using its detected media type. Rows 3 and 4 completed without
fallback. Row 5 reached provider state `done`, but its successful text was
nested at `run_output.result.text`, which the adapter did not yet normalize.
The runner stopped immediately; rows 6–16 were not submitted and no retry was
attempted during that run.

The resumed runner's complete console output was:

```text
Validation stopped at quest: Provider reported "done" but returned no output. Partial evidence: C:\Users\manuj\code_barely_runs\Objectquest_worktrees\sudden-stone\docs\evidence\live-validation-2026-09-24.json
```

### Resumed per-row execution record

| # | Row | Application / provider job | Served capability / model | Status | Artifact |
| ---: | --- | --- | --- | --- | --- |
| 1 | Cutout | `job_737935e2-c54b-4c18-a6a6-782a7a4c69c8` / `mjob_a2426904c928` | `bg-remove` / `fal-ai/birefnet` | **Reconciled ready**, no fallback, zero new spend | PNG, 193,234 bytes, SHA-256 `6d0b4d2c18d6dd58aa1a7754cebc710b7872094295457c538666205c0da404f9` |
| 2 | Cartoon style preview | `job_ef2fde65-65e2-4d16-b8df-e75d53c93d85` / `mjob_d3d1797a1657` | `kontext-edit` / `fal-ai/flux-pro/kontext` | **Reconciled ready**, no fallback, zero new spend | JPEG, 129,740 bytes, SHA-256 `adcd4f6a9c5ab0e6064d1e3656f906f5f5b9c4a22da704854b7c2c8fa0263c5e` |
| 3 | GPT image-edit alternate | `job_f9bcf342-6254-4b38-9fa0-d32c797cb89f` / `mjob_4a0b2bde417b` | `gpt-image-edit` / `openai/gpt-image-2/edit` | **Ready**, no fallback; provider total 77,457 ms | PNG, 684,261 bytes, SHA-256 `93c3895a6dbf68121eb8f50487efd44a0e2601a4ee5bf6c2653c133aa1501106` |
| 4 | Rodin mesh | `job_662f0c8a-52f1-4e33-adad-fcff355e014d` / `mjob_0001ef7f3201` | `rodin-i3d` / `fal-ai/hyper3d/rodin/v2.5` | **Ready**, no fallback; provider total 138,789 ms | GLB, 4,680,412 bytes, SHA-256 `f0855519fb1314e14703ef91a7778b6992f2f4c80b64910cfe4781e719b0e24c` |
| 5 | Quest | `job_8df572b8-0ded-4e8b-b524-c3361698a1ca` / `mjob_13e739e8d5af` | `gemini-text` / `fal-ai/any-llm` | **Recovered ready**, no fallback and zero new provider submission; originally stopped after 10,478 ms | Structured quest JSON, canonical SHA-256 `47561633496011cc62324b3d7b8225b5600c1f9178e3a5a2e82bfb6fd1f5bb6e` |
| 6 | Music | `job_38ac4480-6e6c-4ed5-99ef-a0e0448cb1e0` / no provider job | `music` / not served | **Failed before dispatch**, no fallback: shared `create_media` contract rejected 60 seconds because its maximum is 15 | None; provider explicitly reported nothing dispatched or charged |
| 7 | Ambience | — | — | Not submitted after runner stop | — |
| 8 | Fragment-pickup SFX | — | — | Not submitted after runner stop | — |
| 9 | Portal-activate SFX | — | — | Not submitted after runner stop | — |
| 10 | Checkpoint SFX | — | — | Not submitted after runner stop | — |
| 11 | Fall/respawn SFX | — | — | Not submitted after runner stop | — |
| 12 | Race-start SFX | — | — | Not submitted after runner stop | — |
| 13 | Race-finish SFX | — | — | Not submitted after runner stop | — |
| 14 | Completion SFX | — | — | Not submitted after runner stop | — |
| 15 | Narration | — | — | Not submitted after runner stop | — |
| 16 | Animated postcard | — | — | Not submitted after runner stop | — |

### Current cumulative ledger

- Ledger estimate/reservation: **$0.7247** across six entries: the five
  provider-backed ready rows totaling `$0.6932`, plus a retained `$0.0315`
  reservation for the pre-dispatch music rejection.
- The latest runner guard had conservatively counted **$0.6816** when it
  stopped: reconciled rows 3–5 plus the rejected row-6 reservation.
- All provider-reported costs are `null`; the provider-reported total is
  **unknown**, not zero.
- Neither reconciliation added a ledger entry or incurred new estimated
  spend.
- Recovering row 5 retained five ledger entries and **$0.6932**, with zero
  estimate/reservation delta. Only the existing quest entry's `updatedAt`
  changed when it finalized.
- The remaining-row attempt retained a `$0.0315` music reservation even though
  provider validation rejected that request before dispatch. Rows 7–16 were
  not submitted. The runner's conservative resume guard counted reconciled
  rows 3–5 and reached `$0.6816` before the stop.

## Zero-spend quest recovery

A read-only provider lookup showed that `mjob_13e739e8d5af` had completed
successfully with `run_output.ok: true`, `run_output.output_kind: text`, and
the quest JSON at `run_output.result.text`. The same result reported concrete
model `fal-ai/any-llm`, estimate `$0.0001`, and paid cost `null`. The adapter
previously inspected only top-level `url`, `text`, `output`, and `payload`.

The scoped adapter repair accepts only the observed successful nested-text
shape, preserves the nested model ID, rejects malformed/error/wrong-kind
nested envelopes, retains legacy top-level normalization, and does not treat
the nested estimate as actual reported spend. Typecheck passed; focused
adapter, job-manager, and quest tests passed 69/69.

Before recovery, all five stored jobs were terminal, provider-backed, and had
`retryCount: 0`, `maxRetries: 0`. Restarting only API port 18799 left the quest
failed and did not alter the ledger. One authorized
`POST /api/jobs/job_8df572b8-0ded-4e8b-b524-c3361698a1ca/retry` then force-polled
the same `mjob_13e739e8d5af`; the app job became ready without entering a
provider submission path. The app/provider IDs and retry counters remained
unchanged, fallback remained null, the four quest fields passed the product
validator, and reported cost remains unknown.

Ledger entry count stayed 5 and its estimate stayed `$0.6932`. The ledger
file hash changed only because the existing quest entry's `updatedAt` changed:
`475df491edf3b679795c338dba26c5688760c68e5ea46a02f13a09d81dfdbcc0`
before recovery and
`4e3d5f91f451acc1277697a2ba8a1a12b75b2760c51c3ec96bdaef8756337e64`
afterward. Cutout, preview, alternate, and mesh bytes still match their
recorded hashes and sizes.

## Remaining-row attempt and music contract blocker

Before this attempt, forced read-only discovery reported `music`,
`mirelo-sfx`, `chatterbox-tts`, and `pixverse-i2v` available/active with the
same displayed rates. Exact request quotes totaled `$0.7326`, within the
plan's conservative `$0.7327`. Pixverse retained the previously documented
warning that its unpinned-resolution quote is a lower bound. The dry-run
exited 0 without changing the five-job store or `$0.6932` ledger, and stored
requests for rows 1–5 matched the runner's resolved requests exactly.

The authorized runner reconciled rows 1–5, then submitted the fixed row-6
application request for a 60-second instrumental track. The provider MCP tool
rejected it during argument validation:

```text
create_media was refused before it ran, so nothing was dispatched and nothing
was charged. duration must be at most 15.
```

The resulting app job is
`job_38ac4480-6e6c-4ed5-99ef-a0e0448cb1e0`, with provider job ID `null`,
`retryable: false`, retry count 0, no served capability/model, no fallback,
and reported cost `null`. No retry or replacement request was made. Rows 7–16
remain unsubmitted.

Read-only inspection of the current `create_media` tool schema confirmed a
shared integer `duration` bound of 3–15 seconds. This conflicts with the
action description's promise that music accepts a duration and with the
`music` capability quote, which priced the exact 60-second request at
`$0.0315`. It affects more than row 6: the 20-second ambience exceeds the
maximum, while the planned 1-, 2-, 1-, 2-, and 2-second event cues fall below
the minimum. Only the two planned 3-second cues, narration, and 5-second
postcard are valid unchanged.

The preflight missed this because `describe_capability` omitted a music
duration range, `cap_price` priced the exact 60-second request, `cap_route`
returned SAFE, and the runner's dry-run checks app health and locally typed
templates rather than the provider tool schema. This is not runner-only:
the production audio orchestrator also requests 60-second music, 20-second
ambience, and the same seven cue durations, while app and adapter validation
allow music for 1–600 seconds and SFX for 1–60 seconds.

The app ledger retained the music estimate despite the provider's explicit
pre-dispatch/no-charge result: entries changed 5→6 and estimate/reservation
changed `$0.6932`→`$0.7247`. This is conservative ledger state, not evidence
of a sixth paid provider job. Actual paid cost for the five completed provider
jobs remains unknown; the rejected music call is explicitly uncharged.

### Superseding zero-call recovery plan

No recovery call has been made. Independent contract review narrowed the next
batch to audio only: 15-second music (`$0.0315`), 15-second ambience
(`$0.1575`), seven 3-second event cues (`$0.2205`), and unchanged narration
(`$0.0029` ceiling; `$0.0028` exact quote). The fresh conservative maximum is
**$0.4124** and the exact quotes sum to **$0.4123**. `loop: true` remains
ObjectQuest playback intent; the wrapper exposes no loop or ambience flag, so
prompt wording is not evidence that upstream output is seamless.

The postcard is now explicitly **SKIPPED/BLOCKED**, not successful or removed
from the optional deliverable. The wrapper cannot pin resolution or audio, so
the `$0.3413` `cap_price` lower bound is not an enforceable maximum. The next
batch must make no postcard reservation, screenshot upload, or video request.

The changed music request cannot reuse `oq-live-20260924-music`: its stored
60-second body would conflict with a 15-second body. Its failed record has no
provider job, and retry would target that obsolete request; therefore recovery
requires new key `oq-live-20260924-music-v2`. Rows 7–15 have no application or
provider jobs, so their unused keys are retained with corrected request bodies.
Row 16 retains its unused identity only as blocked plan evidence. Successful
rows 1–5 require no upload, reset, regeneration, or new provider call.

Conservatively retaining the explicitly uncharged `$0.0315` reservation, the
current batch ledger `$0.7247` plus the audio-only future plan `$0.4124` would
be **$1.1371**, below the `$3` batch guard. Including the earlier `$0.462`
style spike gives **$1.5991** against the cumulative `$10` ceiling, leaving
**$8.4009**. Before any corrected run, the current project total is `$1.1867`
and headroom is `$8.8133`. Provider-metered cost for completed calls remains
unknown and must not be inferred from these estimates.

The minimal repair belongs in `server/livepeer/adapter.ts` and
`server/routes/jobs.ts` to enforce the observed 3–15-second wrapper contract
before ledger reservation, plus `server/audio/prompts.ts` and
`scripts/live-validation/plan.ts` and `run.ts` to emit supported durations, use
a new music key, verify rows 1–5 read-only, and block postcard execution.
Focused regression coverage belongs in the existing adapter, audio
orchestrator, HTTP generation-validation, and live-runner tests. No broad
recursive normalization, schema, dependency, or UI change is indicated.

## Initial per-row execution record

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

## Initial spend

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

The resumed run stored the JPEG style preview and the generated mesh, but the
quest failure occurred before the runner's save step. No validation level was
created, no publish attempt was possible, and `GET /api/levels` still returned
an empty list. Per the revised handoff scope, no course traversal, repair, or
extended browser screenshot session was performed.

Consequently these requested checks were **not verified**:

- Cartoon styling quality and identity preservation by the user;
- generated mesh recognizability/loading in gameplay;
- quest title, intro, and objective;
- music, ambience, SFX, narration, audio diagnostics, and subtitles;
- generated-animation postcard labeling or MP4 playback;
- course traversal, guided repair, validation, or publication;
- a fresh-context `/share/<id>` run without generation or source photos.

The course was neither found completable nor repaired because no generated
world was saved. No level URL, share ID, or share link was created.

## Resolved image-format defect

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

**Resolution evidence:** after the server began treating requested MIME as a
preference and retained magic-byte validation, the same provider job and URL
stored a valid JPEG artifact without another paid Kontext submission.

## Resolved quest-output normalization defect

**Reproduction:** submit the authorized `gemini-text` request with idempotency
key `oq-live-20260924-quest` through `POST /api/jobs/generate` and poll
application job `job_8df572b8-0ded-4e8b-b524-c3361698a1ca`.

**Expected:** provider state `done` includes text or structured quest JSON for
the four required fields and the adapter normalizes the provider's supported
success envelope.

**Actual before repair:** provider job `mjob_13e739e8d5af` reported `done`,
served `gemini-text`, and fired no fallback. Its valid JSON was nested at
`run_output.result.text`; the adapter ignored that field and failed the app job
with `Provider reported "done" but returned no output`.

**Resolution evidence:** commit
`27bebaeda3e30e9985c95073f68ce830bb641fc0` added strict support for the
observed nested text envelope. One force-poll of the existing provider job
recovered the same application job as ready with served model
`fal-ai/any-llm`, validated quest fields, null reported cost, and no new ledger
entry, reservation, or provider submission.

## Five-layer distinction

1. **Catalog availability:** the 2026-09-24 plan snapshot listed all requested
   capabilities as available/active. Immediately before the remaining-row
   attempt, read-only discovery reconfirmed `music`, `mirelo-sfx`,
   `chatterbox-tts`, and `pixverse-i2v` as available/active at unchanged
   displayed rates. The shared tool schema conflict was not reflected in the
   capability card or exact price quote.
2. **Historical health:** the plan's seven-day provider history remains
   contextual evidence only; it is not this ObjectQuest run.
3. **Our execution:** ObjectQuest has ready, no-fallback jobs for `bg-remove`,
   `kontext-edit`, `gpt-image-edit`, `rodin-i3d`, and `gemini-text`. The text
   job was recovered by polling its original provider job after the adapter
   learned the observed nested-output contract. Row 6 created an app job but
   was rejected before provider dispatch. Rows 7–16 were not submitted.
4. **Visual quality:** human inspection in real Chrome supports only the
   cutout-preservation finding above. Preview and mesh artifacts exist but
   were intentionally left for the user's hands-on review. There is no audio
   or video quality evidence from this run.
5. **Gameplay usability:** not established. No level was saved, traversed,
   repaired, published, or opened through a share link.

## Evidence hashes

- Runner and recovery evidence JSON: SHA-256
  `2826cde038acf1046403f6a0d9451dbff61ccb4b90bbd1866a650fe5ee56928d`
  (18,578 bytes).
- Recovered canonical quest JSON: SHA-256
  `47561633496011cc62324b3d7b8225b5600c1f9178e3a5a2e82bfb6fd1f5bb6e`
  (478 bytes).
- Full runner console log: SHA-256
  `af9a316e22346f08b671ff97c8017bdc80862fd8bd71f258110d418c2292db6a`
  (225 bytes; local ignored path `test-results/live-validation/paid-run.log`).
- Successful cutout artifact: SHA-256
  `6d0b4d2c18d6dd58aa1a7754cebc710b7872094295457c538666205c0da404f9`
  (193,234 bytes; retained only in ignored validation storage).
- Reconciled style preview: SHA-256
  `adcd4f6a9c5ab0e6064d1e3656f906f5f5b9c4a22da704854b7c2c8fa0263c5e`
  (129,740-byte JPEG; retained only in ignored validation storage).
- GPT alternate: SHA-256
  `93c3895a6dbf68121eb8f50487efd44a0e2601a4ee5bf6c2653c133aa1501106`
  (684,261-byte PNG; retained only in ignored validation storage).
- Rodin mesh: SHA-256
  `f0855519fb1314e14703ef91a7778b6992f2f4c80b64910cfe4781e719b0e24c`
  (4,680,412-byte GLB; retained only in ignored validation storage).
- Resumed runner console log: SHA-256
  `bca4a287856d4197b99035b6f87dc8d8496d0126ad52f9c3b57a277047810459`
  (210 bytes; local ignored path `test-results/live-validation/resumed-run.log`).
- Chrome screenshot: SHA-256
  `4d4073f495391e5796cd64f88b69576895b490053fdc5480bd309ab57920f614`
  (36,575 bytes).

## Cleanup and local-state integrity

- Final spend endpoint: `knownUsd: 0.7247`, `unknownEntries: 0`,
  `entries: 6`, `reservedUsd: 0.7247`. The sixth entry is the retained
  estimate for the explicitly uncharged pre-dispatch music rejection.
- Final saved-level count: 0.
- Ignored spend ledger SHA-256:
  `21b4bf78146bd05c64f11365ac30e7b29ac9fd8d37b19feb8f18d866bb65e1fe`.
- Ignored durable jobs index SHA-256:
  `b32d9fdbb4865b68d839588ead5c5ca1230534b174e2ed3ceb41709cdc331560`.
- Generated media, storage, durable jobs/ledger, runtime Vite configuration,
  and runner logs remain uncommitted under ignored paths.
- The isolated API remains running at `http://127.0.0.1:18799` and the client
  remains running at `http://127.0.0.1:15173/` with `/api` proxied to that API.
- My Worlds is the client root above. There is no validation-level URL or
  share URL because the runner stopped before save/publish.

Checkpoint commits before this final document update:

- `1a57e0e5dee60d150218bdcec62e120b79e8f820` — dry-run confirmation.
- `a2142c36bb2b01495390b3ac109523696c054e1f` — runner evidence JSON.
- `1bed190a0545b88f817b9a6e996d8fdfd1790302` — browser findings and
  screenshot.
- `86f2b4005eb4c60704550fedc0a9dbfd546bf2e8` — resume-mode runner tooling.
- `27bebaeda3e30e9985c95073f68ce830bb641fc0` — nested text-output adapter
  repair and regression coverage.
