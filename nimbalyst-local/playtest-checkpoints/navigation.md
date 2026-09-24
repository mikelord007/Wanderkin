# Navigation + pointer-lock worker checkpoint

## Reopened: item 6 async-navigation race (fixed)

Independent QA (`nimbalyst-local/playtest-checkpoints/verification.md`, "original" item 6 section) reproduced
a real, live bug: `resolveScreen`'s async branches (`edit`/`play`/`finish`/`share-play`) had no supersession
guard. A slow `/api/levels/:id` fetch that outlasted a subsequent navigation (Back/Home/another route) would
still land its `.then` — silently snapping the user back into the stale screen *and* rewriting the URL back
via `navigateTo(..., true)` (`history.replaceState`). Neither the initial-load effect's `cancelled` boolean
(only guards a real React unmount, which the root `App` never does) nor the `popstate` handler (had no guard
at all) caught this.

Fix: `src/ui/routing.ts` gains `createNavigationGuard()` — a token counter where `begin()` (called at the
start of *every* navigation attempt: initial load, each `popstate`, every in-app `go()`) invalidates any
earlier attempt, and `isCurrent(token)` is checked before an async resolution's `.then` is allowed to call
`setScreen`/`navigateTo`. Covers out-of-order settling too (an older attempt's promise can resolve *after* a
newer one without being applied), and covers a resolved *fallback* the same as a resolved success (the
route resolvers never reject — a failed fetch already resolves to a fallback `Screen` like `start`, so
"still current" is the only thing that matters). `src/App.tsx`'s `go()`, the initial-resolution effect, and
`onPopState` all now go through it.

Regression tests added to `routing.test.ts` (4 new, all passing) using a controlled `deferred<T>()` helper —
not just `parseRoute` coverage: (1) the exact reported scenario (stale `/edit/:id` resolution must not
overrule a later Home navigation), (2) out-of-order settling of two competing async navigations, (3) a stale
*fallback* result treated the same as a stale success, (4) an un-superseded result still applies normally
(no false-positive suppression).

Live-verified with the same bounded, read-only repro QA used (delayed `GET /api/levels/level-0ed836ff` via a
patched `window.fetch`, `pushState`+`popstate` to `/edit/level-0ed836ff` then `/` before the fetch resolves):
user now correctly stays on `/` after the delayed fetch finally settles (previously snapped back into the
editor and rewrote the URL). Re-confirmed a legitimate, un-superseded direct load to `/edit/level-0ed836ff`
still resolves correctly (no regression). No live-world/provider mutation — only `GET` traffic, same as QA's
own repro.

Scope discipline: did not touch the disclosed-but-nonblocking `GameStageProps.config` dead-code/diagnostics
finding (QA's finding #1, gameplay-owned file, explicitly flagged as non-blocking pending the gameplay
freeze) — out of scope for this reopened item per the coordinator's instruction.

Session: NEW Claude-only overnight worker, coordinator 30e37344-f303-4b8a-80c8-ee9f8fd5f3d6.
Model: Sonnet 5 (model id `claude-sonnet-5`, per this runtime's own system context — not inferred from a requested alias).
Owns: items 6 (real URL routes) and 13 (pointer-lock/HUD usability) from OVERNIGHT_PLAYTEST_PLAN.md.
Baseline: recognized MAIN at 1de4f28. No worktree created; working directly on MAIN per instructions.

## Exclusive ownership (this worker only)
`src/App.tsx`, `src/main.tsx`, `src/ui/shareRouting*`, `src/ui/routing*` (new),
`src/ui/screens/PlayScreen.tsx`, `FinishScreen.tsx`, `CaptureScreen.tsx`,
`src/ui/components/PlayFrame.tsx`, `AudioControls.tsx`,
`src/game/GameView.tsx`, `src/game/input/*`, `src/game/hud/*`,
`src/capture/*` (only if needed for input wiring).
Not touching: global styles/theme, StartScreen/CustomizeScreen/editor, `src/game/render/*` or `core/*` (Opus), `src/audio/*`, shared/server/package files.

## Plan (item 6 — real URL routes)

New `src/ui/routing.ts`: pure `parseRoute(pathname)` / `pathFor*()` builders / `navigateTo(path, replace)`
(history wrapper that preserves the hash so old `#my-worlds` links survive). Kept `src/ui/shareRouting.ts`
untouched/reused (`/share/:shareId` semantics preserved exactly, including API `/api/shares/*` and `/share/`
prefix compatibility).

Routes: `/` (start), `/worlds` (start, scrolled — also fixes the legacy `#my-worlds` anchor, which never
worked reliably on a cold SPA load), `/create` (photos), `/create/generating/:jobId`, `/create/prepare`,
`/create/prepare/:assetId`, `/edit/:levelId`, `/play/:levelId`, `/finish/:levelId`, `/share/:shareId`
(unchanged), `/share/:shareId/play`.

`App.tsx` gets a `resolveScreen(pathname)` that returns either a `Screen` synchronously (start/worlds/create/
generation — all resolvable from existing localStorage resume state, unchanged logic) or a `Promise<Screen>`
for the routes that need a refetch on a cold load (`/edit/:id` -> `getLevel`, `/play/:id` -> bundled-sample
match then `getLevel`, `/share/:id/play` -> `getSharedLevel`). `/finish/:id` is a deliberate redirect-only
route: the completion result/screenshot/highlight are ephemeral and were never persisted server-side, so a
direct load or refresh there resolves to `/play/:id` instead of a broken Finish screen (the "useful
missing-state fallback" the plan asks for) — Finish is only ever reached in-app, right after `onComplete`.
Every existing `setScreen(...)` call becomes `go(screen)`, which also pushes the matching path via
`pathForScreen`. A `popstate` listener re-runs the same `resolveScreen` so back/forward genuinely restores
state instead of just changing the URL. `document.getElementById("my-worlds")` is scrolled to directly from
App (not by editing StartScreen, which I don't own) for both `/worlds` and the legacy hash link.

Status: DONE and committed (398c7ebecf9f8d67cc20421119920ef2cc4d219f). Full vitest (401/401) and tsc --noEmit
clean (aside from a pre-existing, unrelated Logo.tsx error from a concurrent peer worker). Manually browser-
verified: `/`, `/worlds` (scrolls), `/#my-worlds` (legacy, scrolls), `/play/sample-explore-rodin` (bundled
sample resolves without a network fetch), `/edit/level-0ed836ff` (real saved level refetched via `getLevel`
and opened in the editor), `/finish/level-0ed836ff` (redirects to `/play/level-0ed836ff` as designed),
`/this-route-does-not-exist` (falls back to `/`), refresh on `/play/:id`, and back/forward across all of the
above. Not live-tested: `/share/:shareId` and `/share/:shareId/play` against a real publication — didn't want
to publish a new version of a live saved world as a side effect just to test; covered instead by
`shareRouting.test.ts` (untouched) and `routing.test.ts`'s path build/parse round trip for `share-play`.

## Plan (item 13 — pointer-lock/HUD usability)

Root cause: while the pointer is locked, a real click on an HTML control overlaid on the canvas (Sound,
Pause, Start/Stop gameplay capture) is not reliably delivered to that control in every browser — the OS
cursor is hidden/frozen, so hit-testing does not reach an element positioned away from the lock point. Escape
already reliably releases lock (`InputController.releasePointerLock` + `onPauseRequested`, tested in
`inputController.test.ts`) and is keyboard-driven, so it's unaffected.

Fix: (1) `Hud`'s Sound button explicitly releases pointer lock before opening the panel (a new
`onRequestPointerRelease` prop wired to `runtime.input.releasePointerLock()` in `GameView`), reusing the
existing `suppressNextUnlockPause` + 600ms grace-period fallback so the game settles into the existing Paused
state (with Resume) rather than a new bespoke state — no new simulation contract. (2) New keyboard shortcuts
usable *while locked* (not dependent on click delivery at all): `M` toggles mute directly in `GameView`,
`C` toggles gameplay capture — wired from `PlayScreen` via a `GameViewHandle` (`forwardRef` +
`useImperativeHandle`) exposing `releasePointerLockForOverlay()`, so the Start/Stop gameplay capture button
also explicitly releases lock before its own click handler runs. (3) No handler anywhere calls
`requestPointerLock()` except the explicit Play/Resume buttons — verified no accidental re-lock on any HUD
click.

Status: implemented, typechecked, and unit-tested; ready to commit next.

- `src/game/input/inputController.ts`: `InputControllerCallbacks` gains optional `onToggleMute`/
  `onToggleCapture`, fired on `KeyM`/`KeyC` (guarded by the same `isInteractiveTarget`/`repeat` checks as
  every other binding). New tests in `inputController.test.ts` (2 added, all passing).
- `src/game/types.ts`: new `GameViewHandle` (`releasePointerLockForOverlay`); `GameViewProps` gains optional
  `onToggleCapture`. Re-exported from `src/game/index.ts`.
- `src/game/GameView.tsx`: now `forwardRef<GameViewHandle, GameViewProps>`; wires `M` to
  `audio.setSettings({...,muted:!muted})` and `C` to the new `onToggleCapture` prop (both read through a
  ref so they never go stale without needing the asset-loading effect to re-run); exposes
  `releasePointerLockForOverlay` via `useImperativeHandle`; passes a new `onRequestPointerRelease` into
  `Hud`. No new `requestPointerLock()` call sites — grepped to confirm still exactly the original 3
  (Start/Resume/Restart) — so nothing can trigger an accidental relock.
- `src/game/hud/Hud.tsx`: Sound button now calls `onRequestPointerRelease` before toggling the panel; added
  `M`/`C` to the on-screen controls legend for discoverability.
- `src/ui/screens/PlayScreen.tsx`: holds a `GameViewHandle` ref; Start/Stop gameplay capture buttons call
  `releasePointerLockForOverlay()` before their own action; `onToggleCapture` passed into `GameView` wires
  the same start/stop through the `C` keyboard shortcut (single source of truth — no duplicate listener, so
  no double-toggle risk).

Root-cause reasoning (why this is the real fix, not a guess): while the pointer is locked the OS cursor is
hidden and effectively frozen, so a browser's hit-test for a `click` on a control positioned away from the
lock point is not reliable — this is why Sound/Pause/Start-Gameplay-Capture were reported as unusable during
play. Escape already worked because it's a `keydown`, unaffected by cursor hit-testing; `M`/`C` extend that
same keyboard path to mute and capture so both are genuinely usable while locked, not just after leaving
pointer lock. The Sound button's explicit release-before-toggle covers the browsers/cases where the click
after release still needs a real cursor.

Not verified in-browser: this repo's headless browser sessions stall the 3D scene at "Rendering first
frame" even with WebGL2 available in the page (matches the pre-existing "Full headless 3D scene stalled in
geometry preparation" note already on record from an earlier worker) — so the actual click-to-play,
pointer-lock-engage, then Sound/Capture-click flow could not be interactively exercised this session.
Confidence instead rests on: the unit-tested keyboard paths (the primary, reliable fix), a full pass over
every `requestPointerLock()` call site (still only the original 3, all explicit Play/Resume/Restart
gestures), and clean mount-through-loading-stage behavior with no console errors (confirms the `forwardRef`
+ `React.lazy` combination in PlayScreen works). Flagging this gap explicitly rather than claiming full
interactive verification — the user's own manual playtest is the way to close it.

## Tests / verification planned
- `npx vitest run src/ui/routing.test.ts` (done, 8/8 passing).
- New `src/game/input/inputController.test.ts` additions for `KeyM`/`KeyC` callbacks.
- Manual browser check via nimbalyst-browser MCP: load `/`, `/worlds`, `/play/:id`, `/edit/:id`, refresh each,
  back/forward between them, confirm `/share/:id` and `#my-worlds` still work.
- Full `npx vitest run` before committing to check for regressions outside my owned files.

## Commits
1. `398c7ebecf9f8d67cc20421119920ef2cc4d219f` — feat: give every screen a real, restorable URL
   (`src/App.tsx`, `src/ui/routing.ts`, `src/ui/routing.test.ts`).
2. `c15ddaa8a6f69f72f3c83c0fe98919ee38fe231f` — fix: make Sound and gameplay capture usable while
   pointer-locked (`src/game/input/inputController.ts`(+test), `src/game/types.ts`, `src/game/index.ts`,
   `src/game/GameView.tsx`, `src/game/hud/Hud.tsx`, `src/ui/screens/PlayScreen.tsx`).

Both items 6 and 13 are done, typechecked, and committed. `git status` confirms no uncommitted changes in any
owned path. Full `npx vitest run`: 435/437 passing; the 2 failures are pre-existing, in
`src/game/render/character/characterAnimator.test.ts`, entirely inside `src/game/render/*` which belongs to
the Opus character/animation worker (untracked/in-progress on this MAIN) — not touched or caused by this
worker.

## Peer coordination received mid-session
- Gameplay worker f4268081-ebbc-45db-bbed-dfe12e5b8c8a owns 5 numeric defaults in `shared/movement.ts`; I
  already import the central `DEFAULT_MOVEMENT_CONFIG` in `GameView.tsx` with no local fork — no action
  needed, acknowledged.
- Interface owner's brand contract (product renamed **Mousehold**, `src/brand.ts` / `src/ui/components/
  Logo.tsx`): grepped `PlayScreen.tsx`/`FinishScreen.tsx`/`CaptureScreen.tsx` for hard-coded "ObjectQuest"
  copy — none found, nothing to sweep. Delegated narrow edit done: `src/capture/recorder.ts`'s fallback
  download-filename stem now reads `BRAND_SLUG` instead of a literal `"objectquest"` (commit
  `722f9fa17064f46a4c680b0eb4b6e21986ccf3e4`). Left `api.ts` alone (their ownership) and didn't touch any
  `.oq-*`/`src/styles.css` theming (their rethemes, my HUD classes untouched and unaffected).

## Next step
Both owned items are complete. If resumed after a quota gap, verify nothing changed underneath (peer
workers share MAIN): re-run `git log --oneline -5` for these two hashes, `npx vitest run` for a regression
check, and re-read this file before doing anything else. Optional follow-up if time/quota remains: a real
interactive pointer-lock click-through test once a working headless (or non-headless) 3D render path is
available — currently blocked by the documented headless "stalls at first frame" limitation, not by this
worker's code. Nothing outstanding is owed to another worker; no material dependency was hit.
