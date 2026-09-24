# ObjectQuest v2 independent acceptance checklist

Snapshot: **2026-09-24**, integrated revision `764d1dd`. This checklist is an
evidence map, not a single release checkbox. **Implemented** means the code path
exists. **Automated/browser** means a named local check passed. **Live** means
ObjectQuest itself submitted or recovered a real provider job. **Hands-on** is
the user's visual, audio, and gameplay judgment. `N/A` means that dimension is
not required for the acceptance item; it does not mean “unverified.”

## Verification baseline

- [x] `npm run typecheck` passed at `764d1dd`.
- [x] The live-runner suite passed 7/7 and the focused provider-neutral saved-
  world copy case passed 1/1 in Chrome at `764d1dd`.
- [x] The full browser suite passed **37**, skipped **6**, and failed **0** of
  43 cases on isolated port 55210 at `764d1dd`. The run also observed three WAV
  requests and zero runtime errors for B14. The temporary servers were stopped.
- [x] The preceding broad revision passed **371 unit tests and 44 HTTP tests**.
  They were intentionally not rerun for the later runner/docs/evidence/test-only
  delta, so this is dated prior-revision evidence, not a fresh `764d1dd` run.
- [x] An earlier production build passed after quest/audio integration; it was
  not rerun for the later runner/docs/evidence/test-only delta.
- [ ] No hosted-origin, backup/restore, or final user hands-on run exists.

Primary reports: [`worker11-suite-results-2026-09-24.md`](qa/evidence/worker11-suite-results-2026-09-24.md),
[`worker11-gameplay-visuals-2026-09-24.md`](qa/evidence/worker11-gameplay-visuals-2026-09-24.md),
[`worker11-performance-2026-09-24.md`](qa/evidence/worker11-performance-2026-09-24.md),
and [`LIVE_VALIDATION_RESULT_2026-09-24.md`](LIVE_VALIDATION_RESULT_2026-09-24.md).
The final 37/6/0 report supersedes earlier in-flight browser counts; it does not
turn skipped cases into passes.

Concrete automated anchors include
[`shared/manifest.test.ts`](../shared/manifest.test.ts),
[`server/jobs/manager.test.ts`](../server/jobs/manager.test.ts),
[`server/audio/orchestrator.test.ts`](../server/audio/orchestrator.test.ts),
[`server/quest/orchestrator.test.ts`](../server/quest/orchestrator.test.ts),
[`server/postcards/service.test.ts`](../server/postcards/service.test.ts),
[`server/publications.test.ts`](../server/publications.test.ts),
[`src/audio/audio.test.ts`](../src/audio/audio.test.ts),
[`src/capture/recorder.test.ts`](../src/capture/recorder.test.ts),
[`src/game/modes/session.test.ts`](../src/game/modes/session.test.ts),
[`scripts/live-validation/run.test.ts`](../scripts/live-validation/run.test.ts),
[`audio-accessibility.qa.test.ts`](../tests/e2e/browser/qa/audio-accessibility.qa.test.ts),
and [`provider-copy.qa.test.ts`](../tests/e2e/browser/qa/provider-copy.qa.test.ts).
These files identify the contracts behind the summary; their presence is not a
substitute for the dated run results above.

## Required automated coverage

| ID | Acceptance item | Implemented | Automated/browser evidence | Live/hands-on boundary |
| --- | --- | --- | --- | --- |
| A1 | Existing levels still load | Yes | Manifest compatibility plus B1 bundled/persisted replay | Live provider N/A; user feel still open |
| A2 | New schema round trips | Yes | Manifest, persistence, publication, audio, quest, and postcard references covered | Live provider N/A for serialization |
| A3 | Migration compatibility | Yes | Legacy fixture import/migration covered | N/A; lossy/defaulted fields remain contract-defined |
| A4 | Job deduplication per kind | Yes | Manager, audio orchestrator, preview, mesh, narration, and postcard dedupe tests; B6/B10/B18 contracts | Real rows must retain provenance; do not infer all-kind live proof |
| A5 | Polling, errors, and resume | Yes | Job manager/store, live runner, B10, and My Worlds paths | **Partial live:** rows 1–4 ready; row 5 provider-complete but app recovery pending |
| A6 | Partial asset failure | Yes | Optional quest/audio/postcard failure tests preserve playable core | Induced/mock failures are not provider incidents |
| A7 | Budget rejection | Yes | Per-request, per-world, global, and rolling-day pre-submit checks in HTTP/unit coverage | No paid rejection required; actual provider billing remains unknown |
| A8 | Preview approval/input selection | Yes | B5/B6 and provider-request-copy case passed | Real Kontext output exists; exact visual approval remains user-owned |
| A9 | Collectible progression | Yes | Unique 0/3→3/3 progression and duplicate prevention; B2 visual evidence | Generated SFX live proof separate |
| A10 | Finish rules | Yes | Collect portal plus Explore and Race completion covered in B2/B4 | N/A |
| A11 | Restart/respawn state | Yes | State-machine/unit coverage and integrated browser suite | Final hands-on game-feel review open |
| A12 | Race timing | Yes | Countdown, timer, restart, best time, ordered checkpoints, and B4/B13 contracts | Times are client-reported, not server-verified |
| A13 | Stable publication versions | Yes | Publication tests and isolated B12/B13 version-bound play | No deployed-origin refresh or revocation proof |

## Required browser scenarios

| ID | Scenario | Current evidence | Remaining gate |
| --- | --- | --- | --- |
| B1 | Play both original bundled samples | Passed and replayed in Worker 11 full-suite evidence | User replay optional, not a provider gate |
| B2 | Complete Lost Colors | Passed with four restoration stages and portal completion | User game-feel/audio judgment |
| B3 | See all three styles in gameplay | Cartoon, Hand-painted, and Watercolor same-scene screenshots plus histogram deltas | Visual difference is not proof of arbitrary-object quality |
| B4 | Exercise Explore, Collect, Race | All three mode goals completed in Chrome | User game-feel judgment |
| B5 | Upload/capture and review object | Upload/review/crop/accept covered; camera availability limitation recorded | Target-device camera lifecycle remains unverified |
| B6 | Approve preview before 3D | Mocked paid-route flow and exact request copy passed; one real Kontext output exists | User visual approval and recovered full live run |
| B7 | Restart/respawn cleanly | Mechanics covered by tests/integrated suite; exact skipped-case mapping was not supplied | User hands-on confirmation remains open |
| B8 | Adjust/save course entities | Real local API save/reload editor case passed | Generated course repair still awaits live world |
| B9 | Reload style, mission, audio | Persistence/reference tests and saved-world browser coverage exist | No saved current live-validation world |
| B10 | Resume pending generation | Seeded same-job resume/My Worlds and live-runner reconciliation covered | Row-5 force-poll recovery still pending |
| B11 | Optional media failure preserves world | Unit/HTTP/browser contracts cover independent failure | No real provider failure claimed |
| B12 | Open share separately | Isolated browser context opened and played publication | No deployed direct `/share/:id` refresh |
| B13 | Compare same published race | Isolated context retained immutable version/target after private edit | Client-reported timing limitation applies |
| B14 | Mute/subtitles/focus/reduced motion | Integrated browser run observed three WAV requests and zero runtime errors; preference/accessibility tests pass | Generated narration/music/SFX and target-device listening unverified |
| B15 | Camera denied/upload fallback/errors | Fallback and validation code/tests exist; prior camera-unavailable path recorded | Final physical-device denial flow is user-owned |
| B16 | Gameplay recording preview/download | Capture/export implementation and browser contracts are integrated | User inspection and browser support matrix remain open |
| B17 | Generated postcard preview/download | Async screenshot/cache/retry/preview/download implementation and tests are integrated | **No real image-to-video execution**; do not substitute B16 footage |
| B18 | Replay without new jobs | Passed twice with zero generation POSTs | Confirm on final live world after recovery |
| B19 | My Worlds actions | Seeded draft/pending/failed/playable actions passed | Current live world has not reached save |

The final integrated report contains six skipped tests, but the supplied report
does not enumerate their IDs. This checklist therefore does not invent an
ID-to-skip mapping; individual scenario wording above uses only named reports,
source/test contracts, and explicitly supplied observations.

## Live-generation and release gates

| ID | Gate | Status at this snapshot |
| --- | --- | --- |
| L1 | Bounded representative-object matrix | **Partial.** Batch is capped below the user's $10 ceiling; rows 1–5 were submitted for one object only. A second object is not authorized yet. |
| L2 | Judge appearance and usability, not HTTP success | **Open.** Rows 1–4 produced artifacts, but the user has not accepted recognizability/course feel. Provider success alone is insufficient. |
| L3 | One current real photo-to-play path | **Open.** Background removal, two image edits, and mesh are ready. Quest row 5 needs zero-spend recovery; no saved/playable/shared validation level exists. |
| L4 | Evidence for every claimed AI capability | **Open.** Own execution exists for background removal, Kontext, GPT image edit, Rodin, and provider-side quest text. Music, ambience, SFX, TTS, and image-to-video have no real execution. |
| L5 | Keep unverified optional features out of core acceptance | **Pass with caveat.** Audio/postcard failures are optional and fall back; optional companion work remains gated. Demo wording must label bundled versus generated media. |
| L6 | Outage-ready bundled example | **Implemented/automated.** Lost Colors and bundled audio load without provider calls. User outage-path rehearsal remains open. |
| L7 | Compare performance with baseline | Worker 11 recorded six 20-second Chrome samples and build size | Observational only; no universal FPS claim or hosted-origin measurement |

## Outstanding acceptance decisions

- [ ] Land and verify the narrow nested quest-response adapter fix, then
  force-poll provider job `mjob_13e739e8d5af` without resubmitting it.
- [ ] Submit authorized rows 6–16 only after that recovery; record actual cost
  as unknown wherever the provider returns no metered value.
- [ ] Save, repair if necessary, play, complete, publish, and reopen the current
  generated world without new generation requests.
- [ ] User accepts or rejects preview/mesh identity, course usability, quest,
  generated audio/subtitles, postcard labeling/playback, and photo-free share.
- [ ] Verify a dedicated same-origin deployment, direct share refresh, durable
  media, pending-job resume, and backup/restore. No authorized target exists.

One successful provider object, if achieved, is evidence only for that object
and configuration; it does not prove arbitrary geometry.
