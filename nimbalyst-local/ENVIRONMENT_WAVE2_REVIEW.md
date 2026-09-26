# Environment upgrade, wave 2: independent review

- **Reviewer:** session 1c47c276, re-engaged after wave 1. Observed runtime model **claude-opus-5-5** (Opus 5.5). No subagents, no fallback model.
- **Reports to:** orchestrator f8543364.
- **Date:** 2026-09-26, about 02:25–02:50 IST (machine clock).
- **Boundaries kept:**
  - Read-only on product source and on the lead's harness.
  - Writes: only this file and `nimbalyst-local/env-upgrade/review-wave2/`.
  - My port was 16491, which was not in use. No protected port touched.
  - `/api` was mocked in memory; every real write was aborted.
  - No saved or private worlds, storage or audio touched. No provider calls.
  - No git commit, stage, reset or stash. My only git write was `checkout --detach` inside my own temporary worktree.

## VERDICT: **APPROVE** wave 2, snapshot daa9810 plus delta c754d52 (no blocking findings)

**Automated gates, all green on my own runs:**
- Every invariant from waves 1 and 2 holds.
- tsc passes for the client and server projects.
- The full sequential suite passes: **1009/1009** at daa9810 and **1010/1010** at c754d52.

**Real Chrome, all six looks, both scans, standard and reduced, with a generated adventure:**
- 0 console errors and 0 unexpected writes;
- Original pixel identity 0 after the look cycles and on the adventure worlds, **and 0 vs the wave-1 and phase1 builds**;
- flat counts;
- no concentric shadow rings on any themed floor;
- perf on AC: p50 17.6–17.9 ms and 0 frames > 50 ms.

**Wave 1 findings:** all five (M1, M2, L1, L2, I1) are closed.

**Remaining findings:** three **Low** findings and several Info notes, none blocking:
- the Autumn Tripo sofa is crushed to a flat black cutout;
- Ember's tall basalt steps read as plain dark blocks in shade;
- the art triangle caps are not guarded by a test.

## 1. Commit set and snapshot

`git log --oneline 6093617..HEAD -- src/biome src/game/render src/scene src/ui/components/AdventureControls.tsx` gives **24 commits**, matching the brief.

| Owner | Commits |
|---|---|
| Framework (lead) | 240ef7b (wave-1 polish), 8383368 (scaffold), 435eac1 (fair per-kind budget), 7581478 (luma-band helper floors), 9568741 (band base colour before lighting), 544e70d (sand re-tune), daa9810 (courseHeight, wall guardrails, harness pose) |
| Alpine | 8154185, c5f75d6, 07f1633, 1b3014c, 1eb1867, b2fa9b3 |
| Autumn | 01b489c, 2d25cb4, 0092988, 556e5e2, 980f370 |
| Ember | a26c804, 522a223, 30652e4, 9fe23a3, 04622a9 |
| UI (look list only) | 0234907 |
| **Delta** (landed during the review) | **c754d52** "feat: planner keyword hints for alpine, autumn and ember" (`planning.ts` + test only) |

The other three commits since 6093617 are auth/dashboard work and are out of scope.

**Snapshot:**
- A clean detached worktree at `daa9810982d432e934612f9a12700f0bcbf648e7` in `%TEMP%\oq-review-wave2`, with `node_modules` junctioned.
- HEAD was the same before and after the suite, and `git status --porcelain` was empty (`review-wave2/head-{before,after}.txt`, `status-after.txt`).
- The browser server (16491) was rooted at that worktree. At run time the main tree had no dirty product files either.
- **Delta pass:** the same worktree was moved to `c754d52571af5353b282828a59f11c07c3b835ab` for tsc and the full suite (`delta-*.log`).
- The browser evidence is at daa9810. The delta changes only the offline planner's theme choice when no look was chosen, which the harness never uses, and themes never change layout. It was not re-shot.
- **Cleanup:** the server was stopped, the junction removed first (main `node_modules` intact at 224/224), then the worktree and private cache removed. HEAD on main is c754d52.

## 2. What I ran (attributable)

| Check | Result | Log / evidence (under `nimbalyst-local/env-upgrade/review-wave2/`) |
|---|---|---|
| tsc client / server @ daa9810 | exit 0 / exit 0 | `tsc-client.log`, `tsc-server.log` |
| `npx vitest run --no-file-parallelism` @ daa9810 | **112 files, 1009/1009**, exit 0, 105.8 s | `vitest-full.log` |
| tsc client / server @ c754d52 | exit 0 / exit 0 | `delta-tsc-*.log` |
| Full suite @ c754d52 | **112 files, 1010/1010**, exit 0 | `delta-vitest-full.log` |
| `shots.mjs 0 … --adventure` with `OQ_LOOKS` = the five themed looks (Rodin) | 0 console errors, 0 blocked hosts, 0 unexpected writes. The only mocked in-memory call is `POST /api/auth/session` (stub sign-in). Original identity **0**/998,400 after 4 six-look cycles; adventure identity **0**. Adventure counts 33/30 before = after. Structure pose: 4 shells, 8/8 visible. | `shots-daa9810/sample-0/` |
| `shots.mjs 1 …` (Tripo) | Same as Rodin: 0 errors, 0 unexpected writes, only the stub-session mock; identity 0 and adventure identity 0; adventure counts 37/37 before = after. Pose: 10 shells, 3/20 visible, because the stairs sit under the sofa. | `shots-daa9810/sample-1/` |
| Cross-build Original: HEAD vs wave-1 (6093617) and phase1 (6ec0947) frames | **0/998,400** on both scans, against both builds | `imgdiff-original-sample{0,1}.txt` |
| Near-player ring check: 4× crops plus a luminance profile along 3 rays of 130 px from the player, on all five floors × both scans × standard and reduced | Max per-pixel luminance jump **≤ 3** (mostly ≤ 1); 0 hard band edges. The crops show one flat contact disc and a smooth glow. | `ring-profile.txt`, `shots-daa9810/sample-*/z-near-player-<look>-x4.png` |
| Perf `perf.mjs` with the five looks, headed Chrome, both scans | Every look: **p50 17.6–17.9**, p95 ≤ 18.3, max ≤ 18.9, **0 frames > 50 ms**. Ember reduced 17.6/17.7. Switch 1.63 s. | `perf-daa9810/perf-{0,1}/log.txt`, `perf{0,1}.console.txt` |
| Power (`Win32_Battery`) | BatteryStatus **2** (AC) before and after; **charge 8%** both times. CPU 18% before, 49% after. 5 local listeners. | `power-{before,after}-perf.txt` |
| Furniture detail metric on the gameplay frames | See Low finding A1 | `furniture-crush.txt` |
| Contact sheets: six looks per scan | For criterion 10 | `shots-daa9810/sample-{0,1}/contact-six-looks.png` |
| Tripo stairs in sofa shade, 3× crops, six looks | For criterion 5 | `shots-daa9810/sample-1/zoom-stairs-all-looks-x3.png` |

- **Harness:** the lead's harness was used read-only. Outputs went to my folder via the milestone argument. `review-wave2/vite.review.mjs` is a copy of its Vite config with the root moved to the worktree.
- **`perf.mjs` coverage:** it measures reduced effects only for the last look, here Ember. Reduced prop counts for every look are in the shot logs.

### Renderer counts over 4 cycles: draws / geometries (props)

| Scan | Original | Tropical | Desert | Alpine | Autumn | Ember |
|---|---|---|---|---|---|---|
| Rodin standard | 29/25 ×4 | 30/33 (88) | 29/34→33 (66) | 29/32 (82) | 29/32↔31 (85) | 30/33→32 (80) |
| Rodin reduced | — | 28/31 (56) | 27/30 (55) | 27/30 (55) | 27/30 (50) | 28/31 (52) |
| Tripo standard | 25/21 ×4 | 29/31↔32 (84) | 28/32↔33 (68) | 28/31↔30 (81) | 28/31↔30 (89) | 29/31↔32 (72) |
| Tripo reduced | — | 27/30 (56) | 26/28 (55) | 26/29 (55) | 26/28 (50) | 27/29 (52) |

- Draw calls are constant for every look.
- Themed geometry counts jitter by ±1 with no trend (wave-1 I4). Original is exact.
- Reduced cuts clusters in every biome, by 20–44 per scan, on top of dropping micro members and shadows and lowering the triangle caps.

## 3. Invariant table

| Invariant | Verdict | Basis |
|---|---|---|
| `PROP_UNIT_RADIUS` / `PROP_FOOTPRINT_RATIO` unchanged vs f3b9477 | **Holds** | `render/propGeometry.ts` has an empty diff f3b9477..daa9810. |
| `testAnchor` unchanged vs f3b9477 | **Holds** | The function body extracted from both revisions is **byte-identical** (3,030 chars). |
| 435eac1 changed only attempt allocation and ordering; 240ef7b skirts are ordering only | **Holds** | `placement.ts` diff vs 6093617:<br>• the plan is built tall-first and then round-robin;<br>• attempts are shared per kind (`allowance`), with a leftover pass bounded by the same `maxTests`, the same cursor and the same candidate order;<br>• skirt anchors all pass `testAnchor`, on their own `seed:skirts` stream, capped at 15% of the target and 2 per structure;<br>• the skirt `AnchorRequest` equals `request("rock")` (radius = h × `PROP_FOOTPRINT_RATIO.rock`, same slope, edgeMargin 0.15r);<br>• skirt ids `prop-rock-skirt-*` are unique.<br>Tests: `placement.test.ts:178–199, 230`. |
| Shells within ±τ, top = collider top, for all five wall styles | **Holds** | `structureShell.test.ts:15–66` loops `registeredBiomeArt()` (5 arts) × 5 box cases (step, bridge, non-uniform, mirrored, platform): every vertex within box ± τ, the top area = w·d, 4 corners and no inside-out walls. The 240ef7b joints and seams split each face along its own ring segment (`structureShell.ts:217–232`), so they are within τ by construction. |
| … with `courseHeight` | **Holds by construction; not exercised** (see I-2) | `courseHeight` only changes the course count, clamped to [strata low, `MAX_COURSES` 12] (`structureShell.ts:131–134`). Horizontal offsets stay clamped. **No shipped wall sets it.** The vertex-containment loop never runs a style with it; the only test is course count and byte-identity (`structureShell.test.ts:113–137`). |
| Props never in physics or raycast | **Holds** | No collider or rapier use in `src/biome/assets` or `render` (only a doc comment). The layer sets `child.raycast = noRaycast` (`decorLayer.ts:172`) and the shell sets `raycast = () => {}` (`structureShell.ts:261`). `SceneEntities.tsx` is unchanged since wave 1. |
| Deterministic per seed | **Holds** | No `Math.random` in `src/biome`. New streams (`seed:skirts`, the fair-budget pass) are seeded. Browser prop counts are identical in every cycle. |
| Theme independent of gameplay | **Holds** | "never lets the theme change the layout" now iterates all six looks (`adventures.test.ts:123–`) and passed in both suites. |
| Original byte-identical: `styleMaterial` | **Holds** | 7581478/9568741: `helperLumaBands` defaults to false. With it false, `styleFragment()` returns the old string, the cache key suffix is empty, and the `color_fragment` injection is skipped. `surfaceBlend.ts` calls `setHelperLumaBands(material, treatment !== null)` for helpers, so Original switches back off. |
| Original byte-identical: `surfaceBlend` | **Holds in pixels** (see I-1) | The injection is installed on every helper material, Original included. Its source and key moved v2 → v3 (the new floor-band branch), gated by `oqBiomeFloorTint`, which is 0 for Original. |
| Original byte-identical: SceneLighting / SceneEntities / BiomeLayer null paths | **Holds** | SceneLighting changed only by removing the orphaned comment (I1). SceneEntities is unchanged. The layer is never built for Original. |
| Original byte-identical: pixels | **Holds** | Identity 0 in-run on both scans after six-look cycles and on adventure worlds. **Cross-build 0 vs 6093617 and vs 6ec0947.** |
| No growth across switches | **Holds** | See the §2 counts. Adventure Original counts are equal before and after 4 cycles with shells mounting and unmounting. |
| Reduced budgets meaningful, all five | **Holds** | Clusters −20 to −44 per scan, micro members dropped, no prop shadows, particles × 0.35, and reduced < standard triangles and members (tested). Autumn reduced is now 45k (980f370). |
| Budgets within caps | **Holds; triangle caps untested** (A3) | Art triangles: Tropical 110k/45k, Desert 80k/35k, Alpine 80k/35k, **Autumn 90k/45k**, Ember 75k/32k. All are within the §3.5 layer caps of 110k/45k. The addendum table still says Autumn 40k. The composer trims to the cap at runtime (`compose.ts` `composeLayout`). |
| Guardrails over all five biomes | **Holds** | `validate.test.ts` covers:<br>• registration (`BIOME_IDS` = `SCENE_BIOME_IDS`, all themed ids have art);<br>• required categories per biome (:20–26) and variant minimums;<br>• accent, glow and litter hue ≥ 30° from the collectible;<br>• contact opacity × strength ≤ `MAX_CONTACT_OPACITY` 0.45 (:159–161);<br>• wall ramps: ordered luma, sat ≤ 0.78, L 0.10–0.88, hue drift ≤ 40, courseHeight > 0 (:140–157);<br>• atmosphere only restyles enabled effects (:164);<br>• lighting bounds.<br>All pass. |
| No new npm dependencies; no third-party assets | **Holds** | Empty diff 6093617..daa9810 on `package.json`, the lockfile and `public/`. No GLB, GLTF or texture loaders in `src/biome`; all new art is procedural (MeshKit builders). |
| Shared schema change is one line | **Holds** | `shared/manifest.ts`: `SCENE_BIOME_IDS` gains alpine/autumn/ember, with a migration round-trip test. |
| Look picker list correct (0234907) | **Holds** | `THEME_OPTIONS = BIOME_IDS.map(id => LOOK_LABELS[id])`. `LOOK_LABELS` is a `Record<BiomeId, …>` (all six; a new id fails to compile); `data-theme` hooks are intact. The harness clicked every look through them. |

## 4. Wave 1 findings: closure

| Wave-1 finding | Status | Evidence |
|---|---|---|
| **M1** Rodin adventure scan-ground stain | **CLOSED** | Up-facing scan texels within `SCAN_FLOOR_BAND` 4.5 cm of the floor take the helper floor tint (`surfaceBlend.ts`, 240ef7b). `shots-daa9810/sample-0/g-adventure-tropical.png` shows clean sand by the desk leg. The green area at right is a crisp support patch under a palm, which is intended. |
| **M2** shells read as boxes at distance | **CLOSED as far as the collider-honest design allows** | Seams, staggered joints and wider tone bands (240ef7b), structure skirts, and a least-occluded pose (daa9810). `zoom-stairs-all-looks-x3.png`: under the sofa at gameplay distance, all five themed looks show courses or joints (in wave 1 these were two-tone boxes). The Rodin structures are finally shot in game (`p-structures-*.png`, 8/8 visible). Silhouettes stay rectangular by design. |
| **L1** pink posterise band (Tripo Tropical) | **CLOSED** | Pixel (370,310): wave 1 (204,153,153) → **(205,165,109)**, the same hue as the neighbouring shade (205,163,105). |
| **L2** contact-decal clamp | **CLOSED** | `MAX_CONTACT_OPACITY = 0.45` in `contactDecals.ts`, plus the guardrail in `validate.test.ts:159–161`. |
| **I1** orphaned comment | **CLOSED** | Removed from `SceneLighting.tsx`. |

## 5. Acceptance criteria per new biome (normal gameplay camera first)

- **R** = `env-upgrade/review-wave2/shots-daa9810/sample-{0 Rodin, 1 Tripo}/`.
- **S** = `env-upgrade/shots/`.
- The workers' tables were treated as claims; the verdicts below are mine.

### Alpine (worker claim: 1, 2, 4, 5, 7–15 MET; 6 with caveat; 3 n/a)

| # | Verdict | Evidence and notes |
|---|---|---|
| 1 (trees, read as conifers) | **MET** | Layered, serrated, snow-laden tiers: `R/sample-1/b-alpine.png` and `S/alpine-final-gallery/clusters.png`. |
| 2 bushes | **MET** | Krummholz dwarf pines and shrubs poking through snow (gallery). They're small at gameplay distance. |
| 3 cacti | n/a | |
| 4 rocks | **MET** | Snow-capped granite: stepped outcrops, boulders and cairns (gallery; `R/sample-1/b-alpine.png`, cairn at right). A few boulders are near-round hulls (Info). |
| 5 walls | **MET (caveat)** | Snow-topped granite courses in the pose (`R/sample-0/p-structures-alpine.png`). Under the sofa: grey courses with joints. The snow top is barely visible in deep shade. |
| 6 repetition | **MET** | 5 conifers + 3 young, 12 rocks, markers. Wood markers repeat (the worker disclosed this). |
| 7 compositions | **MET** | Groves with open snowfield between them (`R/sample-1/b-alpine.png`). |
| 8 dressing | **MET** | Drifts, twigs and stones around heroes (gallery). |
| 9 grounding | **MET** | Blue contact shadows and snow mounds at the bases. |
| 10 | see §6 | |
| 11 stylised | **MET** | |
| 12 polish | **MET** (automated judgement) | |
| 13 furniture | **MET** | The strong sun bands the desk and sofa textures more than other looks. Both stay recognisable, and they have the most tonal detail of any look (`furniture-crush.txt`: Tripo 530 distinct colours vs Original 359). |
| 14 architecture | **MET** | Own builders under `assets/alpine/**` plus shared snowCap/conifer capabilities; no framework edit by the worker. |
| 15 perf | **MET** | p50 17.6–17.7; 0 frames > 50 ms. |

### Autumn (worker claim: 1, 2, 4, 5 (caveat), 6–9, 11–15 MET; 10 PARTLY)

| # | Verdict | Evidence and notes |
|---|---|---|
| 1 trees | **MET** | Layered broadleaf canopies in rust, amber and olive on flared trunks (`R/sample-0/b-autumn.png`, left; `R/sample-1/b-autumn.png`). |
| 2 bushes | **MET (caveat)** | Leafy shrubs with berries and bracken (`S/gallery/autumn-m3c/autumn-shrubs.png`). They're lumpier than Tropical's shingled bushes, but no longer plain blobs. |
| 3 cacti | n/a | |
| 4 rocks | **MET** | Mossy and lichen granite, medium stones and pebbles (`S/review-autumn-m2/gallery-rocks-wood.png`). |
| 5 walls | **MET** | Timber beams with courses and beam ends in the pose (`R/sample-0/p-structures-autumn.png`) and under the sofa (stairs composite). |
| 6–8 | **MET** | 6 + 3 trees, 13 bushes, 13 rocks, 25 dressing; toadstools, logs, stumps and leaf litter. |
| 9 grounding | **MET** | Leaf-litter patches and contact shadows (`R/sample-1/b-autumn.png`). |
| 10 | see §6 | |
| 11–12 | **MET** | Worker-disclosed: the largest toadstools are about character height (`R/sample-0/b-autumn.png`, right), and bracken can read as flames up close. |
| 13 furniture | **MET, caveat A1** | The Rodin desk is fine. **The Tripo sofa underside is crushed to a flat black cutout** (148 distinct colours vs Original 359 and Ember 309). It remains recognisable by silhouette. |
| 14–15 | **MET** | p50 17.7; 0 frames > 50 ms. |

### Ember (worker claim: 2, 4, 6–9, 11–15 MET; 5 PARTLY; 1, 3 n/a)

| # | Verdict | Evidence and notes |
|---|---|---|
| 1 trees | **MET** (as charred snags) | Snags and splintered stumps (`R/sample-0/b-ember.png`, `S/ember-m2-gallery/trees.png`). |
| 2 bushes | **MET** | Ash scrub cushions, tussocks, ember ferns and fire lilies (gallery). |
| 3 cacti | n/a | The cactus placement kind is used for basalt spires. |
| 4 rocks | **MET** | Hex basalt columns, obsidian blades, cinder cones with glowing craters, crust lobes (`S/review-ember-m1/gallery-rocks.png`; `R/sample-0/g-adventure-ember.png`, right). |
| 5 walls | **PARTLY** (A2) | Columnar joints read on the low steps and under the sofa (stairs composite). The tall step's shaded face in the Rodin pose reads as a near-plain dark block (`R/sample-0/p-structures-ember.png`). The worker disclosed the same limit. |
| 6–8 | **MET** | 8 tree, 7 bush and 21 rock variants; vents, scoria and fire lilies. |
| 9 grounding | **MET** | Glowing cracked patches, contact shadows, charred bases. |
| 10 | see §6 | |
| 11–12 | **MET** | The lava field (the restyled water ring) is a strong identity element and stays outside the playable floor. |
| 13 furniture | **MET** | The dusk front-left sun keeps the Tripo sofa panels visible (309 distinct colours). The Rodin desk is clearly readable (`R/sample-0/b-ember.png`). |
| 14–15 | **MET** | p50 17.6–17.7 including reduced; 0 frames > 50 ms. |

### Tropical and Desert regression (7581478, 9568741, 544e70d)

| Check | Result |
|---|---|
| Sand warmth restored | **Desert: yes.** Lit floor (640,650) wave 1 (255,204,102) hue 40 → (253,208,103) hue 42 on Rodin; the same on Tripo.<br>**Tropical: mostly.** Rodin (204,153,102) hue 30 → (204,161,103) hue 34 at the same saturation. Tripo (255,204,153) hue 30, sat 1.00 → (247,208,144) hue 37, sat 0.87: slightly yellower and paler, still warm peach (Info). |
| New artefacts | **None found.** No rings (ring profile), no hue flips in shade (the L1 pixel is fixed), and no stains. Tropical rocks are back in standard layouts (fair budget): `R/sample-0/b-tropical.png`. |
| Criteria 1–15 for both | **Unchanged from wave 1**, plus criterion 5 improved (M2 closed). |

## 6. Cross-biome judgement

| Item | Verdict | Evidence |
|---|---|---|
| **10: each look clearly distinct, yet one game** | **MET** | `R/sample-{0,1}/contact-six-looks.png`, the same frame in six looks.<br>**Distinct:**<br>• Tropical: turquoise sea, palms, peach sand;<br>• Desert: dusty gradient sky, cacti and sandstone, amber floor;<br>• Alpine: bright snowfield, snow-tier conifers, frozen edge;<br>• Autumn: khaki woodland floor, russet and amber canopies, toadstools, leaf litter;<br>• Ember: mauve ash, red dusk sky, lava field, black snags.<br>**Shared:** the same character, camera, faceted-rock and vertex-tone language, contact treatment and saturation ceiling.<br>**Weakest pair:** Tropical, Desert and Autumn all have warm-tan floors, so they separate mainly by sky and props. They are still clearly distinct. |
| **13: furniture recognisable in every look** | **MET, with caveat A1** | The desk and sofa silhouettes dominate every frame. Alpine's strong sun increases texture banding but keeps the most detail. Ember's dusk keeps the panels. Only Autumn-on-Tripo flattens the dark underside to black. |
| **5: with the new wall styles and courseHeight** | **MET for Tropical, Desert, Alpine and Autumn (collider-honest caveat); PARTLY for Ember** | Pose shots `R/sample-0/p-structures-*.png`, where all five are clearly coursed timber, masonry or basalt apart from Ember's tall shaded face. Stairs composite `R/sample-1/zoom-stairs-all-looks-x3.png`. `courseHeight` is unused by any biome. |
| **9: grounding** | **MET** | Contact decals under every hero; skirts (tested); litter, glow and snow patches; baked AO. |
| **14: scaffold (adding a biome = data + own builders)** | **MET** | 8383368 added three biomes with one shared schema line, three `definitions/<id>.ts`, three art files, one registry line each and mission copy. New shared capabilities (snowCap, conifer, broadleaf, atmosphere water/particle styles, crackGlow, litter patches) went in as additive, tested framework options. Compose, batch, the layer, placement and lighting needed no change. The three workers then worked in their own files only. Every guardrail and loop picked up the new ids automatically. The picker derives from `BIOME_IDS`. |

## 7. Findings (severity-ranked). No Critical, High or Medium findings; nothing blocking.

### A1: Low: the Autumn look crushes the Tripo sofa underside to a flat black cutout

**Owner:** Autumn worker (released, re-engageable): `definitions/autumn.ts` lighting and `assets/biomes/autumn.ts` `lighting`.

- **Where / evidence:**
  - `R/sample-1/b-autumn.png` and `contact-six-looks.png`;
  - `furniture-crush.txt`: in the sofa region, Tripo Autumn has **148** distinct colours vs Original 359, Tropical 403, Ember 309 and Alpine 530; reduced is the same (149).
- **Cause (likely):** the low golden sun (elevation [20, 40]) lights the sofa from behind. The Cartoon grade then crushes the dark warm-lit underside to black, the same class of problem Ember solved in 9fe23a3 with a front-left sun.
- **Effect:** the sofa is recognisable by silhouette only. Criterion 13 is met with this caveat, and the Rodin desk is unaffected.
- **Smallest repair:** a slight change to Autumn's sun azimuth, toward front-left like Ember's, or raise `ambientKeep` or the hemisphere share. Verify it with the same metric: the sofa region should reach ≥ Original's distinct colours on Tripo.

### A2: Low: Ember's tall basalt steps read as plain dark blocks in shade

**Owner:** Ember worker (released): `assets/biomes/ember.ts` wall.

- **Where:** `R/sample-0/p-structures-ember.png`: the tall step's shaded face. The low steps are fine.
- **Effect:** criterion 5 is PARTLY for Ember. The worker disclosed the same limit.
- **Smallest repair:** a stronger side ramp light end or `seam` contrast on the shaded faces, or set `courseHeight` (≈ 0.15 m) so tall steps get proportionally more courses. If `courseHeight` is used, add that style to the containment loop first (see I-2).

### A3: Low: the art triangle caps are not guarded by a test

**Owner:** lead.

- **Where:** `validate.test.ts:190–192` checks only reduced < standard. §3.5 states the layer caps (standard ≤ 110k, reduced ≤ 45k) and the addendum states per-biome caps. No test enforces either.
- **Effect:** none today; all five are within the global caps. But a new biome could declare any budget and stay green. The addendum table is stale for Autumn reduced (40k → 45k, approved in the lead's review).
- **Repair:** assert `art.budgets.triangles.standard ≤ 110_000` and `reduced ≤ 45_000` in the guardrail, and update the addendum table.

### Info

- **I-1** (lead): the surfaceBlend helper injection is installed on Original materials too. Its source and program key moved v2 → v3 (the scan floor-band branch), gated by a zero uniform. The operative guarantee is pixels, which are proven identical in-run and across builds. `styleMaterial` itself keeps Original's source and key.
- **I-2** (lead): `WallStyle.courseHeight` is unused by every shipped wall. The vertex-containment loop never runs a style with it, so add a courseHeight case to `structureShell.test.ts` CASES before any biome adopts it.
- **I-3:** Tropical lit sand on Tripo is slightly yellower and paler than wave 1 (hue 30 → 37, sat 1.00 → 0.87). Rodin is unchanged in saturation. Acceptable; noted for the user's eye.
- **I-4:** a few Alpine snow-capped boulders are near-round hulls (the gallery's centre columns). Criterion 4 still holds.
- **I-5** (UI, out of scope): the picker swatches are hard-coded hex copies of definition colours, so they can drift.
- **I-6:** `perf.mjs` measures reduced effects only for the last look (Ember here).
- **I-7:** the structure pose on Tripo sees 3/20 shell samples because the stairs sit under the sofa. The stairs composite from the gameplay frame covers it instead.
- **I-8 (delta c754d52):** the planner hint table is sound:
  - the explicit `preferredBiome` still wins;
  - a newer look needs a unique top score of ≥ 2 distinct words, otherwise the earlier Tropical/Desert rule applies, so earlier inputs keep their plans;
  - the output is always a valid `BiomeId`;
  - it is offline and deterministic.
  Word choices such as "fall", "leaf" and "fire" are only hints, and theme never affects layout.

## 8. Residuals to disclose (hands-on handoff)

1. A1: under Autumn, the dark sofa underside is a flat black silhouette on the Tripo scan.
2. A2 and criterion 5: shells keep rectangular silhouettes by design (collider-honest, ±1.2 cm). Ember's tall shaded steps are the weakest case.
3. **Worker-disclosed visual limits:**
   - Autumn: toadstools about character height; bracken can read as flames close up.
   - Alpine: snow particles vs sky; about 5% warm-grey scan areas; the strong sun bands furniture textures.
   - Ember: ember particle colour is hard-coded.
4. **Hardware:** the battery was at **8% while on AC** (BatteryStatus 2) through the whole perf run. The charger appears underpowered, as in wave 1.
5. **Carried from earlier reviews:** the M1 worst-case workload is bounded but unmeasured; the F-1 narration mismatch; the legacy Lost Colors e2e is not green. Untouched by wave 2.
6. **Feel and play** are not judged here; the user owns hands-on play.

## 9. Evidence index (`nimbalyst-local/env-upgrade/review-wave2/`)

- **Snapshot:** `head-before.txt`, `head-after.txt`, `status-after.txt`.
- **Gates:** `tsc-client.log`, `tsc-server.log`, `vitest-full.log`.
- **Delta:** `delta-head.txt`, `delta-stat.txt`, `delta-tsc-*.log`, `delta-vitest-full.log`, `delta-status-after.txt`.
- **Server:** `vite.review.mjs`, `vite.log`.
- **Shots:** `shots-daa9810/sample-{0,1}/`:
  - `a`/`b`/`d`/`f`/`g`/`i` frames, `p-structures-<look>.png` and `log.txt`;
  - `z-near-player-<look>-x4.png`, `contact-six-looks.png`;
  - `zoom-stairs-all-looks-x3.png` (sample-1).
- **Analysis:** `shots{0,1}.console.txt`, `imgdiff-original-sample{0,1}.txt`, `ring-profile.txt`, `furniture-crush.txt`.
- **Perf:** `perf-daa9810/perf-{0,1}/log.txt`, `perf{0,1}.console.txt`, `power-{before,after}-perf.txt`.


## 10. Closure check (2026-09-26, about 03:00–03:10 IST, snapshot 3c6c284)

- **Reviewer:** same session. Observed runtime model **claude-opus-5-5**. Same boundaries as the review.
- **Worktree:** a clean detached worktree at `3c6c284f136134af9d94ba428ed5f1306fbfa5b6`, with `node_modules` junctioned.
- **Cleanup:** the server (16491) was stopped, the junction removed first (main `node_modules` intact at 224/224), then the worktree and private cache removed.
- **Evidence:** everything is under `nimbalyst-local/env-upgrade/review-closure/`.

**Commits since the approval (c754d52):**

| Commit | Content | Files |
|---|---|---|
| f6b18ce | Ember A2: tall steps | `assets/biomes/ember.ts` |
| 7e9b717 | Lead: A3 caps, I-2 courseHeight cases, `particleTint`, I-6 perf tooling | `types.ts`, `validate.test.ts`, `atmosphereEffects.ts` (+ test), `decorLayer.ts`, `structureShell.test.ts` |
| 7488d5d | Autumn A1: sun direction | `definitions/autumn.ts` |
| 4cdcfcc | Ember patch Medium | `assets/biomes/ember.ts` |
| 3c6c284 | Alpine `particleTint` | `assets/biomes/alpine.ts` |

All of these stay within `src/biome`.

| Check | Result | Evidence |
|---|---|---|
| tsc client / server | exit 0 / exit 0 | `tsc-client.log`, `tsc-server.log` |
| Full suite, `--no-file-parallelism` | **112 files, 1026/1026**, exit 0. HEAD unchanged and worktree clean afterwards. | `vitest-full.log`, `head-after.txt`, `status-after.txt` |
| **A1 (Autumn Tripo sofa)** | **CLOSED.** The sun moved to front-left, `direction` [-4, 4.2, 4]. Sofa-region distinct colours on the review's metric: **148 → 423**, against Original 359 and Ember 309; reduced is also 423. Panels are visible in the frame. | `shots-3c6c284/sample-1/b-autumn.png`, `furniture-crush.txt` |
| **A2 (Ember tall steps)** | **CLOSED.** Wall strata [1,2] → [2,3], joints [12,18], seam 1, stoneSide.light #948c9e. The tall steps now show two courses with a dark seam, and column joints on every visible face. | `shots-3c6c284/sample-0/p-structures-ember.png` |
| **A3 (triangle caps untested)** | **CLOSED.** `validate.test.ts` adds a `describe.each(registeredBiomeArt())` case: art triangles ≤ the layer caps (110k/45k) and ≤ `APPROVED_TRIANGLES` per biome. All five ids are listed, and a missing id fails. | 7e9b717 diff, `vitest-full.log` |
| I-2 (courseHeight not in containment) | **CLOSED.** Two courseHeight cases (a tall step at the `MAX_COURSES` cap, and a non-uniform mirrored box) join the ±τ / top-coverage loop for all five arts. | 7e9b717 `structureShell.test.ts` |
| I-6 (perf reduced only for the last look) | **CLOSED.** `perf.mjs` now samples reduced effects for every look. | `perf-3c6c284/perf-1/log.txt` |
| **Lead's Ember patch Medium** | **CLOSED.** The support-patch tints are now #8a7c80 / #a09496 (ash drifts one step either side of the lit floor). The Tripo adventure spawn floor is clean ash with no dark stain. | `shots-3c6c284/sample-1/g-adventure-ember.png` |
| `particleTint` (new optional) | **Byte-identical when unset.** `uColor` = `tint ?? look.color(definition)`, uniform only, with no program change. The guardrail checks it for saturation, lightness and collectible hue. Alpine uses #c4d0de. | 7e9b717 diff |
| **Original identity** | **0/998,400 on both scans** after 4 cycles through Alpine, Autumn and Ember, and **0 on both adventure worlds** (Rodin 32/29, Tripo 27/32 counts before = after). This covers Alpine's skipped adventure run. Cross-build vs the wave-2 frames: **0** on both scans. | `shots-3c6c284/sample-{0,1}/log.txt`, `imgdiff-original-vs-wave2.txt` |
| Browser gates | 0 console errors, 0 blocked hosts, 0 unexpected writes; the only mock is the stub-session POST. Poses: Rodin 8/8, Tripo 19/20 visible. | same logs |
| **Perf on AC** (one sample, Tripo) | Original, Alpine, Ember and Autumn, each standard and reduced: **p50 17.6–17.7**, p95 ≤ 18.3, max ≤ 19.0, **0 frames > 50 ms**; switch 1.61 s. | `perf-3c6c284/perf-1/log.txt`, `perf1.console.txt` |
| Power | BatteryStatus **2** (AC) before and after; **charge 4%**; CPU 56% → 68%. | `power-{before,after}-perf.txt` |

**Scope of this check:**
- Tropical and Desert were not re-shot. Neither biome's files changed after the approval, and the only shared change (`particleTint`) is a no-op when unset.
- The remaining Info items (I-1, I-3, I-4, I-5, I-7) and the disclosed residuals in §8 are unchanged.

**Hardware (for the user):** the battery fell to **4% while Windows reports AC power**. The charger or cable should be checked before any long session.

**wave 2 CLOSED**: A1, A2, A3 and the Ember patch Medium are verified closed at 3c6c284, as are I-2 and I-6. Nothing blocking remains; only the disclosed residuals and the Info notes are open.