# Overnight playtest fixes — historical checkpoint

**Superseded by later user feedback and visual refinement.** The current product is Wanderkin, with a 0.175 m character, wider camera, material/lighting improvements and subsequent hum/landing fixes. Product revision `7ec73b2` passed 505 unit tests, typecheck/build and a real-Chrome smoke. See [VISUAL_REFINEMENT_REPORT.md](VISUAL_REFINEMENT_REPORT.md) and [VISUAL_REFINEMENT_PLAN.md](VISUAL_REFINEMENT_PLAN.md) for current evidence and ownership. Later Opus 5.5 review found and corrected additional material and miniature-visual defects in b9a00e5, 70f9863 and 13ed712. Final validation is recorded in the current report. The user approved the resumed finish-card/share fix; it and its delayed-save guard are now committed and independently approved at product 9b761eb / review 2193c5c. Do not infer current completion or paused status from this historical table.

Implementation checkpoint: product revision `d0c9215`. **All 13 requested changes are implemented, committed and independently verified within the documented scope.** Final Opus verification APPROVED the control fixes in real Chrome: 10/10 focused and gameplay checks passed, including actual mouse access to Sound and repeated failures/retries with the real browser recorder. No remaining item-13 defect was found. Your subjective playtest remains the acceptance step.

Open the app at http://localhost:5173/ and saved worlds at http://localhost:5173/worlds. The separate private generated world remains available at http://127.0.0.1:15173/worlds; its existing legacy hash link is supported too. No saved world was published or replaced by this work.

| Request | Delivered change |
| --- | --- |
| 1. Better name | Mousehold; centralized name/copy, exported bundle/capture names and final screenshot badge updated. Persisted storage/protocol identifiers intentionally stay compatible. |
| 2. New logo | Original SVG mark and wordmark, favicon, boot and app branding. |
| 3. Word wrapping | Revised landing typography and line lengths. |
| 4. Cluttered spacing | Revised spacing, section hierarchy and readable contrast. |
| 5. Responsiveness | Landing, editor and creation layout adjusted; desktop/tablet/mobile checks reported. |
| 6. Real URLs | Paths for worlds, creation, play, editor and share; direct loads, refresh and browser history supported. QA found and verified a fix for an asynchronous navigation race. |
| 7. Editor consistency | Editor uses the shared Mousehold theme; below-fold boot-background leak fixed. |
| 8. Look/Adventure headings | Clear section headings and spacing in the actual CustomizeScreen component. |
| 9. Style examples | One real reference photo and genuine Cartoon, Hand-painted and Watercolor variations of that same photo, with provenance. Examples are distinct from a user's own generated preview. |
| 10. Creepy music | Bundled sustained drone replaced by a cheerful plucked pentatonic phrase, bass and light percussion. Existing private-world audio left untouched. |
| 11. Character and animation | Cohesive welded skinned character, authored blended poses, distance-driven stride and follow-through; readable face and scaled lantern lighting. |
| 12. Tiny character | Actual collider/body reduced from 0.70m to 0.35m with matching camera. Saved spawn/respawn points re-seated on read; saved manifests not rewritten. |
| 13. Gameplay buttons | Real Chrome confirmed lock, movement, mouse-look, M mute, C capture, Escape/Resume and no accidental relock. Final independent check confirmed paused Sound mouse access, mute/slider operation, Resume-only relock and repeated capture-error recovery. Approved. |

## Verification

- Independent combined typecheck and client/server build passed.
- 474 unit tests and 46 HTTP tests passed on the settled product revision before the final screenshot-branding change.
- Delayed and out-of-order navigation fetches were tested in the browser; stale responses no longer navigate the user backwards.
- Soundtrack ships as a tracked WAV, reproduces byte-for-byte from the generator and decodes in the browser.
- Independent gameplay review traced collider, rendering and camera to the same runtime configuration; scale/spawn/idempotency, course and camera tests passed. Character screenshots came from a separate preview harness and are not a claim of full gameplay traversal.
- Responsive and contrast checks passed on the inspected interface routes. Real source/style images were viewed and their original hashes verified.

## Remaining verification limits

- The earlier off-screen browser limitation is resolved: the repository Playwright Chrome harness reached real gameplay in about two seconds. Actual pointer lock was observed, not faked; position/yaw changed under real input. Headed Chrome produced a real capture highlight in the initial production check. Final independent verification passed 10/10 tests, including two consecutive real-recorder failures followed by successful restart attempts and the four deterministic regression tests. The successful headed encoding path was not repeated after the narrow error-recovery fix; no claim of that extra run is made. Console/network were clean.
- The Look/Adventure layout was independently checked through the real component in the design kit; a new paid photo-to-world creation was not run just for visual QA.
- Musical taste, character feel and the overall tiny-world experience need your judgment. No agent claims your subjective approval.
- A small unused configuration prop/diagnostics-label mismatch remains nonblocking; no cleanup was added outside your requested fixes.
- The final screenshot badge change at `837a720` passed batch-2 verification: MOUSEHOLD measures 110.2px inside its 162px pill (25.9px margin per side), no clipping; capture tests 7/7 and typecheck passed. No unnecessary full-suite rerun was performed.

## Batch-2 service and data checks

Read-only checks recorded in `6149700` confirm the root, worlds and sample-play routes, private-world root/worlds/legacy link, and both API health endpoints respond HTTP 200. This confirms serving/route health, not interactive gameplay. All four protected services kept their recorded PIDs. Logo/favicon, source photo, three style previews and provenance serve correctly.

The existing private level still has its ten audio assets in canonical order, narration duration 8.52 seconds, unchanged identity and timestamps. No world, job, provider or storage mutation was made during these checks. No blocker found in this bounded verification scope. Runtime worker model: Claude Sonnet 5, no fallback.

## LivePeer budget

New overnight estimate: **$0.1260 of the additional $10 authorization**, for three style examples. Each used kontext-edit, served by fal-ai/flux-pro/kontext, with no fallback or automatic retries. Music and character required no provider calls.

Historical conservative project total $1.6621 plus this round $0.1260 = **$1.7881**. These are estimates/reservations, not settled paid charges; actual billing remains unknown. Additional round allowance remaining: **$9.8740**. No further media generation is pending.

## Recovery schedule

The coordinator's 03:00 IST September25 recovery pass completed. Its actual-browser verification found and resolved the final two control defects, followed by independent approval. The 08:30 IST handoff wakeup remains scheduled for final state/report reconciliation only; no further feature work, repeated full suites or paid generation is required. Preserve the app and saved worlds for the user's playtest.

Detailed evidence: [verification](playtest-checkpoints/verification.md), [interface](playtest-checkpoints/interface.md), [gameplay](playtest-checkpoints/gameplay.md), [navigation](playtest-checkpoints/navigation.md), [sample music](playtest-checkpoints/sample-audio.md), [coordination plan](OVERNIGHT_PLAYTEST_PLAN.md).


