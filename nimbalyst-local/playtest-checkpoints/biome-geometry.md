# Biome geometry / placement / adventures checkpoint

- Worker session: geometry (64ffaf53…), model **claude-opus-5-5** (Claude Opus 5.5).
- Base: `main` 2193c5c. **Nothing committed yet.** Commit is blocked on dependency order (see below).
- Status: implemented and verified in Node. No visual inspection by this worker.

## Files owned (all new, untracked, in `src/biome/`)

| File | Role |
|---|---|
| `geometry.ts` | Recovers the authored config from the runtime one (`authoredMovementFor`); centre conversions (`authoredCentreFromSurface`, `surfaceFromAuthoredCentre`, `runtimeCentreFromAuthored`, `groundedTriggerReach`); `soupFromIndexed`, `assetGeometryFromLoaded`, `analyzeScene`/`analyzeManifest` (authored-scale surfaces + limits, 400k-triangle cap), `raycastDown`, `distanceToSegment`, `hash32` |
| `adventures.ts` | `prepareAdventure(AdventureRequest): AdventureOutcome` (types from `./types.js`, which is owned by integration). Also `generateAdventure` (detail), `isOwnGeneratedHelper`, `adventureStructures`, trigger-radius constants |
| `placement.ts` | `prepareBiomeLayout(BiomePreparationInput): BiomeLayout`, `computeGameplayExclusions`, `testAnchor`, `segmentDistance`, `PROP_FOOTPRINT_RATIO` (= renderer `PROP_UNIT_RADIUS` + 0.02) |
| `geometryFixtures.ts` | Test-only fixtures: desk, countertop, bed, poor (± floor), `lowCeilingFixture` (honestly impossible), `sampleScanFixture(levelId, authoredSteps)` (real Rodin/Tripo GLBs) |
| `adventures.test.ts` | 20 tests |
| `placement.test.ts` | 17 tests |
| `adventureController.test.ts` | 15 tests: real Rapier `GameSimulation` at miniature scale |

No edits to `types.ts`, `shared/`, `src/scene`, `src/game`, or any other worker's files.

## Semantics

- Manifest spawn, checkpoint and objective positions are AUTHORED capsule centres (surface + 0.37 m). `GameSimulation` re-seats them down by 0.2625 m. Triggers: fragment r 0.45 (0.37 m on-foot reach), portal r 0.75, checkpoint r 0.45; the explore destination uses the fixed 0.7.
- Analysis runs at authored scale (0.36 m grid), which is the same model the planner and publish gate use. Prop sizes follow the runtime body (0.175 m) × biome `scaleRange`. `scale` = world height and `radius` = height × renderer unit radius + 0.02.
- Adventure pipeline:
  1. Existing spawn kept if solid.
  2. Structures if no raised tier is reachable, tried in this order: the existing `planCourse` helpers, then bridges and stairs (grid-aligned boxes, 0.42 m max rise), then an open-floor stepped route with a jump gap.
  3. Each structure is accepted only after a full re-sample, a verified route to its target, an unchanged grid anchor, and ≥ 0.6 m from spawn.
  4. Objectives are picked from the reachable set, with the climax on the highest tier.
  5. The ordered chain spawn → objectives → exit is validated by `validateRoute`, with ≤ 6 attempts.
  6. Fallbacks in order: compact floor layout; then, only when the manifest has no floor, a simplified game floor at scan min Y with the spawn moved onto it; otherwise `ok:false`.
  7. Final gates: `validateExperiencePlacements` (authored) and `migrateSceneManifest`.
- Output manifest: sets `adventure {template, seed, generator:1}`, `initialColorRestoration: 1`, neutral quest text. Checkpoints sit at the fragments / route points. Helpers are `adventure-*` boxes, `addedBy:"game"`, with box colliders.
- Regeneration removes only its own helpers: requires the `adventure` marker AND `adventure-` prefix AND `addedBy:"game"` AND kind box/floor. New ids are de-duplicated against preserved entities.
- Layout never reads `definition`/`quality` (tested; also covered by integration's contract test).
- Decoration safety:
  - support rays across the footprint;
  - empty prop volume and tier-edge margin;
  - capsule-axis distance to every exclusion: spawn, checkpoints, objectives, walk corridors, jump take-off/landing and lifted arc, mantle climb, generated structures;
  - spacing between props.
- When the current route is unproven, decoration drops to ≤ 30% of budget with no tall props.
- Water only when a game floor is the lowest support, the scan never dips below it, and the whole scene and every standing surface are inside the floor footprint. The ring sits 6 cm under the floor top.

## Verification (2026-09-25, Node vitest, no ports, no provider calls)

- `npx vitest run src/biome`: 11 files, 148 tests pass (includes other workers' files). Earlier, `src/biome src/scene src/game shared`: 38 files, 368 pass.
- `npx tsc --noEmit -p tsconfig.json`: clean.
- Real-controller traversal (`adventureController.test.ts`), 15/15: desk, countertop, bed, poor, poor-no-floor, and real Rodin and Tripo scans without their authored steps, × both templates, plus a forced generated-jump case. Every real trigger fires in order with 0 respawns. The follower is scripted (run-up for gap/up jumps, offered mantles on climb legs, a hop when stalled), not human play.
- Real scans reach ≥ 0.5 m. Before this work the old planner reached ground only: rodin raw 1.08 m (stepped route), tripo raw 2.07 m (two stairs).
- Measured `prepareAdventure` timings (ms, this machine):

  | Scene | restore-portal | reach-beacon |
  |---|---|---|
  | Rodin raw | 350 | 320 |
  | Rodin with authored steps | 134 | 121 |
  | Tripo raw | 228 | 220 |

  Test bound is 1500 ms. `prepareBiomeLayout` takes 15–230 ms.
- Honest failure: a low-ceiling scene returns `ok:false` "no-playable-layout" with the source untouched. Missing geometry returns "geometry-unavailable".

## Known limits

- No new ramps. On Rodin raw, stairs against the ledges don't validate, so the fallback is the open-floor stepped route.
- Stairs may sit under overhangs (desk knee space). That's validated, but may look odd.
- Generated helper boxes render with the existing helper colour (`style.sceneColors.surfaces[0]`, yellow in cartoon). Theming them belongs to visuals/integration, e.g. via `isOwnGeneratedHelper`.
- No visual inspection by this worker. Integration ran real Chrome on 5287 (see `nimbalyst-local/tmp-biome-integration`).

## FROZEN snapshot (2026-09-25 ~15:21 local; no edits after this)

SHA-256 (in `src/biome/`):

```
e8a0ebe3b5e3382c3ce484c4db3235b1da721db5fdb70ed9f0796706c7170c06  geometry.ts               (mtime 14:53:07)
fe2f52a9b07b272cce723cf04456dc7a8887be32b860a67313782f4ea7a76033  adventures.ts             (15:17:52)
35e5517d6bc6d6eb763dd2137a7c093456bf26e53436c4146ed8d1fbe592f926  placement.ts              (15:18:17)
ddce35e28177ab6a302788d53ef4235c3da0dcd20d286d10d814f7632e1396d2  geometryFixtures.ts       (15:19:35)
31b1751eb3bd65d63e7b5a10952b0b3bd24c732bbc183f5fc5f563ae151def83  adventures.test.ts        (15:19:02)
74223b018a99cb3d2f82d6918efbbe1de2dd3fddf3edbd90ba5bf62c2bfd186c  placement.test.ts         (15:20:56)
9b5edf7d06989b03a9ef562b1a6e1753154c35bd0ff4a0f0025f0bc8be05fa53  adventureController.test.ts (15:20:56)
```

Final focused check against exactly these bytes:
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx vitest run src/biome/adventures.test.ts src/biome/placement.test.ts src/biome/adventureController.test.ts`: 3 files, 52 tests pass.

Earlier on the same source: `npx vitest run src/biome`, 11 files, 148 pass.

Dependencies (not mine; they must be in the same or an earlier commit):
- `src/biome/types.ts`, and the shared `ADVENTURE_GENERATOR_VERSION` / `adventure` / `biome` schema in `shared/manifest.ts` + `shared/manifest-migration.ts` (integration ad9320dd);
- `src/biome/presets.ts`, `src/biome/render/propGeometry.ts` (visuals 359d554d);
- existing committed `src/scene/*`, `src/game/*`.

Source and provenance preservation: output keeps the source `assets` (including provenance), `photos`, `calibration`, `movementConfigId` and generated-mesh entities unchanged, which tests assert. The integration gate `adventureDraft.ts` independently requires byte-identity.

## Next step

Handed off and frozen. Integration owner ad9320dd is the SOLE committer: one combined Nimbalyst commit that includes these 7 exact files (hashes above) with their dependencies. The geometry worker makes no separate commit and runs no further tests or edits. Any defect found later is reported to ad9320dd, not edited. Next is independent review of the combined implementation, including the visual acceptance this worker did not do.
