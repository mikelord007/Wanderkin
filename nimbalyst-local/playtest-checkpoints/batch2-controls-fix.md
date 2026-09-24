# Batch-2 checkpoint — item 13 fixes for Finding 1 and Finding 2

Worker: fresh Claude Sonnet worker, coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
Runtime model: **Sonnet 5** (`claude-sonnet-5`), recorded verbatim from this runtime's own
system context.

Started 2026-09-25, following up on `nimbalyst-local/playtest-checkpoints/batch2-controls.md`
(read first, not re-derived). That checkpoint left MAIN at `837a720` read-only and reported two
defects, both scoped for a follow-up fix pass. This checkpoint closes both.

Scope: exactly the two files named in the brief, plus one new regression test file and this
checkpoint. No other product source touched. Protected ports 5173/8787/15173/18799/15911
confirmed untouched before and after (same PIDs). Disposable ports used: 15931 (existing
harness default), 15941–15945 (this session's runs) and 5174 (product's own e2e default) — all
fully closed (`TIME_WAIT`, no `LISTENING` sockets) after each run. No LivePeer/provider calls,
no world created/saved/published, no capture uploaded.

---

## Fix 1 — `src/game/hud/hud.css`

**Root cause (from the prior checkpoint):** `.oq-hud__top-actions` had `z-index: auto` and the
pause overlay `.oq-hud__overlay` (also `z-index: auto`, later in the DOM) painted on top of it,
so a mouse click on "Sound" while paused never reached the button.

**Change:** added `z-index: 4` to `.oq-hud__top-actions` (line 96–103), matching the existing
`.oq-hud__sound` panel's stacking level. One property, no other rule touched, no behaviour
change, no forced pointer lock, no broader z-index redesign.

```diff
 .oq-hud__top-actions {
   position: absolute;
+  z-index: 4;
   top: 1.1rem;
   right: 1.1rem;
   display: flex;
   gap: .5rem;
   pointer-events: auto;
 }
```

## Fix 2 — `src/ui/screens/PlayScreen.tsx`

**Root cause (from the prior checkpoint):** the recorder's state callback in `startCapture`
only updated `captureState` for `"recording" | "stopping" | "ready"`. On `"error"` it set
`captureError` but left `captureState` stuck at whatever it was (`"stopping"`), so the UI stayed
on "Finishing gameplay highlight…" forever and neither the button nor `C` could start again
(`handleToggleCapture` only acts on `"recording"` or `"idle"`).

**Change:** the `"error"` branch now also resets `captureState` to `"idle"`, alongside the
existing `setCaptureError`. No new state values, no new refs, no new machinery — reuses the
existing retryable `"idle"` state that the `"idle"` render branch and `handleToggleCapture`
already handle.

```diff
       if (state === "error") {
         const message = recorder.error?.message ?? "Gameplay recording stopped unexpectedly.";
         recordingErrorRef.current = message;
         setCaptureError(message);
+        setCaptureState("idle");
       }
```

`startCapture` already clears `captureError` (`setCaptureError(null)`) at the top of every new
attempt, so a stale error message from a prior failed run does not linger once a new recording
starts — this was already correct and needed no change. `stopCapture`'s own catch block (for a
rejected `recorder.stop()`) relies on the same `onStateChange("error")` path to reset
`captureState`, so no separate fix was needed there. Unmount/dispose contract unchanged:
`recorderRef.current?.dispose()` on unmount stops the underlying `MediaRecorder`/tracks exactly
as before; a new `startCapture()` call always creates a fresh `GameplayRecorder` and reassigns
`recorderRef.current`, so a stale failed recorder is never reused.

---

## Regression coverage — `nimbalyst-local/tmp-batch2-controls/regression-fixes.test.ts`

New Playwright file (own path, not touching `controls.test.ts`/`hittest.test.ts`), same harness
(`channel: "chrome"`, `nimbalyst-local/tmp-batch2-controls/playwright.config.ts`). Three tests,
all against the real production bundle, real `requestPointerLock()`, real click/keyboard input —
nothing forced. No test asserts CSS strings; every assertion is on observable behaviour (panel
visibility, `pointerLockElement`, button text, alert text).

1. **Finding 1 regression** — raw mouse click (no actionability gate) on "Sound" while paused
   opens the panel, the panel's own controls operate (mute toggle flips the persisted setting),
   the pointer stays released throughout (no accidental relock from interacting with the panel),
   and clicking "Resume" is what re-locks.
2. **Finding 2 regression (×2)** — a *deterministic* recorder-failure fixture (a `MediaRecorder`
   stand-in installed via `page.addInitScript` that never emits a `dataavailable` event) drives
   the production code's own `blob.size === 0` guard in `src/capture/recorder.ts`'s `finish()`,
   which is exactly the path Finding 2 reproduced. This replaces reliance on headless Chrome's
   incidental inability to encode `canvas.captureStream()` — the prior checkpoint noted that
   headed Chrome could produce *either* a real highlight or an empty one depending on window
   occlusion, so the absence of frames is not a reliable signal to build a test on. The fixture
   makes the failure deterministic on any Chromium, headed or headless, while leaving pointer
   lock, keyboard routing and the button DOM completely real.
   - Test A: error surfaces (`role=alert` text), the "Finishing gameplay highlight…" status is
     gone (not stuck), "Start gameplay capture" is back, pointer lock is still held throughout,
     retry via the `C` key works, and a *second* failure recovers the same way (not a one-shot
     fix).
   - Test B: the same recovery via a direct click on the button (not just the keyboard shortcut),
     with the pointer already released (paused-then-resumed-less path, i.e. the button's own
     click handler).

### Falsification check (required before trusting the tests)

Ran all three new tests against the code *before* the two fixes (`git stash` of only the two
source edits, tests kept): **all three failed**, with exactly the expected symptoms —
`getByRole('group', {name:'Sound'})` never appeared while paused; "Finishing gameplay
highlight…" stayed at count 1 instead of 0; "Start gameplay capture" never reappeared. Then
`git stash pop` restored the fixes and reran: **all three pass**. This confirms the tests
exercise the real defects, not tautologies.

## Runs performed (bounded, no full-suite rerun)

```
OQ_BATCH2_PORT=15941 npx playwright test --config nimbalyst-local/tmp-batch2-controls/playwright.config.ts nimbalyst-local/tmp-batch2-controls/regression-fixes.test.ts
  → 3 passed (post-fix)
OQ_BATCH2_PORT=15942 <same, against git-stashed pre-fix source>
  → 3 failed (expected — falsification check)
OQ_BATCH2_PORT=15943 <same, post-fix again after stash pop>
  → 3 passed
OQ_BATCH2_PORT=15944 npx playwright test --config nimbalyst-local/tmp-batch2-controls/playwright.config.ts nimbalyst-local/tmp-batch2-controls/controls.test.ts nimbalyst-local/tmp-batch2-controls/hittest.test.ts nimbalyst-local/tmp-batch2-controls/paused-hittest.test.ts
  → 5 passed — paused-hittest.test.ts now logs
    `[PAUSED] raw click on "Sound" → panel open = true` (previously `false`)
npx tsc -p tsconfig.json --noEmit
  → clean, no errors
npx playwright test --config tests/e2e/browser/playwright.config.ts tests/e2e/browser/gameplay.test.ts
  → 2 passed (46.5s → this run 41.9s), unchanged baseline, product's own suite, port 5174 default
```

Full 474-unit/HTTP/build rerun explicitly not performed, per brief, for a two-file scoped CSS +
state-reset fix with a clean focused typecheck and the above targeted/bounded browser proof.

## Budget

Zero spend this session (typecheck + local Playwright runs only, no provider calls). Overnight
round estimate unchanged at **$0.1260**; conservative project total unchanged at **$1.7881**.

## Handoff

Both findings from `batch2-controls.md` are closed. Opus verifier `8926d07f-8c42-4867-b5d1-
c809c4ed137e` can independently rerun:
```
OQ_BATCH2_PORT=<free-port> npx playwright test --config nimbalyst-local/tmp-batch2-controls/playwright.config.ts nimbalyst-local/tmp-batch2-controls/regression-fixes.test.ts nimbalyst-local/tmp-batch2-controls/paused-hittest.test.ts
```
Not expanded to low-priority diagnostic cleanup, animation, or branding — out of scope for this
pass.
