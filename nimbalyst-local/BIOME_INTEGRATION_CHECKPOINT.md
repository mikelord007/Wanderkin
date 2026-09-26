# Biome integration checkpoint (worker ad9320dd, claude-opus-5-5)

## PHASE C DONE: committed f3b9477da69dd4af1243670c8ff2fb5f99b8c89e (parent 2193c5c), 2026-09-25 16:10 IST

- The GO came from f8543364 after 67329395 APPROVED.
- Final `npm run build` exit 0, with only the chunk-size warning. Log: tmp-biome-integration/build-final.log.
- Pre-commit: 53/53 OK against tmp-biome-final-review/combined-snapshot.lf.sha256.
- Committed via Nimbalyst developer_git_commit_proposal: 53 paths (38 A + 15 M), equal to combined-paths.txt.
- Post-commit checks:
  - git status over src/shared/server/docs/tests is clean;
  - nothing is dirty outside nimbalyst-local/.nimbalyst;
  - `git hash-object` == `HEAD:<p>` blob for all 53 paths;
  - working tree still 53/53 OK.
- Handoff revision filled and the §7 residuals added (F-1/F-2/F-3, the 1.5× slower-device refusal, Lost Colors not green).

## SUCCESSOR 412d5f2d (claude-opus-5-5): PHASE C-PREP DONE, idle awaiting GO (2026-09-25)

- HEAD is 2193c5c. Nothing is staged. No gate was re-run.
- Snapshot re-verified: all 53 hashes match (0 mismatches). combined-snapshot.sha256 itself hashes to 7a61be50d7ca…713766. Its paths equal combined-paths.txt.
  - Both files are CRLF. Strip `\r` before running `sha256sum -c`/`diff`, or every line reads as missing.
- Path set = `git status -uall -- src shared server docs tests` exactly: 15 modified (M) + 38 untracked (??). That includes workBudget.ts/.test.ts and simulation.lifecycle.test.ts.
- Outside that scope, only nimbalyst-local/ and .nimbalyst/ are untracked. There are 0 package/lockfile/config changes.
- core.autocrlf=true, so committed blobs are LF-normalised. After the commit, check scope with `git hash-object <p>` == `git rev-parse HEAD:<p>`, plus unchanged working-tree hashes. Don't compare raw blob hashes.
- Commit message is drafted in tmp-biome-integration/commit-message.txt.
- Waiting on BIOME_FINAL_REVIEW.md (67329395) APPROVE and an explicit orchestrator GO.

## RETIREMENT — ad9320dd (claude-opus-5-5) stopped at the END OF PHASE B. NO commit made.

The successor, owned by orchestrator f8543364, makes the sole Nimbalyst commit after reviewer 9323cc08's verdict.

- **HEAD:** 2193c5c; working tree uncommitted.
- **Processes:** none of mine running (5287/5288/15988 free; no Playwright Chrome). Protected 5173/8787/15173/18799 were untouched; they serve this working tree live.
- **Snapshot (exact commit scope):**
  - `nimbalyst-local/tmp-biome-integration/combined-snapshot.sha256` holds 53 lines of `<sha256>  <path>`; the file itself has sha256 7a61be50d7ca06788d8aa3c860cdb8e0a6a9d673c1441cd23ebaed4ccf713766.
  - `combined-paths.txt` holds the same 53 paths only.
  - It was generated from `git status --porcelain --untracked-files=all -- src shared server docs tests package.json vite.config.ts tsconfig.json`: 15 modified + 38 new.
  - Commit with EXPLICIT paths from that list only. Exclude nimbalyst-local/, .nimbalyst/, screenshots and tmp harnesses. No package/config/lockfile change is in scope. shared/geometry.ts has no net change (0 diff lines).
  - All 26 peer files were byte-verified (geometry 9 incl. workBudget.ts/.test.ts; visuals 17).
  - Before committing, re-run the verification: every line's hash must match and the path set must be identical. If anything moved, re-gate.
- **Path list (53):**
  - docs/BIOME_FEASIBILITY.md
  - shared/manifest-migration.ts, shared/manifest.test.ts, shared/manifest.ts
  - src/App.tsx
  - src/biome/:
    - adventureController.test.ts, adventureDraft.test.ts, adventureDraft.ts
    - adventures.test.ts, adventures.ts
    - geometry.ts, geometryFixtures.ts
    - integrationContract.test.ts
    - missionCopy.test.ts, missionCopy.ts
    - placement.test.ts, placement.ts
    - planning.test.ts, planning.ts
    - presets.test.ts, presets.ts
    - types.ts, useBiomeAdventure.ts
    - workBudget.test.ts, workBudget.ts
  - src/biome/render/:
    - atmosphereEffects.ts, BiomeLayer.tsx
    - decorLayer.test.ts, decorLayer.ts
    - propGeometry.test.ts, propGeometry.ts, propMaterial.ts
    - selection.ts
    - surfaceBlend.test.ts, surfaceBlend.ts
    - wind.ts, windsock.ts
  - src/game/:
    - core/simulation.lifecycle.test.ts, core/simulation.ts
    - diagnostics.ts, GameView.tsx, types.ts
    - hud/hud.css, hud/Hud.tsx
    - input/inputController.ts
    - render/GameStage.tsx, render/SceneEntities.tsx, render/SceneLighting.test.ts, render/SceneLighting.tsx
  - src/ui/components/adventure-controls.css, src/ui/components/AdventureControls.test.ts, src/ui/components/AdventureControls.tsx
  - src/ui/screens/PlayScreen.tsx
- **Gate (run ONCE on these exact bytes):**
  - `npm run build` (= client `tsc -p tsconfig.json --noEmit` + server `tsc -p server/tsconfig.json --noEmit` + `vite build` + server compile): exit 0. Only the pre-existing chunk-size warning.
  - `npx vitest run`: 87 files / 717 tests passed, 0 failed.
  - Post-gate re-verification: 0 hash mismatches, identical path set, HEAD unchanged.
  - Logs were console output in this session only; no gate log files were written. The results above are the record (also sent to 9323cc08 and f8543364).
- **Browser evidence (not re-run in the gate, per the orchestrator):** tmp-biome-integration/shots/*:
  - sample-0/1 (switching/restore/adventures), restore-0/1, perf-0/1, pickup-0/1;
  - swap-0-headless and swap-0-headed (the Phase A 30-swap crash regression: 0 pageerrors).
- **Handoff:** `nimbalyst-local/BIOME_HANDS_ON_HANDOFF.md` (sha256 f4aa2d5b39a2121c…) is written and updated with the M1 limits. OPEN: the "Commit hash" revision line must be filled in by the successor after the commit.
- **Open items:**
  1. Reviewer 9323cc08's final verdict on the Phase B snapshot (pending).
  2. The commit, by the successor.
  3. The handoff revision line.
- **Residuals (disclose; never label green):**
  - the legacy Lost Colors worker5 fragment-1 scripted failure (also at 2193c5c);
  - castShape: freed-world query proven, trigger timing inferred (never reproduced here); the guard is verified by 30 swaps;
  - pre-existing HUD quirks: intro under subtitle, grey Play button;
  - human-owned visual checks L4 (Tripo stairs) and V1 (faint Desert spawn marker).

## RESUMED by orchestrator f8543364 — Phase A DONE

- Swap crash regression on the guard (simulation.ts a6a1cc73…, GameStage 4ebce344…, PlayScreen 6042d31b…), all Rodin:
  - headless GPU: 10 pre-start + 10 paused;
  - headed: 5 + 5.
  - Results: 30 replacements, 0 pageerrors, fresh canvas each time. Renderer counts per world are bounded (geo 34–37, tex 4, draws 34–40). The last world simulates after Play.
  - Logs: tmp-biome-integration/shots/swap-0-{headless,headed}/log.txt.
  - adventures.ts was b3dc4530… (15:42:19), unchanged during the run.
- Delta + proven-vs-inferred cause sent to reviewer 9323cc08.
- BIOME_HANDS_ON_HANDOFF.md written; the revision line is still to be filled.
- Phase B waits for the d66b11af freeze.

## (historical) PAUSED — 2026-09-25, user-requested handover

- State: PAUSED and idle. Nothing committed; HEAD 2193c5c. No reset/revert/delete. No processes of mine running (5287/5288/15988 free, no Playwright Chrome). Protected 5173/8787/15173/18799 untouched (NOTE: 5173 Vite and 8787 tsx serve THIS working tree live, so uncommitted edits are already visible there).
- Ownership:
  - Mine (integration/UI) — dirty, uncommitted: shared/manifest{,-migration,.test}.ts; src/App.tsx; src/ui/screens/PlayScreen.tsx; src/game/{GameView.tsx,types.ts,diagnostics.ts,hud/Hud.tsx,hud/hud.css,input/inputController.ts,render/GameStage.tsx}; src/biome/{types,useBiomeAdventure,missionCopy(+test),adventureDraft(+test),planning(+test),integrationContract.test}.ts; src/ui/components/AdventureControls{.tsx,.test.ts} + adventure-controls.css; docs/BIOME_FEASIBILITY.md.
  - Pre-authorized core seam: src/game/core/simulation.ts (read-only `get isDisposed()` only).
  - Visuals 359d554d: 17 files FROZEN, hashes verified (list in playtest-checkpoints/biome-visuals.md).
  - Geometry: geometry.ts, geometryFixtures.ts and adventureController.test.ts frozen (hashes above). adventures.ts, placement.ts and their 2 tests are UNFROZEN and exclusively owned by the repair worker d66b11af (M1/L1/L2). Waiting for its freeze and hashes. Do not touch.
- castShape blocker (last action):
  - Proven by the reviewer: `world.castShape` ran on a FREED Rapier world (World.free clears queryPipeline).
  - Inferred, not proven: the trigger is a GameStage frame after the loader-effect cleanup disposes the live simulation, before runtime→null unmounts the Canvas.
  - Fix applied, uncommitted:
    - simulation.ts gets `get isDisposed()`;
    - the GameStage useFrame returns early when disposed, before every Rapier query;
    - GameView is keyed by levelId in PlayScreen, with the comment corrected (passive Canvas teardown).
  - Checks done: client tsc 0; src/game 159/159.
  - NOT done: the ≥10 Rodin pre-start + paused replacement crash regression (tmp-biome-integration/swap.mjs 0 10 1). The run was interrupted before it started. My own earlier runs never reproduced the error (0 in 11 swaps before the guard); visuals saw 2/3.
- Settled-gate evidence is STALE: the full gate (build ok, 710/710 unit tests) and the combined-snapshot.sha256 (49 files) predate the guard and the geometry repair.
- Next actions on explicit resume by the new orchestrator:
  1. Run the swap crash regression (≥10 pre-start + paused; 0 pageerrors; new world simulates after Play; renderer counts per world).
  2. Send the delta, the proven-vs-inferred cause and the evidence to reviewer 9323cc08.
  3. Write nimbalyst-local/BIOME_HANDS_ON_HANDOFF.md (URL http://localhost:5173/, clicks, controls, the reviewer's 10 human steps, blockers, revision). NOT yet written.
  4. After the d66b11af freeze: regenerate the combined snapshot and run one settled gate.
  5. Reviewer, then the sole scoped Nimbalyst commit.
- No mission walking/replay/feel testing by agents (user owns hands-on play).

Updated 2026-09-25 ~15:25 IST. Authoritative technical progress for integration. Nothing committed; HEAD 2193c5c.

## Ownership held

UI/model: `src/ui/components/AdventureControls.tsx` + `adventure-controls.css` + test; `src/biome/planning.ts` + test; `docs/BIOME_FEASIBILITY.md`.
Integration: `shared/manifest.ts`, `shared/manifest-migration.ts`, `shared/manifest.test.ts`, `src/biome/types.ts`, `src/biome/useBiomeAdventure.ts`, `src/biome/missionCopy.ts` + test, `src/biome/adventureDraft.ts` + test, `src/App.tsx`, `src/game/GameView.tsx`, `src/game/diagnostics.ts`, `src/game/hud/Hud.tsx` + `hud.css`, `src/game/render/GameStage.tsx`, `src/game/types.ts`, `src/ui/screens/PlayScreen.tsx`, one-word `src/game/input/inputController.ts` (`summary` is interactive).
Peers: geometry 64ffaf53 (`src/biome/geometry.ts`, `placement.ts`, `adventures.ts`, `geometryFixtures.ts`, `src/scene/*` additions); visuals 359d554d (`src/biome/presets.ts`, `src/biome/render/*`, SceneLighting/SceneEntities/SceneEnvironment changes).

## Verified

- Client and server `tsc` clean; the full unit suite was 632/632 before the latest additions, and 287/287 in the affected dirs after them.
- Real Chrome (`nimbalyst-local/tmp-biome-integration/`, disposable Vite 5287, private cacheDir, /api mocked, 0 writes, 0 console errors), on both bundled scans:
  - Settings panel works in the click-to-play card without starting play.
  - Switching while paused keeps position, checkpoints and fragments exactly.
  - 4× Original/Tropical/Desert cycles give identical renderer counts (no accumulation).
  - Original round trip at pre-start: identical counts and 0.07% pixel diff.
  - Reduced effects lowers props and patches.
  - New adventure, both templates, both scans: ok, then the gate, then a new world. HUD "Fragments 0 / 3" / "Beacon 0 / 1".
- Smoke: decision C. Both probes halted, 0 submissions, $0, and the $0.06 reservation released.
- `src/biome/integrationContract.test.ts`, 20/20 on geometry fixtures (desk, countertop, bed, poor) × both templates:
  - runtime and authored movement give identical results (no double shrink);
  - theme-independent traversal: spawn, checkpoints (position and safeRespawn), structures, objectives and mode are identical under any look/quality;
  - gate plus JSON reload through migrateSceneManifest keeps `adventure`/`biome`;
  - props ≤ runtime-body scale.
- The server `sceneManifestSchema` keeps both markers and rejects unknown templates (one-off `tmp-biome-integration/schema-check.mts`).
- `types.ts` now exports canonical `AdventureRequest`/`AdventureOutcome`/`AdventureFailureReason`; `BiomeId`/`AdventureTemplateId` alias the shared unions. Geometry was asked to delete its local duplicates.
- Perf (`perf.mjs`, real Chrome, this machine): all looks p50 17.7 ms, p99 ~18.6 ms, 0 frames over 50 ms on both scans. Draw calls +3..+7 when themed. Reduced Desert has 55 props. A pickup hitch is NOT measured. Tripo showed +1 draw/geometry after walking (gameplay state; the paused cycle test was flat).

- Lost Colors browser acceptance: `worker5-gameplay.acceptance.test.ts` run on a PRIVATE Vite (port 5288, private cacheDir, no /api proxy; config `tmp-biome-integration/playwright.lostcolors.config.mjs`). "Colors found 0" renders (copy unchanged). The scripted drive to fragment 1 (-4.02, 2.154) does not collect, and the test fails at line 95, IDENTICALLY on a detached HEAD 2193c5c baseline worktree (since removed; the node_modules junction was detached first). Pre-existing, not a regression. The other test in the file passes on both.
- Bounded pickup/frame check (`tmp-biome-integration/pickup.mjs`, Rodin, generated Restore-the-Portal, Tropical look): the real controller was driven to fragment 1 and collected it (HUD "Fragments 1 / 3"). Whole drive 296 frames, p50 17.7 / p95 18.3 / max 18.7 ms. The window from 0.4 s before to 1.5 s after pickup had a worst frame of 18.7 ms and 0 over 50 ms. No measurable pointLight/shader hitch on this machine, so no ModeEntities change was proposed.
- Geometry freeze NOT final: geometryFixtures.ts changed after my snapshot (parent-observed DDCE35E28177…, 15:19:35). Wait for the explicit final geometry freeze + hashes. Awaiting the visuals freeze + list; I am the sole committer of the combined set.

## Reported by peers (not re-run here; for the independent reviewer)

- Geometry (checkpoint `nimbalyst-local/playtest-checkpoints/biome-geometry.md`):
  - `src/biome/adventureController.test.ts` 15/15: real miniature Rapier GameSimulation, 7 scenes × 2 templates (including raw Rodin/Tripo without authored steps) plus a forced jump; every trigger fires in order with 0 respawns;
  - src/biome 11 files / 148 tests;
  - prepareAdventure 120–350 ms on real scans (synchronous, bounded; up to ~0.4 s frame stall);
  - explicit ok:false with the untouched source on a low-ceiling scene;
  - adventures.ts imports the canonical types from types.ts; `isOwnGeneratedHelper` identifies generated structures.

## Pending / next action

1. Geometry FROZEN; all 7 full SHA-256 values verified MATCH in the working tree:
   - geometry.ts e8a0ebe3…
   - adventures.ts fe2f52a9…
   - placement.ts 35e5517d…
   - geometryFixtures.ts ddce35e2…
   - adventures.test.ts 31b1751e…
   - placement.test.ts 74223b01…
   - adventureController.test.ts 9b5edf7d…
   Still waiting for the explicit freeze from visuals (Desert floor / structure theming / spawn disc: fix or declared limitation).
2. Then ONE settled gate: tsc client+server, build, full unit suite, real-Chrome play/restore/pickup on both scans.
3. Exact combined source list + hashes to the parent → fresh independent Claude reviewer → sole combined Nimbalyst commit (explicit paths; no nimbalyst-local/.nimbalyst).

## Residuals (keep; do not label green)

- Legacy Lost Colors acceptance (`worker5-gameplay.acceptance.test.ts:95`): the scripted drive to fragment 1 does not collect. The same failure reproduces on detached 2193c5c. The copy "Colors found 0" is intact, and the other test in the file passes. The reviewer assesses attribution; no old-sample fix in this scope.
- Original restore evidence: identical renderer counts and 0.07% pixel variance (animated pickups), one machine. Perf is vsync-bound on one machine.

## Known issues

- Pre-existing HUD overlap: `.oq-hud__intro` (bottom 1.1rem) sits under `.oq-hud__subtitle` (bottom 2rem) when narration plays. Not introduced here.
- Pre-existing: `.oq-hud button` outranks `.oq-hud__primary`, so the Play button renders grey. Not introduced here.
- The planner has no transport (offline fallback only), by design this round.
