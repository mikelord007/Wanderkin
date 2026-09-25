# Checkpoint — scale-refinement (further miniature-scale reduction)

## Identity

- Worker: Claude Code, runtime-reported model **Sonnet 5** (`claude-sonnet-5`), from this
  runtime's own system context — self-reported by the harness, not independently verified
  against an external source. Nimbalyst session for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
- Started 2026-09-25. Baseline MAIN `3174932`.
- No subagents, no nested agents, no provider/publish/upload/generation calls, no new deps.
- Committed: `6f142b1c6b6c40ef99b32647feabfacecc7a275a` — `src/game/core/characterScale.ts`,
  `nimbalyst-local/character-preview.ts`, this checkpoint file. Nothing else staged.
- **Reopened** by the coordinator: the first pass's own evidence showed real in-game spawn
  screenshots were near pixel-identical across every scale explored, and said the external
  sofa-comparison render was "the correct way to judge" — correctly rejected as not satisfying
  "when character spawns, environment looks bigger" in the actual production camera. See the new
  section below for what changed as a result.

### Addendum: disposable-Vite cache isolation (coordinator-flagged, test-infra only)

The coordinator flagged that a disposable Vite dev server on an unrelated port can still
invalidate the dependency-optimizer chunks the protected 5173/15173 servers are serving, because
Vite's default `cacheDir` (`node_modules/.vite`) is shared by every process in the checkout
regardless of port — the brand worker hit this and repaired it without needing a restart. Every
disposable Vite invocation this session up to that point (`npx vite --port 15981/15991/15992/
15993/15994 --strictPort`, and `tmp-scale-refinement/playwright.config.ts`'s `webServer`) used
that default, unscoped cache. Protected 5173 and 15173 were re-verified 200/clean after the fact
(`curl` to both, plus a real Chrome run through `tests/e2e/browser/gameplay.test.ts` earlier in
this same session) — no repair action was taken or needed on my part, and no shared cache was
cleared.

Fixed going forward, test-infra only, no product scope: added
`nimbalyst-local/tmp-scale-refinement/vite.disposable.config.mjs` (mirrors the root
`vite.config.ts`'s react plugin and `@shared` alias, but sets `cacheDir` to a private folder under
`os.tmpdir()`), and pointed `tmp-scale-refinement/playwright.config.ts`'s `webServer.command` at it
via `--config`. Re-ran the spawn-views capture against the new config to confirm: the isolated
cache directory is actually created and used (verified on disk), the app still serves and plays
correctly, and protected 5173/15173 stayed 200 throughout. Neither of these files is committed
(scratch, like `tmp-batch2-controls/` before it) — noted here only so the practice survives past
this session: **any future disposable Vite server in this repo must pass `--config` to a config
that overrides `cacheDir` away from the repo default, never the bare `npx vite --port N` form.**

## Task

The previous scale owner shipped the character at a 0.35 m capsule (see
`nimbalyst-local/playtest-checkpoints/gameplay.md`). The user played it and it is **still too
large** relative to the furniture around it. This pass explores a further reduction — starting
around 0.15–0.20 m total capsule height, per the coordinator's brief — and picks the actual
final value from real production spawn views and traversability checks, not from math/render-only
shrink.

## Result

**`MINIATURE_CAPSULE_HEIGHT` lowered from 0.35 m → 0.175 m** in
`src/game/core/characterScale.ts` — a clean second halving of the previous pass (0.70 → 0.35 →
0.175). No other product file needed a change: `cameraRig.ts`, `GameStage.tsx`, `simulation.ts`
and `PlayerAvatar` already derive everything from `simulation.config`, so the smaller number
propagates through physics, camera and rendering with no separate edit and no risk of a second,
independent shrink.

One real (small) bug found and fixed along the way, unrelated to which value was finally chosen:
`toMiniatureScale()` set `mantle.requiredClearanceHeight` to the literal
`MINIATURE_CAPSULE_HEIGHT` constant, but the *actual* scaled capsule height
(`2 * (characterHalfHeight + characterRadius)`) lands a float-rounding hair above that constant
for some target heights (e.g. exactly reproduced at 0.20 m: capsule height computed as
`0.20000000000000004`). That failed the existing "clearance ≥ capsule height" contract test.
Fixed by deriving `requiredClearanceHeight` from the actual scaled radius/half-height instead of
the nominal constant, so it can never fall short regardless of the target value or floating-point
rounding. Covered by the existing `characterScale.test.ts` (unchanged, still 14/14 green).

## Ownership honoured

Edited: `src/game/core/characterScale.ts` only (constant value, the clearance derivation, and the
doc comment explaining both). No edit to `shared/movement.ts` / `DEFAULT_MOVEMENT_CONFIG`, `App`,
HUD, `src/scene/**` (styleMaterial, SceneLighting, SceneEnvironment), brand, or audio.
`cameraRig.ts` and `GameStage.tsx` were read and verified but needed no change — see "Why no
camera/render edit" below.

Also touched, **not product code**: `nimbalyst-local/character-preview.ts` (the previous scale
worker's own committed studio-preview harness, at `cec9f92`) — extended its hardcoded
`[0.7, 0.35]` sofa comparison to an arbitrary `?heights=` list and added a `?cam=closeup` framing,
so the new candidates could be screenshotted against the same fixed external camera/sofa rig
without touching the in-game chase camera. This is the same file and the same kind of extension
the previous worker made; it is not imported by the shipped app.

Scratch, **not committed** (mirrors how `nimbalyst-local/tmp-batch2-controls/` was left):
`nimbalyst-local/tmp-scale-refinement/` (a disposable Playwright config + two capture scripts) and
`nimbalyst-local/screenshots/scale-refinement/` (raw Playwright output dir, overwritten every run —
`nimbalyst-local/screenshots/scale-refinement-kept/` holds the copies actually referenced below).

Concurrent peer activity observed and **not touched**: while this session was running,
`src/game/render/SceneEntities.tsx`, `src/game/render/SceneLighting.tsx`, `src/scene/styleMaterial.ts`
became dirty and a new `src/scene/materialRegions.ts` appeared, untracked — the surfaces/light
worker the plan document anticipated starting. None of it was staged, reverted, or read as part of
my diff; my commit lists only the exact paths above.

## How the decision was made

### 1. Fast, in-process checks first (no browser)

Temporarily tried `MINIATURE_CAPSULE_HEIGHT` at 0.20 / 0.175 / 0.15 (and the current 0.35), running
`characterScale.test.ts`, `cameraRig.test.ts`, `authoredCourse.test.ts`, `mantle.test.ts`,
`simulation.test.ts` at each. All green at every candidate (after the clearance fix above). A
scratch script (`nimbalyst-local/tmp-scale-refinement/explore-margins.ts`, not committed)
quantified the numbers that matter for a go/no-go before touching a browser:

| capsule height | walkMaxSpan | flatJumpRange (unchanged) | margin | walk speed | jump height | min camera dist. vs. near-clip (0.02 m) |
| --- | --- | --- | --- | --- | --- | --- |
| 0.35 m (current) | 0.315 m | 1.539 m | 20.5% | 6.3 body-heights/s | 1.7 body-heights | 0.144 m (7.2×) |
| 0.20 m | 0.180 m | 1.539 m | 11.7% | 11.0 body-heights/s | 3.0 body-heights | 0.082 m (4.1×) |
| **0.175 m (chosen)** | 0.158 m | 1.539 m | 10.2% | 12.6 body-heights/s | 3.4 body-heights | 0.072 m (3.6×) |
| 0.15 m | 0.135 m | 1.539 m | 8.8% | 14.7 body-heights/s | 4.0 body-heights | 0.062 m (3.1×) |

`flatJumpRange`, `jumpHeight`, `walkSpeed`, `stepHeight`, `gravity` and the mantle ledge/reach
envelope are all **unchanged in metres** at every scale, by design (this is what keeps existing
authored courses reachable) — the table's "body-heights" columns are exactly why the *relative*
feel gets faster as the body shrinks, even though nothing about crossing distances moved.

### 2. Real Chrome, both bundled samples, at each candidate

Ran the product's own `tests/e2e/browser/gameplay.test.ts` (real `channel: "chrome"`, pointer lock,
full checkpoint/mantle/jump/respawn/completion flow) on a disposable port
(`OBJECTQUEST_E2E_PORT=15991`, well clear of the protected 5173/8787/15173/18799):

- **At the chosen 0.175 m:** the Rodin sample ("The desk & sofa adventure") completes pause/resume,
  manual respawn, jump (apex clears the test's own `> +0.25 m` bar), fall + automatic respawn, and
  collects all 3 checkpoints up to and including the mantled/elevated one — same as at 0.35 m —
  **except** one assertion: `expect(elevated.maxY).toBeGreaterThan(1.4)` failed at `1.3935`.
  Diagnosed exactly: that `1.4` is a hardcoded absolute world-Y sanity check in a file I do not own
  (`tests/e2e/browser/gameplay.test.ts`), implicitly calibrated to the *old* 0.35 m capsule's
  standing height on that furniture (`FURNITURE_TOP(1.286) + halfCapsule(0.175) + skin(0.02) =
  1.481`, comfortably over 1.4). At 0.175 m the same arithmetic gives `1.286 + 0.0875 + 0.02 =
  1.3935` — the exact number observed. The character genuinely reached the elevated surface (every
  other assertion in that same test run — `mantleObserved`, checkpoint count, `playerPosition.y`
  in my own scale-aware `authoredCourse.test.ts` — agrees); only this one incidental threshold
  needs a one-line update (e.g. to a value derived from the running scale, or just lowered) by
  whoever owns that file. **Reporting this, not fixing it** — it is outside my ownership.
  Re-verified this is genuinely a byproduct of the scale change and not a flake: it is present at
  0.175 m and would be marginal even at 0.20 m (predicted `1.406`, a 6 mm margin), but is **not**
  present at the current 0.35 m baseline (confirmed by re-running the identical test at 0.35 m:
  passes clean).
- The Tripo sample ("A different perspective") also failed, stuck approaching checkpoint 5
  (`mantleRejection: "top-not-standable"`, pinned against geometry for 38 simulated seconds).
  **Confirmed pre-existing and unrelated to this change**: re-ran the identical test at the
  *current, unmodified* 0.35 m baseline and it fails the exact same way (`mantleRejection:
  "top-not-standable"`, stuck at the same target). Not investigated further — it predates this
  session and is not something a character-scale change caused or can fix; flagging for whoever
  triages it next, consistent with how the landing owner logged a similarly pre-existing,
  out-of-scope failure in `VISUAL_REFINEMENT_PLAN.md`.

### 3. Real spawn/camera screenshots, all four candidates plus the current baseline

`tests/e2e/browser`'s own bundled Rodin sample, real Chrome, on a disposable port
(`nimbalyst-local/tmp-scale-refinement/spawn-views.test.ts`, not committed): spawn, a 2-second walk,
and a jump, at 0.35 (before) / 0.20 / 0.175 / 0.15 m. Kept in
`nimbalyst-local/screenshots/scale-refinement-kept/` (`h035-before-*`, `h020-*`, `h0175-after-*`,
`h015-*`).

**Important finding from these**: the four in-game spawn screenshots are visually
near-identical. This is not a measurement mistake — it is the intended consequence of
`CameraRig`'s boom and target-lift being *ratios* of the capsule's own height
(`CAMERA_MIN_DISTANCE_RATIO`, `CAMERA_TARGET_LIFT_RATIO` in `constants.ts`, unchanged by this
work): the character's apparent size on screen is framing-invariant across the whole explored
range. That vantage point also happens to sit right under a low overhang, so the boom is
collision-clamped to nearly the same real-world position at every scale, which suppresses even
the furniture-loom effect there. **This is why the sofa-comparison harness, not the in-game chase
camera, is the correct way to judge "does this look convincingly giant"** — the chase camera's job
is to keep the character legible, not to convey absolute scale.

The `character-preview.ts` sofa-rig screenshots do show it plainly:
`candidates-on-sofa.png` (0.70 / 0.35 / 0.20 / 0.175 / 0.15 m against the same 8 m × 3.4 m sofa
proxy, external fixed camera) — the character visibly shrinks at every step, monotonically.
`candidates-under-sofa.png` and `candidates-closeup-under-sofa.png` show the same candidates in
the gap under a raised sofa, where 0.35/0.20/0.175 are individually distinguishable in size.
(`candidates-close-on-sofa.png` — the sub-0.35 m-only version of the top-down shot — is included
but, being zoomed for the full sofa, the smallest three still read as near-equal dots; the closeup
under-sofa shot is the one that actually resolves them.)

## Why 0.175 m, not 0.20 or 0.15

- All three pass every reachability/camera-collision/real-browser check with margin (see tables
  and section 2 above). This was not a case of one candidate breaking and the others surviving.
- 0.175 m is a clean second halving of the shipped 0.35 m, which is easy to reason about and keeps
  the walkMaxSpan/flatJumpRange margin (10.2%) safely clear of the tighter end of the range (8.8%
  at 0.15 m) while still being a substantial, visibly different step down from what the user
  rejected as too large.
- Camera near-clip (0.02 m) is not a binding constraint anywhere in this range — the closest the
  boom is ever allowed to pull in (`characterRadius * CAMERA_MIN_DISTANCE_RATIO`) stays 3–7× the
  near plane across 0.35→0.15 m; going further, down to ~0.10 m, would still clear it by ~2×. This
  was not the deciding factor.
- Because the chase camera is framing-invariant (see above), going smaller than 0.175 m does not
  buy additional on-screen legibility of the character — the only thing that changes further is
  the walk-speed/jump-height-in-body-heights ratio (see next section) and the safety margin. Both
  point away from the smallest end of the range.

## Speed/jump feel — quantified, not tuned

`walkSpeed` (2.2 m/s) and `jumpHeight` (0.6 m) are unchanged in metres at every scale, by design —
that is what keeps every authored course's crossing distances identical regardless of body size.
As the body shrinks, the same absolute numbers necessarily read as faster/higher relative to it:
6.3 body-heights/s and a 1.7-body-height jump at the current 0.35 m, rising to 12.6 body-heights/s
and a 3.4-body-height jump at 0.175 m (full table above).

**Not tuned.** Two reasons: (1) the real-browser evidence in section 2 shows the character
actually navigating, jumping, and completing checkpoints at 0.175 m without difficulty — nothing
in the automated play read as broken or uncontrollable, only quantifiably brisk; (2) the only
levers available inside my own ownership that would change this — `walkSpeed`, `jumpHeight`,
`gravity` inside `toMiniatureScale()` — are exactly the capability-envelope values the existing
design (and its tests) deliberately hold fixed to guarantee every authored course's reachability
limits do not move. Touching them would require re-verifying every course's reachability from
scratch and risks silently breaking one that currently passes, for a purely subjective feel
adjustment with no automated way to confirm "too fast" vs. "appropriately energetic". Recorded here
as an explicit, quantified trade-off for the user's own playtest to weigh in on, per
`user-does-manual-browser-testing` — not a decision made unilaterally.

## Verification run at the final value (0.175 m)

- `characterScale.test.ts` 14/14, `cameraRig.test.ts` 4/4, `authoredCourse.test.ts` 4/4,
  `mantle.test.ts` 14/14, `simulation.test.ts` 17/17, `placementValidation.test.ts` 2/2 — **55/55**,
  vitest.
- `tsc -p tsconfig.json --noEmit` — clean, zero errors anywhere in the tree (checked before
  concluding, so any pre-existing peer WIP was already clean at the time).
- Real Chrome (`channel: "chrome"`) `tests/e2e/browser/gameplay.test.ts`, disposable port 15991:
  Rodin sample — pause/resume, manual respawn, jump, fall+auto-respawn, mantle, 3/5 checkpoints all
  pass; fails only on the out-of-ownership hardcoded-threshold line diagnosed above. Tripo sample —
  fails identically to the unmodified 0.35 m baseline (pre-existing, confirmed, unrelated).
- Real Chrome spawn/camera evidence at the final value:
  `nimbalyst-local/screenshots/scale-refinement-kept/h0175-after-01-spawn.png` (grounded, no
  drop-in — `playerPosition.y - halfCapsule ≈ 0`, matches `groundHeightBelow ≈ 0`),
  `…-02-mid-walk.png`, `…-03-near-jump-apex.png`.
- Protected ports 5173 / 8787 / 15173 / 18799 confirmed listening, untouched, before and after
  (checked via `netstat`). All disposable servers (Vite on 15981/15991/15992/15993, Playwright's
  own webServer instances) shut down.

## Limitations, stated plainly

- Subjective feel ("does 0.175 m, at this camera framing, *look* and *play* right") is the user's
  own playtest to make, per `user-does-manual-browser-testing.md`; this checkpoint provides
  quantified evidence, a same-world before/after screenshot pair, and passing gameplay tests, not
  an acceptance claim.
- **Resolved in the reopen, superseding the line that used to be here**: the `elevated.maxY > 1.4`
  assertion is fixed (derived from checkpoint-authored data, not a re-tuned magic number — see
  above), and the Rodin sample now runs 3/3 all the way to `finishAndReplay`, not just to
  checkpoint 3.
- The Tripo sample's `checkpoint-5` approach is broken independently of this change, confirmed
  pre-existing at the unmodified 0.35 m baseline, and observed **intermittent** across this
  session (2 failures, 1 pass, identical signature each time) — not investigated or fixed, out of
  scope for a character-scale/camera pass.
- One pre-existing rendering artifact (an unlit black underside when standing directly beneath the
  desk overhang) is more visually prominent with the wider FOV; not a clipping bug, not fixed here
  (`SceneLighting`/`styleMaterial`, out of ownership) — see the reopen section for the exact
  evidence that rules out a collision regression.
- Checkpoint *trigger* positions are not re-seated by scale the way spawn/respawn positions are —
  found while fixing the test assertion, does not currently break anything, not fixed (out of the
  narrow test-only grant) — flagged above for whoever owns `checkpoints.ts`/`samples.ts`.
- I did not run the full repository test suite (`npm test`) at any point in either pass, per the
  brief's instruction to avoid repeated full-suite runs while peers are moving in the shared tree;
  the focused files covered above exercise everything that reads `characterScale.ts` / `cameraRig.
  ts` / `GameStage.tsx` / `constants.ts` directly, plus the real end-to-end browser gameplay test.
- No new npm dependency, no provider/publish/upload/generation call of any kind, in either pass.

## REOPEN — visible in-game camera framing, plus a real full Rodin pass through finish

The first pass's own screenshots proved the problem it then excused: a real spawn/gameplay
screenshot looked the same at 0.35 m and at 0.175 m. That is a real defect in the *camera*, not an
acceptable property of "how chase cameras work" — the coordinator correctly rejected treating the
external studio render as a substitute for the actual production view. This section is the fix,
entirely inside owned camera paths, plus the narrowly-granted test fix.

### What changed, and why it is bounded

`cameraRig.ts`'s boom and target-lift were plain ratios of the capsule's own height, so the
character's apparent screen size — and therefore how much of the room fits around it — never
changed with scale; only the external, non-production sofa-comparison render showed the shrink.
Two changes, both pure camera/projection, neither touching physics, the collider, or any world/
spawn data:

1. **`CAMERA_MINIATURE_PULLBACK_RATIO = 1.6`**, in `characterScale.ts`. Applied only to the
   *nominal* (unoccluded) `camera.distance` inside `toMiniatureScale()` — `collisionPadding` still
   gets the plain body-height factor, since it sizes the occlusion sweep's own clearance ball and
   widening it would make the camera duck away from furniture earlier than it needs to. Bounded by
   construction: `CameraRig.update()`'s existing occlusion sweep (unmodified) still shortens the
   boom the instant this longer nominal length would clip through anything, so this can only widen
   the *open* framing — it cannot introduce a new clipping path. At 0.175 m this raises
   `camera.distance` from 0.625 m to 1.0 m (authored is 2.5 m; still clearly the smaller boom).
2. **`GAMEPLAY_CAMERA_FOV_DEGREES = 72`**, in `constants.ts`, applied once in `GameStage.tsx` via a
   `useEffect` that sets `camera.fov` (guarded to `PerspectiveCamera` instances) and calls
   `updateProjectionMatrix()`. The Canvas's own declarative `fov: 55` in `GameView.tsx` (not my
   file) is left as the initial mount value; this overrides it a frame later, inside my own
   assigned camera path, without touching that file. FOV is a pure projection parameter — it does
   not appear anywhere in `CameraRig.update()`'s occlusion/minimum-distance math, so that behaviour
   is provably unaffected.

Initial camera **yaw** was left alone: it is set from `manifest.spawn.headingRadians` in
`GameView.tsx`/`InputController` (not mine), and it drives movement-relative-to-camera as well as
the view — decoupling it from movement to chase a framing win would be a much larger, riskier
change than the two above, and was not needed once the boom/FOV combination gave a clear result.

### Test evidence for "bounded, not fake, not clipping"

- `characterScale.test.ts` (14/14) and `cameraRig.test.ts` (4/4) rewritten to assert the new,
  intentional relationship instead of the old (now-wrong) "framing is unchanged" one: the boom
  ratio at miniature scale is exactly `CAMERA_MINIATURE_PULLBACK_RATIO` times the authored one; the
  look-at lift and minimum-distance ratios (both sized straight from `characterRadius`, not from
  `camera.distance`) are untouched; the miniature boom is still shorter than the authored one in
  absolute metres; occlusion under a 0.55 m sofa gap still holds (same test, unmodified physics).
- `tsc -p tsconfig.json --noEmit` — clean, zero errors, after these edits.
- Full focused suite — `characterScale.test.ts`, `cameraRig.test.ts`, `authoredCourse.test.ts`,
  `mantle.test.ts`, `simulation.test.ts`, `placementValidation.test.ts`, plus the character
  render/rig/animator tests (nothing here touches character geometry, but re-ran them since
  `GameStage.tsx` was edited) — **93/93 pass**.

### Real production before/after, same world, same spawn, same camera code path

Real Chrome (`channel: "chrome"`), the actual bundled "The desk & sofa adventure" sample, disposable
port, isolated `cacheDir` (see addendum above) — `nimbalyst-local/tmp-scale-refinement/spawn-views.test.ts`:

- **Before**: `nimbalyst-local/screenshots/scale-refinement-kept/h035-before-01-spawn.png` — the
  originally-rejected 0.35 m capsule, FOV 55°, boom 1.25 m. Character fills a large fraction of
  the frame; the desk overhang crops out of view almost immediately above it.
- **After**: `nimbalyst-local/screenshots/scale-refinement-kept/h0175-pullback-fov72-01-spawn.png` —
  0.175 m capsule, FOV 72°, boom 1.0 m (`CAMERA_MINIATURE_PULLBACK_RATIO` applied). The character
  is visibly and substantially smaller on screen (roughly 40% of its previous pixel height at the
  same viewport), the full desk overhang and its legs are in frame, and a wide extra area of floor
  (including a second floor patch to the right, previously entirely out of frame) is now visible.
  This is the same spawn point, same manifest, same camera code path — not the external
  sofa-comparison render.
- Two intermediate captures exist for anyone auditing the delta:
  `h0175-fov72-01-spawn.png` (FOV widened, pull-back not yet applied — a smaller, partial effect)
  and `h0175-after-01-spawn.png` (the pre-reopen state: pull-back and FOV both still at the old
  values, confirming the "near-identical" finding that triggered the reopen was accurate at the
  time).

**One pre-existing rendering artifact, not caused by this change**: walking forward from spawn
until standing directly under the desk overhang shows a large, unlit black region where its
underside is in frame (`…-02-mid-walk.png`, `…-03-near-jump-apex.png`, both before and after).
Confirmed present, just smaller, in the pre-reopen `h0175-after-02-mid-walk.png` too — this is a
lighting/material characteristic of that mesh's underside (`SceneLighting`/`styleMaterial`, not my
files), not a camera-collision bug: `cameraOccluded` and `cameraDistance` at that moment are
consistent with the boom correctly sitting in open air below the desk, looking up at an unlit
back-face, not clipped into geometry. The wider FOV does make it occupy more of the frame in that
one specific spot. Flagging for whoever next touches that mesh's material/lighting; not fixed here
(out of ownership), and not disqualifying — a player is not stationary directly under a low
overhang for most of a level, and the framing win at spawn and in open areas is the point of this
change.

### Narrow `tests/e2e/browser/gameplay.test.ts` fix — full Rodin course to finish, not 3/5

Per the coordinator's explicit, narrow grant: replaced `expect(elevated.maxY).toBeGreaterThan(1.4)`
— a hardcoded absolute world-Y that was implicitly calibrated to the *previous* 0.35 m capsule's
standing height on the desk (diagnosed exactly in the pre-reopen section above) — with an
assertion derived from the checkpoint's own authored data, not a re-tuned magic number:

- The next checkpoint's `position` is a capsule *centre*, stored by `standOn()` in
  `src/scene/samples.ts` as `surfaceY + DEFAULT_MOVEMENT_CONFIG.characterHalfHeight +
  characterRadius + 0.02`, always against the authored config regardless of which scale is
  actually running. Recovering `surfaceY = nextCheckpointPosition[1] - 0.37` before the approach
  gives the real, scale-independent support-surface height the mantle has to land on (it comes out
  to `1.286` for this checkpoint — exactly `RODIN_DESK_Y` in `samples.ts`, an independent
  cross-check that the recovery is correct).
- The new assertion bounds `elevated.maxY` between `surfaceY - 0.05` (must have actually reached
  the surface, not stalled below it) and `surfaceY + AUTHORED_STANDING_OFFSET + 0.05` (must not be
  implausibly far above it — using the *authored* capsule's own standing offset as the ceiling,
  since every miniature scale this game ships is shorter than authored, never taller). This is
  correct at whatever capsule height is running, not just today's 0.175 m.
- Also documented, **found but not touched, out of the narrow grant**: checkpoint *trigger*
  positions (used by `updateCheckpoints` in `src/game/core/checkpoints.ts` for the actual 3D-radius
  collection test) are never re-seated by scale the way spawn/respawn positions are by
  `reseatCapsuleCentre()` — they stay at the authored-scale capsule-centre height forever. This
  does not currently break anything (the 0.4 m trigger radius comfortably absorbs the up-to-~0.3 m
  vertical gap this creates at 0.175 m), so it was not in scope to fix, but it is the same category
  of bug class `reseatCapsuleCentre` exists to prevent and is worth someone owning
  `checkpoints.ts`/`samples.ts` picking up.

**Full course verified to finish, not just to the elevated checkpoint**: ran the fixed test three
times end to end at the final camera settings (0.175 m, pull-back + FOV) through a cache-isolated
disposable harness (`nimbalyst-local/tmp-scale-refinement/playwright.gameplay.config.ts`, not
committed — points at the product's real, unmodified `tests/e2e/browser/gameplay.test.ts` via
`testDir`, with its own `--config vite.disposable.config.mjs` webServer) — **3/3 pass**, all the
way through pause/resume, manual respawn, jump, fall+auto-respawn, all 5 checkpoints including the
mantled one, `finishAndReplay`.

### Tripo sample — retained exact baseline evidence, not expanded into

Per the explicit instruction, this was not investigated or fixed. Ran it three times across this
session at the current settings: **2 failures, 1 pass**, all with the identical signature
(`mantleRejection: "top-not-standable"`, stuck near the same position approaching checkpoint 5,
`checkpointsCollected: 4`). It fails identically at the unmodified 0.35 m baseline (confirmed in
the pre-reopen section). Conclusion: this is a **pre-existing, intermittent/flaky** failure on that
sample, unrelated to character scale or camera changes (camera framing does not touch mantle
probing or physics), present before this session and not caused or fixed by it. Retained here as
the exact, honest evidence rather than a single cherry-picked run.

## Reproduce

```
npx vitest run src/game/core/characterScale.test.ts src/game/render/cameraRig.test.ts \
  src/game/core/authoredCourse.test.ts src/game/core/mantle.test.ts \
  src/game/core/simulation.test.ts src/game/placementValidation.test.ts \
  src/game/render/character

npx tsc -p tsconfig.json --noEmit

# Full product gameplay e2e through a cache-isolated disposable harness (see addendum):
OQ_SCALE_PORT=16010 npx playwright test \
  --config nimbalyst-local/tmp-scale-refinement/playwright.gameplay.config.ts

# Sofa-scale comparison harness (nimbalyst-local/character-preview.ts, committed):
npx vite --config nimbalyst-local/tmp-scale-refinement/vite.disposable.config.mjs --port 15981 --strictPort
#   /nimbalyst-local/character-preview.html?scene=sofa&heights=0.7,0.35,0.2,0.175,0.15
#   /nimbalyst-local/character-preview.html?scene=sofa&under=1&cam=closeup&heights=0.35,0.2,0.175,0.15

# Real production spawn/camera evidence (before/after, isolated cache):
OQ_SCALE_LABEL=my-label OQ_SCALE_PORT=16011 npx playwright test \
  --config nimbalyst-local/tmp-scale-refinement/playwright.config.ts
```
