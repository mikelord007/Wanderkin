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

---

# Third pass: material/lighting refinement (`fc121b1`, `b012dd2`)

- Reviewer: fresh Claude Sonnet worker, same coordinator. Runtime model, from this
  session's own environment block: **Sonnet 5** (`claude-sonnet-5`). No subagents.
- Read-only. No product paths touched by me. Mid-review, a **new** active worker appeared
  (`nimbalyst-local/tmp-blackpatch-investigation/`, `vite.oq-blackpatch.config.ts` at repo
  root, and a live uncommitted change to `src/scene/styleMaterial.ts` — a
  `RELIT_MINIMUM_BRIGHTNESS_FRACTION` floor, unrelated to and layered on top of the frozen
  commits below). Detected this via `git status`/`git diff` before drawing conclusions,
  confirmed the live diff only touches `cloneStyledMaterial`/`installStyleShader`'s call
  signature and adds a brightness floor — nothing in the two frozen commits' surface — and
  re-derived every finding below from `git show fc121b1`/`git show b012dd2` (the frozen
  blobs), not from a raw `Read` of the current working-tree file, which would have been
  contaminated by that live edit. Did not touch, stash, or otherwise interact with that
  worker's files. `git stash list` only (4 stashes, untouched).

## Findings, most severe first

### 1. [Moderate — doc/implementation mismatch, mitigated in practice] The known-asset hash gate trusts a declared manifest field, not a hash "computed from the fetched bytes at load time" as documented

`materialRegions.ts`'s own doc comment claims: "Profiles are keyed by the asset's actual
decoded content hash (`LoadedSceneAsset.sha256`, computed from the fetched bytes at load
time)... a renamed, duplicated, or user-regenerated asset can never accidentally inherit a
mapping it was not measured against." Traced the actual wiring:

- `SceneEntities.tsx:94` builds the hash it passes to `cloneStyledObject` from
  `manifest.assets.map((asset) => [asset.id, asset.sha256])` — i.e. `AssetReference.sha256`
  (`shared/manifest.ts:32`), a plain **declared string field in the persisted manifest
  JSON**.
- The actual `LoadedSceneAsset` type the renderer works with (`src/scene/runtime.ts:33`) has
  **no `sha256` field at all** — `loadSceneAsset()` (`runtime.ts:50`) calls the loader that
  does compute a real hash from fetched bytes (`src/scene/loader.ts:179`,
  `hashBytes(bytes)`), then explicitly discards it, returning only `{ scene, collision }`.
  There is no code path anywhere that re-hashes the fetched GLB bytes and compares them
  against the manifest's declared value at the point this material-region decision is made.
- So, read literally, the doc comment describes a client-side, load-time verification that
  does not exist in this code. A manifest whose `sha256` field falsely claims the known
  Rodin hash (`c750cb2c1f...`) while its `url` actually serves a different mesh would
  incorrectly receive the Rodin-specific wood/fabric shader (with that asset's specific
  world-space X divider and grain/weave patterns) — a client-only rendering glitch, not a
  security/data issue, but exactly the "arbitrary label on a mixed mesh" failure mode this
  mechanism exists to prevent.
- **Mitigating factor, found by tracing further**: `server/levels.ts` independently
  recomputes `sha256 = createHash("sha256").update(buffer).digest("hex")` from the actual
  embedded bytes and **rejects** the request (`InvalidBundleError`) if it doesn't match the
  manifest's declared `asset.sha256`, at both the two places a manifest's asset list is ever
  written: export (`levels.ts:423-425`) and import (`levels.ts:508-510`). The freshly-
  generated-world path also derives the field from `loader.ts`'s real computed hash
  (`prepare.ts:156`, `options.sha256 ?? loaded.sha256`). So in practice, every manifest a
  player ever loads for play has already had its `(url, sha256)` pairing validated
  server-side at creation time — the client re-trusting it on read is a defensible
  verify-once-at-write pattern, not an open spoofing hole, *provided* no other code path can
  mutate a manifest's asset list without going through one of those two validated writers
  (I did not audit the full manifest-mutation surface for that — out of scope for two
  material commits).
- For the one asset that actually has a region profile today (the bundled, git-tracked
  `public/samples/rodin.glb`), I independently re-verified its real sha256
  (`c750cb2c1fcd2197f8c373b791703bc90073075e11d08cafb0be4d84012d54b8`) matches both the
  hardcoded profile key and `samples.ts`'s declaration exactly — so there is no live
  mismatch today.
- **Net**: downgrade from "the code lacks the safety property" to "the code comment
  overclaims *how* the safety property is achieved, and no test exercises the actual
  `SceneEntities.tsx` wiring at all" — `materialRegions.test.ts`/`styleMaterial.test.ts`
  only ever pass hash strings directly into the pure functions, never through the real
  manifest-to-hash path. Worth a one-line doc correction and, ideally, a test that the
  wiring reads `manifest.assets[].sha256` and not something else — but not a functional bug
  given the server-side write-time validation found above.

### 2. [Minor — evidence gap] The "sofa's underside" same-camera comparison has no "after" screenshot

The checkpoint states the before/after evidence covers three subjects: "the sofa's fabric
region, the desk's wood-region top surface, and **the sofa's underside**" — and the
underside case is the specific, named motivating example for the hemisphere ground-colour
fix ("every downward-facing furniture surface (a desk's underside, a sofa's frame) pick up a
thematically-wrong green tint... this is the specific mechanism behind 'readability beneath
furniture'"). Checked the actual delivered files
(`nimbalyst-local/screenshots/materials/`): `before-sofa-underside-baked-flat.png` exists,
but there is **no** matching after-shot — only `after-desk-relit-wood-grain.png`,
`after-sofa-relit-fabric-weave.png`, and `after-tripo-unknown-asset-safe-relight.png` (a
different subject entirely). Viewed the two pairs that do exist
(`before-desk-top-flat.png`/`after-desk-relit-wood-grain.png`,
`before-sofa-fabric-flat.png`/`after-sofa-relit-fabric-weave.png`): both are genuinely
controlled, same-camera, same-HUD-state comparisons (identical distance readout, identical
sun icon position) and both show a real, visible lighting/shading difference, not a
no-op — so the relighting mechanism itself is credible. But the one comparison specifically
about the underside/hemisphere-colour claim is simply missing its "after" half; the code
change (`SceneLighting.tsx`'s hemisphere-ground blend) is real and I read it directly, but
its own headline visual claim is not fully substantiated by the delivered evidence set.

### 3. [Note, not a defect — methodological caution for whoever reads screenshots across workers] Don't use the scale worker's spawn screenshots as material/lighting evidence

The scale-refinement checkpoint's `h035-before-01-spawn.png` / `h0175-pullback-fov72-*.png`
before/after pair (reviewed in my second pass) shows a dark, unlit patch under the desk
overhang in *both* frames. That pair varies capsule scale, camera pull-back, and FOV — not
lighting — and its "before" and "after" captures were taken at different points in a
timeline that also straddles these material commits landing, so it is not a controlled,
single-variable comparison for anything about `fc121b1`/`b012dd2`'s lighting work. I did not
treat it as such; flagging explicitly so a future reader doesn't cite those images as
evidence for or against the material work either way. The material checkpoint's own
before/after pairs (finding 2 above) are the only controlled comparisons for that.

### 4. [Note, not a defect — flagging per instruction rather than accepting at face value] The shadow-map "fallback" is an accessibility signal, not a device-capability check

`SceneLighting.tsx`'s corrected cost accounting (2048 vs. 1024 shadow map side length = 4x
texel area, not free) is arithmetically correct — verified: doubling each of two dimensions
is indeed 2×2=4x the area. The checkpoint is appropriately hedged about what the
`usePrefersReducedMotion()` fallback actually is: it calls it "a proxy for 'reduce visual
load'" and never claims it solves the cost problem for constrained devices generally
(grepped the checkpoint for "device"/"budget"/"low-end"/"GPU capacity" framing — found none
that overclaims this). Independently confirmed the underlying hook is genuine, pre-existing
(`useReducedMotion.ts`, predates this work) and the "same signal `SceneEnvironment` already
uses" claim is accurate in substance (`GameView.tsx` computes it once and passes it to
`SceneEnvironment`; `SceneLighting.tsx` now computes the same OS/browser signal a second
time independently, since threading it through `GameStage.tsx` was out of this worker's
owned paths). Stating this per the review instruction rather than treating the fallback as
proof the performance concern is closed: **prefers-reduced-motion is an accessibility
opt-in, not a GPU-capability signal.** A user with a genuinely weak GPU who has not enabled
reduced motion still pays the full 4x shadow cost every frame; a user who enabled reduced
motion for motion-sickness reasons (unrelated to their GPU) gets a lower-fidelity shadow
they didn't ask for. Neither the checkpoint nor the code claims otherwise, so there is no
misleading claim to correct here — but there is a real, still-open gap: no actual
device/GPU-capability-based fallback exists for this cost.

## Verification performed

- Read `fc121b1`/`b012dd2` diffs directly (`styleMaterial.ts`, `materialRegions.ts`,
  `materialRegions.test.ts`, `styleMaterial.test.ts`, `SceneLighting.tsx`,
  `SceneEntities.tsx`) rather than trusting the checkpoint prose, cross-referencing every
  quoted constant/hash against its actual source (`shared/movement.ts`-style
  cross-referencing, applied here to `shared/manifest.ts`, `samples.ts`, `loader.ts`,
  `runtime.ts`, `server/levels.ts`).
- `sha256sum public/samples/rodin.glb` → matches the hardcoded profile key and `samples.ts`
  exactly (independent re-verification, not trusting the checkpoint's own claimed hash).
- Read the actual PBR-preservation test fixtures line by line to confirm they exercise the
  *new* `normalMap`/`metalnessMap`/`roughnessMap` guard specifically (the narrow
  `isBakedEmissiveOnlyMaterial` unit test does; the broader `cloneStyledObject`
  end-to-end test is redundant with a pre-existing `map`-presence check but still a valid
  outcome-level test) — initially suspected a coverage gap here, verified it does not
  actually hold once the fixtures were read in full.
- Viewed the actual delivered before/after PNGs (not just their filenames) for both matched
  pairs and the unmatched "before-sofa-underside" shot.
- Did not re-run `vitest`/`tsc` against the working tree: `src/scene/styleMaterial.ts` is
  currently dirty from the unrelated live "blackpatch" investigation, so any run right now
  would test a mixed state, not the frozen `b012dd2` commit, and would not honestly
  attribute results to either worker. Cross-checked the claimed "26 tests (was 23)" count
  instead by counting the actual new `it()` blocks in the `b012dd2` diff (3 new — one
  narrow-guard test, two PBR-preservation tests) against 23 prior, which matches exactly (a
  static, arithmetic check, not a re-run).
- Did not touch any protected port, provider, or the paused Finish/share stash.

## Bottom line (third pass)

Both material commits are well-evidenced and mostly hold up under direct tracing: the
baked-emissive relight mechanism, the hash-gated wood/fabric region split for the one known
asset, the Mikkelsen bump-math bug-fix, and the genuine-PBR-preservation guard are all real
and correctly scoped to exactly what they claim, with tests that actually exercise the code
paths described (with the one caveat on finding 1: the manifest-hash wiring itself is
untested, only the pure lookup function is). Two concrete gaps, not previously reported: (1)
the known-asset gate's own doc comment overclaims how its safety property is achieved — real
mitigation exists, but one level higher in the pipeline (server-side, at write time) than
documented (client-side, at load time) — and the wiring that reads it has no direct test;
(2) the specific "sofa underside" before/after comparison named in the checkpoint has no
delivered "after" image. Neither blocks approval on its own, but both are real,
independently-verified gaps that should not be waved through as "fully proven" on this
checkpoint's evidence alone. The residual "no true GPU-capability fallback for the shadow
cost" point (finding 4) is an honest, already-disclosed limitation, not a new defect.

---

# Fourth pass — FINAL: material source freeze at `7ec73b2` (`28fa5d2` + `7ec73b2` on the approved base)

- Reviewer: fresh Claude Sonnet worker, same coordinator. Runtime model: **Sonnet 5**
  (`claude-sonnet-5`), from this session's own environment block. No subagents.
- Confirmed frozen tip before reviewing anything: `git log` → HEAD `7ec73b2`, parent
  `28fa5d2`, parent of that `b012dd2` (my third-pass base). `git status --short` and
  `git diff --stat` both empty except pre-existing untracked scratch from other workers —
  material owner genuinely idle, nothing moving. Read-only; no source edits.
- Did not touch the paused Finish/share stash — `git stash list` only (4 entries, same as
  every prior pass, none applied/dropped/inspected).

## Delta review

### `28fa5d2` — dark-tone/crush fix: real regression, real fix, correctly scoped

Read the diff directly (`styleMaterial.ts`, `styleMaterial.test.ts`). Confirms this is the
proper fix for the exact issue the scale/camera owner and coordinator flagged (furniture
undersides reading near-black): captures each relit material's own raw baked colour
(`diffuseColor.rgb` right after `#include <map_fragment>`, in linear space) and floors the
*final*, tonemapped/graded colour at 45% of that colour's own re-encoded (`pow(x, 1/2.2)`)
display brightness, via a per-channel `max()` — so it can only ever brighten a pixel lighting
pushed below that floor, never darken one above it. Gated correctly behind `wasRelit` (the
same flag `isBakedEmissiveOnlyMaterial` already computed), so it only ever touches materials
this pipeline actually relit — confirmed by the two new tests, which check the shader
plumbing (`oqRelitFloor` uniform, `oqBakedAlbedo` capture) is present for a relit material and
completely absent for an untouched one.

**Verified the visual evidence directly, not just the filenames**: viewed all four
`underfurniture-crush-fix/` screenshots. `2-relit-before-fix-crushed-black.png` genuinely
shows a flat, near-featureless black underside; `3-relit-after-floor-fix.png` (identical
camera/HUD state) shows a clearly visible warm dark-brown surface with real detail — a real,
visible fix, not a placebo. `4-desk-top-unaffected-by-floor.png` still shows the
directly-lit, previously-verified wood grain looking exactly as before — confirms the floor
does not wash out already-well-lit surfaces, as claimed.

**Math sanity-checked, not blindly trusted**: the gamma round-trip
(`pow(clamp(oqBakedAlbedo,0,1), vec3(1/2.2))`) is a reasonable approximation for undoing sRGB
texture decode without replicating the renderer's full ACES tonemapping — the checkpoint
itself flags this as intentionally approximate ("a reasonable perceptual floor, not an exact
reproduction"), which I agree is an honest characterization: a hand-derived expected pixel
value from this formula alone doesn't land exactly on the measured RGB(36,30,22) (ambient/fill
lighting and a small non-albedo-tinted specular term also contribute to the final colour, which
the floor's own approximation doesn't model), but the *actual, empirically measured* result —
verified independently below via a live re-render, not just the checkpoint's own screenshots —
is real and matches the qualitative claim ("visibly distinct, still shadowed, no longer
crushed").

### `7ec73b2` — loader-hash propagation: correctly closes my third-pass finding #1

This is exactly the minimal, correctly-scoped fix for the gap I raised last pass. Read the
diff directly:
- `src/scene/runtime.ts`: `LoadedSceneAsset` gains `sha256: string | null`, populated in
  `loadSceneAsset()` straight from `loadAsset()`'s own `LoadedAsset.sha256` (the real hash of
  downloaded bytes, computed in `loader.ts` via `hashBytes(bytes)`) — never recomputed, never
  substituted.
- `src/game/render/SceneEntities.tsx`: now reads `asset.sha256` (from the `assets` map, i.e.
  the loader-computed value) directly. The `manifest.assets.map((asset) => [asset.id,
  asset.sha256])` lookup I flagged is gone entirely — the manifest's declared hash is no
  longer consulted anywhere in material-region selection.
- `src/game/assets/loadSceneAsset.ts`: `ParsedSceneAsset` (offline fixture-only parser) sets
  `sha256: null` — correctly honest, since that path never touches the network loader's
  hashing step. One mechanical line, no new behavior, exactly as the checkpoint describes.
- `src/scene/runtime.test.ts`: the new tests are genuinely end-to-end, not shortcuts — they
  stub `fetch` to serve the **actual bundled `rodin.glb`/`tripo.glb` bytes** (`readFileSync`
  from `public/samples/`) through the real `loadSceneAsset()` → real `loadAsset()` → real
  `hashBytes()` path, and assert: real Rodin bytes hash to the exact constant
  `materialRegions.ts` keys on; real Tripo bytes served at a "declared-Rodin-shaped" URL hash
  to something else entirely. This is the precise regression test my finding asked for —
  proof that bytes, not any declared/URL identity, drive the result. Ran the exact reasoning
  through independently rather than taking the checkpoint's word: traced every line of the
  diff against the actual `loader.ts`/`runtime.ts` source, confirms it does what it says.
- Cache/collision semantics: `loadAsset`'s cache is keyed by URL (unchanged, not touched by
  this diff); `sha256` is a passthrough field added to the returned shape, not a cache key —
  confirmed by reading `loader.ts`'s cache implementation was untouched in this diff (only
  `runtime.ts`'s adapter function and `SceneEntities.tsx`'s consumption changed). Collision
  building (`buildManifestCollision`) reads `LoadedAsset.triangles`, an entirely separate
  field, untouched.

**This closes my third-pass finding #1 correctly and completely.** The doc-comment/mechanism
mismatch I flagged is gone: the hash actually used for region gating is now, in fact, computed
from the fetched bytes at load time, exactly as `materialRegions.ts` always claimed.

### Matched-underside evidence (`after-sofa-underside-relit-floor-fixed.png`) — one precision note, not a defect

The new "after" screenshot **is** captured at the exact documented spawn coordinates
(`[-4.02, 0.09, -1.086]`, cross-checked against my own live diagnostics below: real spawn
reads `[-4.02, 0.1075, -1.086]` — same x/z exactly, y differs by ~2 cm, consistent with normal
skin/settling variance, not a different point). However, viewing
`before-sofa-underside-baked-flat.png` and the new `after-sofa-underside-relit-floor-fixed.png`
side by side, the apparent field of view and boom distance visibly differ between the two
(more terrain and a shifted sun-icon position in the "after" shot) — because the "before" shot
was captured when `fc121b1` first landed, **before** the scale/camera owner's `13caa6b`
(wider FOV, longer pull-back boom) existed, while the "after" shot was captured at the current
tip, **after** `13caa6b`. So this specific pair is same-world-position but not
same-camera-parameters — it closes the "no after image existed at all" gap I raised, but isn't
quite the single-variable comparison its framing implies. This does not undermine the fix
itself: the `underfurniture-crush-fix/` set (reviewed above) *is* a genuinely
camera-frozen, single-variable comparison and independently proves the same fix. Noting this
precisely rather than either rejecting the new evidence or accepting the "matched" framing at
face value.

## Final combined verification (this session, at the frozen `7ec73b2` tip)

- **Typecheck**: `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p server/tsconfig.json
  --noEmit` → both exit 0, zero errors.
- **Full unit suite**: `npx vitest run` (whole repo, appropriate now that the material owner
  is confirmed idle and nothing is moving) → **71 files / 505 tests pass**, zero failures.
  (Includes the 3 GLTFLoader "Couldn't load texture blob" stderr lines from
  `runtime.test.ts`'s real-bytes hash test — expected noise from Node's lack of image
  decoding, not a failure; the test still passes since it only needs the byte hash, not pixel
  decode.)
- **Production build**: `npm run build` (`tsc && vite build && tsc -p server/tsconfig.json`)
  → succeeds end to end, exit 0. `dist/assets/styleMaterial-*.js` and `dist/assets/runtime-*.js`
  chunks present and correctly bundled; `dist-server/server/` emitted. No new build warnings
  beyond the pre-existing large-chunk notices (`GLTFLoader`, `rapier.es`), unrelated to this
  work.
- **Bounded real-Chrome smoke** (Playwright `channel: "chrome"`, **not** the nimbalyst-browser
  MCP tool — that tool's headless session could not get the WebGL canvas past a 300×150
  placeholder after 35+ seconds with zero errors thrown, which reads as a limitation of that
  particular automation surface in this environment rather than a product regression, since
  the identical build renders correctly under real Chrome below; noting this rather than
  silently switching tools):
  - Disposable Vite server, **private `cacheDir`** under `os.tmpdir()`
    (`nimbalyst-local/tmp-final-smoke/vite.disposable.config.mjs`, deleted after use along
    with its cache dir), port 5196 — clear of protected 5173/8787/15173/18799.
  - Loaded `/`, clicked through to "The desk & sofa adventure" → `/play/sample-rodin-room-corner`
    (the actual Rodin sample with the region/floor treatment), waited for
    `window.__objectquest.get()` to report a running frame.
  - **Zero console errors, zero page errors** (both smoke scripts, ~2 real page loads).
  - Live diagnostics confirm the frozen camera change is real and active:
    `cameraDistance: 1` (matches the checkpoint's stated 0.175 m × pull-back result exactly),
    spawn `playerPosition: [-4.02, 0.1075, -1.086]` (matches the documented deterministic spawn
    within expected skin tolerance), `collisionTriangles: 50000`, canvas correctly sized
    1280×720.
  - Screenshots (`rodin-smoke-clear.png`, `rodin-smoke-walked.png`, viewed directly, not just
    generated): first frame shows the same wide, pulled-back framing as the checkpoint's own
    "after" evidence; after walking forward under the desk overhang, the underside is
    **visibly warm brown with real detail, not crushed black** — a live, independent
    re-confirmation of the `28fa5d2` fix working in the actual running build at this exact
    tip, not just in the checkpoint's own captured evidence.
  - Disposable server killed (Windows `taskkill` by PID, `pkill` unavailable in this shell),
    its private cache dir removed, scratch directory deleted. `git status` afterward shows no
    residue from this pass.
- **Protected services, read-only, before and after** — no restart, no cache/service change:
  `localhost:5173` → 200, `127.0.0.1:15173` → 200, `localhost:8787/api/capabilities` → 200,
  `localhost:18799/api/capabilities` → 200 (`18799/` root alone 404s, expected for an API-only
  server with no static index route — not a health signal).
- Did not re-run `tests/e2e/browser`'s full Playwright suite or any paid/provider/user-world
  path — the bounded smoke above covers "new framing/material shaders/controls render without
  error at this tip," which was the actual ask; the full Rodin finish-to-completion path was
  already proven 3/3 by the scale/camera checkpoint before this material-only delta, and
  nothing in `28fa5d2`/`7ec73b2` touches gameplay/physics/checkpoint logic.

## Outstanding, honestly summarized (nothing here is "all done")

- **Tripo sample, checkpoint-5 mantle rejection**: still open, still pre-existing, still
  unrelated to any material/lighting/camera work across all four passes of this review
  (confirmed again this pass: neither `28fa5d2` nor `7ec73b2` touches `checkpoints.ts`,
  `mantle.ts`, or `samples.ts`). Not investigated further this pass — out of scope, not caused
  or fixed by anything reviewed here.
- **Finish/share**: still paused on an explicit user stop; its stash still untouched across
  all four review passes. Not part of this review's scope and not touched.
- **Shadow-map reduced-motion fallback** (third-pass finding 4): unchanged, still an honest,
  disclosed limitation — an accessibility signal reused for cost reduction, not a genuine
  GPU-capability check. Not revisited or re-litigated this pass.
- **One remaining precision note** (not a blocking defect): the new matched
  sofa-underside screenshot pair is position-matched but spans a camera-parameter change from
  an unrelated commit (`13caa6b`), so it is weaker evidence than its "matched" framing implies
  — though the fix's correctness is independently proven by both the properly camera-frozen
  `underfurniture-crush-fix/` set and my own live re-render above.

## Final verdict

`fc121b1`, `b012dd2`, `28fa5d2`, and `7ec73b2` together are approved as the complete,
frozen material/lighting/region-identity work. Both concrete gaps raised in my third pass
(the hash-gating doc/implementation mismatch, and the missing underside evidence) are now
correctly closed by `7ec73b2` and `28fa5d2`/`7ec73b2` respectively, verified by reading the
actual diffs and re-deriving the reasoning rather than trusting the checkpoint prose, plus one
live, independent real-Chrome re-render at the exact frozen tip showing both the new camera
framing and the no-longer-crushed underside working correctly with zero console/page errors.
Full typecheck, full unit suite (505/505), and a full production build all pass cleanly at
this tip. This is not a blanket "everything in the project is done" — it is a scoped approval
of exactly the material/lighting/camera-identity commits reviewed across these four passes;
the Tripo flake and the paused Finish/share work remain open, exactly as already and honestly
disclosed.
