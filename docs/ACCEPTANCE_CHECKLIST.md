# ObjectQuest v2 independent acceptance checklist

Worker 10 maintains this checklist independently from
`docs/ACCEPTANCE_MATRIX.md`. It uses the matrix IDs and wording where they
match product brief section 10, but a checked item must be backed by Worker 10
or Worker 11 evidence. Every item intentionally starts unchecked. Existing v1
evidence is context, not automatic v2 acceptance.

For each status cell, check the box only after recording a test, run log,
artifact, or limitation in the eventual acceptance evidence. “Live-provider”
means a real provider execution is required for the claim; mock-only evidence
must remain labeled as such.

## Starting baseline

| ID and acceptance item | Implemented | Automated | Browser | Live-provider | Limitations |
| --- | --- | --- | --- | --- | --- |
| Q0 Record starting baseline and investigate regressions | [ ] Baseline revision identified | [ ] Typecheck, build, unit, and HTTP results recorded | [ ] Browser baseline attempted and environment blockers recorded | [ ] No live call required | [ ] Device, ports, optional artifacts, warnings, and unrun checks stated |

## Required automated coverage

| ID and acceptance item | Implemented | Automated | Browser | Live-provider | Limitations |
| --- | --- | --- | --- | --- | --- |
| A1 Existing levels still load | [ ] Compatible loader/runtime exists | [ ] Bundled and persisted v1 levels load | [ ] B1 and B9 verified | [ ] None required | [ ] Record any migrated or unsupported fields |
| A2 New schema round trips | [ ] v2 schema and serialization exist | [ ] Lost Colors, media, job, and publication data parse/serialize/parse without loss | [ ] B2 and B9 verified | [ ] None required for schema behavior | [ ] Record intentionally normalized/defaulted fields |
| A3 Migration compatibility | [ ] Legacy migration exists | [ ] `legacy-scene-manifest-v1.json` migrates and imports through persistence | [ ] B1, B8, and B9 verified | [ ] None required | [ ] List lossy mappings and unsupported legacy versions |
| A4 Job deduplication per kind | [ ] Stable per-kind idempotency contract exists | [ ] Concurrent duplicates for preview, mesh, audio, narration, and postcard make one provider submission per kind | [ ] B6, B10, and B18 verified | [ ] One bounded final-run observation linked | [ ] Distinguish same-kind dedupe from independent asset jobs |
| A5 Polling, errors, and resume | [ ] Durable lifecycle and resume paths exist | [ ] Queued/running/ready/failed, reconnect, restart, retry classification, and same-job resume covered | [ ] B10 and B11 verified | [ ] Real job IDs/states captured for claimed capabilities | [ ] State unobserved provider transitions and retry ceilings |
| A6 Partial asset failure | [ ] Optional assets fail independently | [ ] Audio/video failure preserves mesh, course, completed assets, publication, and replay | [ ] B11 verified | [ ] Real or deliberately induced optional failure identified | [ ] Induced failures must not be presented as provider incidents |
| A7 Budget rejection | [ ] Per-request and per-world limits exist | [ ] Rejection occurs before provider submission; unknown cost is never treated as zero | [ ] Creation-flow rejection is understandable | [ ] Current price/budget input recorded; rejection spends nothing | [ ] Record unavailable pricing and configured ceilings |
| A8 Preview approval and correct input selection | [ ] Approval identity is persisted | [ ] Style choice alone submits nothing; Build uses the exact approved asset and settings after refresh | [ ] B5 and B6 verified | [ ] Real approved preview is tied to the bounded mesh request | [ ] Record whether preview is reused, regenerated, or expired |
| A9 Collectible progression | [ ] Lost Colors state exists | [ ] Unique pickups progress 0/3 to 3/3, restoration is monotonic, duplicate rewards are impossible | [ ] B2 and B7 verified | [ ] None for mechanics | [ ] Generated SFX requires separate live evidence |
| A10 Finish rules | [ ] Mode-specific completion exists | [ ] Collect portal gating plus independent Explore and Race finish conditions covered | [ ] B2 and B4 verified | [ ] None required | [ ] State exact goal and portal prerequisites per mode |
| A11 Restart and respawn state | [ ] Reset/restore policy exists | [ ] Checkpoint, collected set, one-shot narration, rewards, and timer state remain consistent | [ ] B7 verified | [ ] None required | [ ] Record deliberate differences between restart and respawn |
| A12 Race timing behavior | [ ] Race lifecycle and records exist | [ ] Countdown, monotonic timer, restart, best time, ordered checkpoints, and version-bound comparison covered | [ ] B4, B7, and B13 verified | [ ] None required | [ ] Label records unverified unless server verification exists |
| A13 Stable published course versions | [ ] Immutable publication exists | [ ] Editing a private source cannot change the original share ID, manifest, or challenge | [ ] B12 and B13 verified | [ ] None required | [ ] Record deletion/availability policy for published assets |

## Required real-browser scenarios

| ID and acceptance item | Implemented | Automated | Browser | Live-provider | Limitations |
| --- | --- | --- | --- | --- | --- |
| B1 Play both original bundled sample levels | [ ] Rodin and Tripo remain available | [ ] Sample/runtime regression suites pass | [ ] Complete and replay both using real input controls | [ ] None required | [ ] Record device/browser and any control assistance |
| B2 Complete a Lost Colors sample adventure | [ ] Lost Colors sample is playable | [ ] A9 and A10 pass against `lost-colors.json` | [ ] Collect three fragments, observe staged color restoration, activate portal, and finish | [ ] Only required for generated media claims | [ ] Separate mechanics evidence from media evidence |
| B3 Verify all three styles affect gameplay rendering | [ ] Cartoon, Hand-painted, and Watercolor mappings exist | [ ] Renderer mapping assertions pass | [ ] Compare the same object in actual play in all three styles | [ ] Real preview edits evidenced; mesh styling only for the chosen path | [ ] Screenshots alone do not prove gameplay usability |
| B4 Exercise Explore, Collect, and Race | [ ] All three modes are reachable | [ ] Mode state-machine and finish suites pass | [ ] Complete one supported goal in each mode | [ ] None required | [ ] Record mode-specific shortcuts or shared behavior |
| B5 Upload or capture an image and review the object | [ ] Upload and supported capture paths exist | [ ] Type, size, dimensions, orientation, crop, and isolation errors covered | [ ] Upload, exercise supported camera flow, inspect, replace, and accept | [ ] Background removal only if shipped/claimed | [ ] Record unavailable camera/device paths |
| B6 Approve a style preview before 3D generation | [ ] Preview approval gates Build | [ ] A8 passes | [ ] Change style, preview, approve, then Build; prove no earlier 3D request | [ ] Matching real image-edit and image-to-3D request evidenced | [ ] Network evidence must identify exact approved input |
| B7 Restart and respawn without duplicate rewards or stale timers | [ ] Both actions are available | [ ] A11 and A12 pass | [ ] Restart Race and fall/respawn in Collect | [ ] None required | [ ] Record reward, checkpoint, narration, and timer observations |
| B8 Adjust and save course entities in the editor | [ ] v2 entities are editable | [ ] Spawn/checkpoint/fragment/portal mutation and persistence pass | [ ] Move each supported entity, save, reload editor, and compare | [ ] None required | [ ] List any read-only generated entities |
| B9 Reload a saved level with style, mission, and audio intact | [ ] v2 persistence stores all references | [ ] Full store round trip passes | [ ] Save, fully refresh, reopen, and verify rendering, quest, and audio | [ ] Reuse recorded assets without regeneration | [ ] Record missing media fallbacks and cache behavior |
| B10 Resume a pending generation after refresh | [ ] My worlds exposes pending jobs | [ ] A5 passes | [ ] Refresh or leave during generation, resume, and retain the same job ID | [ ] One real long-running capability observed when authorized | [ ] Do not synthesize an unobserved real provider state |
| B11 Optional audio/video failure does not lose the level | [ ] Optional failure UI is isolated | [ ] A6 passes | [ ] Fail/retry narration or postcard while level remains playable, saveable, and shareable | [ ] Real or clearly labeled induced failure | [ ] Preserve successful assets; no mesh regeneration |
| B12 Open a shared course in a separate browser session | [ ] Friend route is public/playable as designed | [ ] Publication route/storage integration passes | [ ] Publish, open in isolated context, and play without upload or regeneration | [ ] None required | [ ] Record authentication and asset-visibility assumptions |
| B13 Race comparisons use the same published course | [ ] Challenge binds an immutable version | [ ] A12 and A13 pass | [ ] Open challenge separately; creator edits do not change version ID or target | [ ] None required | [ ] Label client-reported times if not server verified |
| B14 Exercise mute, subtitles, keyboard focus, and reduced motion | [ ] Preferences and accessible controls exist | [ ] Audio preferences, narration one-shot, focus order, and motion preference covered | [ ] Keyboard-only pass, mute channels, toggle subtitles, and enable reduced motion | [ ] Real narration/music/SFX required for playback claims | [ ] Record unsupported touch/screen-reader combinations separately |
| B15 Verify camera-denied/upload alternatives and invalid-input errors | [ ] Fallback and validation UI exist | [ ] Permission, format, size, and dimension rejection pass before billing | [ ] Deny camera, continue with upload, and try invalid/oversized files | [ ] None required | [ ] Error copy must be useful and preserve prior safe state |
| B16 Preview/download an actual gameplay recording | [ ] Gameplay capture/export exists where supported | [ ] Capture lifecycle and export tests pass | [ ] Record real play, preview, download, and inspect title/time overlay | [ ] None required | [ ] Label output as gameplay capture; list browser support |
| B17 Preview/download a generated postcard after a real job | [ ] Postcard flow exists | [ ] Async video lifecycle and independent failure tests pass | [ ] Submit screenshot, leave/resume, preview, and download result | [ ] One real image-to-video job with provenance and observed/unknown cost | [ ] Do not substitute gameplay footage for generated postcard evidence |
| B18 Replaying a saved world submits no new generation jobs | [ ] Replay reuses persisted assets | [ ] Provider call count stays unchanged | [ ] Finish and replay twice while inspecting network/job list | [ ] Confirm zero new live jobs | [ ] Existing asset IDs and publication version must remain stable |
| B19 My worlds exposes correct state-specific actions | [ ] Draft/pending/failed/playable/published states exist | [ ] State-to-action mapping passes | [ ] Verify Resume, Retry, Edit, Play, and Share against seeded/real states | [ ] Real pending/failed state useful but not required for every state | [ ] Clearly label seeded versus provider-observed states |

## Real-generation, outage, and performance gates

| ID and acceptance item | Implemented | Automated | Browser | Live-provider | Limitations |
| --- | --- | --- | --- | --- | --- |
| L1 Use a bounded representative-object matrix | [ ] Matrix and maximum spend approved | [ ] Provenance fixtures validate | [ ] Review every generated object in preparation and play | [ ] Current prices, job IDs, outputs, timings, and costs/unknowns recorded | [ ] Results apply only to tested objects |
| L2 Validate appearance and gameplay usability, not HTTP success | [ ] Review rubric exists | [ ] Geometry/collision/course checks pass | [ ] Confirm recognizability and complete or repair each course | [ ] Preserve provider artifacts | [ ] HTTP success alone is insufficient |
| L3 Complete one real photo-to-play run on the production path | [ ] End-to-end path is connected | [ ] Stored-artifact integration passes | [ ] Photo review through play and save/share completes | [ ] Every claimed AI capability in the run has real evidence | [ ] One success does not prove arbitrary geometry |
| L4 Obtain evidence for every claimed AI capability | [ ] Provenance model covers all capabilities | [ ] Normalized provenance validates | [ ] Actual output is previewed, played, or downloaded | [ ] Requested/served capability and model, job ID, timing, cost/unknown, and consumer recorded | [ ] Catalog/health/history are not own-run evidence |
| L5 Keep unverified optional features out of normal flows | [ ] Feature gating exists | [ ] Flag/routing assertions pass | [ ] Normal onboarding omits or labels unavailable options | [ ] Missing evidence prevents a production claim | [ ] Experimental paths remain clearly isolated |
| L6 Preserve outage-ready bundled examples | [ ] Polished local examples exist | [ ] Offline/local asset load passes | [ ] Play with provider unavailable | [ ] None required | [ ] Bundled worlds are visibly distinguished from live-generated worlds |
| L7 Assess rendering/loading performance against baseline | [ ] Repeatable measurement path exists | [ ] Metrics collection is repeatable where feasible | [ ] Measure on a named device/browser against v1 | [ ] None required | [ ] Report observations, not universal FPS guarantees |
