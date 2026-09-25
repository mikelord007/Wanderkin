# Checkpoint — scale-refinement (further miniature-scale reduction)

## Identity

- Worker: Claude Code, runtime-reported model **Sonnet 5** (`claude-sonnet-5`), from this
  runtime's own system context — self-reported by the harness, not independently verified
  against an external source. Nimbalyst session for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
- Started 2026-09-25. Baseline MAIN `3174932`.
- No subagents, no nested agents, no provider/publish/upload/generation calls, no new deps.
- Committed: `6f142b1c6b6c40ef99b32647feabfacecc7a275a` — `src/game/core/characterScale.ts`,
  `nimbalyst-local/character-preview.ts`, this checkpoint file. Nothing else staged.

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

- Subjective feel ("does 0.175 m *look* and *play* right") is the user's own playtest to make, per
  `user-does-manual-browser-testing.md`; this checkpoint provides quantified evidence and
  screenshots, not an acceptance claim.
- The `elevated.maxY > 1.4` assertion in `tests/e2e/browser/gameplay.test.ts` needs a one-line
  update by that file's owner (or explicit coordinator sign-off to extend my ownership to it) —
  otherwise that test will read as a regression on a future full-suite run at this scale, even
  though the underlying mechanic (reaching the elevated surface via mantle) is intact.
- The Tripo sample's `checkpoint-5` approach is broken independently of this change (confirmed at
  the current 0.35 m baseline too) and was not investigated further — out of scope for a
  character-scale pass.
- I did not run the full repository test suite (`npm test`), per the brief's instruction to avoid
  repeated full-suite runs while peers are moving in the shared tree; the six focused files above
  cover everything that reads `characterScale.ts`/`cameraRig.ts` directly.
- No new npm dependency, no provider/publish/upload/generation call of any kind.

## Reproduce

```
npx vitest run src/game/core/characterScale.test.ts src/game/render/cameraRig.test.ts \
  src/game/core/authoredCourse.test.ts src/game/core/mantle.test.ts \
  src/game/core/simulation.test.ts src/game/placementValidation.test.ts

OBJECTQUEST_E2E_PORT=15991 npx playwright test \
  --config tests/e2e/browser/playwright.config.ts tests/e2e/browser/gameplay.test.ts

# Sofa-scale comparison harness (nimbalyst-local/character-preview.ts, committed):
npx vite --port 15981 --strictPort
#   /nimbalyst-local/character-preview.html?scene=sofa&heights=0.7,0.35,0.2,0.175,0.15
#   /nimbalyst-local/character-preview.html?scene=sofa&under=1&cam=closeup&heights=0.35,0.2,0.175,0.15
```
