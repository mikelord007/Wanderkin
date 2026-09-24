# ObjectQuest v2 acceptance matrix

This matrix maps every verification item in product brief section 10 to a
primary implementation owner, automated evidence, a real-browser scenario,
and any live-provider evidence required. Worker 10 owns cross-feature test
integration; Worker 11 owns independent browser execution and evidence review.
“Planned” means the named evidence must exist before final acceptance—it is not
a claim that the feature currently passes.

## Starting baseline

| Baseline gate | Owner | Automated test | Browser scenario | Live-provider evidence |
| --- | --- | --- | --- | --- |
| Preserve v1 behavior | W10 | `npm run typecheck`, `npm test`, `npm run test:e2e:http` | Re-run both bundled courses and existing editor/import flows | Reuse the recorded Rodin artifact; no new paid job required |
| Recorded 2026-09-24 result | W1 | 253/253 unit/headless and 24/24 HTTP passed; typecheck passed | Not rerun by W1 | No live calls made by W1 |

## Required automated coverage

| ID and acceptance item | Owner | Automated test | Browser scenario | Live-provider evidence |
| --- | --- | --- | --- | --- |
| A1 Existing levels still load | W1 + W7 | `shared/manifest.test.ts` legacy fixture; existing `src/scene/samples.test.ts`; persistence reload test | B1 and B9 | None; bundled assets are sufficient |
| A2 New schema round trips | W1 + W10 | Parse/serialize/parse Lost Colors, media, job, and publication fixtures without loss | B2 and B9 | None for schema behavior |
| A3 Migration compatibility | W1 + W7 | `migrateSceneManifest` legacy fixture plus real saved-level import through Worker 7 route | B1, B8, B9 | None |
| A4 Job deduplication | W2 + W10 | Concurrent identical idempotency-key submissions make one provider call | B6, B10, B18 | Mock required; one bounded live observation for final photo-to-play run |
| A5 Polling, errors, and resume | W2 + W4 + W10 | queued/running/ready/failed, reconnect, process restart, and resume tests | B10 and B11 | Capture real job IDs/states for each capability exercised |
| A6 Partial asset failure | W2 + W6 + W8 + W10 | Optional audio/video failure preserves mesh, course, other assets, publication, and replay | B11 | At least one real or deliberately induced optional-provider failure; no duplicate mesh job |
| A7 Budget rejection | W2 + W10 | Per-request/per-world limit rejects before provider submission and records no zero-cost fiction | Failure message in B6/B10 creation flow | Current `cap_price`/budget evidence; rejection itself should not spend |
| A8 Preview approval and correct input | W4 + W10 | Approved preview identity survives refresh; style selection alone submits nothing; Build uses exact approved asset/settings | B5 and B6 | One real image-edit preview tied to the subsequent bounded mesh request |
| A9 Collectible progression | W5 + W10 | Unique pickup, 0/3→3/3, monotonic color restoration, no duplicate reward | B2 and B7 | None for mechanics; real SFX only for audio claim |
| A10 Finish rules | W5 + W10 | Collect portal gated until required fragments; Explore/Race finish conditions tested independently | B2 and B4 | None |
| A11 Restart and respawn state | W5 + W10 | Checkpoint restore, collected-set consistency, narration one-shot, timer reset | B7 | None |
| A12 Race timing | W5 + W7 + W10 | Countdown, monotonic timer, restart, best time, checkpoint order, version-bound comparison | B4, B7, B13 | None; comparisons are personal/unverified unless server verification is added |
| A13 Stable published versions | W7 + W10 | Publish snapshot, edit private source, assert original `shareId`/manifest/challenge unchanged | B12 and B13 | None |

## Required real-browser scenarios

| ID and acceptance item | Owner | Automated test | Browser scenario | Live-provider evidence |
| --- | --- | --- | --- | --- |
| B1 Play both original bundled levels | W11 (W5 support) | Existing sample/runtime suites | Complete and replay Rodin and Tripo using input controls | None |
| B2 Complete Lost Colors | W11 (W5) | A9/A10 against `shared/fixtures/lost-colors.json` | Collect three fragments, observe staged restoration, activate portal, finish | Generated media only if audible/visual generation is claimed |
| B3 Three styles affect gameplay | W11 (W3) | Style-definition/render mapping snapshots or renderer assertions | Load same object in cartoon, hand-painted, watercolor; compare actual play rendering | Real image-edit evidence for previews; style-to-mesh evidence only for chosen production path |
| B4 Explore, Collect, Race | W11 (W5) | Mode reducer/state-machine suites | Complete one supported goal in each mode | None |
| B5 Upload/capture and object review | W11 (W4) | MIME/size/orientation/crop/isolation error tests | Upload plus supported camera path; inspect, replace, and accept object | Real background-removal evidence only if that step is shipped |
| B6 Approve preview before 3D | W11 (W4) | A8 | Change style, generate/reuse preview, approve, explicitly Build; assert no earlier 3D call | Real image-edit then one real image-to-3D request with matching reference |
| B7 Restart/respawn consistency | W11 (W5) | A11/A12 | Restart race and fall/respawn in Collect without duplicate rewards/stale timer | None |
| B8 Adjust/save course entities | W11 (W7) | Editor mutation and persistence tests for spawn/checkpoints/fragments/portal | Move each supported entity, save, reload editor | None |
| B9 Reload style/mission/audio | W11 (W7 + W6) | Manifest/media round trip through actual store | Save, full refresh, reopen and verify render, quest, and audio references | Reuse recorded real audio assets; no regeneration on reload |
| B10 Resume pending generation | W11 (W2 + W4) | A5 | Refresh/leave during a pending job, resume from My worlds, assert same job ID | One real long-running capability observation when authorized |
| B11 Optional failure preserves level | W11 (W2 + W6 + W8) | A6 | Fail/retry narration or postcard while entering, replaying, saving, and sharing level | Real failure if safely observable; otherwise clearly labeled induced adapter failure |
| B12 Shared course in separate session | W11 (W7) | Published route/storage integration | Publish, open friend link in isolated browser context, play without upload/regeneration | None |
| B13 Race uses same publication | W11 (W7 + W5) | A12/A13 | Open challenge in separate session; verify version ID and target survive creator edits | None |
| B14 Mute/subtitles/focus/reduced motion | W11 (W6 + design) | Audio preferences, one-shot narration, focus order, motion preference tests | Keyboard-only pass; mute channels; subtitles; OS/browser reduced motion | Real narration/music/SFX used for playback evidence |
| B15 Camera denied and invalid input | W11 (W4) | Permission-denied, unsupported, type/size/dimension validation tests | Deny camera, continue with upload; try invalid and oversized files | None; invalid input must be rejected before paid calls |
| B16 Actual gameplay recording | W11 (W8) | Capture lifecycle/export tests | Record real play, preview, download, verify title/time overlay where supported | None; source must be labeled gameplay capture |
| B17 Generated postcard | W11 (W8 + W2) | Async video lifecycle and independent failure tests | Submit screenshot, leave/resume, preview/download finished postcard | One real image-to-video job with provenance and observed cost |
| B18 Replay without generation | W11 (W5 + W7) | Provider call counter remains unchanged across replay | Finish, replay saved world twice, inspect network/job list | No new live jobs; prior asset IDs must be reused |
| B19 My worlds action states | W11 (W4 + W7) | State-to-action mapping for draft/pending/failed/playable/published | Seed each state and verify Resume/Retry/Edit/Play/Share action | A real pending/failed job is useful but not required for every UI state |

## Real-generation and quality gates

| ID and acceptance item | Owner | Automated test | Browser scenario | Live-provider evidence |
| --- | --- | --- | --- | --- |
| L1 Bounded representative objects | W2 + W3 + W12 | Fixture replay and provenance completeness | Review each generated object in preparation and play | Predeclared small matrix, current prices, maximum cost, job IDs, artifacts |
| L2 Appearance and usability, not HTTP only | W3 + W11 | Geometry/collision/course checks | Visual recognizability review plus movement completion/repair evidence | Preserve provider result and assessment; HTTP 200 alone fails this gate |
| L3 Complete real photo-to-play | W12 with W2–W7 | Full integration suite around stored artifacts | Photo review → approved preview → generation → play → save/share | At least one real run through the chosen production path with every claimed capability evidenced |
| L4 Evidence for every claimed AI capability | W12 + capability owner | Validate normalized provenance and durable output | Preview/playback/download the actual output as appropriate | Requested/served capability and model, job ID, timings, cost or explicit unknown, consuming asset |
| L5 Optional features stay out if unverified | Orchestrator + W12 | Feature-flag/routing assertions | Normal onboarding must not expose an unusable optional step | Missing evidence means feature excluded or clearly experimental |
| L6 Do not generalize from one object | W3 + W12 | None can prove arbitrary geometry | Report results per object and device | Keep limitations explicit even after successful runs |
| L7 Bundled outage-ready examples | W5 + W12 | Offline/local asset load tests | Play polished sample with provider unavailable | Clearly labeled bundled example; no claim of a fresh provider run |
| L8 Rendering/loading performance | W11 | Repeatable metrics collection where possible | Measure on named available device/browser against v1 baseline | No universal FPS claim; provider evidence not applicable |

## Final gate

Core acceptance requires all applicable rows to contain actual links/logs or
recorded results, not only planned test names. Passing mocks cannot satisfy a
live-provider cell, and a live provider response cannot satisfy gameplay or
browser usability. Any intentionally deferred row must be labeled optional,
removed from the normal flow, and listed as a concrete limitation.
