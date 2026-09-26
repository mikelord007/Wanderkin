# Biome independent review (reviewer, Claude Opus 5.5)

- Runtime model observed: **claude-opus-5-5** (Opus 5.5). No subagents and no fallback model.
- Role: independent reviewer. Makes no product-source or peer-test edits. Exclusive writes are this file and `nimbalyst-local/tmp-biome-review/`.
- Base HEAD `2193c5c`. The combined feature is uncommitted.
- Status: **Phase 1 (frozen geometry) DONE, verdict below. Phase 2 (combined visual/integration) is WAITING** for the explicit combined freeze and hash list from parent or integration (ad9320dd).

## Phase 1: frozen geometry scope (2026-09-25, about 15:25–15:35 IST)

### Snapshot reviewed (byte-verified; re-verified unchanged after my test run)

```
e8a0ebe3b5e3382c3ce484c4db3235b1da721db5fdb70ed9f0796706c7170c06  src/biome/geometry.ts
fe2f52a9b07b272cce723cf04456dc7a8887be32b860a67313782f4ea7a76033  src/biome/adventures.ts
35e5517d6bc6d6eb763dd2137a7c093456bf26e53436c4146ed8d1fbe592f926  src/biome/placement.ts
ddce35e28177ab6a302788d53ef4235c3da0dcd20d286d10d814f7632e1396d2  src/biome/geometryFixtures.ts
31b1751eb3bd65d63e7b5a10952b0b3bd24c732bbc183f5fc5f563ae151def83  src/biome/adventures.test.ts
74223b018a99cb3d2f82d6918efbbe1de2dd3fddf3edbd90ba5bf62c2bfd186c  src/biome/placement.test.ts
9b5edf7d06989b03a9ef562b1a6e1753154c35bd0ff4a0f0025f0bc8be05fa53  src/biome/adventureController.test.ts
```

The dependency snapshot at review time is NOT frozen: these files are uncommitted and owned by peers. It is recorded so drift can be detected later.

```
bee37f9bd06c9ba681d4bbece57e873481bde215ca88a48f3f139e4d2c10fbd5  src/biome/types.ts               (integration)
7bebade733c3fdbc3ff0c8b8dd0189150b0d3f2e249a9e66a0133d69be882bcf  src/biome/presets.ts             (visuals, mtime 15:25:45)
5e4604a5280e3c057e617548595e42d15be0b41972c8aa2356af45881834f87e  src/biome/render/propGeometry.ts (visuals)
808493f0f2241c03439fe96d0d3dac885cd674f40a74ef87dd2b8cc84717904b  shared/manifest.ts               (integration)
d7b6c8d3f596cf456eaa941c108689e5b5462e0eb91241674f8c438259be3cf8  shared/manifest-migration.ts     (integration)
```

If any of these change before the combined freeze, the Phase 1 test result below must be treated as evidence for this snapshot only.

### Checks I ran (attributable)

- `npx vitest run src/biome/adventures.test.ts src/biome/placement.test.ts src/biome/adventureController.test.ts`: **3 files, 52/52 pass**, 12.9 s. Log: `tmp-biome-review/focused-run.log`.
  - Real-scan `prepareAdventure` timings (ms): Rodin raw 354/341, Rodin authored 136/133, Tripo raw 258/233, Tripo authored 223/208. These match the geometry checkpoint.
- Hashes were identical before and after the run (`tmp-biome-review/hashes-before-focused-run.txt`).
- Reviewer probes (`tmp-biome-review/geometry.review.test.ts`, private vitest config; no ports, no provider, no storage):
  - Real-scan unit costs:
    - Rodin (50,012 tris): 34 ms per full analysis, 33 ms per publish gate, 163 ms per `planCourse`.
    - Tripo (45,054 tris): 24 ms, 28 ms and 67 ms.
  - The planner-path ramp probe covered six block heights and both real scans. `planCourse` produced no helpers in any case, so the step 1 planner branch was never taken.
  - Stair-box overlap probe: scan triangles lie inside the volume below the top of the stair box nearest the ledge. Desk: 1 box. Tripo raw: 2 boxes. Bed and Rodin: 0.
- No full suite was run, by design. Integration owns the one settled gate.

### Guarantees audited: what the code actually ensures

| Claim | Verdict | Basis |
|---|---|---|
| Ordered directed reachability, spawn → objectives → exit | **Holds** | `finalize` → `validateRoute` over `[spawnPatch, ...objectives]`. It is directed (Dijkstra on directed walk/jump/mantle edges), every used edge is swept for clearance, and chain points snap to themselves. The exit is the last chain point. |
| Respawn safety | **Holds (structurally + tested on 3 fixtures)** | Checkpoints are ordered (`checkpoints.ts` refuses out-of-order ones). Checkpoint k sits on chain point k with `safeRespawn` equal to its trigger position, so `R` always lands on a point from which the rest of the ordered chain was validated. Fragments can be collected in any order, but that never creates an unvalidated respawn point. The test covers desk, counter and bed × 2 templates, not real scans or poor. |
| Authored 0.70 vs runtime 0.175, no double shrink | **Holds** | `authoredMovementFor` restores the default body (only one movement config exists). Centres are surface + 0.37. Sim re-seat drop is 0.2625, matching `reseatCapsuleCentre`. Grounded reach is fragment/checkpoint 0.366 m, portal 0.70 m, beacon 0.649 m. Trigger math matches `checkpoints.ts` / `proximity.ts` (3-D distance from the runtime centre to the authored centre). |
| Idempotency and determinism | **Holds** | Same seed gives identical chain and entities. Regenerating on a generated world with the same seed gives identical helpers. Only `updatedAt`/`checkedAt` are wall-clock. Integration overrides `levelId` and caps the seed, so ids do not grow. |
| Actual controller capability | **Holds for the scripted follower** | Real Rapier `GameSimulation` at miniature scale, 7 scenes × 2 templates + jump gap, 0 respawns. The follower walks the validated transitions with run-ups, offered mantles and stall hops. It re-implements the trigger sphere (the same math as the game) rather than reading session events. It is **not human play**. |
| Supporting surfaces, clearance, one-way | **Holds (reuses src/scene)** | New structures are accepted only after a full re-sample plus `findRoute` (clearance-swept) to the target, with the grid anchor unchanged and ≥ 0.6 m from spawn. Bridges and platform routes also require an empty volume. Stairs check only the top (see L4). |
| Finite workload / no unvalidated fallback | **Bounded; worst case not characterised** (see M1) | Limits: ≤ 14 trial analyses, ≤ 3 structures, 6 + 6 objective attempts, ≤ 2 geometry attempts (the second only when floorless), `findRoute` ≤ 400 re-plans per leg, and 400k triangles. Every fallback (compact, game-floor) goes through `validateRoute` + the publish gate + `migrateSceneManifest`. Otherwise it returns `ok:false` with the source manifest identity unchanged. |
| Helper ownership, removal and source preservation | **Holds, one latent gap** (L1) | Removal requires the marker, the `adventure-` prefix, `addedBy:"game"` and kind box/floor. Foreign same-prefix entities are kept. New ids are de-duplicated. `assets`/`photos`/`calibration`/`movementConfigId`/generated-mesh are spread-preserved (tested). |
| Prop footprint vs renderer | **Holds** | `PROP_FOOTPRINT_RATIO = PROP_UNIT_RADIUS + 0.02` per unit height. `propGeometry.test` pins each instanced kind's horizontal extent ≤ unit radius. `decorLayer` scales by height and clamps the windsock to `radius/unit`. The windsock's own extent is not pinned by a test (visual owner). Rock tilt (slerp 0.8 to the normal) can exceed the cylinder slightly; this is cosmetic only. |
| Route/objective exclusion | **Holds (visual only)** | Props never join physics, so an overlap can only be visual. The axis-vs-corridor test covers walk, jump (lifted), take-off/landing, mantle, structures and triggers. A stale layout is prevented because `GameView` is keyed by `levelId` and the cache is cleared on manifest change. |
| Water safety | **Holds** | Water needs a game floor as the lowest support. The scan never dips below floorTop − 0.05. The whole collision AABB and every raised standable must lie inside the floor footprint (0.2 m inset). The ring sits 6 cm under the floor top, so it cannot cover a route or a source object. |
| Arbitrary / poor / no-floor scenes | **Holds** | A fallback floor is added only when the manifest has no floor, and the spawn moves onto it. The low-ceiling case refuses honestly. Missing assets return `geometry-unavailable`. The hook catches both theme and adventure throws and keeps the current world. |

### Findings (severity-ranked). No Critical or High findings in the frozen geometry scope.

**M1 (Medium; residual, non-blocking): the worst-case synchronous workload is bounded but unmeasured.**
- Where: `adventures.ts` 170–251, 351–426, 996–1036; `geometry.ts` 46. `useBiomeAdventure.ts` 142–171 runs it on the main thread.
- Only success paths are timed (≤ 354 ms).
- Worst case from the measured unit costs at 50k triangles, per geometry attempt: about 15 analyses + a planner call + 12 × (graph + gate) ≈ 1.4 s. Doubled on a floorless scan that refuses: ≈ 3 s. It scales roughly linearly up to the 400k cap: ≈ 8×, over 20 s of frozen UI before "We couldn't find a safe new adventure".
- Smallest repair (owner: geometry code → assign via ad9320dd): a wall-clock deadline (e.g. 2 s) checked in `tryAccept` and in both objective loops that throws `BiomeGeometryError`. Or lower `MAX_ANALYSED_TRIANGLES` to what is actually tested, then add one test timing a refusing real-scale scene.
- If not fixed, disclose it as a known limitation.

**L1 (Low, latent): a planner ramp would not be recognised as own.**
- Where: `adventures.ts:1196`.
- Step 1 renames every `planCourse` helper to `adventure-planner-N`, and `planCourse` tries **ramps first** (`kind:"ramp"`, triangle-mesh collider; `course.ts:147–156, 596`). `isOwnGeneratedHelper` accepts only box/floor.
- If this path ever fires, the ramp:
  - survives every regeneration;
  - is missing from `adventureStructures` (theming);
  - would also fail `adventures.test.ts:93`.
- Not reached in any probe or fixture: `planCourse` returned no helpers. It is reachable on arbitrary scans.
- Smallest repair: add `|| entity.kind === "ramp"` to that condition.

**L2 (Low): race-mode exclusion waypoints can be attached to the wrong checkpoints.**
- Where: `placement.ts:226`.
- `byId` pairs the **sorted** `checkpoints[index]` with the **unsorted** `manifest.checkpoints[index].id`.
- For a race world (editor or `raceVariant`) whose checkpoint array is not already in order, the exclusion corridors follow the wrong order. Decoration then goes sparse (`certain=false`) or leaves the real race line unreserved. The effect is visual only.
- Smallest repair: build the map from the same sorted array, e.g. `const sorted = [...manifest.checkpoints].sort(byOrder)` and use `sorted[index].id`.

**L3 (Low, doc mismatch): the windsock ignores "no tall props when the route is unproven".**
- Where: `placement.ts:460` vs `:478`.
- The windsock is placed before the `allowTall` filter, with a 0.6 m extra margin. That is arguably correct, since Desert requires it.
- Repair: fix the checkpoint wording, or gate it on `allowTall`. Owner's choice.

**L4 (Low, visual): stair boxes are checked only above their top.**
- Where: `adventures.ts:670`.
- Real overlap exists: desk 1 box, Tripo raw 2 boxes, all in the flush-to-ledge position. This is the same policy as the existing planner ("block pushed against furniture") and nothing gameplay-relevant is buried: spawn is ≥ 0.6 m away and objectives are picked after re-sampling.
- For Phase 2: confirm in the Tripo screenshots that the stairs don't hide a recognisable object. No code change is required unless that visual check fails.

**L5 (Info): failure reasons are coarse.**
- Where: `adventures.ts:162`.
- Any unexpected exception, including a programming error, maps to `geometry-unavailable`. The 400k-triangle refusal maps to `no-playable-layout`.
- The UI shows the same message for both, so this is diagnostics only.

**L6 (Info): test-strength notes.**
- `adventures.test.ts:205` (the sliver case) asserts only `typeof ok === "boolean"`.
- The respawn test skips the real scans and poor scenes.
- The controller follower is scripted; it is not proof of human playability.
- Reduced-quality factors (0.5 / 0.6) are duplicated between `placement.ts:121–122` and the presets budget (they agree today).

### Phase 1 verdict

- **The frozen geometry scope is sound and approvable as a component.** No blocking defects were found.
- M1 should be fixed (deadline) or disclosed.
- L1 and L2 are one-line fixes. They are recommended but not blocking.
- Source corrections belong to the implementation owners (geometry is retired, so via ad9320dd as sole committer). If any of the 7 files changes, this verdict does not carry over. Re-hash and re-review the diff.
- **This is NOT an overall feature approval.** Dependencies are uncommitted and moving.

## Phase 1b: visuals frozen snapshot + lifecycle read (about 15:45 IST)

### Visuals freeze

All 17 files listed in `playtest-checkpoints/biome-visuals.md` match its sha256 prefixes. Full hashes are in `tmp-biome-review/visuals-hashes-observed.txt`.

### Resource and lifecycle read (static)

- **`decorLayer` / `BiomeLayer`:**
  - One handle owns every geometry and material. There are no textures.
  - `dispose()` is idempotent and `retain()` is StrictMode-safe.
  - The primitive is mounted with `dispose={null}`, so R3F cannot double-free.
  - A water mesh rejected by the draw budget is disposed immediately.
  - Handles created by a discarded `useMemo` render never upload GPU resources.
  - Water is a filled disc (`CircleGeometry(outerRadius)`) at floorTop − 0.06, under the opaque floor. Geometry guarantees the scan never goes below floorTop − 0.05, so the disc cannot cover the scan.
- **`SceneEntities`:** the blend is installed on clone-owned and helper-owned materials only, and those go through the existing dispose paths (`disposeStyledObject`, helper cleanup). A treatment change is uniform-only.
- The runtime counts and pixel-identity evidence belong to the visuals and integration harnesses. I will cross-check them at the combined gate.

### Blocker `castShape` (owner ad9320dd): independent root-cause evidence (read-only)

1. **Where the message comes from (proven in the source).** In `node_modules/@dimforge/rapier3d-compat/rapier.es.js`, `World.free()` sets `this.queryPipeline = void 0`, and `World.castShape` reads `this.queryPipeline.castShape`. So "Cannot read properties of undefined (reading 'castShape')" means **`world.castShape` was called on a freed world**. It is a use-after-dispose, not a geometry or manifest defect.
2. **Which caller.**
   - Direct callers are `cameraRig.ts:75` and `mantle.ts:249/270`.
   - Mantle queries run inside `simulation.advance`, which is disposed-guarded (`simulation.ts:326`).
   - In the `GameStage` `useFrame` (lines 150–190), `rig.update(simulation.scene.world, …)` is the **first unguarded Rapier query** after `advance`. `groundHeightBelow` → `castRay` is also unguarded, but it runs later in the frame.
   - Therefore a `GameStage` frame ran after `simulation.dispose()`.
3. **The `PlayScreen` comment is inaccurate.**
   - In R3F 8.18.0 the Canvas tears down in a **passive** `useEffect` (`react-three-fiber.cjs.prod.js:142–144`), not a layout cleanup.
   - `unmountComponentAtNode` sets `internal.active = false` synchronously, which stops the loop.
   - On a key remount, the old `GameView` dispose and the Canvas deactivation run in the same pre-order passive flush, so on paper the key path is safe, but not for the reason the comment gives.
4. **A plausible race: the in-place loader re-run** (`GameView.tsx` ~219–333, deps `[signature, loadToken, config, gameplaySession]`).
   - Its cleanup disposes `built`, which is the live runtime's simulation.
   - `setRuntime(null)` is only scheduled by the next effect body, so the old Canvas stays mounted and active until the following render/commit.
   - Any rAF in that window runs the old `GameStage` against the freed world.
   - This exists at baseline too, but it matters whenever a new-adventure or regeneration path changes those deps in place.
   - I could not prove statically which path the Rodin repro takes. It is timing-dependent, which fits "2 of 3 Rodin, 0 of 3 Tripo" (Rodin preparation is slower).
5. **Smallest robust repair (owner's call).**
   - Add a public `get disposed()` on `GameSimulation`, and return early at the top of the `GameStage` `useFrame` when it is set, before `rig.update` and `groundHeightBelow`.
   - Optionally also clear `runtime` before disposing on the in-place path.
   - This closes the whole class regardless of which path triggers it.
   - Acceptance: 10 or more repeated Rodin pre-start new-adventure replacements in real Chrome with 0 pageerrors, plus the pause→new-adventure and retry paths. I did **not** build a duplicate harness.

## Phase 1c: repair round opened + read-only visual evidence (about 15:50 IST)

### Parent decision

M1, L1 and L2 are to be FIXED by the repair worker d66b11af. It owns `adventures.ts`, `placement.ts` and their tests, and may touch `geometry.ts` only narrowly. Integration ad9320dd remains sole committer and owns the castShape lifecycle fix. L3 may be disclosed. L4 needs my Phase 2 Tripo visual check.

### Delta baseline

- Byte-exact frozen copies of 6 files are in `tmp-biome-review/geometry-baseline/*.orig`.
- **`adventures.ts` had ALREADY changed** (158d14f3, 15:38:54) before I could copy it. The in-flight copy is labelled NOT-BASELINE.
- I asked d66b11af to supply a unified diff against fe2f52a9, or to state that it has none, in which case I review against my Phase 1 reading.
- My delta acceptance criteria were sent to d66b11af:
  - M1: whole-call budget including the floorless attempt; injected-clock test; measured real-scale refusal; ok:false with the untouched source; no false hard-timeout claim.
  - L1: planner-ramp ownership test.
  - L2: permuted race-checkpoint test.
  - No layout or seed drift on unchanged scenes.

### Visual code and evidence against the 17 frozen visual hashes

- **Wind:** one shared downwind XZ vector.
  - Windsock: `rotation.set(0, downwindYaw, droop)`. Euler order XYZ applies the droop first and then the yaw, so the tail's horizontal direction equals downwind. `decorLayer.test` checks the world direction.
  - Dust drift uses (uWindDir.x → X, .y → Z).
  - Sway transforms the same vector into the instance frame.
  - All three agree.
- **Production shots** (`tmp-biome-visuals/shots/prod-0` Rodin, `prod-1` Tripo; taken 15:26–15:31, i.e. before the repair edits, so their layouts are evidence for the ORIGINAL geometry snapshot only):
  - 0 console errors, 0 blocked hosts, 0 unexpected writes.
  - Renderer counts: Original, then Tropical (+4 draw calls), then Desert (+3). After an adventure: helpers, fragments and portal are added. Original after the adventure has 0 props and 0 patches.
  - The scan furniture (Rodin table, Tripo sofa) stays recognisable in every look. Props sit clear of the spawn.
  - The large translucent sky shapes also appear in Original, so they are not biome-caused.
- **V1 (Low, visual):** the Desert spawn marker is barely visible (Rodin: effectively only the contact shadow; Tripo: a faint pink tint). Tropical shows a clear ring and Original a clear green disc. This does not match the visuals checkpoint's claim that the spawn ring is visible. To check in Phase 2.
- **L4 not resolved by the existing shots.** The Tripo generated stairs sit under the sofa overhang and only their fronts are visible from the pre-start chase camera. Phase 2 needs an overview or approach view of the Tripo stairs, on the REPAIRED geometry snapshot.

## USER STEERING (about 15:55 IST): the stop boundary is acknowledged

- The reviewer will run **no** agent-driven whole-game playtesting: no playthrough, traversal, completion or replay browser runs, and no subjective feel judgements.
- At acknowledgement **no such reviewer run was active**. None has been launched in this review; all reviewer checks so far are Node/static.
- The existing controller evidence (`adventureController.test.ts`, 15 scripted Rapier cases) is reused as-is.
- **Retained:** exact-snapshot static review, and narrow automated invariants or crash/switch checks only where needed to establish implementation correctness.
- **Human acceptance steps** go to integration for `BIOME_HANDS_ON_HANDOFF.md`, including L4 (Tripo stairs) and V1 (Desert spawn marker), which move from reviewer browser checks to user observation.
- The user playtest is a separate remaining acceptance gate. It is not a reason to withhold the ready build.

### Lifecycle-fix scope noted (coordinator)

- Integration may add a read-only public `disposed` getter over the existing state in `src/game/core/simulation.ts`, plus a minimal regression test. There must be no physics behaviour change, refactor or world mutation.
- Delta baseline: `simulation.ts` is committed, so review uses `git diff 2193c5c -- src/game/core/simulation.ts`, which must show a getter only. `GameStage.tsx` and `PlayScreen.tsx` diffs are to be reviewed at the combined snapshot. The passive-Canvas comment is to be corrected.
- Crash-check acceptance is unchanged: at least 10 real Rodin pre-start and paused world replacements, 0 pageerrors, the new world ready, the old resources released, and freed-world-query vs trigger evidence. No catch-suppression.

## PAUSED for orchestrator handover (user request, 2026-09-25 about 16:00 IST)

- **Processes:** none active. No test, build, browser or server was running. The last run, the focused vitest, finished long before the pause. Protected ports and storage were never touched.
- **Dirty files owned by the reviewer:** only this file and `nimbalyst-local/tmp-biome-review/`:
  - review config and probe tests;
  - logs and hash lists;
  - `geometry-baseline/`, holding six byte-exact `.orig` files plus the in-flight `adventures.ts` copy labelled NOT-BASELINE.
  - No product source edits, commits or provider calls.
- **Progress:**
  - Phase 1 (frozen geometry): DONE. Findings M1, L1 and L2 were routed for fixing by d66b11af, and the parent accepted them as scoped findings.
  - Phase 1b (visuals hashes 17/17, lifecycle read, castShape provenance): DONE.
  - Phase 1c (wind code, prod shots, V1, L4 routed to the user): DONE.
  - Human steps were sent to ad9320dd.
  - No overall approval has been given.
- **Last action:** recorded the scope of the `simulation.ts` getter-only lifecycle fix.
- **Next action, only after an explicit resume:**
  1. Delta-review the d66b11af geometry repair freeze. The `adventures.ts` baseline diff was requested from d66b11af.
  2. Review the ad9320dd castShape fix: `git diff 2193c5c` of `simulation.ts` must be getter-only, then the `GameStage` guard and the `PlayScreen` comment, plus the evidence of at least 10 Rodin replacements with 0 pageerrors.
  3. Review the combined snapshot and gate results, then give the final approve/block verdict.
- **Partial operations:** none.

## RESUMED by new orchestrator f8543364 (runtime claude-opus-5-5, no subagents or fallback)

### Step 1: castShape lifecycle fix (static review)

Files reviewed (hashes in `tmp-biome-review/step1-lifecycle-hashes.txt`):

| File | sha256 prefix | mtime |
|---|---|---|
| `simulation.ts` | a6a1cc73 | 15:41:24 |
| `GameStage.tsx` | 4ebce344 | 15:41:26 |
| `PlayScreen.tsx` | 6042d31b | 15:41:28 |
| `GameView.tsx` | 7b8a14f8 | 15:11:23, unchanged since the Phase 1b read |

- **`simulation.ts`:** `git diff 2193c5c` is exactly one read-only `get isDisposed()` over the existing `disposed` field. No behaviour change. PASS.
- **`GameStage.tsx:150–154`:** `if (simulation.isDisposed) return;` is the first statement of the only Rapier-touching frame loop. It precedes `advance`, `drainEvents`, `rig.update` (castShape), `groundHeightBelow` (castRay) and every getter, so the whole frame path is closed. PASS.
  - The other `useFrame`s (`Checkpoints`, `ModeEntities`, `SceneEnvironment`, `BiomeLayer`) touch no Rapier.
  - Respawn runs inside the guarded `advance`.
  - This is a lifecycle guard, not catch-suppression.
- **`PlayScreen.tsx`:** keyed by `levelId`. The comment no longer claims a layout cleanup; it now says frames arriving after the free are skipped in `GameStage`. PASS.
- **`GameView.tsx` in-place loader path (≈219–333):** unchanged. Its cleanup still frees the live simulation before `setRuntime(null)` commits, but every frame in that window now returns early, so the path that frees the world in place and keeps the Canvas alive is closed for frame-driven queries.
- **S1-L1 (Low):** `GameView.tsx:511` `handleRestart` → `simulation.reset()` (`simulation.ts:629`) → `teleport` (`:642`, `playerBody.setTranslation` / `world.propagate…`) has no disposed guard.
  - It is reachable only by a user Replay click inside the sub-frame window between the in-place loader cleanup and the `runtime=null` commit, or on a disposed runtime. Practically unreachable.
  - Smallest repair: `if (!runtime || runtime.simulation.isDisposed) return;` at the top of `handleRestart`.
  - Non-blocking.
- **S1-L2 (Low):** no Node regression test pins `isDisposed` or the frame no-op.
  - Smallest: in the existing simulation test, assert `isDisposed` false → true after `dispose()`, and that `advance`/`stepFixed` are no-ops.
  - Non-blocking. The browser regression is the primary evidence.
- **Evidence still required from ad9320dd:** at least 10 real Rodin pre-start and paused replacements; 0 pageerrors; the new world ready; the old resources released. I have not built a duplicate harness.

### Step 1 CLOSED: PASS (evidence from ad9320dd, logs verified by the reviewer)

- **Hashes:** a6a1cc73, 4ebce344 and 6042d31b were confirmed again at the time of evidence.
- **Headless (`tmp-biome-integration/shots/swap-0-headless/log.txt`):** 10 pre-start + 10 paused Rodin replacements, Desert look, all 20 on fresh canvases, `[page errors] []`, errorsSoFar 0 throughout. Per-world renderer counts: geometries 34–37, textures 4, drawCalls 34–40, with no monotonic growth. The last world ran 90 steps after Play.
- **Headed (`swap-0-headed`):** 5 + 5 replacements, 10 fresh canvases, 0 page errors. The last world stepped 38 times, then the designed pointer-lock fallback paused it.
- **Assessment:**
  - The whole frame-driven use-after-free class is closed **by construction**, by the static review above: the guard precedes every Rapier query in the only Rapier-touching frame loop.
  - The browser run is **non-regression and resource evidence, not a reproduction.** Integration never reproduced the original error (0 of 3, and 0 of 8 without the guard), and it correctly labels the timing trigger as inferred rather than proven.
  - That is acceptable because the fix does not depend on which trigger fired.
- **Residuals:**
  - S1-L1: `handleRestart` is unguarded; Low, see above.
  - S1-L2: no Node test pins `isDisposed`; Low.
  - "Old resources released" is shown indirectly: bounded per-world counts, fresh canvases, and no reported context-loss errors. There is no heap or WebGL-context count; Low.

### Step 1 follow-up: S1-L1 and S1-L2 FIXED (verified)

- **S1-L1:** `GameView.tsx` (65ba3c3d): `handleRestart` now starts with `if (!runtime || runtime.simulation.isDisposed) return;` plus a comment. Nothing else changed in the handler.
- **S1-L2:** the new `src/game/core/simulation.lifecycle.test.ts` (6da19c18) pins `isDisposed` false → true, `stepFixed` as a no-op, `advance` returning 0, and a double `dispose()` being safe.
  - I ran it: 1/1 pass.
  - The integration-reported src/game result is 160/160.
- The remaining Step 1 residual is "resources released" shown only indirectly; Low.
- **Reproduction honesty:** the trigger was not reproduced (0 of 11 without the guard). This stays disclosed; closure rests on the static by-construction argument.

### Step 2 pre-read (source only; tests were still moving at 15:53)

Sources pre-read:

| File | sha256 prefix | mtime |
|---|---|---|
| `adventures.ts` | b3dc4530 | 15:42:19 |
| `placement.ts` | d074787c | 15:39:38 |
| `workBudget.ts` (new) | 0397bbd5 | 15:42:21 |

At the freeze: re-hash these, and re-review any that changed.

- **L2 fix:** `diff` against `.orig` shows only `sortedCheckpoints` shared by the waypoints and `byId`. Correct.
- **L1 fix:** `adventures.ts:1230` now accepts `kind === "ramp"`. The marker, prefix and `addedBy` conditions are unchanged. Correct.
- **M1:**
  - `WorkDeadline` takes an injectable clock; `check()` only throws `AdventureBudgetExhaustedError` (a `BiomeGeometryError`), so the result is `ok:false` "no-playable-layout" with `manifest: input.manifest` (identity).
  - One deadline per `prepareAdventure` call, passed through both `attemptOnGeometry` calls. The "game-floor attempt" check sits between them, so the budget spans the floorless attempt.
  - Checks sit before: analysis, movement graph, planner, each structure trial, each elevated and compact objective attempt, the route check and the publish check.
  - The docs state it is not a hard timeout (the worst case is the limit plus the longest stage).
  - The 200k-triangle cap is applied per attempt to the collision, including helpers and floor.
- **No byte baseline for `adventures.ts`.** Line accounting against my Phase 1 read: the current file has 1250 lines against 1216 frozen, a difference of +34. The identified additions also total exactly 34:

  | Addition | Lines |
  |---|---|
  | Header comment | 3 |
  | Import | 1 |
  | Cap constant | 9 |
  | `attemptOnGeometry` parameter, cap and check | 7 |
  | Movement-graph check | 1 |
  | Loop checks | 2 |
  | `addStructures` parameter, trial check and planner check | 3 |
  | `finalize` parameter, route check and publish check | 3 |
  | `generateAdventure` parameter and comment | 2 |
  | Game-floor check | 1 |
  | Ramp | 2 |

  Constants and budgets were spot-checked against the Phase 1 reading and are unchanged.
- **Drift probe** (`step2-drift-probe.log`): structure kinds and ids for desk, bed, Tripo raw and Rodin raw × both templates are **identical** to Phase 1. Planner-path scan: still no planner helpers.
- **Pending at freeze:** the new tests (injected-clock floorless refusal, sufficient-budget equality, measured refusal, triangle cap, ramp ownership, permuted race), the updated `adventures.test.ts:90` assertion, tsc, and the focused run.

### Step 2 CLOSED: PASS (geometry repair freeze by d66b11af)

**Hashes verified** (`tmp-biome-review/step2-freeze-hashes.txt`, unchanged after my run):

| File | sha256 prefix |
|---|---|
| `adventures.ts` | b3dc4530 |
| `placement.ts` | d074787c |
| `workBudget.ts` | 0397bbd5 |
| `workBudget.test.ts` | 8984f698 |
| `adventures.test.ts` | 6f8b0bf3 |
| `placement.test.ts` | 81aa47a0 |

`geometry.ts` (e8a0ebe3), `geometryFixtures.ts` (ddce35e2) and `adventureController.test.ts` (9b5edf7d) are unchanged. The source hashes equal my pre-read, so the source review above stands.

**Test deltas** (diffed against my `.orig` copies):

- **M1, step-clock test.**
  - With an unlimited budget it counts the total checks; the index of "the game-floor attempt" check is greater than 0.
  - A budget of exactly `total` gives a layout identical to the unbudgeted reference (JSON with the wall-clock fields nulled) and the same chain.
  - A budget of `total − 1` refuses on the LAST check, which is inside the second attempt, and follows the same stage path. The result is ok:false "no-playable-layout", the manifest is the same object, and the source JSON is unchanged.
  - This proves the budget spans both attempts and never steers the layout.
- **M1, triangle cap.** 200,001 triangles are refused with `checkCount 0`, i.e. before any analysis, with the source identity kept. The test asserts that the adventure cap is ≤ the geometry cap.
- **M1, measured refusal.**
  - `workBudget.test.ts` mocks the gate and `findRoute` so they refuse AFTER doing their real work, on the floorless raw Rodin scan (both attempts).
  - **My run: 1469 ms, 59 checks.** The result is ok:false with the same manifest and the source is unchanged. The assertion bound is deliberately loose (< 10 s), so the measurement is informational.
  - The docs say plainly that it is not a hard timeout.
- **L1.**
  - An injected `adventure-planner-1` ramp (built with `createRamp`) is owned and appears in `adventureStructures`.
  - A foreign `helper-ramp-7` is not owned and is kept exactly once across two regenerations.
  - The same-prefix ramp on an unmarked world is not owned.
  - Regeneration is idempotent and ids stay unique.
  - The line-90 collider assertion now expects `triangle-mesh` for ramps.
- **L2.**
  - A race manifest whose checkpoint array is permuted gives exclusions and waypoints identical to the sorted one, and the waypoint order follows the race order.
  - `certain` is true.
  - d66b11af reports that the original code fails this case.

**Checks I ran:** `adventures.test`, `placement.test` and `workBudget.test`, 43/43 pass (`step2-focused-run.log`). The drift probe run earlier is identical to Phase 1. I did not rerun the controller file, which is unchanged; the worker reports 15/15 on these exact bytes and tsc 0.

**Residuals (Info):**
- The planner-ramp path is still not produced naturally by any fixture; ownership is tested by injection.
- Refusal on devices about 1.5× slower ends after roughly 2 s plus one stage (≤ ~0.5 s at the 200k cap). Disclose in the hands-on handoff.
- Theme-layout preparation (`prepareBiomeLayout`, 15–230 ms) is not budgeted. That is outside M1 and bounded by the 400k analysis cap.

## RETIREMENT (reviewer, claude-opus-5-5, retired at END OF STEP 2 by orchestrator f8543364)

This reviewer has stopped. **Step 3 (the final approve/block on the combined snapshot and gate) was NOT done.** A successor reviewer owns it.

- No product-source edits, commits, provider calls, protected-port use or storage writes were made at any point.
- No processes are running.

### Verdicts to date

| Step | Verdict |
|---|---|
| Phase 1: frozen geometry | Component approvable; M1/L1/L2 raised and FIXED in the repair |
| Phase 1b/1c: visuals | Scoped pass (static lifecycle, wind, prod shots) |
| Step 1: castShape lifecycle | PASS, with S1-L1 and S1-L2 FIXED |
| Step 2: geometry repair delta | PASS |

**No overall feature approval has been given.**

### Exact hashes reviewed (full sha256; also in `tmp-biome-review/*.txt`)

Geometry (9 files; `tmp-biome-review/step2-freeze-hashes.txt` and `retirement-geometry-lifecycle-hashes.txt`):

```
e8a0ebe3b5e3382c3ce484c4db3235b1da721db5fdb70ed9f0796706c7170c06  src/biome/geometry.ts
b3dc45301c7f372cff69230845e430566e2ead9787160c016b1e38c6ca864e2a  src/biome/adventures.ts
d074787cd36b36275281d5aa428de437affda2d7001a783b9b477a9eb286f6a6  src/biome/placement.ts
0397bbd54dd5fb50c138984e25b84f587519d6c14276c4801ff3363c8c6b66ae  src/biome/workBudget.ts
ddce35e28177ab6a302788d53ef4235c3da0dcd20d286d10d814f7632e1396d2  src/biome/geometryFixtures.ts
6f8b0bf3e109d8166c916fe4148949cef6e2939de115f94d79e0c54fbdb8d8c0  src/biome/adventures.test.ts
81aa47a0a8e0a5614fed740d61fab8eecf809c426539067335c2888a8d305759  src/biome/placement.test.ts
8984f698ad7684ffa9681bf0a4f783d862755183b6f404050514f2cd83eb86bc  src/biome/workBudget.test.ts
9b5edf7d06989b03a9ef562b1a6e1753154c35bd0ff4a0f0025f0bc8be05fa53  src/biome/adventureController.test.ts
```

Lifecycle (5 files):

```
a6a1cc73f241737b8c35a5ca1663bcba330fa700a30fc4e4358288cb10d63104  src/game/core/simulation.ts   (diff vs 2193c5c: isDisposed getter only)
4ebce3447b6a54f629736d9ae3cd611a5047d53ab02bb55174b437383f09cc0a  src/game/render/GameStage.tsx
6042d31bd4a5d0c5fc58e963379b6960880d25899e7ec7af3bc8b4f70f523979  src/ui/screens/PlayScreen.tsx
65ba3c3dc652ea1cf53dfcffacd7c83248943c6dd9c7bddff382c470e4d8ba51  src/game/GameView.tsx
6da19c1893614e4506312169bc5bf24f6decaff0b6e2ace90475e7c7a9391061  src/game/core/simulation.lifecycle.test.ts
```

Visuals: 17 files, re-verified 17/17 OK at retirement against `tmp-biome-review/visuals-hashes-observed.txt`:

```
7bebade733c3fdbc3ff0c8b8dd0189150b0d3f2e249a9e66a0133d69be882bcf  src/biome/presets.ts
0cec2ebbc3b107f247f4027bb0869c8f7f246defe785b915a8f8bfdb94c45042  src/biome/presets.test.ts
9337f663bfab3c5c18703fccfd0e30b8edf3b3c25ed241dcafc27dcee3f48607  src/biome/render/atmosphereEffects.ts
6f26e2292f74eb6241277c3e0bfbf929fe48a6a47c680ea6220b4de27a7ad21f  src/biome/render/decorLayer.test.ts
c76bc1733bafa73a6a6d2e1f99c2e4f44203869126b5a9ec99693302c7d3a625  src/biome/render/decorLayer.ts
fce341903cc59f9d22c30c4a6dda7810f523105d2fd8be9e0998ceed8287b968  src/biome/render/propGeometry.test.ts
5e4604a5280e3c057e617548595e42d15be0b41972c8aa2356af45881834f87e  src/biome/render/propGeometry.ts
00ec4519dc43688d2f7eff73afa63022837ab60834458c84ac7aba946c51c9ed  src/biome/render/propMaterial.ts
2cf78dc668744798f4baaad4870b8a741b00fffd80a984c798d3695ba8e6b00b  src/biome/render/selection.ts
93ba5d172e991ac802928552ac7c95fd43f341b1a8c37b5daa3adf95182fc02c  src/biome/render/surfaceBlend.test.ts
75f9f2e71d9b17745e8761418d02f78ef7edec2206b815221a31d607834d44fd  src/biome/render/surfaceBlend.ts
ea4aebafae9e7d4aa19ca42e861fca2bf214c558db133a15f910c4c367e1b0b5  src/biome/render/wind.ts
bcd21f213dd145271874e5bebc74b9ad85818b06348fdf01220e8946de537113  src/biome/render/windsock.ts
f531e8e686143e0f6f62fc45e59594cb6aafab9bd343e0aff3b94eec0dab29e2  src/biome/render/BiomeLayer.tsx
6eced3929ac41382698381846993a391071c7dfdf01a03a30357b13bf02e4157  src/game/render/SceneLighting.tsx
575a57d0726b82ee57e0636300d35088a9524b4b47ed6d1e07b2697a9cf67118  src/game/render/SceneLighting.test.ts
452eafb1a5d47eb35bfca881323bf25b207b283777ff7cec1745f0b88c7eecfa  src/game/render/SceneEntities.tsx
```

**Successor rule:** any file in the combined snapshot whose hash differs from the ones above needs a delta review. Integration-owned files NOT reviewed at an exact hash by me:
- `shared/manifest*.ts`
- `src/biome/{types,useBiomeAdventure,adventureDraft,missionCopy,planning,integrationContract.test}.ts`
- `src/App.tsx`, `Hud.tsx`/`hud.css`, `diagnostics.ts`, `game/types.ts`, `inputController.ts`
- `AdventureControls*`
- `docs/BIOME_FEASIBILITY.md`

I read parts of them (the hook, App draft routing, GameView wiring) without finding defects, but I did not review them fully at an exact snapshot.

### Open residuals (none blocking; disclose in the hands-on handoff and delivery notes)

- **M1 residuals (Info):**
  - Refusal is not a hard timeout: about 2 s plus one stage, ≤ ~0.5 s at the 200k cap. On the real Rodin scan it measured 1.47 s.
  - Ramp ownership is tested by injection, since no fixture produces a planner ramp.
  - Theme-layout preparation (15–230 ms) is not budgeted.
- **L3 (Info):** the Desert windsock is placed even when the route cannot be proven (intentional, disclosed).
- **L4 and V1:** user observations in `BIOME_HANDS_ON_HANDOFF.md`, not review gates.
  - L4: Tripo generated stairs sit under the sofa overhang and flush against the scan; desk 1 and Tripo 2 boxes overlap the scan below their top.
  - V1: the Desert spawn marker is faint.
- **Step 1 residual (Low):** release of old resources is shown only indirectly (fresh canvas per world, bounded counts), with no heap or WebGL-context count. The castShape trigger was never reproduced (0 of 11 without the guard); the fix is closed by construction.
- **Structural (Info):**
  - Generation is synchronous on the main thread; typical cost on the samples is 0.1–0.35 s.
  - Generated structures are axis-aligned boxes, and Rodin uses the open-floor fallback route.
  - Controller evidence comes from a scripted follower, not human play.
  - There is no network AI planner (deterministic presets); the capability smoke was halted with $0 spent.

### Acceptance items still to verify at the combined snapshot (Step 3)

1. **Hashes.** Obtain ad9320dd's explicit combined path list and hashes, verify them yourself, and delta-review any file that differs from the above.
2. **Gate results.** Client and server tsc, build, and the full unit suite on those exact bytes. Integration's earlier 632 (full) and 341 (affected) results predate the fixes and are NOT final.
3. **Browser evidence.** Cross-check integration's earlier attributable real-Chrome evidence (`tmp-biome-integration/`) and note which items ran on older bytes:
   - pause/switch preserves position, checkpoints and fragments;
   - 4 switch cycles give flat renderer counts;
   - Original round-trip at 0.07% pixel difference;
   - both templates prepare and pass the gate;
   - no pickup hitch (p50 ≈ 17.7 ms, one vsync-bound machine);
   - swap regression (30 swaps, 0 errors).
4. **Integration seams.**
   - Saved/shared publication identity is unaffected by look switches (App passes `onAdventurePrepared` only when there is no publication; drafts are unsaved).
   - The generated draft's `adventure`/`biome` markers survive a round-trip through `migrateSceneManifest` and the server schema.
   - Assets are byte-identical (`adventureDraft.ts` gate).
   - An asynchronous failure keeps the old world (`useBiomeAdventure` catch paths).
   - Missing credentials or malformed model output fall back deterministically (the planning schema tests).
   - Reduced-quality budgets are consistent between `placement.ts` (0.5 / 0.6) and `presets.effectiveBudget`.
5. **Legacy Lost Colors stance.** `worker5-gameplay.acceptance.test.ts:95` (scripted drive to fragment 1 does not collect) is reported by integration as failing IDENTICALLY on a detached 2193c5c baseline worktree, and the other test in the file passes.
   - Treat it as a **pre-existing failure, attributed to baseline, NOT green**.
   - Verify attribution from integration's recorded baseline evidence only (the worktree has since been removed); do not widen scope to fix the old sample.
   - Confirm that the copy "Colors found 0" still renders, i.e. authored worlds keep their Lost Colors copy and colours (`GameStage` recolours only worlds with the `adventure` marker).

### Where things live (`nimbalyst-local/tmp-biome-review/`)

- **Harness:**
  - `vitest.review.config.ts`, a private config. Run with `npx vitest run --config nimbalyst-local/tmp-biome-review/vitest.review.config.ts`.
  - `geometry.review.test.ts`, the reviewer probes: planner-ramp ownership, unit costs, planner scan, stair-overlap / drift probe.
- **Logs:**
  - `focused-run.log` (Phase 1: 52/52)
  - `step2-focused-run.log` (43/43, worst-case refusal 1469 ms / 59 checks)
  - `step2-drift-probe.log`
- **Hash lists:**
  - `hashes-before-focused-run.txt` (Phase 1 frozen 7 + deps)
  - `visuals-hashes-observed.txt` (17)
  - `step1-lifecycle-hashes.txt`
  - `step2-freeze-hashes.txt`
  - `retirement-geometry-lifecycle-hashes.txt` (14, at retirement)
- **Baselines:** `geometry-baseline/*.orig`, the six byte-exact frozen originals. `adventures.ts.NOT-BASELINE-158d14f3-inflight` is in-flight only; `README.txt` explains.

## Phase 2: combined freeze (not done by this reviewer; see RETIREMENT)

Waiting for the exact combined file list and hashes from parent 30e37344 or integration ad9320dd, plus integration's single settled gate (tsc client/server, build, full unit suite, real Chrome).

Then I will:
- reuse the attributable gate results;
- inspect the integration and visual code;
- run focused real-Chrome checks only where warranted, on a private Vite with its own cacheDir and port, mocked saves, and none of the protected ports 5173/8787/15173/18799.

Acceptance items to verify: Original/Tropical/Desert look; wind and windsock direction; recognisability and nothing buried; repeated switching cleanup and progress preservation; explicit new-adventure reset; saved/shared identity unaffected; generated-draft marker round-trip; asset bytes unchanged; an async failure keeps the old world; no model credentials and malformed output fall back deterministically; reduced-quality budgets; the L4 Tripo stair visual.

Legacy Lost Colors `worker5-gameplay.acceptance.test.ts:95` is reported identical on detached 2193c5c. I will assess attribution only. It is not to be labelled green.

## Recovery notes for another orchestrator

- Harness: `nimbalyst-local/tmp-biome-review/` (`vitest.review.config.ts`, `geometry.review.test.ts`, logs).
- Run: `npx vitest run --config nimbalyst-local/tmp-biome-review/vitest.review.config.ts`. Node only.
- To re-verify Phase 1: `sha256sum -c nimbalyst-local/tmp-biome-review/hashes-before-focused-run.txt`.
