# Checkpoint: miniature polish (Opus review F3 markers, F4 stride)

## Identity

- **Runtime model:** Claude Code, **`claude-opus-5-5`** (Opus 5.5), as reported by this session's own system context. Independently confirmed by the coordinator from this session's transcript `9b87a724-0135-48a9-bf66-1849b1a3eec1.jsonl`: all 105 sampled assistant `model` fields read `claude-opus-5-5`.
- **Session and role:** a Nimbalyst session working for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`. I implemented the fixes myself: no subagents, no provider, generation, upload, publish or save calls, and no new dependencies.
- **Date and base:** 2026-09-25. Started at MAIN `2625ef7` (product `7ec73b2`). The concurrent material worker committed `b9a00e5`, which touches only `src/scene/*`, during my captures; I re-ran my focused tests and typecheck on it (see Checks).
- **Scope:**
  - F3 and F4 from `opus-visual-review.md`, and nothing else.
  - Unchanged: movement physics, collider, camera, FOV/boom, global scale, geometry, materials and lighting.
  - Unchanged: stored manifests, coordinates, IDs, trigger radii and checkpoint/proximity logic.

- **Commits** (Nimbalyst commit proposal, exact paths only):
  - `70f9863` F3 markers (`markerLayout.ts` and test, `Checkpoints.tsx`, `ModeEntities.tsx`, `GameStage.tsx`)
  - `13ed712` F4 stride (`characterAnimator.ts` and test, `PlayerAvatar.tsx`)
  - a docs commit with this file and the curated evidence

## What changed

### F3: checkpoint and explore-destination markers sized for the real body

The new `src/game/render/markerLayout.ts` is pure arithmetic with its own tests.

- **Seating.** A stored marker position is an *authored* (0.70 m) capsule centre. It is re-seated onto the author's support surface using `reseatCapsuleCentre`, the same rule spawns already use.
- **Sizing.** Everything is sized in runtime body heights, taken from `simulation.config`, so any custom config works. Nothing is shrunk twice: for positions authored at miniature size, the offset from the stored point is zero.
- **Checkpoint gem.**
  - Diameter is 0.46 × body height: 0.080 m, where it was 0.27 m (≈1.55 heights).
  - It hovers at feet + 1.42 heights, so even at the bottom of its bob it stays clear of the head. It used to sit at the authored centre, 0.37 m, well above the head.
  - Bob amplitude and the guide beam are scaled to match. The beam keeps its 2.4 m height as the world-scale navigation cue, and the active point light is unchanged.
- **Halo replaced by an honest footprint ring.**
  - The 0.40 m translucent sphere that washed over the frame is gone.
  - In its place is a flat ring on the surface. Its radius is where the unchanged 3D trigger actually fires for a grounded character. At 0.175 m that is `sqrt(0.4² − 0.2625²)` = **0.302 m**. The old sphere visually over-promised by 0.1 m.
  - States:
    - active: ring pulses at 0.30–0.54 opacity
    - pending: dim, 0.2 opacity
    - collected: ring hidden; the gem shrinks to 0.75× at a dimmer emissive
- **Explore destinations** (`ModeEntities.tsx`, destination only). The floating 0.28 m authored-height disc is now a glowing pad on the surface: radius 1.25 heights, thickness 0.1 height. It still hides once reached.
- **Wiring.** `GameStage.tsx` passes `simulation.authoredConfig` and `simulation.config` into both marker components. That is the only change in that file.

### F4: stride and cadence paced to body height

This is in `characterAnimator.ts`.

- **Stride rate.** `strideRadiansPerMetre = 8.4 × (0.70 / H)^0.5`, with the tempo clamped to [0.5, 3] to keep the springs stable.
  - At 0.175 m that is 16.8 rad/m.
  - Each footfall covers 0.187 m, about 1.07 body heights.
  - A full run is about 11.7 footfalls/s, where it was 5.8.
- **Why 0.5 and not 1.** A linear exponent (k = 1) would be about 23 steps/s, which reads as a blur. The review also suggested k = 0.5–0.75; k = 0.5 is the calmest of those that still reads as a scurry. In the per-frame capture at about 55 fps, one stride cycle takes about 10 frames, which still reads.
- **Springs keep up.** The leg, arm and torso springs, plus bob and squash, speed up by the same tempo *only in proportion to grounded walk/run weight*:
  - The speed-up drops instantly on leaving the ground.
  - It eases back in over about 0.15 s after touchdown.
  - Jump, fall, landing, mantle and idle keep the authored spring response at every size.
  - Without this, the doubled cycle would be filtered to about 58% leg swing (a shuffle). The test asserts leg swing stays within 0.85–1.25× of the reference.
- **Wiring.** `PlayerAvatar.tsx` builds the animator with the runtime `bodyHeight`, memoised on height; a changed height gets a new animator rather than rescaling a live one. With no `bodyHeight` given, the reference tuning is reproduced exactly (existing tests unchanged).
- **Still preserved:** poses, proportions and the mesh, run/walk/jump/mantle blend weights, movement speed, jump and collider.

**Honest limit (stylised, not foot-locked).** I measured slip by driving the real animator into the real rig in Node, moving the body at the measured 2.17 m/s and tracking the ankle that sweeps backward (`tmp-miniature-polish/foot-slip.ts`).

| | footfalls/s | body heights per footfall | stance-foot slip (0 = planted, 1 = glides with body) |
|---|---|---|---|
| Before | 5.8 | 2.13 | 0.89 |
| **After** | **11.7** | **1.06** | **0.79** |
| Tempo 3 (not shipped) | 17.3 | 0.72 | 0.69 |

This chibi rig's hip-to-ankle length is about 0.27 body heights, so the leg sweep can only cover a fraction of each footfall at 11 body-heights/s. True foot-lock would need about 35 steps/s. The result is a visibly busier toy scurry instead of a glide, but the feet still slide.

## Evidence (real Chrome, production landing → "Play now", same camera code)

**Harness.** `nimbalyst-local/tmp-miniature-polish/`, not committed, like earlier `tmp-*` folders.

- **Servers.** Two disposable Vite servers (5231 before, 5232 after), each with a **private `cacheDir` under the OS temp dir**, **no `/api` proxy**, and **no watcher or HMR**. Peer file saves had been hot-reloading the game mid-capture until I disabled HMR.
  - "Before" serves `git show HEAD:` for my five owned files.
  - Both serve HEAD for the material worker's files, so the evidence is committed product with and without this change, independent of their in-progress edits.
- **API mocking.** Every `/api` call was mocked read-only in Playwright. Non-GET requests were aborted and none occurred; foreign hosts were blocked and none were requested. **Console and page errors: 0** in every final run.
- **One discarded run.** A parallel before/after run froze, with one Rapier `castShape` page error in "before"; its images were thrown away. Every run after that was sequential, and all of them were clean.

Curated images are in `nimbalyst-local/screenshots/miniature-polish/`. Poses 01/02, 05/06 and 03/04 use the checkpoint's own respawn pose (`R`), so they are pixel-identical camera poses; the approach poses are within 4 cm.

| Pair | Shows |
|---|---|
| `01` / `02` | Standing on checkpoint 1, looking down, same pose. Before: the gem **completely hides the hero** (the review's F3 case). After: the hero is fully visible, with a small gem above the cap. |
| `03` / `04` | 0.6 m from the active checkpoint. Before: a hero-sized gem in a translucent halo washing the upper frame. After: a small gem on the beam, and a crisp ring at the true on-foot reach. |
| `05` / `06` | Next objective at 6.6 m. It is still findable by beam, ring and light, and the collected gem behind the hero is small. |
| `07` / `08` | Spawn view of the first marker at 3.3 m. |
| `09` / `10` | Explore "Teacup Island Wander". Before: the yellow destination disc floats at authored height. After: the pad sits on the floor. |
| `11` / `12` | **Moving:** side-on full-speed run, one crop per rendered frame (40 frames at about 55 fps). The cycle takes about 20 frames before and about 10 after. |
| `13` / `14` | **Moving:** the same, running away from the camera. |

- **Video** (webm, 1280×720, not committed because of size): `tmp-miniature-polish/shots/{rodin,explore}-{before,after}/page@*.webm`.
- **Not captured as an image:** the elevated (sofa-seat) checkpoint 3. My scripted drive can't do the helper-step climb. Its seating is covered by the unit test on the real Rodin data (surface 1.286 m) and by the gameplay e2e collecting it.

## Checks

- Focused vitest:
  - `src/game/render` (markerLayout 7 new, characterAnimator 23 including 7 new, character rig/geometry), `src/game/core` and `src/game/modes` (checkpoints, proximity, session, simulation, characterScale, authoredCourse, mantle) plus `placementValidation`: **138/138** before the peer commit.
  - After rebasing onto `b9a00e5`, the same run without `placementValidation`: 136/136.
  - Mutation check: with the gait spring speed-up removed, the leg-swing test fails.
- `tsc -p tsconfig.json --noEmit`: clean over the whole tree, before and after the peer commit.
- Bounded Rodin regression: the product's unmodified `tests/e2e/browser/gameplay.test.ts -g Rodin` against the isolated after-server passed (19 s). That is the full course through all checkpoints, including the mantled one, and `finishAndReplay`. Trigger behaviour is unchanged.
- No full suite run, as instructed.
- Protected services afterwards: 5173, 15173, 8787 `/api/capabilities` and 18799 `/api/capabilities` all returned 200. My servers never proxied to them.
- Cleanup: both disposable servers stopped, and their private caches and Playwright temp dirs deleted.
- Untouched: the saved world, all 4 stashes, Finish/App/share work, and the material worker's paths.

## Tests added (what they pin)

- **Marker layout:**
  - exact trigger at authored size
  - the miniature marker sits on the same surface, core between 0.35 and 0.5 heights, clear of the head at the bottom of its bob
  - **the footprint ring lands exactly where the real `updateCheckpoints` fires** (±2 mm, four body sizes)
  - zero footprint when unreachable
  - linear scaling with custom heights, and no second shrink for positions authored at miniature size
  - frozen inputs never mutated
  - the shipped Rodin checkpoints and explore destinations are byte-identical before and after, and seat on floor or seat
- **Animator:**
  - default reproduces 8.4 rad/m
  - tempo 1, √2 and 2 at 0.70, 0.35 and 0.175 m; footfall about one body height; 8–13 steps/s
  - nonsense heights fall back to the reference and extremes are clamped
  - per-metre rate is exact, never compounds, deterministic and frame-rate independent at miniature size
  - leg swing kept at the faster cadence
  - air and mantle transitions match the reference springs; touchdown into a run is at most 1.35× the reference per-frame joint jump
  - stable at the maximum tempo under violent input

## Residuals

- **Feet still slide** at about 79% of body speed (see the table). A real fix needs a different gait or longer strides, or slower movement, and the brief put all of those out of scope.
- **Colour-fragment collectibles** (`ModeEntities` `Fragment`) are still authored-size and have a 2.25× glow sphere, so the pink octahedron in explore/lost-colors is larger than the hero. This is outside F3's marker scope; the next step would be the same treatment via `markerLayout`.
- **The finish portal** is authored-size as well; not touched.
- **Subjective feel** of the scurry and the gem size is for the user's own play-test.
