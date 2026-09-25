# Finish card height and gray Share: recovery checkpoint (2026-09-25)

Owner: the recovery worker, model `claude-opus-5-5` (Claude Code). No fallback models, no subagents.
Scope: `src/ui/screens/FinishScreen.tsx`, `src/ui/screens/finish-screen.css`, `src/capture/media.css`, and the Finish share state in `src/App.tsx`.
**Landed as `e83f8b1`. F-1 follow-up is in the commit after `d2855ce` (see "Reopened" below). Frozen.** The independent Opus reviewer `2d3b34b6` owns the narrow review of the 4-file Finish/App change, including the real App state hand-off.
Source base: main `ce8f3be`. The final visual review's frozen source `13ed712` doesn't include these files. This is a separate finish scope.

## Recovery
- The stash `c493c73705f90718a444d1d23dec67debfe9eaf5` ("WIP on main: fd19c49 …") contained exactly the 3 files. They were unchanged on main since fd19c49, so the apply was clean.
- I applied it by SHA with `git stash apply` and kept the stash. I didn't touch the three dusky-dove stashes.

## What changed on top of the recovered work
- **App.tsx:** play and finish now carry an explicit `unsaved?: { kind: "sample" } | { kind: "draft"; manifest }`. It's set where the run starts:
  - A sample launch or sample route sets `sample`.
  - Preparation `onPlay` with `isNew` sets `draft`, unless the run came from `onEditSample`, which sets `fromSample` and so `sample`.
  - It carries through Replay, Race and completion.
  - `unsaved-draft` is no longer inferred from `publishable: false`.
- **Share mapping:**
  - An existing publication: `existingShareUrl` gives the copy action.
  - Publishable: the existing `onShare`/`publishLevel`.
  - Draft: `onSaveAndShare`. On an explicit click it calls the same `createLevel` that Preparation's Save uses, then `clearActiveSource`. Finish is replaced by a normal publishable finish, then the ordinary `publishLevel` runs. If the publish fails, plain Share retries it and no second copy is saved.
  - Sample: an honest explanation with no save action.
  - There's no new API and no bypass of existing guards: the server's create and publish checks are unchanged.
- **FinishScreen:**
  - Share stays disabled and reads "Publishing…" while a save-and-share is in flight. This covers the moment App swaps in a real `onShare` mid-publish, so one click can't publish twice.
  - The reason note is linked to the button with `aria-describedby`, not only a hover `title`.
- **Layout:**
  - Vertical page padding follows height (`clamp(16px, 4dvh, 40px)`). The card is `min(560px, 100%)`.
  - Media download controls are compact and single-line with a 44px minimum height. Video previews are capped at `clamp(84px, 12dvh, 150px)`.
  - The card is capped at the viewport and scrolls internally below about 800px of height.

## Focused evidence (Chrome channel, isolated fixture `nimbalyst-local/tmp-finish-followup`, port 15961, own tmp Vite cacheDir, HMR and watch off)
All publish and save calls are mocked in the fixture. There were no network, provider or publish calls.
`npx playwright test --config playwright.config.ts`: **12 passed**.

Fit of the fully populated race card (both media cards):

| Viewport | Card client (px) | Card scroll (px) | Document height (px) |
|---|---|---|---|
| 1440x900 | 803 | 803 | 900 |
| 1366x768 | 705 | 788 | 768 |
| 1440x700 | 642 | 779 | 700 |
| 390x844 | 589 | 1077 | 1008 |

- 1440x900 fits with no scroll at all. The shorter windows keep the actions on screen and scroll only the optional media inside the card.
- 390x844 has the hero above, then a card capped at 70dvh.

Screenshots are in `nimbalyst-local/tmp-finish-followup/evidence/`.

Cases covered:
- Desktop and short-desktop action visibility and no page scroll.
- Narrow layout.
- Fit at 1440x900 with single-line download controls.
- Internal-scroll reachability.
- Sample: disabled, the reason is the accessible description, no save action.
- Unsaved draft with and without a save path.
- The save-and-share mid-flight swap: `{save: 1, publish: 1, share: 0}`.
- An existing URL copies to the clipboard.
- Publishable: enabled.

`tsc -p tsconfig.json --noEmit` exits 0.

## Reopened: reviewer F-1 (stale Save & share navigation), fixed in `src/App.tsx` only
The reviewer's finding is in `visual-final-opus-review.md` at `d2855ce`. If the player left Finish while the save was pending, the post-save `go(finish, {replace: true})` pulled them back to Finish and replaced their history entry. The link was lost, and the save also cleared whatever active source existed by then.

Fix, App-local, with no new API and no navigation rewrite:
- **Is the player still on this Finish?**
  - `currentScreenRef` holds the current `Screen` object. Every navigation installs a new one: `go`, popstate and route resolution.
  - The ref is set synchronously by a thin `setScreen` wrapper that every existing call site already uses. It is also synced from the committed screen in a layout effect.
  - After the save, the swap to a publishable Finish runs only if `currentScreenRef.current === screen`. Otherwise nothing navigates, and the publish the player explicitly asked for still completes.
- **No double save:** `saveDraftOnce` keys the pending create on the draft object that `unsaved` carries through Replay and Race. If the create fails, the key is dropped so a retry is possible. A later Finish of an already-saved draft offers plain Share of the stored copy.
- **Recovery record:** `clearActiveSource` runs only if the active source is unchanged since the save started, so a newer creation's record survives.

Real-App regression: `nimbalyst-local/tmp-finish-followup/finish-app-race.mjs` with `vite.app.config.mjs` (port 5261, private cacheDir, no HMR or watch).
- It is adapted from the reviewer's S5. Their harness wasn't edited.
- All /api calls are mocked and delayed, and foreign hosts are blocked.

| Scenario | Checks |
|---|---|
| A: Play again during a 1500 ms save, while a newer creation sets the active source | Stays on `/play/race-a` with the same history length. 1 create, 1 publish. The newer active source is kept. |
| A2: that replay's Finish | Plain Share, and publish only, with 0 extra creates |
| B: browser Back during the save | Stays on `/`. 1 create, 1 publish. |
| C: control, player stays on Finish | "Publishing…" is locked mid-flight. The URL is replaced in place as `/finish/saved-race-c` with the same history length. The link is shown. 1 create, 1 publish of the saved id. |

Results:
- **Fixed: 11/11 PASS.**
- **Pre-fix falsification:** the same harness with `OQ_APP_AT=e83f8b1` (git show, nothing on disk changed) got 2/6 passing before a timeout. The failures reproduce F-1: the player was yanked to `/finish/saved-race-a`, history was rewritten, and the newer active source was cleared.
- Logs are in `evidence/app-race/`.
- `tsc -p tsconfig.json --noEmit` exits 0.

## Limits
- The fixture drives FinishScreen. The real-App harness drives App's own screen state through the React fiber, not a full gameplay run to completion.
- Leaving Finish and then clicking Save & share again on a later Finish while the first save is still pending reuses that save, but it can publish a second publication version. Both are explicit clicks, and no duplicate saved copy is made.
- I didn't run the full unit, build or e2e suite, because the final reviewer owns that gate.
- At 1366x768 and shorter, the optional media section still scrolls inside the card.
