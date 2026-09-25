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
