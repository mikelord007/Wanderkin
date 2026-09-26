# Biome geometry review fixes (M1/L1/L2): FROZEN

- Worker runtime: **claude-opus-5-5** (Opus 5.5). No subagents, no fallback.
- Paused 10:12Z. Resumed by the new orchestrator f8543364. **Frozen 2026-09-25 ~10:40Z.**
- Base 2193c5c. The whole feature is uncommitted. **No commit by this worker.** Sole committer: ad9320dd. Nothing was reset, reverted or deleted.
- Node only: no ports, no provider calls, no storage writes, no browser, and no whole-game play (the user owns hands-on play).

## Frozen files (full SHA-256)

| File | Status | SHA-256 |
|---|---|---|
| `src/biome/adventures.ts` | edited (M1, L1) | `b3dc45301c7f372cff69230845e430566e2ead9787160c016b1e38c6ca864e2a` |
| `src/biome/placement.ts` | edited (L2) | `d074787cd36b36275281d5aa428de437affda2d7001a783b9b477a9eb286f6a6` |
| `src/biome/workBudget.ts` | NEW (M1) | `0397bbd54dd5fb50c138984e25b84f587519d6c14276c4801ff3363c8c6b66ae` |
| `src/biome/workBudget.test.ts` | NEW (M1) | `8984f698ad7684ffa9681bf0a4f783d862755183b6f404050514f2cd83eb86bc` |
| `src/biome/adventures.test.ts` | edited | `6f8b0bf3e109d8166c916fe4148949cef6e2939de115f94d79e0c54fbdb8d8c0` |
| `src/biome/placement.test.ts` | edited | `81aa47a0a8e0a5614fed740d61fab8eecf809c426539067335c2888a8d305759` |
| `src/biome/geometry.ts` | UNCHANGED | `e8a0ebe3b5e3382c3ce484c4db3235b1da721db5fdb70ed9f0796706c7170c06` |
| `src/biome/geometryFixtures.ts` | unchanged (not mine) | `ddce35e28177ab6a302788d53ef4235c3da0dcd20d286d10d814f7632e1396d2` |
| `src/biome/adventureController.test.ts` | unchanged (not mine) | `9b5edf7d06989b03a9ef562b1a6e1753154c35bd0ff4a0f0025f0bc8be05fa53` |

The combined commit must add the NEW `workBudget.ts` and `workBudget.test.ts`, because `adventures.ts` imports `./workBudget.js`.

## Diffs

- Unified diffs against the reviewer's byte-exact `.orig` baselines (baseline hashes re-verified: placement 35e5517d…, adventures.test 31b1751e…, placement.test 74223b01…) are in `nimbalyst-local/tmp-biome-geometry-fixes/`:
  - `placement.ts.diff` (7 lines)
  - `adventures.test.ts.diff`
  - `placement.test.ts.diff`
  - `geometry.ts.diff` (empty)
- **adventures.ts has NO byte baseline.** The frozen fe2f52a9 was verified at start and then edited. No copy was kept and none has been reconstructed. The changed regions in the current file (1250 lines) are:
  - L24–27: module doc (one `WorkDeadline` spans the request).
  - L79: `import { WorkDeadline } from "./workBudget.js"`.
  - L110–117: new `ADVENTURE_MAX_ANALYSED_TRIANGLES = 200_000` and its doc.
  - L167–169: `prepareAdventure(input, deadline = new WorkDeadline())` passes `DEFAULT_ADVENTURE_BUDGET, deadline` through.
  - L183–188: `generateAdventure(input, budget, deadline = new WorkDeadline())`.
  - L201, L205, L215: both `attemptOnGeometry` calls get `deadline`; `deadline.check("the game-floor attempt")` before the floor fallback.
  - L225–270: `attemptOnGeometry` gets a `deadline` param, the triangle-cap throw (L235–239), and checks before scene analysis (L240), the movement graph (L248), each elevated objective attempt (L255) and each compact objective attempt (L268); `finalize(…, deadline, …)`.
  - L377–404: `addStructures` gets a `deadline` param; checks in `tryAccept` (L392) and before `planCourse` (L403).
  - L1025–1047: `finalize` gets a `deadline` param; checks before `validateRoute` (L1039) and before assemble/publish gate (L1047).
  - L1227–1230: `isOwnGeneratedHelper` also accepts `kind === "ramp"`, with a comment. The marker, prefix and `addedBy` checks are unchanged.
  - Nothing else changed.

## What changed

- **M1:**
  - `WorkDeadline(limitMs = 2000, now = performance.now)`: `check(stage)` throws `AdventureBudgetExhaustedError`, which extends `BiomeGeometryError`. `prepareAdventure` returns `ok:false`, "no-playable-layout", the same source manifest object, and a diagnostic naming the stage it stopped before.
  - One deadline per call spans both geometry attempts and every loop.
  - Checks only throw and never steer. A throw leaves nothing partial: generation state is local, and the source is never mutated.
  - **Not a hard timeout.** The worst case is 2 s plus the longest single stage. That stage is one `planCourse` call, or one structure trial, route check or publish check (each a full re-analysis plus a route search).
  - The new 200k collision-triangle adventure cap (4× the provider's 50k `face_limit`) bounds that stage. `geometry.ts` keeps its 400k analysis cap, so decoration is unaffected.
- **L1:** planner ramps (`adventure-planner-N`, kind ramp) are now owned. They are themed via `adventureStructures`, removed on regeneration and not accumulated. Foreign ramps (no prefix, or no adventure marker) are kept.
- **L2:** `missionWaypoints` pairs race ids with the same sorted checkpoint array.
- **L3 (no code change):** the Desert windsock is deliberately placed before the `allowTall` filter, with a 0.6 m extra margin, because the Desert biome requires exactly one. So "no tall props when the route is unproven" has this one intentional exception. Visual behaviour is unchanged.
- **L4 (no code change):** stair boxes are checked only above their top. Flush-to-ledge stairs can overlap scan triangles (desk 1 box, Tripo raw 2), which is the existing planner's "pushed against furniture" policy. This remains for the reviewer's Phase 2 visual check and the user's hands-on observation.

## Evidence

- `npx tsc --noEmit -p tsconfig.json`: exit 0 (both before and after the test additions).
- `npx vitest run src/biome/adventures.test.ts src/biome/placement.test.ts src/biome/workBudget.test.ts src/biome/adventureController.test.ts`: **4 files, 58/58 pass**, 15.0 s. Log: `tmp-biome-geometry-fixes/focused-run.log`.
  - adventures 23 (20 existing + 3 new)
  - placement 18 (17 + 1)
  - workBudget 2 (new)
  - controller 15/15, run once because production geometry code changed
- Real-scan `prepareAdventure` in that run (ms):

  | Scene | restore-portal | reach-beacon |
  |---|---|---|
  | Rodin raw | 381 | 352 |
  | Rodin authored | 152 | 147 |
  | Tripo raw | 271 | 258 |
  | Tripo authored | 238 | 221 |

- New tests:
  - **M1, deterministic step clock (poor-no-floor):**
    - With exactly N checks allowed, the layout is identical to the no-budget one (chain plus manifest, timestamps aside).
    - With N−1 it refuses at the last check, inside the game-floor attempt. Either attempt alone would fit N−1, which proves the budget does not reset per attempt.
    - The result is `ok:false` with the same manifest object and the source JSON unchanged.
  - **M1:** a 200,001-triangle scene is refused before any check or analysis.
  - **M1:** `WorkDeadline` unit test.
  - **M1, forced worst-case refusal on the real floorless Rodin scan:** the gate and `findRoute` are mocked in that file only, and refuse AFTER the real computation. It measured **1501 ms, 59 checks**, and returned `ok:false` with the source untouched. The generous bound (< 10 s) is not a tight timing test.
  - **L1:** an injected `adventure-planner-1` ramp (built with `createRamp`) is owned and themed, and removed on regeneration. Regenerating twice is idempotent. The foreign `helper-ramp-7` is kept exactly once. On an unmarked world, the prefixed ramp is not owned. The collider assertion for existing helpers now expects `triangle-mesh` for ramps and `box` otherwise.
  - **L2:** a permuted race checkpoint array gives the same waypoints and exclusions as the sorted one, and legs run spawn, then checkpoints in race order. A private probe (`l2.probe.test.ts` vs the `.orig`) confirmed the ORIGINAL code gives different waypoints and exclusions here.
- **Layout and seed determinism:** the existing determinism, theme-independence, regeneration and respawn tests all pass unchanged. For scenes under 200k triangles the checks cannot alter control flow, and the L1 condition only matches prefixed ramps on marked worlds (none are generated by the fixtures), so layouts are unchanged by construction. The exact-budget equality test pins this for the budgeted path.
- **Characterization** (private harness `tmp-biome-geometry-fixes/budget.probe.test.ts`, `results-*.json`):
  - Forced worst-case floorless refusal: Rodin 1.17–1.34 s, Tripo 1.65–1.78 s (no deadline hit).
  - Rodin densified to 200k: forced refusal 2.23 s without a deadline, and 2.06 s with it (stopped before "a compact objective layout").
  - `planCourse` with the floor: 236 / 288 / 523 / 965 ms at 50k / 100k / 200k / 400k triangles.

## Human-test limitation (for integration and the user)

On a device slower than this machine, a scene that cannot get an adventure now refuses after about 2 s plus the longest single stage (≤ ~0.5 s here at the 200k cap; proportionally longer on slower hardware), instead of running on. Successful real scans stay well inside the budget (≤ 381 ms here). On a device more than about 5× slower, a scan that would have succeeded could instead be refused. It reports "We couldn't find a safe new adventure" and keeps the current world. Scenes above 200k collision triangles are refused for adventures, although theme decoration still works up to 400k.

## Private harness (not product code)

`nimbalyst-local/tmp-biome-geometry-fixes/` holds:
- `vitest.fixes.config.ts` (own cacheDir)
- `budget.probe.test.ts`
- `l2.probe.test.ts`
- `placementOrig.ts` (an import-rewritten copy of the reviewer's `.orig`, used only by the L2 probe)
- `results-*.json`
- `focused-run.log`
- `*.diff`

## Status

FROZEN. Report sent to ad9320dd and 9323cc08. This worker has released capacity and makes no further edits unless explicitly reassigned.
