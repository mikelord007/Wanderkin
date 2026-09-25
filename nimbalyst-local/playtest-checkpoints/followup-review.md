# Independent follow-up review (post-batch, three commits)

- Reviewer: fresh Claude Sonnet worker for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
- Runtime model, from this session's own environment block (not inferred): **Sonnet 5**,
  exact model ID `claude-sonnet-5`.
- Mode: read-only. No product/test files modified. All scratch computation (see
  "Evidence" below) ran in a temp/scratch dir under `nimbalyst-local/` and was deleted
  before this checkpoint was written; `git status` shows no residue from this review.
- Did not touch: the two live worktree/scale/material workers' dirty or untracked files
  (`nimbalyst-local/character-preview.ts`, `src/game/core/characterScale.ts`,
  `src/scene/materialRegions.ts`), any stash (`git stash list` only — 4 stashes present,
  none inspected/applied/dropped), or protected ports 5173/8787/15173/18799. No full test
  suite was run; only the narrow files each commit itself changed.

## Approved scope

- `a8ebc7a` — hum fix (+ `hum-followup.md`)
- `ca187e5` + `3174932` — landing-redirect fix (+ `landing-followup.md`)
- `d5ea77c` + `cc26a76` + `20e7818` — Wanderkin brand rename (+ `brand-refinement.md`)

## Findings, most severe first

### 1. [Moderate] Landing fix (`ca187e5`) trades one bug for a slower-building one: abandoned Create sessions now each leave a permanent empty "Untitled world" draft in My Worlds

**Claim in `landing-followup.md`:** clearing `objectquest:v2:active-creation` on first-step
Back "clears only the pointer, never the record… shows up as an 'In progress' card with a
Resume button in My Worlds." True as far as it goes, but the checkpoint's own test only
exercises **one** back-out cycle, so it never observes what happens on repeat.

**Root cause of the side effect (traced in code, not assumed):**
- `CreationJourneyScreen.initialRecord()` (`src/ui/screens/CreationJourneyScreen.tsx:14`)
  calls `loadActiveCreation()`; if that returns `null`, it **mints and immediately
  persists** (`saveCreationRecord` + `setActiveCreationId`) a brand-new empty record,
  every time the screen mounts.
- `loadCreationWorldItems()` (`src/ui/creationStorage.ts:90`) surfaces **every** stored
  record whose `step !== "ready"` as a My Worlds card via `toPendingWorldItem`
  (`src/ui/creationFlow.ts:151`) — there is no filter for "nothing was ever entered."
  A record at step `"photo"` with no photo and no jobs still becomes a `"draft"` /
  `"Untitled world"` / `"Resume"` card.
- **Before this fix:** the pointer was never cleared, so `loadActiveCreation()` kept
  returning the *same* stale record on every subsequent Create open — at most one stray
  draft ever accumulated (at the cost of the reported landing-hijack bug).
- **After this fix:** `handleCreationBack` clears the pointer, so the *next* time the
  user opens Create, `loadActiveCreation()` returns `null` again and a **new** record
  is minted. Repeating "open Create → back out before choosing a photo" N times now
  leaves N separate empty "Untitled world" drafts permanently in My Worlds (nothing ever
  prunes a step-`"photo"` record with no photo).

**Verified independently**, not just read: exercised the actual, unmodified
`createCreationRecord` / `saveCreationRecord` / `setActiveCreationId` / `clearActiveCreationId`
/ `loadActiveCreation` / `loadCreationWorldItems` functions from the committed tree against
an in-memory `Storage` stand-in, simulating 3 "open + immediate back" cycles:
- Pre-fix behavior (pointer never cleared): **1** stray draft after 3 cycles.
- Post-fix behavior (pointer cleared each time, i.e. what `ca187e5` actually ships):
  **3** stray "Untitled world" / "Resume" drafts after 3 cycles — one per cycle.

This is a real, reproducible behavior change, not a hypothetical. It's a UX/data-hygiene
regression (clutter, not data loss or security), and it's the kind of side effect the new
`landing-resume.test.ts` cannot catch because it only ever backs out once. Flagging per the
standing instruction not to rubberstamp a fix as fully done — the reported landing bug is
genuinely fixed, but a user who tries "Create," changes their mind, and does this a few
times over the life of the app will now see a small pile of empty drafts in My Worlds that
never goes away and (per `toPendingWorldItem`) can never resolve to "ready." Recommend a
follow-up: either prune step-`"photo"`/no-photo records when the pointer is cleared, or skip
`saveCreationRecord` for a completely empty record until it has at least a photo.

Everything else in this fix checks out: the top-level `onBack` (the one now wired to
`handleCreationBack`) only fires from `CreationJourneyScreen`'s `record.step === "photo"`
branch (`CreationJourneyScreen.tsx:112`/`116`) — every other step's Back
(`review`/`customize`/`preview`) calls a local `persist(withCreationUpdate(...))` that stays
inside the journey, confirmed by reading all four `if (record.step === ...)` branches. So
the fix cannot fire mid-journey or after a job/photo exists, and deep-link resume
(`/create/generating/:id`, `/create/prepare[/:id]`) and B10's in-flight-job resume are
untouched — no code path leading there passes through `handleCreationBack`.

### 2. [Info, no issue found] Hum fix (`a8ebc7a`) — reproduced the acoustic claim independently, not just read it

- Extracted the exact git blobs at `a8ebc7a` for the 3 regenerated WAVs and hashed them:
  `gentle-breeze.wav`/`fall-respawn.wav`/`lost-colors-loop.wav` sha256+size match
  `bundledMedia.ts`'s recorded values exactly (byte-for-byte, not just "should match").
- Recomputed the autocorrelation check myself (independent script, same method as the
  shipped regression test) on the actual committed blobs at `a8ebc7a^` (old) vs `a8ebc7a`
  (new): old = **0.989** max |r|, new = **0.022** max |r| — corroborates the checkpoint's
  reported 0.94–0.99 → ~0.06 swing; the defect and the fix are both real.
- Confirmed `seedNoise` has exactly 3 call sites in `scripts/generate-bundled-audio.mjs`
  (ambience bed, fall-respawn thud, music's percussion tap) — the melody notes themselves
  never call it, so "cheerful music preserved" is structurally true, not just asserted.
- `npx vitest run src/audio` → 6/6 pass against the current committed tree.
- `git show --stat a8ebc7a` matches the checkpoint's claimed file list exactly (7 files,
  no `engine.ts` change). No issues found.

### 3. [Info, no issue found] Brand rename (`d5ea77c`) — spot-checked the specific risk areas named in scope

- `src/brand.ts`: `BRAND_NAME`/`BRAND_SLUG` changed; storage/protocol keys
  (`objectquest:v2:*`) and `window.__objectquest` are untouched — grepped the whole
  `src/ui/creationStorage.ts`/`jobStorage.ts` key constants, all still `objectquest:`-prefixed.
- `git grep -in mousehold` across the tree at HEAD: only 3 hits, all comment-only headers
  in `tokens.css`/`styles.css`/`editor.css` — exactly the ones the checkpoint disclosed as
  "left alone on purpose." No user-visible stray old name anywhere else. No dangling
  references to the deleted `public/brand/mousehold-mark.svg` in any file.
- Bundle import compatibility: `importLevelBundle` (`src/ui/api.ts:266`) reads the file as
  text and never inspects its name/extension; the file-picker `accept` list is generic
  `.json`. Old `.mousehold.json`/`.objectquest.json` bundles are unaffected — confirmed by
  reading the actual import path, not assuming it from the checkpoint's prose.
- `npx vitest run src/ui/components/Logo.test.ts` → 7/7 pass against the committed tree,
  including the drift guard that fails if `public/brand/wanderkin-*.svg` or the
  `index.html` boot-screen SVG diverge from `Logo.tsx`'s own rendering, and the
  accessible-name/dotless-ı wiring (`mh-logo__name` visually hidden, plain "Wanderkin";
  drawn glyphs `aria-hidden`).
- Independently re-measured the capture watermark: rendered `ctx.font = "800 17px
  system-ui, sans-serif"; ctx.measureText("WANDERKIN").width` in a real disposable
  Chromium page (not the dev server) → **109.79px**, matching the checkpoint's claimed
  109.8px inside the fixed 162px pill (≈26px clear on each side). Watermark fits.
- No issues found in this commit.

### 4. [Info, unverifiable by me] Runtime-model self-reports

`hum-followup.md`/`landing-followup.md` self-report `claude-sonnet-5`, matching this
review session's own observed model. `brand-refinement.md` self-reports `claude-opus-5-5`,
cross-checked in that checkpoint against its own session transcript file — I did not have
reason or access to independently re-open that specific transcript; the claim is
methodologically sound (cites a concrete file and a count of matching records) and nothing
else in the diff contradicts an Opus-quality pass. Not flagged as a problem, just noted as
self-reported rather than re-verified by me.

## Bottom line

Hum and brand commits: clean, independently re-verified, nothing further needed. Landing
commit: fixes the reported bug correctly and narrowly, but ships a real (if low-severity)
side effect — repeated abandoned Create sessions now permanently litter My Worlds with
empty draft cards — that its own test suite does not cover. Recommend the coordinator
decide whether that's worth a fast follow-up before calling the landing item fully closed.

---

# Second pass: scale/camera reopen (`6f142b1`, `13caa6b`/`4f3e672`) and the empty-draft fix (`e13e24c`)

- Reviewer: fresh Claude Sonnet worker, same coordinator. Runtime model, from this
  session's own environment block: **Sonnet 5** (`claude-sonnet-5`). No subagents.
- Read-only again. Scratch measurement scripts (draft-accumulation repro, a canvas-based
  pixel-height comparison of the real spawn screenshots) ran under a workspace-local
  `nimbalyst-local/tmp-review/` and were deleted before this checkpoint was written;
  `git status` shows no residue. Any disposable browser session used a `nim-preview://`
  local-file preview only — no dev server, no shared Vite `cacheDir`, protected
  5173/8787/15173/18799 never touched or queried.
- Did not read/touch the two active workers' moving diffs or files (`src/game/render/
  SceneEntities.tsx`, `src/game/render/SceneLighting.tsx`, `src/scene/styleMaterial.ts`,
  `src/scene/materialRegions.ts`) — confirmed via `git show --stat` on both reviewed
  commits that neither touches any material/lighting file, so there is no overlap to
  worry about. `git stash list` only (4 stashes, none applied/dropped/inspected further).
  No full test suite run — only the exact files the commits themselves own.

## Findings

### 1. [Fixed, verified] `e13e24c` correctly resolves the empty-draft clutter I flagged in the first pass

Read the actual diff (`src/App.tsx`, `src/ui/creationFlow.ts` `isUntouchedCreationRecord`,
`src/ui/creationStorage.ts` `removeCreationRecord`) rather than trusting the checkpoint
prose, then re-ran **my own original repro** against the current, unmodified functions
(in-memory `Storage`, no mocks):
- 3× "open Create, back out before a photo": **0** stray records survive (was 3 before
  this fix, 1 before `ca187e5`). Matches the checkpoint's own claim exactly.
- A record carrying a job (simulating the `ReviewObjectScreen` "Replace" path, which
  resets `step` to `"photo"` but does not clear `jobs.object`) and a record carrying a
  real `photo` are both **preserved** and still resolve to one resumable My Worlds item —
  confirmed the predicate does not over-delete.
- `isUntouchedCreationRecord`'s field list matches `createCreationRecord()`'s minted
  shape exactly (checked side by side); `npx vitest run src/ui/creationFlow.test.ts
  src/ui/creationStorage.test.ts src/ui/routing.test.ts src/ui/jobStorage.test.ts` →
  29/29 pass against the committed tree.
- The updated `tests/e2e/browser/landing-resume.test.ts` correctly flips the single-cycle
  test's assertion from "Resume is visible" to "Resume has count 0" (the empty draft is
  now pruned, not kept) and adds the exact repeated-cycle scenario — a real, non-vacuous
  update, not a relaxed threshold.
- Checkpoint honestly self-corrects an earlier false claim about port isolation
  ("sequential ports already avoid the collision") instead of leaving it uncorrected —
  a good sign, noted rather than a finding.

No issues found. This closes the loop on my prior top finding.

### 2. [No issue found] `6f142b1` — plain constant shrink (0.35 m → 0.175 m) plus a real, narrow float-rounding fix

- The diff is exactly what it claims: `MINIATURE_CAPSULE_HEIGHT` changed, and
  `mantle.requiredClearanceHeight` now derives from the actual scaled
  `characterHalfHeight`/`characterRadius` instead of the nominal constant. Read the
  surrounding `toMiniatureScale()` — this is a one-line, clearly-motivated fix for a real
  float-rounding edge (`0.20000000000000004` vs. `0.2`), not scope creep.
- `isMiniatureScale()` (unchanged) still guards `toMiniatureScale()` from double-applying
  — `capsuleHeight(config) <= MINIATURE_CAPSULE_HEIGHT * 1.001` — so idempotency holds at
  the new value exactly as it did at the old one.
- File list is exactly `characterScale.ts` + the (non-product) `character-preview.ts`
  studio-rig extension + the checkpoint doc — no `shared/movement.ts`, `App`, HUD, or
  `src/scene/**` touched, matching the ownership claim.

### 3. [No issue found, independently corroborated] `13caa6b` — camera pull-back + FOV reopen

Traced the actual mechanism rather than accepting the prose:
- **Cannot introduce new clipping**: read `cameraRig.ts`'s `update()` — `maxDistance =
  camera.distance` (now the larger, pulled-back nominal value) is only ever used as the
  *sweep length* for a real physics shape-cast (`world.castShape`) against actual
  collider geometry; the resulting `allowed` distance is clamped to whatever the sweep
  actually reports, independent of how large `maxDistance` is. A larger nominal distance
  can only ever result in an `allowed` value that is itself larger-or-equal in open space,
  never smaller near geometry — confirms "widens open framing, cannot create a new
  clipping path" is actually true of the code, not just asserted. `collisionPadding`
  (the sweep's own clearance-ball radius) is untouched by the pull-back ratio, exactly as
  claimed.
- **FOV effect has no lifecycle/leak risk**: `GameStage.tsx`'s `useEffect` sets
  `camera.fov`/`updateProjectionMatrix()` with no cleanup, but traced the camera's actual
  lifetime — `<Canvas>` (and therefore the `PerspectiveCamera` instance) lives inside
  `GameView.tsx`, mounted only via `PlayScreen`, which `App.tsx` renders only for
  `case "play"`. Leaving the play screen unmounts the whole `Canvas`/camera; the next
  "play" mount starts from the Canvas's own declarative `fov: 55` again, so there is
  nothing to leak or restore. No second camera exists anywhere in the gameplay render
  tree (`grep` for `PerspectiveCamera`/`makeDefault` in `GameView.tsx`/`GameStage.tsx`
  confirms one camera, one place it's read). The world-screenshot/gameplay-clip capture
  path (`src/capture/screenshot.ts`) takes the already-rendered `HTMLCanvasElement` as a
  pixel source (`context.drawImage(source, ...)`), not a separate camera/projection setup
  — so it cannot disagree with whatever FOV the live camera was using. No global or
  wrong-projection risk found.
- **Test assertions are the real, intentional relationship, not loosened**: the updated
  `characterScale.test.ts`/`cameraRig.test.ts` assertions multiply the expected boom
  ratio by the actual named `CAMERA_MINIATURE_PULLBACK_RATIO` constant (`toBeCloseTo(...,
  9)` — tight, exact-formula equality), not a widened tolerance. Ran them:
  `npx vitest run src/game/core/characterScale.test.ts src/game/render/cameraRig.test.ts
  src/game/core/authoredCourse.test.ts src/game/core/mantle.test.ts
  src/game/core/simulation.test.ts src/game/placementValidation.test.ts` → **55/55 pass**
  against the committed tree, matching the checkpoint's claimed count exactly.
- **The `gameplay.test.ts` threshold fix is a meaningful derived bound, not a lowered
  magic number**: independently cross-checked every constant it uses against source —
  `AUTHORED_STANDING_OFFSET = 0.17 + 0.18 + 0.02` matches `DEFAULT_MOVEMENT_CONFIG`
  (`shared/movement.ts`: `characterHalfHeight: 0.17, characterRadius: 0.18`) plus the
  `0.02` landing skin in `samples.ts`'s `standOn()`; recovering `surfaceY` from the
  live-published `nextCheckpointPosition` and subtracting that same offset reproduces
  `RODIN_DESK_Y = 1.286` from `samples.ts` exactly — an independent structural
  cross-check, not just trusting the number. The new assertion is two-sided
  (`surfaceY - 0.05` … `surfaceY + AUTHORED_STANDING_OFFSET + 0.05`), so it still fails
  both "never actually got up" and "ended up somewhere implausible," unlike a
  single-sided threshold that could be gamed by picking a low enough bound.
- **Before/after production screenshots substantiate the claim, checked with real pixel
  measurement, not by eye**: loaded `h035-before-01-spawn.png` and
  `h0175-pullback-fov72-01-spawn.png` (both real Chrome captures already on disk, not
  regenerated by me) into a disposable local-file canvas, stacked them at native 1:1
  scale, and located the character's beanie-top and floor-contact rows by sampling the
  actual rendered pixel colors (teal beanie ≈ `rgb(0,115,110)`, floor ≈ `rgb(34,135,68)`)
  rather than eyeballing. Measured character height ≈ 181 px before, ≈ 82 px after ≈
  **45%** of the original — in the same ballpark as the checkpoint's claimed "roughly
  40%," confirming the visible-shrink claim is honest and not overstated, and that more
  of the desk overhang and floor are genuinely in frame (visible directly in the stacked
  comparison). Deleted the scratch HTML/canvas files afterward.
- **Tripo intermittent failure**: not re-run by me (would need the real e2e gameplay
  harness against a disposable, cache-isolated Vite instance, which is exactly the setup
  this session was told to avoid unless needed). Accepted the checkpoint's claim on
  structural grounds instead of re-running it: `git show --stat` on both commits confirms
  neither touches `checkpoints.ts`, `mantle.ts`'s probing logic, or `samples.ts` — nothing
  in this diff could plausibly change that sample's mantle-rejection behavior, so "same
  pre-existing signature, present at the unmodified baseline too" is at minimum
  consistent with the code, even though I did not personally reproduce the flake.
- File lists for both commits (`git show --stat`) contain zero overlap with the two
  active workers' material/lighting files — confirmed, not just asserted.

## Bottom line (second pass)

No unresolved issues found in `6f142b1`, `13caa6b`, or `e13e24c`. The empty-draft clutter
from the first pass is genuinely fixed, verified by re-running my own original repro
against the real code. The camera reopen's core safety claims (no new clipping path, no
FOV lifecycle leak, a meaningful/derived test threshold rather than a lowered one, and a
real, independently pixel-measured visible-size reduction) all hold up under direct code
tracing and a bounded, disposable-browser measurement — not just by re-reading the
checkpoint's prose. Recommend approval of this batch; the Tripo checkpoint-5 flake remains
open and pre-existing, as both checkpoints already disclose.
