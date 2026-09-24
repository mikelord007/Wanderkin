# Independent QA verification — items 6, 10, 13

Worker: fresh Claude-only QA/review worker, coordinator 30e37344-f303-4b8a-80c8-ee9f8fd5f3d6 (session 15c3b0c2-6158-40c2-a52d-926f2afa4f7e per the ledger).
Runtime model: **Sonnet 5** (`claude-sonnet-5`), per this runtime's own system context — recorded verbatim, not inferred.
Scope: read-only source review + targeted runtime validation of completed items 6 (real routes), 13 (pointer-lock/HUD controls), 10 (friendly sample music). No source/test edits made. No moving-interface/character diff reviewed (out of scope; still owned by Opus be45d8ac / Opus f4268081, both actively editing — did not touch their dirty files).
Own paths only: this file, and `nimbalyst-local/tmp-qa-verify/` (one small `.mjs` helper; large regenerated WAVs already deleted after use).

Reviewed at HEAD `07d9d82468e08a2263928c036dc0a8964d2fd917` (2026-09-24 ~17:13 UTC). Verified no commit after my four target commits touched any of the files I reviewed (`git log 3b159b1..HEAD -- <routing/pointer-lock/audio files>` shows only `dfd33db` itself) — so these findings are not stale relative to the moving shared tree. Interface/gameplay owners are still landing unrelated work (character scale, etc.) concurrently; not reviewed here.

Exact commits verified against the checkpoints' claims — all four hashes matched exactly, nothing invented:
- `398c7ebecf9f8d67cc20421119920ef2cc4d219f` — feat: give every screen a real, restorable URL
- `c15ddaa8a6f69f72f3c83c0fe98919ee38fe231f` — fix: make Sound and gameplay capture usable while pointer-locked
- `722f9fa17064f46a4c680b0eb4b6e21986ccf3e4` — chore: use BRAND_SLUG for the gameplay highlight filename stem
- `3b159b13abe720d35214c3017b9cf2a2dd87abfc` — docs: record peer coordination
- `dfd33dbc307874fc4ca2f58ea0812851989585fe` — fix: replace creepy bundled landing-page music with a cheerful pluck loop

## Item 6 — real URL routes

**Source review + live verification, dev server at http://localhost:5173/ (read-only GET traffic only).**

Confirmed working, via a real headed... actually headless Chromium session through the nimbalyst-browser MCP tool (this session's `browser_evaluate` worked correctly, including a real `AudioContext.decodeAudioData` call — unlike the prior worker's report of a non-functional tool; noting the discrepancy honestly, may be session/state-dependent):
- `/` loads the start screen.
- `/worlds` loads and scrolls to `#my-worlds` (`scrollY` moved from 0 to 729, target element found).
- `/#my-worlds` (legacy hash) also resolves to `/` + scrolls identically — legacy link preserved.
- `/this-route-does-not-exist` falls back to the start screen at `/` (matches `parseRoute`'s `unknown -> start` branch and `resolveSyncScreen`'s `unknown` case).
- `/play/sample-rodin-room-corner` (a real bundled-sample id, confirmed via `GET /api/levels`) resolves synchronously without a network fetch, as designed.
- `/edit/level-0ed836ff` (a real saved level, confirmed via `GET /api/levels`) resolves asynchronously via `getLevel` and lands in the editor ("Adjust your course" — an existing, pre-existing course-validation warning on that saved level, unrelated to this review).

### Confirmed bug: async-load race on rapid back-navigation (not caught by any existing test)

Reproduced live, not just reasoned from source. `App.tsx`'s `resolveScreen()` returns a `Promise<Screen>` for `edit`/`play`/`finish`/`share-play` routes (`App.tsx:174-188`). Both the initial-load effect (`App.tsx:254-269`) and the `popstate` handler (`App.tsx:271-287`) call `.then(resolved => { setScreen(resolved); navigateTo(pathForScreen(resolved), true); })` on whatever promise `resolveScreen` returns, with **no cancellation/generation guard** tied to a newer navigation superseding an older, still-in-flight one. (The initial-load effect's `cancelled` flag only guards true React-unmount, not a subsequent `popstate`.)

Live repro: patched `window.fetch` to add a 900ms delay only for `GET /api/levels/level-0ed836ff`, then via `history.pushState` + a dispatched `popstate` event: navigated to `/edit/level-0ed836ff` (slow async resolution starts), waited 100ms, then navigated to `/` (synchronous, resolves immediately — user is now legitimately at the start screen, confirmed via `location.pathname === "/"` at that point). After the delayed fetch finally resolved (~900ms later), the app **silently snapped the user back into the editor** for `level-0ed836ff` and rewrote the URL back to `/edit/level-0ed836ff` via `navigateTo(..., true)` (a `history.replaceState` call, confirmed by `location.pathname` after settling) — even though the user had already navigated away. This is a real, user-visible correctness bug: a slow `/edit/:id`, `/play/:id`, `/finish/:id`, or `/share/:id/play` load, combined with the user pressing Back (or any other navigation) before it finishes, can un-navigate them back into stale state.
- Not covered by `routing.test.ts` (which only tests the pure `parseRoute`/`pathFor*`/`navigateTo` functions, no React/App integration) — there is no `App.test.tsx` at all.
- Severity: real but narrow — requires a slow API response *and* the user navigating again within that window. Worth a fix (a generation counter or `AbortController` tied to each `resolveScreen` call, discarding a resolution if the URL has since changed) but not necessarily a release blocker; flagging for the coordinator/navigation owner to decide, not fixing myself (out of my read-only scope).

Not independently re-verified: `/share/:shareId` and `/share/:shareId/play` against a real publication — deliberately avoided triggering a publish as a side effect (read-only scope, no publication actions), same call the navigation worker made. `shareRouting.test.ts` and `routing.test.ts`'s path round-trip remain the only coverage for that path shape.

One environment note for whoever does the next headless check: the first `browser_evaluate` that triggered a full 3D editor mount (WebGL) on `/edit/level-0ed836ff` took long enough that the browser-tool round trip itself timed out at 30s, even though the page had not actually crashed (a follow-up `evaluate` call afterwards succeeded instantly and showed the editor had in fact finished loading). This is consistent with the earlier-reported "headless 3D stalls at first frame" pattern — here it eventually resolved, just very slowly, rather than hanging forever. Treat any single 30s tool timeout around a `/edit` or `/play` navigation as inconclusive on its own, not proof of a hang — a follow-up `evaluate` after the timeout can reveal the page actually finished.

## Item 13 — pointer-lock controls

**Source review** (this session did not get a stable pointer-locked 3D gameplay session running headless within a reasonable time budget — see the environment note above — so the click-to-play → lock → HUD-interaction flow was not interactively exercised end to end this session either; unit-level keyboard-path coverage is not proof the UI works, per the review brief, so treating this as source-verified, not interactively confirmed):

- `requestPointerLock()` call sites, independently grepped: exactly 3, all in `GameView.tsx` (`handleStart` line 465, `handleResume` line 474, `handleRestart` line 503) — all explicit Play/Resume/Restart user gestures. No HUD click handler (Sound, Pause, capture buttons) calls it. This directly confirms the "no accidental relock" claim by source inspection, not just trusting the checkpoint's own grep count.
- `Hud.tsx`'s Sound button (line ~211) calls `props.onRequestPointerRelease?.()` before toggling the panel, as claimed.
- `inputController.ts`'s `handleKeyDown`: `isInteractiveTarget(event.target)` guard applies before Escape/M/C (so HUD form controls keep normal keyboard behavior); `event.repeat` is checked (line 102) before the `KeyM`/`KeyC` branches (lines 104-111), so a held-down key doesn't spam-toggle mute/capture. Escape is handled before the repeat check (matches "Escape always fires even mid-repeat" being intentional).
- End-to-end wiring for `C` traced through all four files: `inputController.ts` (`onToggleCapture` callback fired on `KeyC`) → `GameView.tsx` (`onToggleCaptureRef` — a ref, so it can't go stale without an effect re-run) → `PlayScreen.tsx` (`onToggleCapture={handleToggleCapture}`, line 145) — single source of truth, no duplicate listener, matches the checkpoint's "no double-toggle risk" claim.
- Controls legend in `Hud.tsx` (`Controls()`) lists `M`/`C` for discoverability, as claimed.

No new issues found in this item beyond what the navigation worker already disclosed (headless 3D can't be interactively exercised end-to-end in this environment). The keyboard-path fix is sound by source inspection; genuine interactive confirmation (click-to-play → real pointer lock engage → HUD button unreachable by click → M/C actually mute/capture while locked) is still owed to the user's own manual playtest, consistent with the plan's explicit stance that automated evidence should not substitute for the user's subjective playtest.

## Item 10 — sample music

**Verified beyond what the sample-audio worker could check themselves** (their own checkpoint honestly flagged their browser-decode tool as non-functional in their session):

- `public/audio/lost-colors-loop.wav` is genuinely tracked and committed at `dfd33db` (`git show --stat` confirms `Bin 96044 -> 176444 bytes` in that commit, not gitignored — `git check-ignore` returns nothing). Working-tree file is byte-identical to the committed one (not in `git status`'s modified list). sha256 of the actual on-disk file (`90167b3cad74...b7051`) matches `src/audio/bundledMedia.ts`'s recorded hash exactly.
- **Reproducibility on a clean checkout, actually tested, not assumed**: copied `scripts/generate-bundled-audio.mjs` into `nimbalyst-local/tmp-qa-verify/` with only the output directory redirected (all synthesis logic untouched), ran it with plain `node`, and diffed the resulting `lost-colors-loop.wav` against the shipped file — **byte-identical sha256** (`90167b3c...`). Confirms the generator is a genuine pure/deterministic function of its code and the shipped asset is not stale or hand-edited relative to it. (Regenerated-WAV temp output deleted after the hash comparison; did not touch `public/audio/`.)
- **Real browser decode, actually obtained this session** (the prior worker's tool attempt returned empty for every expression): fetched `/audio/lost-colors-loop.wav` from the live dev server and ran `AudioContext.decodeAudioData` on the real bytes in a real (headless) browser. Result: `byteLength: 176444` (matches), `contentType: audio/wav`, decoded successfully, `duration: 4` seconds (matches recorded metadata), browser resampled to its native `48000` Hz (expected/normal — source is authored at 22050 Hz). No decode error, no truncation.
- Did not attempt a live-storage/private-world audio check (out of scope, explicitly a different asset per the sample-audio worker's own diagnosis, which this review did not need to re-litigate).
- Seam jump: the sample-audio worker disclosed a ~1.8%-of-peak amplitude jump at the loop-wrap point from their own waveform math. Did not independently re-derive this (would require reimplementing the trim/loop-point math against the decoded buffer); no audible or runtime evidence contradicts their "small soft transient, not a click" characterization, and per the review brief this alone should not block on a tiny documented splice without further evidence. Leaving as accurately disclosed, not escalating.

**Verdict: item 10's asset genuinely ships, is reproducible from source, and decodes/plays correctly in a real browser context.** No issues found.

## Summary for coordinator

- Item 6: implementation is real and mostly correct; **one genuine, reproduced-live bug** — an async-navigation race that can snap the user back into a stale screen (e.g. the editor) after they've already navigated away, if the route's data fetch is slow enough to outlast the next navigation. Not covered by any existing test (no `App.test.tsx` exists). Recommend the navigation owner (or whoever gets fix-scope) add a generation/abort guard to `resolveScreen`'s async branches. Not release-blocking on its own (narrow timing window) but should be fixed before calling item 6 fully done.
- Item 13: source-verified sound; no new issues. Still genuinely unconfirmed end-to-end interactively (headless 3D limitation, not this worker's fault) — real confirmation is owed to the user's own manual playtest as the plan already anticipated.
- Item 10: verified ships, reproducible, and decodes/plays correctly — stronger confidence than the original worker could self-report, no issues found.

No source or test files were modified. No paid/provider calls made. No live services restarted (ports 5173/8787/15173/18799 untouched). No worlds created, no saves/generation triggered — all API calls made were `GET` (`/api/levels`, `/api/levels/level-0ed836ff`, the audio file itself). Private world audio and saved positions untouched.

## Next step

Full combined verification across all three active owners is still pending their final milestones (interface, gameplay) per the plan — not started here, correctly deferred. If resumed after a quota gap: re-read this file, re-run `git log --oneline -5` to confirm the four target commits are still present and still not touched by anything newer, and re-check `git status` for what interface/gameplay have landed since before doing anything else.
