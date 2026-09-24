# Navigation + pointer-lock worker checkpoint

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

Status: `src/ui/routing.ts` + `src/ui/routing.test.ts` written and passing (8/8). App.tsx rewrite in progress next.

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

Status: not yet implemented — next step after App.tsx routing lands and is committed.

## Tests / verification planned
- `npx vitest run src/ui/routing.test.ts` (done, 8/8 passing).
- New `src/game/input/inputController.test.ts` additions for `KeyM`/`KeyC` callbacks.
- Manual browser check via nimbalyst-browser MCP: load `/`, `/worlds`, `/play/:id`, `/edit/:id`, refresh each,
  back/forward between them, confirm `/share/:id` and `#my-worlds` still work.
- Full `npx vitest run` before committing to check for regressions outside my owned files.

## Commits
None yet — first commit lands once App.tsx routing is implemented and tested.

## Next step
Finish rewriting `src/App.tsx` to use `routing.ts`, run the full test suite, browser-verify direct load/
refresh/back-forward, then commit routing as one atomic increment via `developer_git_commit_proposal`
(paths: `src/ui/routing.ts`, `src/ui/routing.test.ts`, `src/App.tsx`). Pointer-lock work follows as a second
commit.
