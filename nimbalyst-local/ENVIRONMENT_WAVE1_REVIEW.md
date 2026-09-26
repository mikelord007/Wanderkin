# Environment upgrade, wave 1: independent review

- **Reviewer:** fresh independent session 1c47c276. Observed runtime model **claude-opus-5-5** (Opus 5.5). No subagents, no fallback model.
- **Reports to:** orchestrator f8543364 (coordination only).
- **Date:** 2026-09-25, about 23:15–23:50 IST (machine clock).
- **Scope:** framework, Tropical and Desert commits in `src/biome/**` and `src/game/render/**`, from f3b9477 (exclusive) to 6093617 (inclusive).
- **Boundaries kept:**
  - Read-only on product source and on the lead's harness.
  - Writes: only this file and `nimbalyst-local/env-upgrade/review-wave1/`.
  - Protected ports 5173/8787/15173/18799 untouched; my port was 16471.
  - No saved or private worlds, storage or audio touched; every `/api` call was mocked and every write aborted.
  - No provider calls. No git commit, stage, reset or stash.

## VERDICT: **APPROVE** wave 1 (no blocking findings)

Every invariant from the ledger and the shipped biome guarantees table still holds at 6093617. All the automated gates are green on my own runs:

- tsc for both the client and server projects;
- the full sequential suite, **812/812**;
- real Chrome on both bundled scans, with a generated adventure world;
- Original pixel identity 0, including across builds;
- flat renderer counts;
- perf on mains power.

There are two **Medium** visual residuals and one **Low** one, all non-blocking. They should be fixed, or disclosed to the user, before hands-on play:

- **M1:** a green or pale stain on the Rodin adventure floor.
- **M2:** acceptance criterion 5 is only PARTLY met at the gameplay camera.
- **L1:** a pink posterisation band in the Tripo sofa shade.

## 1. Commit set and snapshot

`git log --oneline f3b9477..6093617 -- src/biome src/game/render` gives 22 commits. None of them touches any other path. I checked each commit's `--name-only` and none lists a file outside the two directories.

| Area | Commits |
|---|---|
| Framework (lead) | 6ec0947, dbf0c4f, 42ed169, 6b166bc (Phase 5 grove order), 46091be + f506409 (Phase 6 lighting), aaaf0d1 (patch outlines), 715c5f7 (cracks), f9dbf5e (regional tone), 12ef492 (test-only deadlines) |
| Tropical | 23de3bf, 16113c9, 96154a0, 572fd96, 28c15d3 (docs), f0c3af0, f75e081, 6093617 |
| Desert (lead) | a485d4b, 09378ab, 7f2c3f2, eb92a88 |

**Snapshot:**
- A clean detached worktree at `6093617b704f995f5071ee9636839562bf326a60` in `%TEMP%\oq-review-wave1`, with `node_modules` junctioned.
- HEAD was the same before and after the suite, and `git status --porcelain` was empty afterwards (`review-wave1/head-before.txt`, `head-after.txt`, `status-after.txt`).
- The browser server was rooted at that worktree. I confirmed it served committed bytes: `presets.ts` as served lacks the lead's uncommitted `ALPINE` wave 2 import, which the dirty main tree has.
- The worktree, the junction (removed first, and the main `node_modules` verified intact at 224/224 dirs) and the private cache were removed at the end.
- **Note:** main advanced to 2beca34 during the review. That commit is auth/server only (`server/auth/**`, `server/index.ts`, `server/security/owner.ts`, `tests/e2e/http/**`) and does not touch the review scope.

## 2. What I ran (attributable)

| Check | Result | Log / evidence (under `nimbalyst-local/env-upgrade/review-wave1/`) |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0, no output | `tsc-client.log` |
| `npx tsc --noEmit -p server/tsconfig.json` | exit 0, no output | `tsc-server.log` |
| `npx vitest run --no-file-parallelism` (full) | **99 files, 812/812**, exit 0, 58.4 s. The count is above 787 because the auth commits added tests. | `vitest-full.log` |
| Real Chrome `shots.mjs 0 … --adventure` (Rodin) | 0 console errors, 0 writes, 0 blocked hosts; Original identity 0/998,400 after 4 cycles; adventure Original identity 0/998,400; adventure counts before = after (32/29) | `shots-6093617/sample-0/log.txt`, pngs |
| Real Chrome `shots.mjs 1 … --adventure` (Tripo) | Same as Rodin: 0 errors, 0 writes, 0 blocked; identity 0 and adventure identity 0; adventure counts 42/40 before = after | `shots-6093617/sample-1/log.txt`, pngs |
| Cross-build Original identity (`imgdiff.mjs`): HEAD vs the lead's phase1 (6ec0947) Original frames | **0/998,400 on both scans** | `imgdiff-original-vs-phase1.txt` |
| Perf `perf.mjs 0` and `1`, headed Chrome | Both scans, every look: **p50 17.6–17.7 ms**, p95 ≤ 18.2, max ≤ 18.9, **0 frames > 50 ms**; switch 1.64 s including UI | `perf-6093617/perf-{0,1}/log.txt`, `perf{0,1}.console.txt` |
| Power during perf (`Win32_Battery`) | BatteryStatus **2** (AC) before and after; charge 11% → 9%; CPU 16% → 23% | `power-{before,after}-perf.txt` |

**Harness use:** I used the lead's harness read-only. The milestone argument pointed its outputs into my folder. My own copy of its Vite config (`review-wave1/vite.review.mjs`) moves the root to the worktree; everything else in it is the same.

**Power caveat:** the battery read as on AC (status 2) during perf, but the charge fell 2 points. The adapter may be supplying less than the load at a 9–11% charge. Frames were vsync-bound at about 57 Hz throughout, with Original at the same numbers as every look, so the gate result is not affected.

### Renderer counts (draws / geometries), 4 cycles

| Scan | Original | Tropical (clusters) | Desert (clusters) | Reduced T / D |
|---|---|---|---|---|
| Rodin | 29/25 ×4 | 30 / 33, 33, 32, 32 (82) | 29/33 ×4 (60) | 28/30 (56) / 27/29 (55) |
| Tripo | 25/21 ×4 | 29 / 32, 32, 31, 32 (92) | 28/32 ×4 (62) | 27/30 (56) / 26/28 (55) |

- Draw calls are constant.
- The Tropical geometry count jitters by ±1 with no upward trend (the Tropical worker saw the same). Original is exact.
- On adventure worlds, shells replace the box meshes and drop their edge lines. So draws fall versus Original (Tripo: Original 42, Tropical 36, Desert 35) while geometries rise (Original 40, Tropical 55, Desert 56).

## 3. Invariant table

| Invariant | Verdict | Basis (file:line at 6093617) |
|---|---|---|
| Decorative props never join physics | **Holds** | No collider, rapier, RigidBody or physics use in `src/biome/assets/**` or `render/**` (comments only). Layer meshes use `noRaycast` (`decorLayer.ts:89`). No product code raycasts rendered meshes; the only Raycaster uses are in tests (`decorLayer.test.ts:211`, `structureShell.test.ts:89`). Camera occlusion is physics-only (`propMaterial.ts:5`). |
| Structure shells within collider ±τ, top = collider top; colliders and dimensions untouched | **Holds** | `structureShell.ts`:<br>• τ = min(1.2 cm, 4%) (:24–26)<br>• side offsets clamped to ±τ per axis (:110)<br>• chamfer only pulls inward (:113–118)<br>• top fan is the exact rectangle at `hy` (:165–173)<br>• base at −2 cm (:127)<br>• `raycast` is a no-op (:224)<br>`structureShell.test.ts:15–66` checks every vertex, the top area = w·d, 4 corners and no inside-out walls, for every registered art × 5 box cases, including non-uniform and mirrored scales. `SceneEntities.tsx:93–100` builds the shell from `entity.dimensions` and `transform.scale` without mutating either; the collider path is untouched (no `src/game/core` change). |
| SceneEntities HelperMesh conditional is themed-only | **Holds** | `wallStyle = biomeSurface?.structureShell ?? null` (:93). `structureShell` = `getBiomeArt(id)?.wall ?? null` (`surfaceBlend.ts:84`). `getBiomeArt("original")` is null because Original has no factory (`assets/biomes/index.ts:15–18`). When there is no shell, the JSX branch renders the identical box, material and edges (:112–120). |
| Footprint contract: `PROP_UNIT_RADIUS` / `PROP_FOOTPRINT_RATIO` unchanged | **Holds** | `render/propGeometry.ts` has **no diff** vs f3b9477. |
| Compose fit-scale guarantees extent ≤ reserved radius | **Holds** | `compose.ts`:<br>• `radius = min(placement.radius, h·PROP_UNIT_RADIUS[kind])` (:229)<br>• measured transformed extent and top over every vertex (:351–361)<br>• one uniform `fit = min(1, r/E, h/T)` about the base (:362–373)<br>• primaries stay at index 0, so trimming (m ≥ 1) never removes them (:413)<br>`validate.test.ts` iterates `registeredBiomeArt()`: radius, triangles, height, variant minimums, primary radius ≤ 1.1 × kind, lighting bounds, reduced < standard. |
| Placement safety: `testAnchor` unchanged; only candidate ordering changed | **Holds** | The `placement.ts` diff vs f3b9477 has three parts (:490–501, :510–521, new :532–589):<br>• `groveOrder` permutes `order` using its own `seededRandom(seed:groves)` stream;<br>• it adds an open-ground quota that only *skips* candidates;<br>• it adds `groveScale`.<br>`testAnchor`, `request`, `accept` and the spacing and exclusions are untouched. |
| Determinism per seed | **Holds** | Every stream is seeded (no `Math.random` in `src/biome`). Tests pass: placement (permutation and determinism), compose determinism and shell determinism. In browser, identical prop counts over 4 cycles. |
| Theme independent of gameplay geometry | **Holds** | "never lets the theme change the layout" passed in the full sequential suite. The placement change is renderer-layout only. |
| Original byte-identical path | **Holds** | Code paths:<br>• SceneLighting: `themed` null ⇒ `tuning` / `rig` null ⇒ the same style values (`SceneLighting.tsx:135, 198–244`);<br>• SceneEntities null path as above;<br>• the BiomeLayer is not built for Original (`placement.test.ts:103`).<br>Pixels: identity 0 after 4 cycles and on adventure worlds on both scans, **and 0 vs the phase1 build**. |
| Dispose / no growth across switches | **Holds** | Draws are flat. Geometries: Original exact, themed ±1 jitter with no trend. Adventure Original counts are equal before and after the shells mount and unmount 4 times. The shell's dispose releases its geometry and material exactly once (test :81–94). The layer has a single-owner dispose (`decorLayer.test`). |
| Reduced-quality budgets meaningful | **Holds** | Tropical 82/92 → 56 clusters. Desert 60/62 → 55 clusters, with members per cluster 6 → 3, no micro members, no prop shadows, and triangle caps 80k → 35k. Draws drop by 2–3 and particles fall to 0.35×. Art `reduced < standard` is tested. |
| Prop draw budget ≤ 14 standard / 11 reduced; triangles ≤ caps | **Holds** | Enforced by the layer's `canDraw` plan and the art budgets (Tropical 110k/45k, Desert 80k/35k; tests). |
| No new npm dependencies (environment commits) | **Holds** | No environment commit touches `package.json` or the lockfile. The `@supabase/supabase-js` and `jose` delta vs f3b9477 comes from auth commit 92a367f (out of scope). |
| No third-party assets | **Holds** | Everything is procedural (MeshKit builders). There are no GLB, GLTF or texture loaders in `src/biome`; the only `.glb` strings are pre-existing test fixtures. No `public/` change by any environment commit. |
| Gameplay rings and readability: decals renderOrder 0, no depth write | **Holds** | `contactDecals.ts:50–53, 109`. Current contact opacity: Tropical 0.42, Desert 0.38 × 1.15 = 0.437, both ≤ 0.45. See L2 for the clamp. |
| Collectible hue ≥ 30° from dressing accents | **Holds** | Tested (`validate.test.ts:55–60`). Tropical coconuts were moved off ochre (checkpoint M3). |

## 4. Acceptance criteria (normal gameplay camera first)

- **R** = `env-upgrade/review-wave1/shots-6093617/sample-{0 Rodin, 1 Tripo}/` (mine).
- **S** = `env-upgrade/shots/` (milestones).
- **G** = `env-upgrade/shots/gallery/`.
- Baseline before the upgrade: `S/phase1/sample-{0,1}/b-tropical.png`, `c-desert.png` (legacy props through the framework).

| # | Criterion | Verdict | Evidence and notes |
|---|---|---|---|
| 1 | Palms not cylinders + triangles | **MET** | `R/sample-0/b-tropical.png`: curved, segmented, leaning trunks and feathered drooping crowns. `G/review-tropical-96154a0/tropical-heroes.png` has 5 heroes and 2 young palms. Compare the baseline flat-cone palms in `S/phase1/sample-1/b-tropical.png`. |
| 2 | Bushes not green blobs | **MET** | `R/sample-1/b-tropical.png`, right: a shingled leafy bush with dark interior masses. The gallery heroes show 6 forms, including the elephant-ear bush. The baseline is icosahedron blobs. |
| 3 | Cacti with several convincing silhouettes | **MET** | `R/sample-0/c-desert.png`: a ribbed saguaro. `R/sample-1/g-adventure-desert.png`: organ-pipe and barrel cacti. `G/review-tropical-96154a0/desert-heroes.png`: saguaro with 1/2/3 arms, a column, organ pipe, barrel, prickly pear, agave and echeveria. |
| 4 | Rocks in clearly different families and sizes | **MET** | Desert: undercut boulder, cap-rock hoodoo, stepped mesa and stacked slabs (`G/.../desert-clusters.png`; hoodoo in `R/sample-1/d-desert-reduced.png`). Tropical: pale limestone vs dark basalt slab (`R/sample-0/e-tropical-reduced.png`), plus pebbles and companions. |
| 5 | Walls and cliffs not plain rectangular blocks | **PARTLY** | Close up, the shells are banded strata with a light rim, a chamfer and crack columns (`S/tropical-walls/g1/shells.png`, `G/desert-m2b/desert-shells.png`). At the gameplay camera in the sofa's shade they still read as two-tone boxes: `R/sample-1/zoom-stairs-h-adventure-tropical.png` and `zoom-stairs-g-adventure-desert.png` (4× crops of the Tripo stairs). Silhouettes are rectangular by design (±1.2 cm, keeping the collider honest). The Rodin platform is again out of the fixed frame. There are no cliff formations in the game to judge. See **M2**. |
| 6 | Repetition substantially less noticeable | **MET** | Tropical: tree 7, bush 14, rock 14 variants. Desert: cactus 11, rock 11. Shuffle-bag variant choice plus yaw, lean, mirror, tone jitter and regional drift (f9dbf5e). In the gameplay frames, neighbouring palms and rocks differ. |
| 7 | Believable compositions | **MET** | Groves with open ground between them (Phase 5). The Desert cluster in `R/sample-0/c-desert.png` has scrub, tumbleweed, saguaro and boulder sharing a contact patch. There are 9 Tropical and 6+ Desert presets (`G/.../desert-clusters.png`). |
| 8 | Secondary dressing on major props | **MET** (standard) | Pebbles, tufts, fronds and companions at the base of the heroes (gallery clusters; `R/sample-1/h-adventure-tropical.png`, right bush). Reduced drops micro members by design. |
| 9 | Grounded, not placed on top | **MET** | Contact blobs and soil patches, baked ground AO and embedding are visible under the Desert cluster and boulder (`R/sample-0/c-desert.png`) and under the Tropical palms (`R/sample-0/b-tropical.png`, left). The shell base sinks 2 cm. The M1 stain and L1 band are floor-tint artefacts, not hovering. |
| 10 | Tropical vs Desert clearly different yet one game | **MET** | Same frame, same furniture: `R/sample-{0,1}/b-tropical.png` vs `c-desert.png`, and `h-` vs `g-adventure-*`.<br>**Different:** a cool turquoise sky and sea vs a warm dusty gradient sky with no water; lush green palms and bushes vs sparse ribbed cacti, sandstone and dry scrub; density 82–92 vs 60–62 clusters; a softer sun vs a harsher, warmer one; bleached timber decks vs orange sandstone strata.<br>**Same game:** the same character, camera, tone-ramp rules, faceted-rock language, contact treatment and saturation ceiling. |
| 11 | Stylised, not photoreal | **MET** | Vertex-tone ramps only and no textures; faceted rocks and simplified leaves (every gallery and frame). |
| 12 | Surroundings substantially more polished at gameplay distance | **MET** (automated judgement) | Compare `S/phase1/sample-{0,1}/b-tropical.png` / `c-desert.png` with `R/…` at the same camera. The user owns the feel. M1 and L1 detract locally. |
| 13 | Uploaded furniture stays recognisable | **MET, with caveat** | The desk and sofa dominate every themed frame (both scans, both looks, standard and reduced, adventure). Original is untouched (identity 0). Caveat: the **known Rodin bleed-through (M1)** is a soft stain on the scan ground near the desk leg (`R/sample-0/h-adventure-tropical.png`, lower left). It doesn't hide the furniture, but it reads as a smear on the surface. The Desert blend is 0.48, unchanged from the shipped biome, and reads cleanly on the dark desk (`R/sample-0/c-desert.png`). |
| 14 | New biomes via the same architecture | **MET** (by design and tests) | One registry line (`assets/biomes/index.ts:15–18`) plus one definition and art file. Guardrails, shell containment and lighting bounds iterate `registeredBiomeArt()`, so a new biome is covered automatically. The §10 contract documents it. Compose, batch, the layer, placement and lighting need no change. The shared id union line remains an integration schema change. |
| 15 | Performance suitable for play | **MET** | Mains power: p50 17.6–17.7 ms (gate ≤ 18.7), 0 frames > 50 ms on both scans in every look, including Desert reduced. Draws 29–31 vs Original 25–29. The switch takes 1.64 s. |

## 5. Findings (severity-ranked). No Critical or High findings; nothing blocking.

### M1: Medium (non-blocking): soft green or pale stain on the Rodin adventure ground in Tropical

**Owner:** lead (render); already investigating per the ledger.

- **Where:**
  - `src/biome/render/surfaceBlend.ts:147–151` (the scan role gets only the soft patch tint at `strength`) and the fragment mix at `:254`;
  - `src/biome/definitions/tropical.ts:26` (`surface.blend` 0.30).
- **Effect:**
  - On the generated Rodin adventure, a large, soft-edged green blob covers about 15% of the frame at lower left, next to the desk leg (`R/sample-0/h-adventure-tropical.png`).
  - At blend 0.42 the same region was a pale sand smear (`S/tropical-final2/sample-0/h-adventure-tropical.png`, `S/phase2-a/…`).
  - 6093617 changed which artefact shows; it did not create the mechanism, which is the shipped surfaceBlend.
  - Tripo shows the pale variant (`R/sample-1/h-adventure-tropical.png`, lower left).
- **Mechanism (static):**
  - Helper floors get the whole-surface tint (0.92).
  - Upward scan texels only get the patch-shaped, luminance-preserving tint at `blend`, which has a wide soft falloff and ignores `patchCoverage`.
  - A flat scan-ground region near floor level therefore shows its photo colour through a thin, blurred tint.
  - I did not instrument which texels these are.
- **Smallest repair (lead's choice):** give the scan patch tint a crisp edge, as aaaf0d1 did for the support patches. Or treat scan texels within a few cm of the floor top like the floor (the helper tint). Keep 0.30 for the dark desk-top case. Verify on `R/sample-0` adventure and on `b-tropical` (the dark desk).

### M2: Medium (non-blocking): criterion 5 is PARTLY met; structure shells still read as boxes at gameplay distance

**Owners:**
- lead: `render/structureShell.ts`, Desert `assets/biomes/desert.ts` wall;
- Tropical follow-up: `assets/tropical/wall.ts`.

- **Where:**
  - the whole shell design within ±τ: `structureShell.ts:24–26, 138–143` (the tone-led strata);
  - the stair zoom crops in `R/sample-1/`.
- **Effect:**
  - In deep furniture shade, the strata contrast collapses to one faint band plus one dark crack column.
  - The silhouettes are exactly rectangular, as the collider-honest design requires, so the spec's "not plain rectangular blocks" is met close up but not at distance.
  - The Rodin platform has still not been shot in game.
- **Smallest repair, without breaking the invariant:**
  - raise the side-band contrast in shade: brighter light bands, or a darker seam line between strata;
  - add a non-colliding base dressing ring of stones or planks around the foot of shelled structures. This would reuse compose, placed only outside the helper footprint and route exclusions, with the lead's placement tests;
  - optionally add a slight outward top lip ≤ τ on the uppermost stratum only.
- **Also:** add a harness frame, or a second camera pose, that captures the Rodin adventure structures.
- **Disclose:** if this is not addressed, disclose it to the user as a known limit.

### L1: Low: pink posterisation band in the Tripo sofa shade, Tropical only

**Owner:** lead (`SceneLighting` rig, or the Tropical `LightingAdjust` in `assets/biomes/tropical.ts` now that Tropical is released).

- **Where:** introduced by **46091be** (`SceneLighting.tsx:260–272` `biomeLightRig`, used at :198: the ambient-to-hemisphere move). I bisected with the milestone shots: absent in `S/phase5/sample-1/b-tropical.png`, present in `S/phase6-a/…` and at HEAD.
- **Effect:**
  - A mauve wedge (≈ x 330–430, y 275–340) sits in the shaded sand under the sofa (`R/sample-1/b-tropical.png`).
  - Pixel samples at (370, 310): phase5 (204,153,102), then phase6-a and HEAD **(204,153,153)**. The neighbouring shade stays (204,153,102).
  - The helper floor's **per-channel** posterisation (5 steps of 51) lets the blue channel cross one step where the hemisphere adds more sky blue. §1.5 warns about exactly this.
- **Smallest repair:** a Tropical-only nudge that keeps shaded sand on the same blue step, for example `lighting.hemisphereShare` ≈ 0.35 or a slightly warmer `lighting.sky`. Verify it with the same pixel sample. Longer term: posterise helper floors per luma band in themed looks.

### L2: Low: the contact-decal opacity clamp is looser than the documented readability rule

**Owner:** lead.

- **Where:** `src/biome/render/contactDecals.ts:40`, which clamps to `Math.min(0.6, …)`, while §9 says decal alpha ≤ 0.45. `contactStrength` may be up to 1.5 (`lighting.ts:39`).
- **Effect:** none today (0.42 and 0.437). A future biome could reach 0.6 and the guardrail would not catch it.
- **Repair:** clamp to 0.45, or assert `ground.contactOpacity × contactStrength ≤ 0.45` in `validate.test.ts`.

### Info

- **I1** (lead): `SceneLighting.tsx:81–82`: an orphaned doc comment ("Biome sun elevation is clamped…") remains after the constants moved to `assets/lighting.ts`.
- **I2** (lead): the shell uses the same pattern as the existing box geometry: a memo plus effect-cleanup dispose (`SceneEntities.tsx:81–88, 94–100`).
  - Under the dev server's `React.StrictMode`, the simulated unmount disposes the live shell once, and three.js re-uploads it on the next frame.
  - There is no leak (counts are flat), and production builds are unaffected.
- **I3** (lead): shell materials are plain `MeshStandardMaterial` and are not colour-restoration-aware. This is consistent with biome props, which also bypass the style shader. It only matters if a colour-restoration mode is ever combined with a themed look.
- **I4:** the Tropical geometry count jitters by ±1 between cycles with no trend; draws are constant (§2). It looks like a visibility-dependent `renderer.info` count, not growth.
- **I5:** Desert reduced keeps nearly as many clusters as standard (60 → 55). It sheds members, micro members, shadows and triangles instead. Perf is equal either way.

## 6. Residuals to disclose (hands-on handoff and delivery notes)

1. M1: a stain on the Rodin adventure scan ground in Tropical (lead is investigating).
2. M2 / criterion 5: shelled steps and platforms read as boxes at gameplay distance in furniture shade. The shell silhouette cannot leave the collider by design (±1.2 cm).
3. L1: a pink band in the Tripo sofa shade under Tropical.
4. **Perf:** measured on AC (BatteryStatus 2), vsync-bound at about 57 Hz. The battery charge was falling (11% → 9%) during the run.
5. **Carried from the shipped biome reviews:** M1 worst-case workload bounded but unmeasured; F-1 narration/copy mismatch on generated drafts; legacy Lost Colors e2e not green (pre-existing). Wave 1 did not touch these paths.
6. **Feel and play** are not judged here; the user owns hands-on play.

## 7. Evidence index (`nimbalyst-local/env-upgrade/review-wave1/`)

- `head-before.txt`, `head-after.txt`, `status-after.txt`: snapshot proof.
- `tsc-client.log`, `tsc-server.log`, `vitest-full.log`.
- `vite.review.mjs`, `vite.log`: my server (port 16471, root = worktree, private cacheDir).
- `shots-6093617/sample-{0,1}/`:
  - `a`–`i` frames and `log.txt`;
  - `zoom-stairs-*.png`, 4× crops of the Tripo stairs from the three `sample-1` adventure frames.
- `shots{0,1}.console.txt`, `imgdiff-original-vs-phase1.txt`.
- `perf-6093617/perf-{0,1}/log.txt`, `perf{0,1}.console.txt`, `power-{before,after}-perf.txt`.
