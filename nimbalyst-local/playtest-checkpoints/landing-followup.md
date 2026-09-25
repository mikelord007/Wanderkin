# Landing-page redirect follow-up (post-13-item overnight batch)

Session: fresh Claude-only worker, coordinator 30e37344-f303-4b8a-80c8-ee9f8fd5f3d6.
Model: Sonnet 5 (`claude-sonnet-5`, per this runtime's own system context).
Baseline: MAIN `fd19c49` (product `d0c9215`), no tracked source dirt at start.
Ownership: `src/App.tsx`, `src/ui/routing.ts`/tests, `src/ui/creationStorage.ts`/`jobStorage.ts` (read/import
only — no edits needed to either). Did not touch FinishScreen, capture/media layouts, audio/theme/gameplay,
or any sibling worker's untracked artifacts under `nimbalyst-local/` (left `VISUAL_REFINEMENT_PLAN.md`,
`tmp-finish-followup/`, `playtest-checkpoints/brand-refinement.md`, etc. exactly as found).

## Report
User: visiting the landing page `/` gets automatically redirected to Create, and has to click Back to see
the landing page.

## Diagnosis (root cause, in plain language)
`resolveSyncScreen`'s `"start"`/`"worlds"` case in `src/App.tsx` (run on every cold load, refresh, and
browser Back/Forward) checks two localStorage-backed "resume" signals and silently jumps away from the
landing screen whenever either says there's unfinished work: `resolveResumeState()` (an in-flight/ready
generation job) and `loadActiveCreation()` (a creation-journey record whose `step` isn't yet `"ready"`).
That auto-resume is *intentional* and already covered by tests (see below) for the case where the pointer
is legitimately live — e.g. B10 reloads straight back into "Your world is taking shape." on purpose.

The actual defect is that the `active-creation` pointer this second check reads
(`objectquest:v2:active-creation`) is **never cleared once set**. `clearActiveCreationId()`
(`src/ui/creationStorage.ts`) existed but had zero call sites anywhere in the app or its tests — dead code.
`CreationJourneyScreen`'s only true exit back to the top-level router is its very first step
(`CaptureScreen`'s Back button, step `"photo"`, before any photo or job exists — every later step's Back
just moves the in-flight record backward a step and stays inside the journey). That top-level Back called
`goStart()` directly, which shows the landing screen correctly *in that instant* (matching the "Back does
show landing" observation) but never cleared the pointer. So the still-empty, already-persisted record
stayed "active" indefinitely, and the very next visit to `/` — a reload, a new tab, or reopening the app
later — re-ran `resolveSyncScreen`, found that same stale pointer, and silently reopened Create again. Each
time, clicking Back "fixes" it for a moment, but the underlying pointer is untouched, so it recurs on the
next load. This matches the report precisely (redirected to *Create* specifically, and Back is the only
apparent fix).

Confirmed with a real-Chrome repro before touching any code: seed `objectquest:v2:creations` +
`objectquest:v2:active-creation` for a step-`"photo"` record (no `objectquest:activeSource`), load `/` —
Create opens instead of landing, and a reload reproduces it again after backing out via the in-app Back
button. Also confirmed the *other* auto-resume path (a real in-flight `ActiveSource` job, B10's scenario) is
a distinct, already-intentional behavior and must not be touched by this fix.

## Fix
`src/App.tsx`: new `handleCreationBack` callback — `clearActiveCreationId()` then `goStart()` — wired as
`PhotosScreen`'s `onBack` (previously bare `goStart`). Clears only the *pointer*, never the record: an
abandoned draft is not discarded, it simply stops being treated as "the thing to silently reopen" and falls
back to the existing, already-shipped explicit affordance — it shows up as an "In progress" card with a
**Resume** button in My Worlds (`loadCreationWorldItems()` → `additionalWorldItems` on `StartScreen`), the
same mechanism B19 already exercises for a *cleared*-pointer creation record. No changes to
`resolveSyncScreen` itself, `resolveResumeState`, deep-link resume (`/create/generating/:id`,
`/create/prepare`, `/create/prepare/:assetId`), or any protected/shared file.

Why this is minimal and not a redesign: the only other place a durable job is deliberately "left" without
clearing state (`handleJobCancelled`, leaving the Generation screen) already has its own explicit comment
("Leaving progress never cancels or forgets durable work — My worlds can reopen the same application job")
and its own B10-covered contract; that path is untouched. `handlePreparationBack` already clears
`ActiveSource` and — because the creation record's `step` flips to `"ready"` as soon as Preparation finishes
preparing the scene, before the user reaches that screen's Back button — never leaves the stale-pointer
condition this fix addresses.

## Tests
New `tests/e2e/browser/landing-resume.test.ts` (real Chrome, `channel: "chrome"`, isolated temp port, no
provider/network calls beyond the existing `installCreationMock` fixture — no live-world writes):
1. **Backing out of a just-started creation draft does not hijack the next visit to `/`.** Opens Create,
   clicks the frame's "← Back" before choosing a photo, confirms landing reappears immediately, then
   **reloads `/`** and confirms landing stays landing (not Create) — the actual reported side effect, not
   just a path-parsing check — and that the abandoned draft is still reachable as an explicit "Resume" card
   under My Worlds.
2. **Companion regression guard**: an in-progress build (photo → review → customize → preview → build)
   still resumes straight to "Your world is taking shape." on reload — proves the fix does not touch the
   intentionally-preserved resume behavior for durable, already-submitted work.

Verified test 1 actually catches the bug: reverted just the `onBack` wiring (kept the import), reran — test
fails exactly at the post-reload landing assertion with the pre-fix code, confirming it's a real regression
test and not vacuous. Restored the fix afterward and reconfirmed both new tests pass.

Regression pass (existing contracts, real Chrome, isolated ports 5193–5199, one test file/spec at a time —
not the full suite, per scope): `B6` (preview-approval gate), `B10` (resume a pending generation after
refresh — the intentional-resume contract this fix must not break), `B11` (optional-failure recovery),
both `B19` cases (My Worlds actions for saved/draft worlds and for creation jobs) — all pass with the fix
applied.

Pre-existing, unrelated failure noted (not caused by this change, not owned by this task): `B5` and
`screens 2–7 mocked creation walkthrough` both fail at the same step — clicking "Looks good" after
"Adjust crop" — expecting the `"What kind of adventure is this?"` (Customize) heading, which never appears.
Reproduced identically against a clean stash of this fix (i.e. present on MAIN before this session touched
anything), so it predates this work. Flagging for the coordinator/whoever owns `ReviewObjectScreen`/
`CustomizeScreen`; out of scope for the App.tsx routing ownership of this task and not touched.

Unit tests: `npx vitest run src/ui/routing.test.ts src/ui/creationStorage.test.ts src/ui/jobStorage.test.ts`
— 23/23 passing (no source changes needed in any of the three, so no new/changed unit assertions there).
`tsc -p tsconfig.json --noEmit && tsc -p server/tsconfig.json --noEmit` — clean.

## Verified still working (no regression)
- Deep-link resume: `/create/prepare` (with a pending preparation resume) and `/create/prepare/:assetId`
  untouched in code and covered by existing `routing.test.ts` path round-trips.
- `/create/generating/:jobId` untouched.
- Private saved-world navigation: not touched; no changes to `getLevel`/`saveLevel`/`/edit/:id`/`/play/:id`
  resolution paths, no live-world writes performed this session.
- The async-navigation supersession guard (`createNavigationGuard`, `src/ui/routing.ts`) is untouched.
- Protected ports (5173/8787/15173/18799) and the private saved world / sibling `sudden-stone` isolated
  storage were never touched — all verification ran against a temporary Vite dev server on ports 5193–5199
  with `installCreationMock`'s mocked `/api/**` routes, no real provider or persisted-world traffic.

## Commit
`ca187e56641ddaad7df2473e003007b172068693` — committed via `mcp__nimbalyst__developer_git_commit_proposal`
(not CLI), scoped to exactly: `src/App.tsx`, `tests/e2e/browser/landing-resume.test.ts`,
`nimbalyst-local/playtest-checkpoints/landing-followup.md`. No other file in the working tree touched or
staged (sibling workers' untracked artifacts left exactly as found). `git status` after the commit shows no
other uncommitted changes in any path this worker owns.

## Remaining issues
- The pre-existing B5 / creation-walkthrough Customize-screen failure above is unrelated and unfixed —
  needs its own owner (touches `ReviewObjectScreen`/`CustomizeScreen`, outside this task's `src/App.tsx`
  ownership).
- Not in scope, not investigated: whether the same dangling-pointer class of bug exists anywhere else in the
  creation flow's non-top-level Back buttons (they never leave `CreationJourneyScreen`, so they were out of
  scope for "explicit `/` navigation" per the assignment, but worth a note for whoever next touches
  `creationFlow.ts`/`CreationJourneyScreen.tsx`).
- User's own hands-on browser playtest of the fix is still the closing step, per this project's standing
  preference for manual verification of feel/regressions beyond automated coverage.

## Follow-up: independent review finding, fixed (empty-draft clutter)

`nimbalyst-local/playtest-checkpoints/followup-review.md` (commit `64316d8`) independently re-derived and
verified, against the actual unmodified storage functions (not just read), a real second-order side effect
of `ca187e5`: clearing `objectquest:v2:active-creation` on first-step Back correctly stops the landing-page
hijack, but `CreationJourneyScreen.initialRecord()` (`src/ui/screens/CreationJourneyScreen.tsx:14`) mints
*and immediately persists* a brand-new empty record every time it mounts with nothing active. Before
`ca187e5`, the pointer was never cleared, so at most one stray record ever existed. After `ca187e5`, clearing
the pointer means the *next* "Create → back out before a photo" cycle mints a fresh record instead of
reusing the old one — repeating that cycle N times now left N permanent, unresolvable "Untitled world" cards
in My Worlds (the reviewer measured 3 cycles → 3 stray drafts, vs. 1 before the fix).

Fix, staying inside `src/App.tsx`/`routing`/`resume`/`storage` ownership — no edit to
`CreationJourneyScreen.tsx` was needed or made:
- `src/ui/creationFlow.ts`: new pure predicate `isUntouchedCreationRecord(record)` — true only for a record
  that still matches exactly what `createCreationRecord()` minted (step `"photo"`, no photo, no job of any
  kind, `crop`/`selection` still at their defaults, no title/preview/reviewed-asset/etc.). `crop` and
  `selection` can only ever be edited once a photo exists (i.e. once `jobs.object` exists — both editing
  screens sit downstream of choosing a photo), so the `jobs` check alone already implies them; the explicit
  field comparisons just make that guarantee visible at the call site instead of relying on it silently.
- `src/ui/creationStorage.ts`: new `removeCreationRecord(id, storage)` — deletes exactly one record by id
  (mirrors `saveCreationRecord`'s filter-and-rewrite shape).
- `src/App.tsx`: `handleCreationBack` now loads the active record first; if `isUntouchedCreationRecord`
  says it's still pristine, `removeCreationRecord`s it before clearing the pointer. A record carrying any
  real work (a photo, a job — e.g. left over from clicking "Replace" in `ReviewObjectScreen`, which resets
  the step back to `"photo"` but does *not* clear `jobs` — or a customized `selection`/`crop`) is left alone
  exactly as `ca187e5` already did, so it still resolves to a resumable "Draft"/"Resume" card in My Worlds.

Verified independently, mirroring the reviewer's own method — exercised the real, unmodified functions
against an in-memory `Storage`, not a mock of them:
- `src/ui/creationFlow.test.ts`: new test asserts a freshly-minted record is untouched, and that a photo, a
  job, an edited `selection`, an edited `crop`, or a changed `step` each independently flip it to "not
  untouched."
- `src/ui/creationStorage.test.ts`: two new tests — (1) replays the reviewer's exact "3 open+back cycles"
  repro against the real `createCreationRecord`/`saveCreationRecord`/`setActiveCreationId`/
  `isUntouchedCreationRecord`/`removeCreationRecord`/`clearActiveCreationId` functions and asserts **zero**
  stray records survive (previously 3), (2) a companion check that a record carrying a photo + job is never
  pruned and still resolves to exactly one My Worlds item.
- `tests/e2e/browser/landing-resume.test.ts` (real Chrome): updated the existing single-cycle test's
  assertion (an empty abandoned draft is now correctly pruned, not resumable — that's the point of this
  fix) and added a new end-to-end test that repeats the actual UI cycle (click "Create my world", back out
  via "← Back", 3 times) and confirms My Worlds shows zero "Resume" buttons and no "Untitled world" text
  afterward — closes the loop from the pure-storage unit tests up through the real wired `App.tsx` handler.

Regression pass (isolated temp port, sequential relative to my own other runs): both `landing-resume.test.ts`
cases plus the new repeated-cycle case, and existing `B6`/`B10`/`B11`/both `B19` contracts — 8/8 pass.
`B19`'s own "creation jobs" case seeds a `step: "customize"` draft record precisely to assert it still shows
a "Resume" action; confirms this fix does not touch any record beyond a truly untouched `step: "photo"` one.
`npx vitest run src/ui/creationFlow.test.ts src/ui/creationStorage.test.ts src/ui/routing.test.ts
src/ui/jobStorage.test.ts` → 29/29 pass. `tsc --noEmit` (app + server) clean.

**Correction (evidence-checked, not just re-asserted):** the line originally here claimed "sequential unique
ports already avoid the collision" with the shared Vite dep-optimizer cache. That claim was false and has
been removed. "Sequential" only ever meant *my own* disposable runs didn't overlap each other — it said
nothing about the two **persistent** dev servers on `5173`/`15173`, which were running the entire time these
regression passes ran and share the exact same `node_modules/.vite` cache dir as any disposable instance
launched from this same checkout, regardless of port. That is precisely the shape of the earlier brand
incident. The claim should never have been written without checking for exactly that overlap; noted here so
it isn't repeated. A bounded, read-only, actual-Chrome check of both persistent servers afterward (see
below) found no resulting breakage this time, but that is a fact about this particular run's luck/timing,
not something the sequential-ports reasoning actually guaranteed. Going forward, any disposable Vite
instance in this repo must use a private `cacheDir` (a throwaway `--config` file under a session-local temp
dir, no edit to the shared/protected `vite.config.ts` or `playwright.config.ts` needed) — not implemented in
this session per explicit instruction (no new Vite processes, no cache-service changes), left as a
requirement for whoever next runs disposable Vite here.

**Read-only verification of the two persistent servers (no server started/restarted/modified):** confirmed
both are actually listening first — `5173` only on the IPv6 loopback (`[::1]:5173`, so `curl 127.0.0.1:5173`
alone misleadingly reports connection failure; `localhost:5173` resolves correctly), `15173` on
`127.0.0.1:15173` — then loaded each in a real headless Chrome (`playwright-core`, `channel: "chrome"`,
scratch script run from and deleted immediately after, under `nimbalyst-local/`, nothing committed) and
inspected every network response, not just the root document:
- `http://localhost:5173/` — 125 requests observed, 0 with status `0` or `>=400`, 0 console errors, 0 page
  errors.
- `http://127.0.0.1:15173/` — 122 requests observed, 0 with status `0` or `>=400`, 0 console errors, 0 page
  errors.

**No breakage found on either persistent server right now.** Both currently serve cleanly. This is a
snapshot, not a guarantee for future disposable runs against the same shared cache — see the correction
above.

Did not touch: `worker27653085`'s stash or any of its FinishScreen/capture-media files (per explicit
instruction — clarification still pending on that side, untouched); the two live scale/material workers'
dirty/untracked files (`src/game/render/SceneEntities.tsx`, `src/game/render/SceneLighting.tsx`,
`src/scene/styleMaterial.ts`, `src/scene/materialRegions.ts`); brand files (already done, not reopened); any
protected port or live/provider/publish path — this review and fix were pure client-side storage-shape
logic, no network or provider calls.

Commit: `e13e24c408ffbeab31917255845da6fb0af9daf2` — scoped to exactly `src/App.tsx`,
`src/ui/creationFlow.ts`, `src/ui/creationFlow.test.ts`, `src/ui/creationStorage.ts`,
`src/ui/creationStorage.test.ts`, `tests/e2e/browser/landing-resume.test.ts`, and this checkpoint file.
`git status` after the commit shows no other uncommitted changes in any path this worker owns.
