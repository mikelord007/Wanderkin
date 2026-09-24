# Checkpoint — gameplay owner (items 11 & 12)

## Identity

- Worker: Claude Code, runtime-reported model **Opus 5** (`claude-opus-5`), Nimbalyst session for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
- Started 2026-09-24, after 22:00 IST. Baseline MAIN `1de4f28`.
- No subagents. No provider/paid calls (none allocated). Assets will be authored in code, provenance recorded in source headers.

## Ownership (as assigned)

Owned, editable:
- `src/game/render/**`
- `src/game/core/**`
- `src/game/placementValidation.ts` + `src/game/placementValidation.test.ts`
- `src/game/types.ts` (only if narrowly needed)
- new character-only assets under `public/character/`

Explicitly NOT edited: `src/game/GameView.tsx`, `src/game/input/**`, `src/game/hud/**`,
`src/game/bundledSamples*`, `src/App.tsx`, UI/styles/editor/shared schemas/server, `src/scene/**`.

## Findings that shape the design

1. `PlayerAvatar.tsx` is a bag of capsule/sphere/cylinder primitives — exactly the
   "visibly assembled" look the user rejected. Replaced, not recoloured.
2. Scale today: assets are normalised so the **longest horizontal extent becomes 8 game
   metres** (`DEFAULT_ASSUMED_EXTENT_METERS = 8`, `src/scene/normalize.ts`). A 2 m real sofa
   therefore becomes 8 m long / ~3.4 m tall with a ~1.7 m seat. The capsule is
   0.70 m tall (`characterRadius 0.18 + characterHalfHeight 0.17`), i.e. ~1:5 of sofa
   height. That reads as "a cat on a sofa", not a toy on a giant sofa.
3. The **single** place scale is bound is `shared/movement.ts DEFAULT_MOVEMENT_CONFIG`,
   consumed by physics (`core/physicsWorld.ts`), camera (`render/cameraRig.ts`), avatar,
   editor spawn placement (`src/editor/geometry.ts`) and course validation
   (`src/scene/route.ts deriveMovementLimits`). `GameView.tsx:88` does
   `const config = DEFAULT_MOVEMENT_CONFIG`.
4. Course validation is re-derived live from the movement config, so it is safe to
   **shrink the body** (radius/half-height/clearance/camera) while leaving the
   **capability envelope** (`gravity`, `walkSpeed`, `jumpHeight`, `mantle.min/maxLedgeHeight`,
   `maxReachDistance`) untouched: every reachability limit in `deriveMovementLimits` that
   changes does so in the permissive direction (smaller radius/height ⇒ more clearance,
   lower required clearance ⇒ more valid mantle destinations). Existing saved manifests
   and their recorded `movementConfigId` stay valid; no manifest/asset migration.

## Plan

Slice A (item 11) — authored character: single skinned mesh built from authored profile
sweeps + a real bone hierarchy, replacing primitive assembly; procedural clip set
(idle / walk / run / air-rise / air-fall / land / mantle) with weighted crossfades and
spring-driven secondary motion. Keeps `PlayerAvatarHandle.update()` signature so no
GameView/GameStage wiring change is needed.

Slice B (item 12) — miniature scale: body-only shrink to a 0.35 m capsule with camera
re-framing, expressed as a derived tuning set + invariant tests proving traversability
is preserved.

## State

**Slice A (item 11) — authored character: implemented and tested.**

New, all under `src/game/render/character/`:
- `characterDesign.ts` — the authored asset, as data. Bone table + swept profile
  rings + palette. Original design ("Pip", a wind-up explorer doll): knitted cap,
  goggles on the brow, padded suit pinched at the waist, mittens, boots, trailing
  scarf, lantern on the back. No third-party mesh, no generated asset, no
  provider call. Authored in normalized units (total height 1, origin on the
  capsule centre) so the character follows `MovementConfig` automatically.
- `characterGeometry.ts` — sweeps the profiles into ONE welded indexed mesh with
  vertex colours and skin weights. The pinched waist / flared boot cuff /
  tapering mitten are continuous surface, which is what removes the
  "assembled primitives" read. Also builds the back-face contour hull.
- `characterRig.ts` — 21-bone skeleton, identity rest rotations so every
  animation channel means the same thing on every bone.
- `faceTexture.ts` — the face drawn procedurally on a canvas atlas. Only the
  head's UVs land in the art region; every other vertex samples a flat white
  corner, so the whole body stays one material and one draw call. Returns null
  with no `document` (tests/SSR) and falls back to vertex colours.
- `characterAnimator.ts` — idle / walk / run / rise / fall / land / mantle as
  authored pose functions; continuous weight blending (no state switch to
  crossfade); distance-driven stride; per-channel springs (stiff on legs, loose
  on arms/head, floppy on the scarf) giving follow-through and smooth
  transitions by construction.
- `buildCharacter.ts` — assembles body + contour + lantern and light.

`PlayerAvatar.tsx` rewritten to drive that model. **Its exported handle
(`PlayerAvatarHandle.update(AvatarFrameState)`) and props are unchanged**, so
GameStage/GameView need no edit at all.

Tests: 35 new (`characterGeometry.test.ts` 11, `characterRig.test.ts` 8,
`characterAnimator.test.ts` 16). Three real defects were caught and fixed by
them: inverted face winding (would have rendered the body inside-out), a boot
sweep whose near-horizontal tangent tipped the cross-section frame and pushed
the soles through the bottom of the collider, and a seam-weld bucket that split
on negative zero. Full `src/game` + `src/editor` suite: 163/163 pass.
`tsc --noEmit` clean for all my paths (the only two errors in the tree are in
`src/ui/components/Logo.tsx`, the branding worker's in-flight file).

**Slice B (item 12) — miniature scale: implemented and tested, no shared/ or
GameView edit needed after all.**

The ownership request below is now **withdrawn**. I found a wiring that keeps the
whole change inside my own paths: every gameplay consumer of the movement config
(physics collider, mantle, camera rig, avatar) flows through `GameSimulation`,
which is mine, so the scale transform is applied there and `GameStage` (mine)
reads `simulation.config` instead of the raw prop. `GameView.tsx` and
`shared/movement.ts` are untouched.

- `src/game/core/characterScale.ts` (new) — `toMiniatureScale()` shrinks the
  capsule 0.70 m -> 0.35 m (radius 0.18 -> 0.09, half-height 0.17 -> 0.085),
  sets mantle clearance to the new capsule height, and pulls the camera boom
  2.5 -> 1.25 with padding 0.15 -> 0.075. It leaves gravity, walkSpeed,
  jumpHeight, airControl, groundFriction and the mantle ledge/reach envelope
  exactly as authored. It is a no-op on an already-miniature config, so moving
  these numbers into the shared tuning set later is a one-line change that
  cannot double-shrink. Also `reseatCapsuleCentre()`, which lowers a saved
  spawn/respawn centre by the half-height difference so the feet land where the
  author put them instead of dropping in from above. Saved data is not touched;
  this is a read-time correction.
- `src/game/core/simulation.ts` — applies the transform once, exposes both
  `config` (live) and `authoredConfig`, re-seats spawn/respawn/reset. New
  `miniature?: boolean` option (default true) so the physics regression tests
  and tools can run the authored numbers.
- `src/game/render/GameStage.tsx` — camera rig and avatar now size from
  `simulation.config`. This is the anti-fake-scale guarantee: there is no path
  by which the drawn character can be a different size from its collider.
- `src/game/placementValidation.ts` — documented as deliberately staying on the
  *authored* config. It is a publish gate and the authored capsule is the
  stricter of the two, so it can only produce conservative false negatives.

Correction to my earlier reasoning, found by the tests: the claim that a
body-only shrink moves *every* affected limit in the permissive direction was
wrong. `walkMaxSpan` shrinks too, because the planner sizes its surface sampling
cells from the character's radius. It is still safe — the old walk span (0.63 m)
is well under the unchanged flat jump range (~1.08 m), so such a gap becomes a
jump edge rather than an unreachable one — but the code doc and the test now
state that accurately rather than claiming a blanket guarantee.

Evidence:
- `characterScale.test.ts` (13 new): capsule height and proportions, capability
  envelope untouched, clearance contract, camera framing invariant in character
  heights, idempotence, no mutation, the reachability-limit analysis above, the
  re-seat round trip against the editor's own `capsuleCenterYAboveSurface`, and
  a live simulation standing the small capsule on a floor with no spawn drop.
- `authoredCourse.test.ts` now runs the real authored Rodin climb **at both
  scales** and both complete: direct end-to-end evidence that shrinking the body
  did not make an authored course unclimbable.
- Full repository suite: **463/463 pass**. `tsc --noEmit` clean for every path I
  touched.
- Visual: `nimbalyst-local/screenshots/character/scale-vs-sofa.png` renders the
  character at 0.70 m and 0.35 m on a block with the real normalised sofa
  proportions (8 m long, 3.4 m tall, 1.68 m seat). At 0.35 m it is a speck on
  the cushion with the backrest towering over it.
  `run-inside-capsule.png` shows the body sitting inside its own collider.

- Dirty/owned paths: all committed (see below).

## Blockers / requests to coordinator

**WITHDRAWN — none outstanding.** The earlier request for narrow ownership of
`shared/movement.ts DEFAULT_MOVEMENT_CONFIG` is no longer needed; the scale is wired
entirely inside my own paths (see Slice B). No file outside my assigned ownership was
edited. No dependency on the navigation/input owner: `GameView.tsx`, `src/game/input/**`
and `src/game/hud/**` are untouched and `PlayerAvatar`'s handle and props are unchanged,
so there is no interface to negotiate.

Two things for the coordinator to be aware of, neither blocking:

1. `GameView.tsx:335` reports `movementConfigId: config.id` in diagnostics from its own
   prop, so the diagnostics panel will say `default-v1` while physics runs the miniature
   derivative of it. Cosmetic, in a file I do not own. If the navigation owner wants it
   exact, the one-line fix is to read it from the simulation. I did not touch it.
2. The right long-term home for these five numbers is `shared/movement.ts`. Moving them
   there is a one-line change whenever someone owns that file, and
   `toMiniatureScale` is written to become a no-op at that point rather than
   shrinking the character twice. There is a test pinning that.

## Budget

Zero LivePeer spend. No provider calls of any kind were made or are needed: the character
is authored in code and its face is drawn procedurally onto a canvas at runtime. No new
npm dependencies.

## Next step

Both assigned items are delivered, tested and committed. Remaining work is polish and the
user's own subjective play-test. Candidate follow-ups, in priority order: run the real
bundled sample level in-browser at the new scale to sanity-check camera framing in a
cluttered scene (needs a temp port and a level fixture, no protected service touched);
soften the scarf's rest curve; add a light idle "look around" toward the next objective.
