# Batch-2 checkpoint — item 13 fixes for Finding 1 and Finding 2

Worker: fresh Claude Sonnet worker, coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
Runtime model: **Sonnet 5** (`claude-sonnet-5`), recorded verbatim from this runtime's own
system context.

Started 2026-09-25, following up on `nimbalyst-local/playtest-checkpoints/batch2-controls.md`
(read first, not re-derived). That checkpoint left MAIN at `837a720` read-only and reported two
defects, both scoped for a follow-up fix pass. This checkpoint closes both.

Scope: the two files named in the brief (`src/game/hud/hud.css`, `src/ui/screens/PlayScreen.tsx`),
plus `src/game/hud/Hud.tsx` — added after independent verifier review flagged a scoping gap in
the first landed version of Fix 1 (see "Verifier feedback" below) — plus one new regression test
file and this checkpoint. No other product source touched. Protected ports
5173/8787/15173/18799/15911 confirmed untouched before and after (same PIDs). Disposable ports
used: 15931 (existing harness default), 15941–15955 (this session's runs) and 5174/15975
(product's own e2e default) — all fully closed (`TIME_WAIT`, no `LISTENING` sockets) after each
run. No LivePeer/provider calls, no world created/saved/published, no capture uploaded.

---

## Fix 1 — `src/game/hud/hud.css` + `src/game/hud/Hud.tsx` (scoped to the paused state only)

**Root cause (from the prior checkpoint):** `.oq-hud__top-actions` had `z-index: auto` and the
pause overlay `.oq-hud__overlay` (also `z-index: auto`, later in the DOM) painted on top of it,
so a mouse click on "Sound" while paused never reached the button.

**First version landed (superseded):** a blanket `z-index: 4` on `.oq-hud__top-actions`. An
independent verifier review pointed out that `.oq-hud__overlay` is the *shared* class for five
distinct overlays in `Hud.tsx` — loading, error, completion (`ready && completed`), the
"Click to play" invite (`ready && awaitingPointerLock && !paused && !completed`), and pause
(`ready && paused && !completed`) — and a blanket rule elevates Sound/Pause above *all* of them,
not just the one this fix was meant to touch. That is broader than the reported defect and was
never verified for the other four states.

**Explicit intent, decided and recorded here:** only the **paused** overlay should have its
Sound/Pause buttons reachable by the fix. The completion and invite overlays are intentionally
left with their original (unreachable) stacking — that was not the reported defect, is out of
this fix's scope, and changing it would need its own review of what a user should be able to do
mid-completion-screen or before their first click, which nobody has done. Concretely:

- **Loading** (`!ready`) and **error** (`error !== null`) overlays can never coexist with
  `.oq-hud__top-actions` in the first place — `GameView.tsx` only sets `error` together with
  `setStage("idle")`, and `.oq-hud__top-actions` only renders when `ready` (`stage === "running"`).
  So these two are safe by construction, before any CSS is considered; a blanket rule was never a
  risk to them.
- **Completion** and **invite** *do* coexist with `.oq-hud__top-actions` (both require `ready`,
  same as pause), so a blanket rule genuinely would have exposed Sound/Pause above them. This was
  the real gap the verifier caught.

**Change actually landed:** `Hud.tsx` sets `data-paused={paused && !completed}` on
`.oq-hud__top-actions` — the exact same condition that gates the pause overlay's own render
(`ready && paused && !completed`, with `ready` already implied by this div's parent). `hud.css`
only raises the z-index for that attribute value, leaving the default (no `data-paused`, or
`data-paused="false"`) at its original `z-index: auto` — i.e. completion and invite keep the
pre-fix, unreachable stacking exactly as before.

```diff
 // Hud.tsx
-          <div className="oq-hud__top-actions">
+          <div className="oq-hud__top-actions" data-paused={paused && !completed}>
```

```diff
 /* hud.css */
-.oq-hud__top-actions {
-  position: absolute;
-  z-index: 4;
-  top: 1.1rem;
+.oq-hud__top-actions {
+  position: absolute;
+  top: 1.1rem;
   right: 1.1rem;
   display: flex;
   gap: .5rem;
   pointer-events: auto;
 }
+
+.oq-hud__top-actions[data-paused="true"] {
+  z-index: 4;
+}
```

No forced pointer lock, no broader z-index redesign, no behaviour change to any state besides
pause — a strictly narrower, more targeted version of the original one-line idea, using the
"paused class/state selector" the verifier explicitly said was acceptable.

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
(`channel: "chrome"`, `nimbalyst-local/tmp-batch2-controls/playwright.config.ts`). Four tests,
all against the real production bundle, real `requestPointerLock()`, real click/keyboard input —
nothing forced. No test asserts CSS strings as the pass/fail condition; every assertion is on
observable behaviour (panel visibility, `pointerLockElement`, button text, alert text). One test
does read `data-paused` and `elementFromPoint(...).className` as *diagnostic* context alongside a
real click and its real effect — never as the sole assertion.

1. **Finding 1 regression (paused)** — raw mouse click (no actionability gate) on "Sound" while
   paused opens the panel, the panel's own controls operate (mute toggle flips the persisted
   setting), the pointer stays released throughout (no accidental relock from interacting with
   the panel), and clicking "Resume" is what re-locks.
2. **Finding 1 scoping regression (invite overlay)** — added in response to the verifier's
   scoping concern. Confirms `.oq-hud__top-actions` carries `data-paused="false"` during the
   pre-lock "Click to play" invite screen, that `elementFromPoint` at the Sound button's own
   coordinates still resolves to the invite overlay (not the button), and — the real behavioural
   proof — a raw click there falls through to the overlay's own `onStart` handler (pointer lock
   engages) instead of ever opening the Sound panel. This is the exact pre-fix behaviour,
   unchanged by scoping the elevation to `data-paused="true"`.
3. **Finding 2 regression (×2)** — a *deterministic* recorder-failure fixture (a `MediaRecorder`
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

### Falsification checks (required before trusting the tests)

Two separate falsification passes were run, one per fix:

1. **Original Finding 1 + Finding 2 fixes.** Ran the (then three) new tests against the code
   *before* either fix (`git stash` of only the two source edits, tests kept): **all three
   failed**, with exactly the expected symptoms — `getByRole('group', {name:'Sound'})` never
   appeared while paused; "Finishing gameplay highlight…" stayed at count 1 instead of 0; "Start
   gameplay capture" never reappeared. `git stash pop` restored the fixes and reran: **all three
   passed**.
2. **The scoping itself, after the verifier's feedback.** Temporarily replaced the scoped
   `.oq-hud__top-actions[data-paused="true"] { z-index: 4; }` rule with the original blanket
   `.oq-hud__top-actions { z-index: 4; }` (files backed up first, not committed) and reran just
   the new invite-overlay test: it **failed** — `elementFromPoint` at the Sound button's
   coordinates resolved to the button's own (unclassed) container instead of
   `.oq-hud__overlay`, proving the blanket rule really would have exposed Sound above the invite
   screen. Restored the scoped files and reran: **passed**. This confirms the scoping fix (not
   just the original stacking fix) is load-bearing and actually tested, not incidental.

## Runs performed (bounded, no full-suite rerun)

```
OQ_BATCH2_PORT=15941 npx playwright test … regression-fixes.test.ts        → 3 passed (post-fix, pre-scoping)
OQ_BATCH2_PORT=15942 <same, against git-stashed pre-fix source>            → 3 failed (falsification #1)
OQ_BATCH2_PORT=15943 <same, post-fix again after stash pop>                → 3 passed
OQ_BATCH2_PORT=15944 … controls.test.ts hittest.test.ts paused-hittest.test.ts → 5 passed
  paused-hittest.test.ts now logs `[PAUSED] raw click on "Sound" → panel open = true` (was `false`)
npx tsc -p tsconfig.json --noEmit                                          → clean (after blanket fix)
[verifier scoping feedback received — Hud.tsx + hud.css revised to data-paused scoping]
npx tsc -p tsconfig.json --noEmit                                          → clean (after scoping)
OQ_BATCH2_PORT=15951 … regression-fixes.test.ts (4 tests incl. new invite test) → 1 failed
  (new invite test hit an unrelated test-authoring bug: the raw click on "Sound" fell through to
  the invite overlay's own onClick and started the game, so the test's later explicit "click Play
  again" step timed out — fixed by asserting the fall-through lock directly instead)
OQ_BATCH2_PORT=15952 … -g "invite"                                         → 1 passed (fixed test)
OQ_BATCH2_PORT=15953 … regression-fixes.test.ts (all 4)                    → 4 passed
OQ_BATCH2_PORT=15954 … -g "invite" against a temporary blanket z-index     → 1 failed (falsification #2)
OQ_BATCH2_PORT=15955 … regression-fixes.test.ts + controls/hittest/paused-hittest (all 9) → 9 passed
OBJECTQUEST_E2E_PORT=15975 npx playwright test … tests/e2e/browser/gameplay.test.ts → 2 passed (41.0s)
```

Full 474-unit/HTTP/build rerun explicitly not performed, per brief, for a small scoped CSS +
markup + state-reset fix with a clean focused typecheck and the above targeted/bounded browser
proof.

## Budget

Zero spend this session (typecheck + local Playwright runs only, no provider calls). Overnight
round estimate unchanged at **$0.1260**; conservative project total unchanged at **$1.7881**.

## Verifier feedback addressed (this revision)

The Opus verifier's first-pass review of the landed Fix 1 correctly flagged that
`.oq-hud__overlay` is shared by five overlays and a blanket `z-index: 4` on
`.oq-hud__top-actions` would elevate Sound/Pause above all of them, not just pause. Decision
recorded above: **scope to paused only**, via `data-paused` on the element itself, leaving
completion/invite at their original (unreachable) stacking since neither was the reported
defect. Verified with a real-browser regression test for the invite overlay and a falsification
check proving that test fails against the blanket version. Capture error recovery (Fix 2) is
unchanged from the original review — no further action needed there.

## Handoff

Both findings from `batch2-controls.md` are closed, with Fix 1 now explicitly scoped to the
paused state per verifier feedback. Opus verifier `8926d07f-8c42-4867-b5d1-c809c4ed137e` can
independently rerun:
```
OQ_BATCH2_PORT=<free-port> npx playwright test --config nimbalyst-local/tmp-batch2-controls/playwright.config.ts nimbalyst-local/tmp-batch2-controls/regression-fixes.test.ts nimbalyst-local/tmp-batch2-controls/paused-hittest.test.ts
```
The invite-overlay test in `regression-fixes.test.ts` is the one to check first for the scoping
question specifically. Not expanded to low-priority diagnostic cleanup, animation, or branding —
out of scope for this pass.
