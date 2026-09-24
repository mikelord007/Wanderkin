# Batch-2 checkpoint — item 13 live pointer-lock verification

Worker: fresh batch-2 Claude worker, coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
Runtime model: **Opus 5** (`claude-opus-5`), recorded verbatim from this runtime's own system
context — not inferred, and not externally verified against a newer alias.
Started 2026-09-25 ~03:05 IST. Product revision under test: MAIN **`837a720`**, tracked source
tree clean (only pre-existing untracked `nimbalyst-local/*` artifacts).

Scope: **read-only on product code**. No `src/`, `server/`, `shared/` or `tests/` file was edited.
Own paths only: this file, `nimbalyst-local/tmp-batch2-controls/` (verification harness) and
`nimbalyst-local/screenshots/batch2-controls/`. No LivePeer calls, no world created/saved/published,
no capture uploaded. Protected ports 5173 / 8787 / 15173 / 18799 (and 15911) confirmed untouched
before and after; disposable Vite servers ran on 15921 and 15931–15939 and are all shut down.
Private world storage `…/sudden-stone/storage/live-validation-2026-09-24` not read or written.

---

## Headline result: the "headless 3D stall" was an automation limitation, not a product bug

Every previous worker reported the scene stuck in *"Rendering first frame / geometry prep"* and
therefore could not close item 13. That was a property of the MCP off-screen browser surface they
were using, **not** of the product.

The repo's own Playwright harness (`@playwright/test`, `channel: "chrome"`) reaches full
pointer-locked gameplay in **~1.9–2.7 seconds**, first try, every run:

```
READINESS: real pointer lock + first frame in 1964 ms, collisionTriangles=50000
LOCK IS LIVE: WASD moved the player and raw mouse motion turned the camera while locked
```

`document.pointerLockElement` was **observed, never faked**; no internal game state was forced. The
lock is proven live, not merely flagged: `WASD` moved `playerPosition` and raw mouse motion changed
`cameraYaw`, both read from the production `window.__objectquest` diagnostics.

As a baseline, the product's own pre-existing suite also passes unmodified at `837a720`:

```
npx playwright test --config tests/e2e/browser/playwright.config.ts tests/e2e/browser/gameplay.test.ts
  2 passed (46.5s)
```

That suite already asserts real `pointerLockElement` through Play → lock → Escape → Resume → relock
→ completion → replay. **Item 13's live pointer-lock gap is closed** — the flow works.

---

## What was verified working, end to end, in a real browser

| Behaviour | Result | Evidence |
| --- | --- | --- |
| Click-to-Play → real pointer lock | PASS | `pointerLockElement !== null`, ~2 s, 50 000 collision triangles |
| Movement + mouse-look while locked | PASS | player position and `cameraYaw` both change under lock |
| `M` mute / unmute while locked | PASS | `objectquest:audio-settings:v1.muted` flips true→false; lock held across a sustained 500 ms poll |
| `C` start capture while locked | PASS | button flips to "Stop gameplay capture"; lock held across a sustained 800 ms poll |
| `C` stop capture while locked | PASS (headed only) | "Gameplay highlight ready"; blob kept in memory, never downloaded/uploaded |
| `Escape` → Paused, lock released | PASS | "Paused" heading; `pointerLockElement === null` |
| `Resume` → re-lock | PASS | lock re-acquired |
| "Start gameplay capture" button, lock released | PASS | raw mouse click starts recording |
| No accidental re-lock from HUD interaction | PASS | lock stays null across sustained polls after release |
| Console / network during the whole flow | CLEAN | no `pageerror`, no console error/warning, no failed request |

Screenshots: `nimbalyst-local/screenshots/batch2-controls/`
(`01-pointer-locked-gameplay.png`, `02-capture-started-by-C-still-locked.png`,
`03-paused-overlay-covers-sound-button.png`, `04-sound-panel-opened-via-keyboard.png`).

**Miniature scale, incidentally confirmed in the production camera** (`01-…png`): the character
reads as a cohesive authored figure, not assembled primitives, and the desk is genuinely enormous
beside it. This is a plausibility observation from the real runtime, **not** a subjective acceptance
claim — that remains the user's.

---

## FINDING 1 — real defect: the pause overlay covers the HUD "Sound" button

**Severity: medium. This is the one part of item 13 that is genuinely not delivered for a mouse user.**

There is **no state in which a mouse user can open the in-game Sound panel.**

1. **While pointer-locked** — the Pointer Lock spec routes *all* mouse events to the lock target
   (the canvas), so a click never reaches the button. Verified with a raw CDP mouse click at the
   button's centre (no actionability gate — exactly what a physical mouse does):

   ```
   PROBE (pointer locked): raw click on "Sound" → panel opened = false, still locked = true
   PROBE (pointer locked): raw click on "Start gameplay capture" → recording = false, still locked = true
   ```

   Consequence: `Hud.tsx`'s `onRequestPointerRelease?.()` and `PlayScreen.tsx`'s
   `releasePointerLockForOverlay()` — the mechanisms added to make these buttons usable — **can never
   run while locked**, because they live inside the click handler of a button the click cannot reach.
   They only ever fire once the lock is already released. This part is browser-mandated, not fixable
   by the app; the keyboard shortcuts are the correct answer and they work.

2. **While paused (lock released)** — the Sound button is *covered by the pause overlay*:

   ```
   [PAUSED, lock released] Sound           → topmost = div.oq-hud__overlay   (button is 2nd in the stack)
   [PAUSED, lock released] Start capture   → topmost = button                 (reachable)
   [PAUSED] raw click on "Sound" → panel open = false
   [PAUSED] raw click on "Start gameplay capture" → recording = true
   ```

**Root cause (exact):**
- `src/game/hud/hud.css:96` `.oq-hud__top-actions` — `position: absolute`, **no `z-index`** (auto).
- `src/game/hud/hud.css:314` `.oq-hud__overlay` — `position: absolute; inset: 0; pointer-events: auto`,
  also `z-index: auto`, and rendered **later in the DOM** (`Hud.tsx:263` vs `Hud.tsx:208`). Equal
  stacking level + later in tree ⇒ the overlay paints on top and swallows the clicks.
- By contrast `.oq-hud__sound` (`hud.css:110`) *does* carry `z-index: 4`, and
  `.oq-capture-controls` (`src/capture/media.css:1`) carries `z-index: 20` — which is exactly why the
  capture button and the opened panel are reachable while the button that opens the panel is not.

Visible in `03-paused-overlay-covers-sound-button.png`: "Sound" and "Pause" are blurred *behind*
the overlay, while "Stop gameplay capture" renders crisply *above* it.

**There is one working route**, keyboard-only: `Esc` → `Tab` to "Sound" → `Enter` opens the panel,
and the panel is then fully operable (it sits above the overlay at `z-index: 4`).

```
[PAUSED] Sound button reachable by Tab within 25 stops = true
[PAUSED] Enter on Sound → panel open = true; topmost element over the panel = input
```

So the accessible/keyboard half of item 13 is sound; the mouse half is not.

**Minimal required fix scope — one CSS rule, no behaviour change:** give `.oq-hud__top-actions` a
stacking level above `.oq-hud__overlay` (e.g. `z-index: 4`, matching `.oq-hud__sound`) in
`src/game/hud/hud.css`. Nothing else needs to move; no TS/TSX change, no schema, no IDs.
*Not edited — reporting first, per the brief. Awaiting focused-fix ownership from the coordinator.*

---

## FINDING 2 — real defect: a failed capture leaves the control permanently dead

**Severity: low–medium (only reachable when a recording fails, but then it is unrecoverable).**

`src/ui/screens/PlayScreen.tsx:51-58` — the recorder's state callback sets `captureState` only for
`recording` / `stopping` / `ready`. On `"error"` it sets `captureError` but **never resets
`captureState`**, which is left at `"stopping"`. Therefore:

- the UI shows `"Finishing gameplay highlight…"` forever, next to the error alert;
- the "Start gameplay capture" button never comes back;
- `handleToggleCapture` (`PlayScreen.tsx:81-84`) only acts on `"recording"` or `"idle"`, so the `C`
  key is inert too.

The player cannot retry capture for the remainder of that play session.

Reproduced deterministically (headless Chrome cannot encode `canvas.captureStream`, which supplies
the error; the *dead-end* is product logic, not environment):

```
OBSERVED: capture stop ended in error — "The browser produced an empty gameplay recording."
FOLLOW-UP after capture error: still showing "Finishing gameplay highlight…" = true;
                               "Start gameplay capture" offered again = false
```

Headed Chrome produced a real highlight on one run and an empty recording on another (window
occlusion changes whether frames are produced), so **an empty recording is reachable on real
hardware**, not a headless-only artifact — which makes the dead-end genuinely user-facing.

**Minimal required fix scope:** in the `state === "error"` branch of `startCapture`, also return
`captureState` to a retryable value (`"idle"`) alongside `setCaptureError`. One file,
`src/ui/screens/PlayScreen.tsx`. *Not edited — awaiting ownership.*

---

## Not a defect, but worth the coordinator knowing

Releasing the lock for a HUD overlay auto-pauses the game after 600 ms
(`GameView.tsx:352-360`) — deliberate, documented in that comment, and it is what makes the pause
overlay appear over the Sound button in Finding 1. The 600 ms window is the only moment the Sound
button is mouse-clickable, which is not a usable affordance. Any fix for Finding 1 should keep this
auto-pause; only the stacking needs to change.

---

## Residual limits — stated plainly

- **Subjective acceptance is untouched.** Nothing here claims the controls *feel* good, that the
  music is pleasant, or that the character reads well. That is the user's playtest.
- `C`-stop producing a real highlight is confirmed **headed only**; headless Chrome cannot encode
  `canvas.captureStream`. The start path and lock retention are confirmed in both.
- Capture artifacts stayed in-page as ephemeral blobs. Nothing was downloaded, uploaded, published
  or generated. No paid provider call of any kind was made.
- The final screenshot-watermark delta at `837a720` was not re-validated by a full suite rerun here;
  the pre-existing `gameplay.test.ts` passing at this exact HEAD is the only new evidence for it.

## Budget

Zero spend this session. Overnight round estimate unchanged at **$0.1260** of the additional $10;
conservative project total unchanged at **$1.7881**. No reservations made or released.

## Reproduce

```
OQ_BATCH2_PORT=15931 npx playwright test --config nimbalyst-local/tmp-batch2-controls/playwright.config.ts
OQ_BATCH2_HEADED=1 …   # visible Chrome; needed for the C-stop highlight happy path
```
Harness: `nimbalyst-local/tmp-batch2-controls/` — `controls.test.ts` (item-13 flows),
`hittest.test.ts` and `paused-hittest.test.ts` (stacking/hit-test diagnostics),
`evidence.test.ts` (screenshots). Disposable ports, isolated from every protected service.
