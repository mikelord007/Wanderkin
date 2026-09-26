# Remaining live-media contract review

Read-only audit timestamp: **2026-09-24T19:11:57+05:30**. No generation, upload, retry, deletion, service, account-cap, or keyless-mode mutation was performed.

Sources: current registered `create_media` / `get_create_media` tool schemas; live read-only `describe_capability`, `cap_route`, `cap_price`, and `get_pricing` responses; fal model API pages; production transforms at sudden-stone `623a440` in `server/livepeer/adapter.ts`, `server/routes/jobs.ts`, `server/jobs/manager.ts`, `server/persistence/generatedAssetStore.ts`, `server/audio/prompts.ts`, `scripts/live-validation/plan.ts`; prior result/evidence at the same revision. Provider documentation was read on 2026-09-24; price-basis verification dates returned by `cap_price` are recorded below.

## Decision

**Do not resume the full paid batch yet.** The corrected durations are wrapper-valid, but two semantic/output claims and the postcard price cap are not yet honest contracts:

- `loop` is not a `create_media` field. ObjectQuest does not dispatch it for either music or Mirelo; it only marks the downloaded asset `loop: true`. Mirelo's real seamless-loop control is upstream `ambience: true`, also absent from the wrapper.
- `pixverse-i2v` supports explicit resolution upstream, but the registered `create_media` wrapper exposes neither `resolution` nor `generate_audio_switch`. `cap_price` ignored all attempted resolution values and continued to call the quote a lower bound. The current `$0.34125` app cap therefore cannot be presented as a finite option-pinned request maximum.

The safely bounded subset is music + ambience + seven cues + narration at a fresh conservative ceiling of **$0.4124**, but ambience/music loop quality remains unverified. If seamless generated loops are acceptance-critical, keep those two rows paused too.

## Exact contract matrix

| Row group | Exact ObjectQuest request and production wrapper transform | Live capability / upstream contract | Output accepted by ObjectQuest | Quote / ceiling | Verdict |
| --- | --- | --- | --- | ---: | --- |
| Music | App: `kind=music`, `capability=music`, versioned fresh idempotency key, exact existing 171-character prompt, `durationSeconds=15`, `instrumental=true`, `loop=true`. Adapter: `create_media {action:"music", model_override:"music", prompt, duration:15, instrumental:true, async:true, idempotency_key, session_id, max_cost_usd}`. **No loop is sent.** | Live route resolves to itself, model `fal-ai/minimax-music/v2`, prompt-only, no fallback, output audio. Wrapper declares `instrumental` but not `loop`; capability detail does not assert loop behavior. Current upstream page shows MP3 output and multiple MiniMax request variants; wrapper transformation, not raw fal fields, is authoritative here. | Terminal `get_create_media` must expose a top-level `url`; optional `output_kind=audio` / `content_type`. Download magic bytes accept WAV, MP3, Ogg. Stored duration is the requested 15, not probed from bytes; stored `loop=true` is app metadata, not proof of a seamless file. | `cap_price`: **$0.0315/call**, exact 15s quote **$0.0315**. Basis $0.03/call, verified 2026-08-11, provider-published. App ceiling $0.0315. | Wrapper-valid. Instrumental field is accepted; audible absence of vocals is runtime-unverified. Seamless looping is **not guaranteed**. |
| Ambience | App: `kind=sfx`, `capability=mirelo-sfx`, existing unused key, exact existing ambience prompt, `durationSeconds=15`, `loop=true`. Adapter: `create_media {action:"music", model_override:"mirelo-sfx", prompt, duration:15, ...common}`. **No loop/ambience flag is sent.** | Live route resolves to itself; registered model `Mirelo-AI/sfx1.6/text-to-audio`; fallback `music` is input-compatible but semantically unacceptable for SFX proof. Upstream exact fields are `text_prompt`, `duration` float (ordinary min 0.1; ambience min 1), `ambience` boolean (true creates a seamlessly loopable tile), `double_output`, `num_samples` default 2, output format default WAV. Wrapper's shared schema limits duration to integer 3-15 and exposes none of the Mirelo-specific controls. | Same audio URL normalization and WAV/MP3/Ogg byte acceptance. Provider upstream output is `audio[]`; the creative wrapper must flatten one selected file to top-level `url`. This flattening is runtime-unverified for this batch. Stored `loop=true` does not prove upstream `ambience:true`. | `cap_price`: **$0.0105/s**, 15s exact **$0.1575**. Basis $0.01/s, verified 2026-08-11. App ceiling $0.1575. | Duration/prompt wrapper-valid. Seamless-loop acceptance is **blocked** unless wrapper exposes/maps `ambience:true`, or product accepts ordinary audio loop playback with an audible-seam risk. |
| Seven event cues | App: seven `kind=sfx`, `capability=mirelo-sfx` requests, existing unused keys, exact existing per-cue prompts, each `durationSeconds=3`, `loop=false`. Adapter sends action/model/prompt/duration 3; no loop field. | Same Mirelo route/model. Upstream ordinary SFX supports these durations. Wrapper requires integer 3-15, so all are valid at 3. Do not accept fallback to `music`. | Same URL normalization; expected upstream WAV, app also accepts MP3/Ogg. Semantic correctness and actual duration remain runtime-unverified. | 7 × (3s × $0.0105) = **$0.2205** exact and ceiling. | Wrapper-compatible and bounded. |
| Narration | App: `kind=tts`, `capability=chatterbox-tts`, existing unused key, `text="Welcome to the Lost Colors of the Room-Corner Island. Find every lost color, then enter the glowing portal."`, exactly **107 ASCII characters**, `language="en"`. Adapter sends `create_media {action:"tts", model_override:"chatterbox-tts", text, prompt:text, ...common}`; `language` is not forwarded. | Live detail explicitly requires field **`text` (not `prompt`)**; model `fal-ai/chatterbox/text-to-speech`; output audio/WAV. ObjectQuest includes the correct field, although redundant `prompt` should be removed for least ambiguity. Upstream maximum is 5,000 characters, so 107 is valid. No voice is requested; do not claim a language/voice selection was honored. Named-capability fallback would fail the named Chatterbox acceptance claim. | Wrapper should return top-level URL; upstream output WAV, accepted by magic bytes. App stores transcript and `durationSeconds=0`; it does not inspect actual duration. | `cap_price`: exact **$0.0028** = $0.02625/1k chars × .107. Basis $0.025/1k, verified 2026-08-11. Keep conservative app ceiling **$0.0029**. | Wrapper-compatible and bounded. Text/prompt defect is not present because `text` is included; redundant prompt is a minimal cleanup, not a blocker. |
| Animated postcard | App: `kind=video`, `capability=pixverse-i2v`, existing unused key, `sourceImageAssetId=$approvedPreviewAssetId` (the already stored 129,740-byte JPEG preview), exact existing shot-native prompt, `durationSeconds=5`. Adapter first uploads/reuses that stored image and then sends `create_media {action:"animate", model_override:"pixverse-i2v", source_url:<public HTTPS>, prompt, duration:5, on_i2v_timeout:"wait", quality_gate:false, ...common}`. It sends no resolution/audio choice. | Live route resolves to itself; model `fal-ai/pixverse/c1/image-to-video`; image `source_url` + prompt required; registered duration 1-15; output MP4, described as no audio. Upstream C1 schema supports `resolution` enum `360p|540p|720p|1080p` (default 720p), duration integer 1-15, `generate_audio_switch`, required `image_url`, output video file. Current wrapper schema exposes neither resolution nor audio switch. | Source is compatible because adapter uploads app bytes and receives a public HTTPS URL. Terminal wrapper must flatten to top-level URL. MP4/WebM magic accepted. **App stores width/height as 0**, so it cannot currently record/verify delivered resolution; audio presence is also not inspected. | Registered quote **$0.3413** for 5s, but `cap_price` explicitly says lower bound because the dispatched request is unpinned. Passing `resolution` values to `cap_price` did not change the quote/warning. Upstream per-second prices: no-audio $0.030/$0.040/$0.050/$0.095 and audio-on $0.040/$0.050/$0.065/$0.120 for 360/540/720/1080p. With 5% margin, 5s ranges **$0.1575-$0.6300**. | **Paid-dispatch blocker.** No honest finite option-pinned cap exists through current production wrapper. Do not treat $0.3413 as a maximum. |

`...common` above is exactly `async:true`, the application idempotency key copied to both `idempotency_key` and `session_id`, and the per-request `max_cost_usd` supplied by `JobManager`.

## Output and normalization constraints

- Successful async jobs must end in status `done|completed|succeeded|ok` and expose a top-level `url`. The adapter only normalizes URL media from the top level; nested provider-native `audio`, `audio[]`, or `video` objects are acceptable only if the creative wrapper flattens them first.
- `output_kind` is optional in ObjectQuest's URL path; the requested kind drives storage. `content_type` is advisory only. The store validates actual magic bytes: WAV/MP3/Ogg for audio, MP4/WebM for video.
- MIME compatibility is therefore adequate for the documented upstream MP3/WAV/MP4 outputs. Creative-wrapper flattening, semantic quality, exact duration, loop seams, and delivered video dimensions remain live-runtime unknowns.
- `fallback_fired` must remain null and served capability/model must match the named claim. A technically input-compatible fallback is not evidence for the requested capability.

## Budget

Known conservative state before any new request:

- Current batch ledger/reservations: **$0.7247** (includes the explicitly uncharged failed-music reservation of $0.0315).
- Earlier style spike estimate: **$0.4620**.
- Conservative project total now: **$1.1867**; provider-paid totals remain unknown.

Bounded audio + narration subset:

- Fresh ceiling: $0.0315 + $0.1575 + $0.2205 + $0.0029 = **$0.4124**.
- Batch ledger after: $0.7247 + $0.4124 = **$1.1371**.
- Project total including spike: **$1.5991**; headroom under $10: **$8.4009**.

The previous full proposal `$0.7537` and projected project total `$1.9404` are **provisional, not enforceable**, because they include the lower-bound postcard quote. A theoretical worst-case upstream postcard allowance at 1080p + audio and 5% margin is $0.6300, which would make fresh media $1.0424 and conservative project total $2.2291. This is useful risk sizing only: the current wrapper cannot pin those options or make its estimator enforce that maximum, so it is not an authorized corrected batch.

## Minimal changes required before paid resume

1. Keep the duration fix: validate music/SFX at wrapper-compatible integer 3-15 before reservation; use music 15, ambience 15, and all seven cues 3; version only the already-failed music key. Preserve rows 1-5.
2. Decide loop acceptance explicitly. For genuine loop generation, extend the provider wrapper contract and mapping so Mirelo ambience sends `ambience:true`; expose a documented music-loop mechanism if one exists. Otherwise describe `loop` only as browser playback behavior and mark seamlessness unverified.
3. Remove redundant TTS `prompt` if convenient; retain required `text`. Do not claim `language=en` is provider-controlled unless it is mapped to a supported field.
4. For postcard, extend `create_media` and its estimator to accept/forward a supported `resolution` and `generate_audio_switch`, then quote those exact options and enforce that quote with `max_cost_usd`. An app-only field addition is insufficient because the current MCP schema rejects/omits it. If wrapper work cannot land, omit the postcard from this batch.
5. Record actual video dimensions from downloaded MP4/WebM metadata (or explicitly mark dimensions unknown) instead of persisting `0×0` as if measured.
6. Before dispatch, re-run the same free describe/route/price checks and retain exact response evidence. Runtime media quality remains user hands-on acceptance.

## Product postcard budget-path audit

Read-only follow-up: **2026-09-24**. The normal product path is:

`FinishScreen` / `MediaCards` button → `usePostcard.create()` → local screenshot upload → `POST /api/postcards/:levelId` → `PostcardService.create()` → `JobManager.submitGenerationOrReconcile()` → `estimateRequestCost()` / `SpendLedger.reserve()` → adapter `create_media(max_cost_usd=effectiveRequestLimit)`.

### What the product currently assumes

- `server/postcards/service.ts` declares `POSTCARD_MAX_COST_USD = 0.34125` and passes it as `requestLimitOverrideUsd`.
- `server/livepeer/capabilities.ts` has only `priceUsd`, `priceUnit`, and fallback metadata. It has no price-confidence, tier pin, or `LOWER_BOUND` state. For PixVerse it blindly calculates duration × `$0.06825/s` and calls the result an estimate.
- `JobManager` takes the smaller of the server per-request limit and the postcard override, reserves the static estimate, and forwards that same effective limit as `max_cost_usd`. The ledger protects only against **its own estimate**; it has no evidence that the underlying option-dependent cost is bounded by that number.
- The adapter proves that it sends a wrapper field named `max_cost_usd`. The wrapper documentation calls that a hard cap, but the current read-only evidence does **not** prove what happens when its own estimator is a known lower bound, nor that it learns the final resolution/audio-dependent provider price before dispatch. These are different guarantees and must not be conflated.

Therefore the product does semantically treat the lower-bound rate as a hard cap, without carrying the warning that invalidates that assumption.

### Accidental current pre-dispatch rejection

The normal route currently appears unable to start a fresh postcard for an unrelated rounding reason:

- Raw constant: `0.06825 × 5 = 0.34125`.
- `estimateRequestCost()` always rounds upward to four decimals, producing **$0.3413**.
- `SpendLedger.reserve()` compares `$0.3413 > $0.34125` and throws `BudgetExceededError` before provider submission.

This is fail-closed in today's exact code, but accidental and fragile. Changing the constant to the displayed `$0.3413`, changing rounding, or introducing a different duration would remove it while leaving the lower-bound defect intact. Existing tests do not catch this integration behavior: `PostcardService` tests mock `JobManager`, and the browser postcard test mocks the HTTP route.

There is also a future bypass to guard: `JobManager.retry()` resubmits a failed job with no `providerJobId` using the global server per-request limit, not the postcard's original `requestLimitOverrideUsd`. Polling a job that already has a provider ID is safe reconciliation, but any no-provider-ID resubmission must repeat the bounded-cost gate.

### Minimal explicit fail-closed gate

Add a small cost-confidence predicate at the shared dispatch boundary, for example `isRequestCostEnforceable(request)`. Until exact options can be pinned and quoted, it returns false for `video/pixverse-i2v` and produces a stable non-retryable error such as `cost_not_bounded`.

Apply it in both places that can start a provider request:

1. `JobManager.submitGenerationOrReconcile()`, after returning a matching existing job but before ledger reservation/job creation for a new request.
2. `JobManager.retry()`, only on the branch with no `providerJobId`, before incrementing the retry count or calling `submitGenerationToProvider()`. Existing-provider polling remains allowed.

Map the error through the postcard route/global error handler to a stable fail-closed response (prefer 503 while the capability is temporarily disabled, or 422 for an unsupported request contract). The UI should disable or hide **Create animated postcard** and **Retry postcard** with an honest “temporarily unavailable until generation cost can be bounded” message. A route-only guard prevents paid dispatch but still allows the preceding local screenshot upload; UI gating avoids that unnecessary local mutation.

Required focused tests, using only fake adapters:

- New postcard creation returns `cost_not_bounded`; provider upload/create calls are zero; no ledger entry, application job, or postcard cache entry is created.
- Generic `POST /api/jobs/generate` with the same PixVerse request is equally blocked, so the product route cannot be bypassed.
- Retry of a failed postcard with `providerJobId=null` is blocked before submission and does not increment `retryCount`; retry/status of a job with a provider ID performs reconciliation only and remains allowed.
- A future explicitly pinned, exact-price contract passes the predicate and propagates the exact finite ceiling to both ledger reservation and `max_cost_usd`; test this with a fake provider rather than a paid call.

This explicit gate should replace reliance on the `$0.3413` versus `$0.34125` rounding accident. It does not require investigating or changing the provider wrapper now.

## Upstream references

- PixVerse C1 I2V API: https://fal.ai/models/fal-ai/pixverse/c1/image-to-video/api
- PixVerse C1 pricing page: https://fal.ai/models/fal-ai/pixverse/c1/image-to-video
- Mirelo SFX 1.6 API: https://fal.ai/models/mirelo-ai/sfx1.6/text-to-audio/api
- MiniMax Music v2 API: https://fal.ai/models/fal-ai/minimax-music/v2/api
- Chatterbox TTS API: https://fal.ai/models/fal-ai/chatterbox/text-to-speech/api

## Frozen V1 repair review

Review timestamp: **2026-09-24**. Scope is strictly the immutable base
`3f210c22362a85c9795d57a5f4d820bc2e3c9870` plus patch SHA-256
`51545a6da2322b4112cf43f093eee4e32838f18dc35383b83b06a1af496355f3`
(75,697 bytes), with manifest SHA-256
`0ef722fd60434f507247400b5c2391f6bf18609011d70fff62aefdab40a1375f`.
Patch/manifest hashes, all 21 manifest file hashes, exact 21-file patch scope,
base/HEAD/MERGE_HEAD identities, and reverse-apply check were independently
verified before the source worktree resumed changing.

**APPROVE V1 component only; overall integration remains pending V2.**

- Shared HTTP and adapter validation now rejects non-integer or out-of-range
  music/SFX/video durations outside **3–15 seconds** before JobManager ledger,
  upload, or provider submission. Boundary and rejection tests cover 3, 15, 2,
  16, and 3.5 seconds, including zero ledger/provider calls for HTTP rejection.
- Production audio defaults are music **15s**, ambience **15s**, and seven event
  cues at **3s** each. Provider transforms preserve those durations without
  inventing unsupported `loop` or `ambience` wrapper fields.
- The recovery plan changes only failed music to
  `oq-live-20260924-music-v2`; rows 1–5 retain their keys and must be exact
  ready/request/fallback matches before any fresh audio reservation.
- `--skip-postcard` is mandatory for this resume. The runner emits an honest
  `SKIPPED/BLOCKED` row before request replacement, reservation, upload, or
  submission; it cannot claim full success and plans only the finite fresh
  audio/narration ceiling **$0.4124**. Conservative cumulative project exposure
  becomes **$1.5991** including prior reservations/spike; paid totals remain
  unknown.
- The narration remains the exact 107-character text and uses the required
  `text` field. Runtime wrapper output envelopes, MIME normalization, media
  quality, exact delivered durations, vocals absence, and audible loop seams
  remain unverified. `loop=true` is playback intent/asset metadata only, not a
  seamless-generation guarantee.

V1 deliberately contains no product postcard guard or client/UI files, so it
does not satisfy the postcard fail-closed user flow by itself. That known scope
is assigned to a separately frozen V2. Review V2 only from its new immutable
patch/hash manifest, verifying: typed error mapping, UI prevention of screenshot
upload/new creation/fresh retry, zero ledger/job/cache/provider/retry-count
mutation for unbounded new/no-provider-ID requests, and continued reconciliation
of matching existing jobs and provider-ID polls/saved video.

## Frozen V2 combined decision

Review timestamp: **2026-09-24**. V2 delta SHA-256
`d452eb100f0e9d75613dbeb856a30137c8144d4bf4452778b3e92adf616814c4`
(40,545 bytes); V2 manifest SHA-256
`1b5aaa41687857ef6bec23ba3f96cf69903a138a1be1b36c90d8a3af8aaff4b5`
(7,220 bytes). Both artifact hashes match. Applying immutable V1 and then V2
with `-p2` to base `3f210c22362a85c9795d57a5f4d820bc2e3c9870`
passes. The frozen source matches all **33/33** cumulative manifest SHA-256
values, and the isolated reconstruction matches the patches' final Git blobs.

**APPROVED: base + V1 + V2, with no blocking defects found.**

- `RequestCostNotBoundedError` is stable, nonretryable, and carries
  `code=cost_not_bounded` plus the ordinary-user message “Animated postcards
  are temporarily unavailable.” Both generic job and postcard routes map it to
  HTTP 503 rather than leaking a generic 500.
- New `video/pixverse-i2v` submission is guarded after matching-existing-job
  reconciliation but before adapter validation, job construction, ledger
  reservation, provider upload, or provider submission. Product cache writes
  occur only after a successful submit/reconcile outcome.
- No-provider-ID retry checks the same guard before retry-count/state mutation
  or provider submission. Boot recovery also fails such an unsubmitted request
  closed. Provider-ID retry/polling remains reconciliation-only and matching
  existing jobs are still returned without a replacement submission.
- Client creation is disabled (`canCreate=false`); its `create()` implementation
  cannot capture, encode, upload, or submit. The completion card exposes no
  Create control and shows the unavailable state. Fresh retry is hidden/blocked
  unless the durable job already has a provider ID.
- Existing in-flight provider jobs remain pollable; failed provider-backed jobs
  may be force-polled without resubmission; existing saved postcard videos remain
  playable and downloadable.
- Focused tests substantively assert zero provider calls, zero jobs, zero ledger
  entries, zero cache writes, unchanged retry count/state, stable HTTP payloads,
  no screenshot/upload/create calls in the hook, hidden Create/Retry controls,
  provider-ID polling without submit, and saved-video rendering. Recorded test
  evidence is typecheck PASS; 389 unit, 46 HTTP, 79 focused, 11 runner, and 12
  focused jobs-HTTP tests PASS. No paid or live-mutating validation was rerun.

Residual limitations remain unchanged: postcard creation is unavailable until
the wrapper can pin and price all material options; generated audio/video output
envelopes and media quality remain runtime-unverified; `loop=true` is playback
intent and not proof of seamless generation; user hands-on acceptance remains
pending. The manifest hashes preserve the mixed-EOL worktree bytes, while patch
application yields equivalent canonical LF Git blobs; this is a packaging detail,
not a content mismatch.

## Narration-duration attachment fix

Reviewed commit **`824e00e30a90804ca7c2402d79f43adec6df889a`** against its
sole parent **`437d145a553c0513eb8260df2044028d7d356a87`**. Scope is exactly
five files: `generatedAssetStore.ts` and its test, `jobs/manager.ts` and its
test, and `audio/orchestrator.ts`. Diff check passes.

**APPROVED; no blocking defect found.**

- WAV duration is derived as `dataBytes / blockAlign / sampleRate` after exact
  RIFF-length, chunk-header/chunk-boundary/padding, PCM/float encoding,
  channel/rate/alignment/byte-rate, nonempty-data, and whole-frame checks.
  Malformed or unsupported WAVs fail closed.
- New WAV assets use byte-derived duration. MP3/Ogg retain their supplied
  positive duration; TTS intentionally requires a derivable supported WAV.
- Legacy READY audio reconciliation verifies the complete stable asset
  reference (including provenance, IDs, URL, hash, size, MIME, kind, gain,
  loop, and transcript), then verifies stored byte count and SHA-256 before
  changing only `durationSeconds` in the asset index and job result.
- Reconciliation is idempotent and preserves the media bytes, asset ID,
  application job ID, provider job ID, result asset ID, and provenance.
- `getPublicWithReconciledAudio()` first observes the existing job; a READY job
  is terminal, so it neither polls nor submits. Tests additionally assert zero
  generation-status and submission calls.
- `POST /api/audio` with `action=refresh`, the existing narration job ID, and no
  `levelId` invokes this local reconciliation and returns `readyAssets` without
  calling level persistence. The later attachment helper can then use the
  ordinary API with the positive **8.52s** narration metadata.

Recorded evidence accepted without redundant broad reruns: typecheck PASS,
393 unit tests PASS, 42 focused tests PASS, diff check PASS, nine live WAV files
parsed read-only, and temp-copy reconciliation idempotent. No live/provider or
service mutation was performed by this review.
