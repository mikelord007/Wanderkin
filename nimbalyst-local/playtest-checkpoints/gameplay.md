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

- Slice B: designed; needs a coordinator decision on one line (see Blockers).
- Dirty/owned paths: `src/game/render/character/**`, `src/game/render/PlayerAvatar.tsx`,
  this checkpoint.

## Blockers / requests to coordinator

**Scale needs one edit outside my ownership.** Preferred: let me change the five numeric
values in `shared/movement.ts DEFAULT_MOVEMENT_CONFIG` (`characterRadius`,
`characterHalfHeight`, `mantle.requiredClearanceHeight`, `camera.distance`,
`camera.collisionPadding`) — no schema/interface change, no new field, no id change.
Alternative if `shared/` must stay untouched: the navigation owner applies a one-line
`GameView.tsx` change from `DEFAULT_MOVEMENT_CONFIG` to a `MINIATURE_MOVEMENT_CONFIG` I
export from `src/game/core/`; that variant leaves the editor's spawn placement computing
against the old capsule height, so it is strictly worse. I am building the derived config
in my own path either way so the decision does not block Slice A.

## Next step

Build `src/game/render/character/` (geometry, rig, animator) with tests, then rewire
`PlayerAvatar.tsx`.
