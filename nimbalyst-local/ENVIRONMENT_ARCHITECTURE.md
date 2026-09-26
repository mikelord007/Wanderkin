# Wanderkin environment architecture (v2 art-directed biome system)

- Owner: environment architecture lead, session ab224d1d. Runtime model **claude-opus-5-5**.
- Parent: orchestrator f8543364 (coordination only).
- Contract: `ENVIRONMENT_UPGRADE_REQUEST.md` (verbatim user spec). Base: `main` f3b9477.
- Status: design (B) written 2026-09-25 before any product-code edit; **Phases 1–2 landed** (6ec0947, dbf0c4f, 42ed169). §10 is the final worker contract; §12 records as-built deltas. Progress lives in `env-upgrade/lead-checkpoint.md`.

---

## 0. What exists today (inspection summary, spec "Work plan" 1–7)

| Concern | Where | Today |
|---|---|---|
| Biome selection | `useBiomeAdventure.ts` → `getBiomeDefinition(id)` (`presets.ts`) → `prepareBiomeLayout` (`placement.ts`) → `GameStage` | 3 ids (`original`, `tropical`, `desert`) from the shared schema union `SCENE_BIOME_IDS`. The look is session state and never part of the gameplay signature. |
| Config | `presets.ts` + `types.ts` `BiomeDefinition` | Flat: 6 palette colours, lighting, sky, surface tint, `props.kinds/density/scaleRange`, wind, ambient, mission copy, budget. There is no art direction, no variants and no compositions. |
| Prop construction | `render/propGeometry.ts` | **All procedural primitives**: palm = bent cylinder + 7 flattened cones; shrub = 4 icosahedra; rock = 1 jittered dodecahedron + 1 pebble; wood = boxes; cactus = capsules; dry plant = 9 cones; windsock = cylinders/torus. One variant per kind, one flat colour per part. No imported models, no textures. |
| Placement | `placement.ts` (geometry-owned, now a seam) | Independent scatter over a shuffled standable grid. The footprint reserved is `PROP_FOOTPRINT_RATIO = PROP_UNIT_RADIUS[kind] + 0.02` × height. Other constraints: support rays, tier margin, clearance box, helper boxes, capsule-axis vs every exclusion, and spacing. Reduced quality is 0.5 props / 0.6 patches; an unproven route gives 0.3 and no tall kinds. |
| Rendering | `render/decorLayer.ts` | One `InstancedMesh` per kind with a shared `MeshStandardMaterial` (flat, vertex colours, wind sway, and a dithered camera fade). The windsock is 2 meshes; patches 1, water 1, particles 1. There is a draw budget (14 standard / 11 reduced), a single-owner `dispose()` and StrictMode `retain()`. Decals and water use renderOrder 0 (below the gameplay rings). |
| Surface | `render/surfaceBlend.ts` via `SceneEntities` | A uniform-only tint on CLONED materials. Scan: localized upward patch tint. Helper floor: flat sand. Helper structures (boxes/ramps incl. `adventure-*`): flat wood tint plus the box edge lines. |
| Structures | `adventures.ts` `adventure-*` boxes, rendered by `SceneEntities.HelperMesh` | Axis-aligned boxes (stairs ≤ 0.42 m rise, bridges, stepped routes) with box colliders. **Colliders must never change.** |
| Lighting | `game/render/SceneLighting.tsx` | Style path, or the biome path (sky, fog, a clamped sun, ambient, hemisphere, a fill light). One 2048² shadow map (1024² with reduced motion). There is no post-processing stack, no SSAO and no IBL. |
| Style | `scene/styleMaterial.ts` | Cartoon posterises helper/floor materials **per channel** (5 steps) and the scan per luma band. **Biome props do NOT go through the style shader**: they are plain `MeshStandardMaterial`. |
| Scale | `characterScale.ts` | Body 0.175 m. Prop heights are the body height × biome `scaleRange` × a per-kind share, so rocks are ~0.1–0.25 m and palms ~0.4–0.56 m. The gameplay camera is close: a near prop can fill 100–200 px. |
| Perf baseline | `tmp-biome-integration/perf.mjs` (read-only) | p50 ≈ 17.7 ms (vsync-bound), 0 frames > 50 ms. Rodin counts: Original 25 geo / 29 draws, Tropical 29/33, Desert 30/32. |

Diagnosis versus the spec: the primitives read as primitives (acceptance criteria 1–5). There is exactly one mesh per kind, so repetition is 100% (criterion 6). Placement scatters props independently with no dressing (criteria 7–8). Props sit on the surface with only a 2% sink and a shadow for some kinds (criterion 9). The config cannot express art direction, so a new biome needs code (criterion 14).

---

## 1. Global art direction (every biome, every worker)

**Target:** polished stylized low/mid-poly miniature world. Shape first, colour second, and no texture detail.

### 1.1 Palette rules
- Each biome defines **tone ramps**, not single colours: `{ dark, base, light }`, plus an optional `accent` (new growth, flowers or a mineral streak) per material family. The families are: foliage, foliage-alt, trunk/wood, rock, sand/soil, dry vegetation, cactus, and the structure stone top/side/recess.
- Guardrails are enforced by a unit test over every biome:
  - every ramp's colours are ordered by luminance, dark < base < light;
  - light/dark contrast within a ramp is 0.08–0.35 in relative luminance;
  - HSL saturation is ≤ 0.78 and lightness is 0.10–0.88. That rules out neon and pure black/white, and keeps the character's saturation (orange suit, teal cap) dominant;
  - hue drift inside a ramp is ≤ 25°, so there are no rainbow ramps.
- **Tone variation is structural, not noise**:
  - light on up-facing and exposed surfaces;
  - base on the sides;
  - dark on down-facing, interior and near-ground surfaces;
  - accent only on explicit parts, never randomly.
- Per-instance variation is a small lightness/hue jitter (≤ ±5% L, ≤ ±6° H) drawn from a seeded stream.

### 1.2 Silhouette rules
- Every hero asset must be identifiable as a flat black silhouette at 120 px:
  - palm: a curved trunk plus a drooping star crown;
  - cactus: a ribbed column with asymmetric arms;
  - bush: a lumpy dome with notched edges;
  - boulder: a flat-bottomed, asymmetric wedge.
- No raw primitive may survive untouched. Cylinders are tapered, bent and segmented. Spheres become squashed, lobed and jittered masses. Boxes are bevelled and stepped. Cones are only used as sub-parts with deformation.
- Proportions are exaggerated: fat bases, thin tops and oversized crowns. Asymmetry comes from the variant, not from the instance.

### 1.3 Material response and shading
- There are two shared prop materials:
  - **faceted** (`flatShading`): rocks, stones, wood, structure shells;
  - **smooth** (vertex normals): foliage masses, trunks, cacti, fronds.
- Both are `MeshStandardMaterial`, metalness 0. Roughness is 0.9 for vegetation and 0.8 for rock. Colour comes only from vertex colours.
- **Baked vertex AO:** each builder darkens vertices by proximity to the ground (lowest 15% of height) and by concavity where cheap (the interior lobes of bushes). This costs no GPU time.

### 1.4 Edge treatment
- Rock and stone edges are faceted (flat shading shows them). Foliage uses soft lobes.
- Structure shells get a rim highlight band on the top edge, which replaces the box outline. This keeps collision edges readable.

### 1.5 Surviving Cartoon posterisation
- Props are **not** style-posterised today, and the design keeps them out of the style shader. This avoids the per-channel banding the visuals worker already hit on helpers.
- Colours are still chosen to be posterisation-safe for when a style ever wraps them:
  - lightness steps within a ramp are ≥ 0.06;
  - there is no per-vertex random noise, only gradients across whole parts.
- Structure shells use the prop materials, not the posterised helper material, so they cannot blotch.
- Cohesion with the posterised scan and floor comes from:
  - matching saturation (see the palette guardrails);
  - the same sun, hemisphere and fog as everything else;
  - never making props more saturated than the character.

---

## 2. Biome definition structure

`types.ts` (`BiomeDefinition`) is the integration-owned **gameplay/placement** boundary, and it stays unchanged. Art direction is a **renderer-side companion**, keyed by the same id, so neither geometry nor saved worlds ever see it.

```text
src/biome/presets.ts            getBiomeDefinition(id) (unchanged API); Original inline
src/biome/definitions/<id>.ts   BiomeDefinition per themed biome (one owner per file)
src/biome/assets/               ── framework (lead-owned) ──
  types.ts                      BiomeArt, ToneRamp, AssetFamily, CompositionPreset, WallStyle, GroundStyle, budgets
  meshKit.ts                    CPU mesh kit: parts, deform, bend, taper, lobes, vertex tone/AO, sway weights, UnitMesh
  builders/                     shared parametric builders (rocks, foliage masses, trunks, fronds/leaves, cacti, grass/dry plants, pebbles, debris, markers)
  compose.ts                    placement → cluster members (deterministic, footprint-fitted)
  batch.ts                      members → merged bucket geometries (faceted | smooth)
  structureShell.ts             box collider → stylised visual shell (walls/steps/cliffs)
  validate.ts                   art guardrails (palette, variant minimums, budgets) used by tests
  biomes/tropical.ts            Tropical BiomeArt   (Tropical worker)
  biomes/desert.ts              Desert BiomeArt     (Desert worker)
  biomes/index.ts               getBiomeArt(id) registry (lead; one line per biome); legacy.ts = v1 props as art
  tropical/…, desert/…          biome-specific builders (owned by each biome worker)
```

### 2.1 `BiomeArt` (renderer-only)

```ts
interface BiomeArt {
  id: BiomeId;
  tones: {                       // §1.1 ramps
    foliage: ToneRamp; foliageAlt: ToneRamp; trunk: ToneRamp; rock: ToneRamp;
    soil: ToneRamp; dry: ToneRamp; cactus: ToneRamp; accent: ToneRamp;
    stoneTop: ToneRamp; stoneSide: ToneRamp; stoneRecess: ToneRamp;
  };
  families: Record<string, AssetFamily>;       // "palm", "bush-round", "rock-large", "pebble", "tuft", ...
  compositions: Partial<Record<BiomePropKind, WeightedPreset[]>>; // placement kind → cluster presets
  wall: WallStyle;               // structure-shell rules (strata, bevel, erosion, tones)
  ground: GroundStyle;           // contact decal colour/opacity/size, base darkening
  variation: { toneJitter: number; hueJitterDeg: number; leanMaxRad: number; mirror: boolean };
  budgets: { triangles: { standard: number; reduced: number }; membersPerCluster: { standard: number; reduced: number } };
  lighting?: LightingAdjust;     // Phase 6: AO strength, contact opacity, sun warmth nudges
}

interface AssetFamily {
  role: "hero" | "supporting" | "micro";
  shading: "faceted" | "smooth";
  sway: boolean;                 // bakes aSway weights (0 at root)
  castShadow: boolean;           // micro never casts
  unitRadius: number;            // horizontal extent per unit height, tested
  variants: readonly VariantBuilder[];         // ≥ spec minimum for the category
  weights?: readonly number[];   // rarity per variant
  triangleBudget: number;        // per variant, tested
}
type VariantBuilder = (tones: BiomeArt["tones"]) => UnitMesh; // unit height 1, base y = 0, deterministic
```

**Mapping the spec's conceptual biome structure:**

| Spec term | Where it lives |
|---|---|
| palette | `tones`, plus `BiomeDefinition.palette` for legacy/UI |
| heroProps / supportingProps / microDressing | `families[*].role` |
| rockSet / vegetationSet | families by name |
| wallSet | `wall` |
| clusterPresets | `compositions` |
| densityRules | `BiomeDefinition.props.density` and `budget` (geometry side) |
| scaleRules | `scaleRange` (geometry side) and each preset member's `scale` (renderer side) |
| spacingRules | preset `ring`/`spacing`, plus geometry spacing |
| materialRules | `family.shading`, tones, `ground` |
| rarity weights | preset and variant weights |
| lighting adjustments | `BiomeDefinition.lighting` and `art.lighting` |

**Adding a future biome (snow, forest, …):**
1. Add the id to the shared union. This is integration's schema change, one line.
2. Add a `BiomeDefinition` in `presets.ts`.
3. Add `assets/biomes/<id>.ts` and optional `assets/<id>/` builders.
4. Register it in `biomes/index.ts`.

No change to compose, batch, the layer, placement or lighting code. The guardrail test automatically applies to the new biome.

---

## 3. Asset system

### 3.1 Procedural mesh kit (default; no imported models in v2)
- The builders are parametric functions over a small CPU kit (`meshKit.ts`):
  - `lathe`/`tube` along a curved spine with taper and ring segmentation (trunks, cactus columns and arms, stems);
  - `lobe` (a squashed, jittered icosphere with a detail-1 budget) for foliage masses and succulent pads;
  - `blade` (a curved, tapered ribbon with droop, optionally leafletted) for palm fronds, broad leaves, grass and dry blades;
  - `rockHull` (convex jittered hull, flattened base, planar slice cuts) for all rock families;
  - `ribs` (a vertex-level radial modulation on lathe rings) for cacti and palm trunk segmentation.
- Every builder returns a `UnitMesh`: indexed positions, normals, colours, sway weights and triangle count. It is exactly 1 unit tall, with its base at y = 0 (rocks sink ≤ 0.08) and a horizontal extent ≤ `family.unitRadius`, all asserted by tests.
- Variants are **distinct designs** (a different spine curve, lobe count or arm layout), not just seeds. Per-instance variation is applied later by the composer.
- **Template cache:** UnitMeshes are CPU-only typed arrays, cached per `(art id, family, variant)` at module level. They are never uploaded to the GPU, so a look switch rebuilds no templates.

### 3.2 Minimum variants (spec §Repetition, tested per biome)

| Category | Minimum |
|---|---|
| Trees/palms | 4 |
| Bushes | 5 |
| Rocks | 8, across the families tiny stone / pebble / medium / clustered / large boulder |
| Cacti | 5 (Desert) |
| Dry plants/tufts | 3 |
| Micro dressing | 3 per biome |
| Wall shells | 3 modular strata/erosion patterns per `WallStyle` |

### 3.3 Per-instance variation (seeded)
- Source: `seededRandom(`${layout.seed}:${placement.id}`)`, so it is stable regardless of budget drops or order.
- Variant choice uses a per-(kind, family) shuffle bag, so equal variants spread out and never repeat back to back.
- Varied per instance:
  - yaw (the placement's own for the hero, random for members);
  - scale (the preset range);
  - lean (≤ `leanMaxRad`, trees/cacti only);
  - mirror X where the family allows it;
  - vertical offset (embed 1–4% of height);
  - tone jitter.

### 3.4 Instancing and material strategy (draw calls independent of variant count)
- Variants × kinds would multiply `InstancedMesh` draws: 5 palms + 6 bushes + 8 rocks is already more than 14. So v2 **bakes every drawn member into merged static bucket geometries**:
  - one `faceted` bucket and one `smooth` bucket;
  - indexed, with world-space positions;
  - per-vertex `aPivot` (member base xyz + height) for wind and the camera fade.
- Props are static apart from shader sway, so nothing needs a per-frame CPU update.
- Cost: 2 main-pass draws for **all** props (was up to 6) plus 2 shadow draws. Build time is linear in vertices (target < 15 ms at the standard budget).
- The prop shader moves from `instanceMatrix` to `aPivot`: sway is world-space along the downwind vector scaled by member height, and the camera fade uses the pivot plus height. The same `WindUniforms` are used, so the windsock, dust and foliage still agree.
- **Budget accounting:** stats keep `propInstances`/`propsByKind` (placements drawn), and add `members`, `triangles` and `buckets`.

### 3.5 Polygon budgets (triangles per variant; tested)

| Asset | Triangles |
|---|---|
| Hero tree/palm | ≤ 900 |
| Bush | ≤ 450 |
| Cactus | ≤ 600 |
| Large rock | ≤ 180 |
| Medium rock | ≤ 100 |
| Pebble/tiny stone | ≤ 40 |
| Tuft / dry plant | ≤ 160 |
| Micro debris | ≤ 60 |
| Marker | ≤ 200 |
| Structure shell | ≤ 1,200 per box |

Per-layer caps: standard ≤ 110k triangles, reduced ≤ 45k. The composer drops micro members first, then supporting members, before it ever drops a hero.

### 3.6 Offline GLB policy
- None in v2.
- If a worker needs GLB, it must come from our own script under `scripts/assets/` that emits self-hosted files into `public/assets/biomes/`. The script, licence (project-owned, CC0-equivalent) and generation command are documented next to it. Every GLB must pass the same UnitMesh checks: height, radius, triangle count and tone ramps.
- No third-party packs and no new npm dependencies without an orchestrator report first.

---

## 4. Composition system

### 4.1 Phase 1–2: a cluster lives inside ONE reserved footprint
- Geometry already reserves a cylinder of radius `r = placement.radius` (≥ `PROP_UNIT_RADIUS[kind] × h + 0.02 h`, clamped by `selection.ts`) and height `h`. It is clear of the scan, on one tier, supported, outside every exclusion, and spaced from other props.
- The renderer expands each placement into a **composition**: 1 primary + 0–N secondary + 0–M micro members, all laid out in the placement's local disc:
  - **Primary:** at the centre, or offset ≤ 0.15 r for asymmetric groves. Its height is the drawn height `h`.
  - **Secondary:** 1–3 members on a ring of 0.35–0.8 r, each 0.2–0.55 h tall.
  - **Micro:** 2–6 members on a ring of 0.25–0.95 r, each 0.04–0.18 h tall, never casting.
- **Fit guarantee:**
  - after composing, the composer measures the true transformed horizontal extent **E** and the top **T** of every member vertex;
  - it applies one uniform scale `s = min(1, r_draw / E, h / T)` about the base point;
  - `r_draw = min(placement.radius, h × PROP_UNIT_RADIUS[kind])` from selection's clamp.
  - So nothing can ever leave the approved cylinder, including leans, mirrors and fronds. This is tested exhaustively over all variants × presets × 200 seeds.
- **Presets per kind** (examples; the biome workers tune them):

| Kind | Tropical presets | Desert presets |
|---|---|---|
| palm | palm oasis (palm + 1–2 bushes + stones + fallen frond + tuft) | — |
| shrub | bush patch (2–3 lobed bushes + flowers or broad leaf) | — |
| rock | rock cluster (large + 2–5 stones + tuft) | layered sandstone cluster (large + 2–4 pebbles + scrub) |
| cactus | — | cactus group (column/branching + short cactus + pebbles + dry grass) |
| dry-plant | — | sparse scrub (2–3 dry plants + pebbles) |
| wood | driftwood/sign marker + stones | post/sign + dry branch |

- Members never exceed the primary's height, so the clearance box `[y + skin, y + h]` holds. Members may sink below y (embedding) but never float: every member's base y is 0 on the placement plane, and rock-like members sink 2–4%.

### 4.2 Phase 5: composition-aware placement (placement.ts seam; lead-owned, invariants tested)
The candidate **ordering** moves from uniform shuffle to cluster-seeded:
1. Pick K cluster centres by seeded Poisson-disc over standable cells, with biome spacing: Tropical `0.9 m`, Desert `1.4 m`, which gives open space.
2. Order candidates by distance to their nearest centre, with a seeded falloff; tall kinds go nearest the centre.
3. Leave a Desert "negative space" quota: centres are rejected where local density exceeds `density × 1.3`.

`testAnchor` (support, tier, clearance, helpers, exclusions, spacing) is **unchanged**, so every guarantee in the Phase 1 table (`BIOME_INDEPENDENT_REVIEW.md`) still holds. Only which safe spots are tried first changes.

New tests:
- determinism for a seed;
- cluster statistics: mean nearest-neighbour distance is lower than the uniform baseline, and empty-area coverage is higher on Desert;
- every existing placement test still passes;
- `PROP_FOOTPRINT_RATIO` is unchanged.

**`PROP_UNIT_RADIUS` stays frozen** at palm .62, shrub .8, rock .9, wood .36, cactus .34, dry-plant .68, windsock .62. If a family ever needs more room, the change goes to `PROP_UNIT_RADIUS` only, which lets geometry reserve *more*. That is the safe direction. It is announced here, with the reason, in the same commit as the placement test update. It is never done by exceeding the value in the renderer.

---

## 5. Walls, cliffs and structure shells

- Scope: every non-floor **box** helper when a themed look is active:
  - generated `adventure-*` stairs, bridges and stepped routes;
  - authored sample steps.
- Ramps keep the tinted triangle mesh, and the floor is unchanged. Original is unchanged: it uses the existing box, material and edge path.
- The collider is untouched. The shell is **visual only** and never raycast. It is built in the entity's local box space by `structureShell.ts` from `dimensions` and the `WallStyle`:
  - **Top:** a flat, walkable face at exactly the collider's top, covering the full top rectangle. A rim bevel goes *outward and down* within the tolerance **τ**, so the walkable top is never visually reduced. A light top tone plus a rim highlight band marks the collision edge.
  - **Sides:** 2–5 horizontal strata (Desert sandstone). Each stratum is inset or outset by ≤ τ, with rounded wind-worn corners, 0–2 shallow erosion notches (inward ≤ τ) and fractured ledge lips (outward ≤ τ). Tropical uses fewer, rounder "coral stone/timber-bound" layers, as chosen by the Tropical worker's `WallStyle`.
  - **Base:** a slight outward flare ≤ τ, embedded 1–2 cm below the bottom. It gets darker base tones and a contact decal instance.
  - Stylised cracks are vertex-colour recess lines, not geometry.
- τ = min(0.012 m, 4% of the smaller horizontal side), converted per axis through the entity scale. The test checks every shell vertex against `box ± τ` horizontally, and against `top exactly` and `bottom − 0.02` vertically. The top face's rectangle must be ⊇ the collider top.
- **Mount:** `SceneEntities.HelperMesh` swaps its box mesh for the shell mesh when `biomeSurface?.structureShell` is present. Edge lines are dropped for shelled boxes; the rim band replaces them. It is one small conditional, keyed on the existing memoized `biomeSurface`, so it causes no GameStage change and no recompile on switch beyond building the shell geometry. Shell geometry is owned and disposed by `HelperMesh`, the same path as the box geometry.
  - **Scope ask:** this touches `SceneEntities.tsx` in Phase 2, not Phase 6. I am asking the orchestrator to confirm.

---

## 6. Grounding

This combines three things:
1. **Contact decals:** one `InstancedMesh` of soft radial darkening discs under every hero and every structure shell. It uses multiply-like alpha, renderOrder 0, `depthWrite` false and polygonOffset, like the patches, so it never covers gameplay rings. It is one draw, sized to `0.7–1.0 r`, with its tone from `GroundStyle`.
2. **Ground patches:** clusters add a subtle soil/sand wobble-patch via the same decal instancing, as a colour variant of the contact disc.
3. **Baked vertex AO** on the lowest 15% of each member, **embedding** of 1–4% of height, and **base dressing** (stones and tufts from the composition).

There is no hovering: the base is on the ray-hit support point from geometry, and members only ever go down.

---

## 7. Lighting and AO plan (Phase 6, after 1–2)

These are cheap wins only:
- baked vertex AO (free);
- contact decals (1 draw);
- per-biome `art.lighting` nudges: sun warmth, hemisphere ground bounce and shadow darkness via ambient/hemisphere balance (uniform-only);
- `shadow.radius` and `normalBias` tuned for the prop scale;
- `receiveShadow` on props.

SSAO/GTAO would need a post-processing stack or a new dependency (N8AO/postprocessing). That is **not proposed**: the cost is a full-screen pass every frame plus a new dependency. It will be reported with a measurement if Phase 6 shots show that contact still reads weak. Original stays byte-identical because the lighting only changes when `biome` is non-null.

---

## 8. Budgets

Budgets per biome (standard / reduced):

| Item | Tropical | Desert |
|---|---|---|
| Placements (`budget.props`, geometry) | 140 / 70 | 110 / 55 |
| Members per cluster cap | 10 / 5 | 8 / 4 |
| Prop triangles | ≤ 110k / 45k | ≤ 80k / 35k |
| Layer draw calls (main pass) | ≤ 9 / 7, cap 14 / 11 | ≤ 9 / 7, cap 14 / 11 |
| Shadow casters | 2 buckets + windsock / 0 | same |
| Particles | 90 / 31 | 260 / 91 |

Draw-call plan (main pass):

| Item | Draws |
|---|---|
| Faceted bucket | 1 |
| Smooth bucket | 1 |
| Windsock | 2 |
| Contact decals | 1 |
| Patches | 1 |
| Water | 1 |
| Particles | 1 |
| **Total** | **≤ 8** |

Structure shells replace the box meshes one for one, so they add 0 draws, and drop the edge lines, which is −1 draw per box.

Reduced effects:
- micro members are dropped first;
- members per cluster are capped;
- props do not cast shadows;
- particles are at 0.35.

**Perf gate per milestone:** real Chrome, the same perf script copy, p50 within +1 ms of the 17.7 ms baseline, and 0 frames > 50 ms. Renderer counts after 4 switch cycles must not grow, and Original must be pixel-identical after cycling.

---

## 9. Gameplay readability rules

- Everything drawn stays inside a geometry-approved footprint, so the route, spawn, objectives and structures stay clear by construction.
- Micro dressing is ≤ 0.18 h tall and ≤ 0.35 of the character height in world terms, so it never hides a collectible.
- Contact decals and patches use renderOrder 0 and alpha ≤ 0.45.
- Heroes keep the dithered camera fade near the camera.
- Clusters must leave open ground between them (Phase 5 spacing).
- Colour: dressing never uses the collectible accent hue, and must be ≥ 30° hue away from `mission.collectibleColor` (tested).
- Structure shells mark the collision rim with the light top band.

---

## 10. Framework contract for the parallel biome workers (FINAL: commits 6ec0947 + dbf0c4f + 42ed169)

### Files each worker owns (whole files only; nobody shares a file)

**Tropical worker**
- Owns `src/biome/definitions/tropical.ts`: the `BiomeDefinition` (palette, lighting, sky, surface, `props.kinds`/`density`/`scaleRange`, wind, ambient, mission copy, budget within the caps).
- Owns `src/biome/assets/biomes/tropical.ts`: `TROPICAL_ART` (tones, families, compositions, wall, ground, variation, budgets).
- May add `src/biome/assets/tropical/**`: biome-specific builders and their tests.

**Desert worker**
- Owns `src/biome/definitions/desert.ts`.
- Owns `src/biome/assets/biomes/desert.ts` (`DESERT_ART`).
- May add `src/biome/assets/desert/**`.

**Lead** owns everything else:
- the rest of `src/biome/assets/**`: types, meshKit, shapes, compose, batch, `builders/**`, `biomes/index.ts`, `biomes/legacy.ts` and the framework tests;
- `src/biome/render/**`;
- `src/biome/presets.ts`;
- the `placement.ts` seam;
- `SceneEntities` / `SceneLighting` (Phase 6).

### Exports to build against (read-only for workers)

- **`assets/types.ts`:**
  - `BiomeArt`;
  - `AssetFamily`: role, **category**, shading, castShadow, unitRadius, triangleBudget and variants, plus optional weights, leanMax, mirror, embed and alignToNormal;
  - `AssetCategory`, `AssetRole`, `AssetShading`;
  - `BiomeTones`, `CoreToneName`, `ToneRamp`;
  - `CompositionPreset`, `CompositionMember`, `WeightedPreset`;
  - `WallStyle`, `GroundStyle`, `UnitMesh`, `VariantBuilder`.
- **`assets/meshKit.ts`:**
  - `MeshKit`, with `add(geometry, { color, sway?, smooth?, doubleSided? })` and `finish({ fit?: "height" | "size", sink?, groundAo? })`;
  - `rampTone`, `rampAt`, `linearRamp`, `unitMeshFromGeometry`.
- **`assets/shapes.ts`:**
  - `tube`: curved spine, taper and ribs, dome/point/open cap;
  - `lobe`;
  - `hull`: planar cuts and a flat base;
  - `blade`: fold, droop, serrate, sweep;
  - `place`, `hash01`, `builderRandom`.
- **`assets/builders/*`** (shared, parametric):
  - rocks: `rock`, `ROCK_SHAPES`, `defaultRockVariants`;
  - foliage: `bush`, `leafRosette`, `tuft`, `flowers`;
  - trees and debris: `palm`, `broadleafTree`, `fallenFrond`, `lyingLog`;
  - cacti: `cactus`, `cactusCluster`, `barrelCactus`, `padCactus`;
  - dry plants and markers: `scrub`, `signpost`, `post`.

### Rules

These are enforced by `assets/validate.test.ts`, `compose.test.ts`, `presets.test.ts` and `render/structureShell.test.ts`, which must all stay green.

1. **Fit.** Hero families use `fit: "height"`, so each is exactly one unit tall. Dressing that is wider than tall (pebbles, slabs, rosettes, logs, fronds) uses `fit: "size"`, and its preset `height` range then means size.
2. **Radius.**
   - `unitRadius` must be at least every variant's measured radius.
   - A preset's primary family must have `unitRadius` ≤ `PROP_UNIT_RADIUS[kind]` × 1.1 (palm .62, shrub .8, rock .9, wood .36, cactus .34, dry-plant .68).
   - The composer clamps members to the footprint, and a measured fit shrinks anything left over. So safety never depends on this rule, but visuals do.
3. **Triangles and members.**
   - Each family's per-variant `triangleBudget` is honoured.
   - Art `budgets.triangles` stays ≤ 110k standard / 45k reduced (Tropical) and ≤ 80k / 35k (Desert).
   - `membersPerCluster.reduced` < standard.
   - Micro families never cast shadows.
4. **Tone ramps.**
   - Luminance is ordered dark < base < light.
   - Saturation ≤ 0.78; lightness 0.10–0.88.
   - Hue drift ≤ 40° within a ramp.
   - The accent hue is ≥ 30° from `mission.collectibleColor`.
   - Tone is structural only; no per-vertex noise.
5. **Variant minimums** per category present in the biome: tree 4, bush 5, rock 8, cactus 5. Tropical must have tree, bush and rock; Desert must have cactus, rock and bush.
6. **Compositions.** Every kind in `definition.props.kinds` (except windsock) has at least one composition, and compositions reference only existing families.
7. **Definitions.** `budget` stays within the caps (draw calls ≤ 14, props ≤ 160, patches ≤ 24, particles ≤ 300). `props.kinds` uses only existing `BiomePropKind`s.

### Lighting knobs (commit f506409): tune them in your OWN files

- **In `definitions/<id>.ts`:**
  - `lighting`: sun colour (warmth), `direction` (sun azimuth and raw elevation), `intensity`, `ambient`, sky and ground colours;
  - `sky`: zenith and horizon colours, `fogNear` / `fogFar`.
- **In `assets/biomes/<id>.ts`,** an optional `lighting: LightingAdjust`:
  - `ambientKeep` 0.3–1 (default 0.62);
  - `hemisphereShare` 0–1 (default 0.45);
  - `sunElevation` [min, max]°, within 15–65 (default [24, 52]);
  - `fogScale` 0.6–1.6 (default 1);
  - `contactStrength` 0–1.5 (default 1).
  Values are clamped at runtime, and `validate.test.ts` fails on out-of-range values.
- **Ground contact:** `ground.contactOpacity` / `contactScale` / `patchColor`.
- **Baked AO:** the `groundAo` option on your builders' `finish()`.
- `SceneLighting.tsx` is lead-owned. Don't edit it: all per-biome tuning goes through the knobs above.

### Must NOT change

- The framework and render files listed above.
- `PROP_UNIT_RADIUS` (in `render/propGeometry.ts`).
- `types.ts` / `BiomePropKind`.
- `placement.ts`, `geometry.ts`, `adventures.ts`, `workBudget.ts`.
- `src/game/**`, `src/ui/**`, `src/game/hud/**`, `shared/**`, server, storage.
- `package.json`: no new dependencies.
- Another worker's files.

If you need a framework change or a new shared builder, ask the lead, or specialise a copy inside your own `assets/<id>/`.

### Verification each worker runs

Use your own port and your own shots folder, with zero live writes.

- **Type check and tests:**
  - `npx tsc --noEmit -p tsconfig.json`
  - `npx vitest run src/biome --no-file-parallelism`. Parallel runs can flake the 2 s wall-clock adventure budget under CPU load; that is not caused by art.
- **Harness** (lead-owned; run it read-only):
  - Start or restart the server with `OQ_ENV_PORT=<port> bash nimbalyst-local/env-upgrade/harness/restart.sh`, using port 16431 for Tropical and 16441 for Desert. The watcher is off, so restart after every edit.
  - **Gallery:** `.../harness/gallery.html?biome=<id>&view=grid|clusters|shells[&rows=a,b]`, shot with `node gallery-shoot.mjs <name>` (set its port via the env variable).
  - **In game:** `OQ_ENV_PORT=<port> node shots.mjs <0|1> <id>-<milestone> --adventure`, which writes to `nimbalyst-local/env-upgrade/shots/<id>-<milestone>/`.
  - **Frame time:** `perf.mjs <sample> <name>`.
- **Gates:**
  - 0 console errors and 0 writes;
  - Original pixel identity with 0 differing pixels;
  - counts flat over the switch cycles;
  - p50 ≤ baseline + 1 ms, and 0 frames over 50 ms.
- **Commit** through `developer_git_commit_proposal`, with your own paths only.

### Wave 2 addendum: Alpine, Autumn and Ember workers (scaffold commit 8383368)

Everything above still applies. This addendum adds three owners, the new shared capabilities, and per-biome budgets.

**Ownership and ports** (whole files; nobody shares a file):

| Worker | Owns | May add | Port | Shots folder |
|---|---|---|---|---|
| Alpine | `definitions/alpine.ts`, `assets/biomes/alpine.ts` (`ALPINE_ART`) | `assets/alpine/**` | 16461 | `shots/alpine-<milestone>/` |
| Autumn | `definitions/autumn.ts`, `assets/biomes/autumn.ts` (`AUTUMN_ART`) | `assets/autumn/**` | 16471 | `shots/autumn-<milestone>/` |
| Ember | `definitions/ember.ts`, `assets/biomes/ember.ts` (`EMBER_ART`) | `assets/ember/**` | 16481 | `shots/ember-<milestone>/` |

Tropical (16431) and Desert (16441) are unchanged. The lead still owns every other file, including `missionCopy.ts` DESTINATIONS for your id: ask if you want different gate or beacon words.

**New shared exports** (read-only for workers):

- `assets/meshKit.ts`:
  - `snowCap(mesh, { color, threshold, heightBias?, strength? })` recolours upward faces only (normal.y > threshold, lowered toward the top by `heightBias`). Geometry, radius and triangles are unchanged.
  - `withSnowCap(builder, options)` wraps any `VariantBuilder`.
  - `SnowCapOptions`.
- `assets/builders/trees.ts`:
  - `conifer({ tiers 3–6, width, droop, trunk, seed, points? })`: layered, serrated, drooping, faceted tiers (snow-cap friendly); about 100–240 triangles.
  - `defaultConiferVariants()`: 5 variants.
  - `defaultBroadleafVariants(crowns?)`: 5 canopies (round, oval, spreading, young, leaning); `crowns` cycles tone-name pairs, e.g. `[["crimson","foliage"]]`.
  - `broadleafTree` takes a new optional `crown: [toneA, toneB]`.
- `assets/types.ts` additions:
  - `BiomeArt.atmosphere?: { water?: "liquid" | "frozen" | "lava"; particles?: "snow" | "embers" }` restyles the existing water ring or particle draw and never adds one:
    - **frozen:** flat, pale and still; it has no clock uniform. Colour = `palette.water` lerped 35% toward white.
    - **lava:** a dark crust (7% of `palette.water`) with glowing, slowly drifting seams, emissive and frozen under reduced motion.
    - **snow:** falls, with normal blending.
    - **embers:** rise, with additive blending.
    - **`particleTint?: string`** (framework follow-up) replaces the particle colour of whichever look draws (snow #fbfdff, embers #ff8a3a, dust = `palette.sand`, motes #fff6d8). Unset keeps that colour, so no shipped biome changes. It follows the tone rules: saturation ≤ 0.78, lightness 0.10–0.88, and ≥ 30° from the collectible hue when saturation > 0.15. It needs `ambient.effect` ≠ `"none"`. Near-whites fail the saturation rule (#fbfdff reads as s = 1.0 in HSL), so pick a visibly tinted colour.
  - `GroundStyle.crackGlow?: string` makes the cracked soil patches' lines glow (the same single contact draw). It needs `cracks` > 0.
  - `GroundStyle.patches?: { tints: {color, weight}[]; litter?: string[1–3] }` sets the support-patch tints. With `litter`, patches are strewn with leaf flecks in those colours (the same single draw). Unset keeps the framework default.

**Rules added** (enforced by `validate.test.ts`, `presets.test.ts`, `capabilities.test.ts` and `render/atmosphereStyles.test.ts`):

- **Required categories:** Alpine has tree, bush and rock; Autumn has tree, bush and rock; Ember has rock and bush.
- **Styles only restyle what the definition enables.** A non-liquid `atmosphere.water` needs `ambient.water: true`; `atmosphere.particles` needs `ambient.effect` ≠ `"none"`.
- **Collectible hue separation.**
  - `crackGlow` hue is ≥ 30° from `collectibleColor`.
  - Saturated litter colours are ≥ 30° from it.
  - Patch tints have saturation ≤ 0.78 and weights > 0.
- **Registration.** Every themed id in `BIOME_IDS` has registered art, and `BIOME_IDS` equals the shared `SCENE_BIOME_IDS`.
- **Triangle caps** (framework follow-up). `validate.test.ts` asserts art `budgets.triangles` ≤ the §3.5 layer caps (110k / 45k) and ≤ each biome's approved ceiling in the table below (`APPROVED_TRIANGLES`). Raising a ceiling is a review decision: update the table and the test together.
- **Course-height walls.** The shell containment loop (`structureShell.test.ts` CASES) runs every art's wall with `courseHeight` 0.15 on a 2.1-tall step (capped at `MAX_COURSES`) and 0.12 on a stretched, mirrored box, so a biome can adopt `courseHeight` without new shell tests.
- **Existing loops.** The existing per-look test loops (decor layer, contact footprint, shells, real-scan placement safety, gameplay-data invariance, mission copy, theme-independent layout) now cover all five themed looks.

**Budgets:**

| Biome | Definition budget (props / patches / particles / draws) | Art triangles (standard / reduced) | Members per cluster (standard / reduced) |
|---|---|---|---|
| Alpine | 110 / 22 / 220 / 14 | ≤ 80k / 35k | 5 / 3 |
| Autumn | 100 / 22 / 120 / 14 | ≤ 90k / 45k | 6 / 3 |
| Ember | 105 / 22 / 220 / 14 | ≤ 75k / 32k | 5 / 3 |

The §8 caps are unchanged: draws ≤ 14, props ≤ 160, patches ≤ 24, particles ≤ 300. The perf gate is also unchanged: p50 ≤ Original + 1 ms and 0 frames over 50 ms, on both scans.

**Harness** (lead-owned; run it read-only):

- Pass `OQ_LOOKS=<id>` to `shots.mjs` and `perf.mjs`; the default is `tropical,desert`. `perf.mjs` samples every look in standard, then every look again with reduced effects (`<id>-reduced`), then turns reduced off for `original-again`.
- The Look picker is UI-owned and lists only Original, Tropical and Desert, so for other looks the harness calls the picker's `onBiomeChange` prop directly (the same path a click takes).
- Example: `OQ_ENV_PORT=16461 OQ_LOOKS=alpine node shots.mjs 0 alpine-m1 --adventure`.
- `scratch/w2-placement.ts <ids> ["lo/hi/density;…"]` prints real-scan placements per kind for standard and reduced. Use it before changing `density` or `scaleRange`.

**Baseline notes (starting points, not limits):**

- **Floor colour.**
  - Helper floors take `palette.sand` at 92% strength; photo textures take `surface.color` at `surface.blend` (≤ 0.6).
  - The global Cartoon grade strongly saturates warm-lit colours. A dark `sand` under a warm sun posterises shadowed floor to pure black: Ember's first baseline did this, so its `sand` is now a cool mid grey (#6c6a74) that grades to dark volcanic red-brown.
  - Check both scans after any floor change.
- **Placement starvation:** fixed in **435eac1**. Kinds get fair attempt shares, tall kinds go first and the rest take turns. The notes below are historical:
  - `placeProps` shares one test budget across the plan, and big kinds are planned first.
  - A tall-kind-heavy look with a large `scaleRange` can starve its rocks in standard mode, ending with fewer props than reduced.
  - Keep `scaleRange` ≤ about 2.4 for tree-led looks, and confirm with `w2-placement.ts` that standard > reduced and rocks are present. Alpine ships at [0.7, 2.4] with density 0.5.
- **Adventure planner.** The AI adventure planner's prompt lists every schema id, so it can now choose Alpine, Autumn or Ember. The word-heuristic fallback still picks only Tropical or Desert.
- **Look picker.** The picker cannot show six options without a UI change: `THEME_OPTIONS` plus the `--three` grid in `src/ui/components/AdventureControls.tsx`, UI-owned.

**Polish 240ef7b (after the scaffold), for every biome:**

- **Wall seams and joints:**
  - `WallStyle.joints?: [lo, hi]` gives staggered thin vertical joints per stratum (default [2, 4]).
  - `WallStyle.seam?: 0–1` sets the darkness of the seam at the foot of each stratum and of the joints (default 0.7).
  - Current settings: Tropical timber [6, 9] / 0.8, Desert [1, 3] / 0.6, Autumn [3, 5], Ember [5, 8] / 0.8, Alpine at the defaults.
- **Structure skirts:** `placeProps` first tries rock clusters at the foot of generated structures (at most 2 each and 15% of the budget; its own stream). Every anchor still passes `testAnchor`, so a biome needs the `rock` kind for skirts.
- **Scan floor band:** up-facing scan texels within 4.5 cm of the floor top take the helper floor tint (`palette.sand` at 92%), which is now part of your floor colour.
- **Contact cap:** contact opacity × `contactStrength` must be ≤ 0.45; `validate.test.ts` checks it.
- **Harness:** the harness pre-seeds the dev stub sign-in (one localStorage key in a fresh context) and mocks the level API in memory, so generated adventures work since 217fd86. `shots.mjs --adventure` also writes `p-structures-<look>.png`, a camera pose that frames the structure shells.

**Must NOT change:** everything in the list above; the new framework code (the snow cap, conifer and broadleaf builders, atmosphere styles, crack glow and litter); `shared/**`; and other workers' biomes.

## 11. Phase plan (lead)

| Phase | Deliverable | Commit |
|---|---|---|
| 1 | Framework: types, mesh kit, composer, batcher, merged-bucket layer and shader. The existing biomes run through it with their legacy builders wrapped as 1-variant families, so there is no visual regression. Tests: determinism, containment, dispose/no-leak, budget caps | "biome: art-direction framework" |
| 2 | Shared builders (rocks ×5 families, lobed bushes, tapered/segmented trunks, fronds/leaves, cactus families, tufts/dry plants, pebbles/debris, markers), baseline Tropical/Desert art using them, structure shells, contact decals, tonal/AO | "biome: shared asset system" |
| hand-off | Report exact files/exports to the orchestrator; biome workers start | — |
| 5 | Cluster-seeded placement ordering + tests | "biome: composition placement" |
| 6 | Lighting/AO/contact polish in `SceneLighting`/`SceneEntities` | "biome: lighting and contact" |

Every milestone passes: tsc, focused vitest, real-Chrome gameplay-camera shots (both scans × 3 looks × standard/reduced) under `env-upgrade/shots/<milestone>/`, the perf check, switch-cycle counts and Original pixel identity.

---

## 12. As built (Phases 1–2): deltas from the design above

### Rendering
- Props use up to 4 buckets: faceted/smooth × cast/no-cast.
- The layer's main-pass plan is ≤ 10 draws: props ≤ 4, contact 1, windsock 2, patches 1, water 1, particles 1.

Measured draws on the real scans:

| Biome | Standard | Reduced |
|---|---|---|
| Tropical | 8 / 14 | 6 / 11 |
| Desert | 9 / 14 | 7 / 11 |

### Measured prop triangles

| Scan and biome | Standard | Reduced |
|---|---|---|
| Rodin, Tropical | 92.6k | 41.0k |
| Tripo, Tropical | 97.4k | 42.9k |
| Rodin, Desert | 40.5k | 21.7k |
| Tripo, Desert | 43.9k | 24.1k |

Reduced effects draw fewer clusters *and* far fewer members. For Rodin Tropical that is 70 clusters instead of 104, and 109 members instead of 488.

Building the layer takes 14–85 ms, after a one-time template build of about 0.2 s per biome (the template cache is CPU-only).

### Composer
- A member's ring distance plus its own extent is clamped to the footprint. A member that doesn't fit is shrunk by up to 50%, or skipped.
- The primary's offset is limited by its own extent.
- Each member draws from its own random stream, so dropping one member never changes another.
- Variant bags are consumed in layout order, so a budget cut only ever removes the tail.

### Art rules changed during the build
- `fit: "size"` was added for flat dressing.
- `category` was added to families for the variant-minimum guardrail.
- The hue-drift rule was relaxed from 25° to 40° to allow warmer yellow-green new growth (spec §4). It still blocks rainbow ramps.
- Per-variant triangle budgets: palm 1300, bush 900, scrub 900, cactus 900, rocks ≤ 400.

### Shells and contact
- **Shells** live in `render/structureShell.ts`:
  - tone-driven strata plus ±τ steps;
  - a rim band;
  - a chamfer;
  - erosion marks confined to one stratum.
- `SceneEntities.HelperMesh` mounts a shell only when `biomeSurface.structureShell` is set (the Q1 approval). Original keeps the box and edges; pixel identity was verified on a generated adventure world.
- **Contact** lives in `render/contactDecals.ts`: one blob plus an optional soil patch per cluster, within the footprint radius, at renderOrder 0 with no depth write.

### Known visual limits (handed to the biome workers)
- The Tripo stairs in deep sofa shadow still read as boxes at a distance. Shell detail is tone-led within ±1.2 cm.
- Desert scrub and the pad cactus are serviceable baselines, not finished designs.
- Tropical rocks use the shared grey ramp.
- Flowers are a single simple design.

---

## 13. Solid props (physics worker, 2026-09-26)

Props used to be non-colliding: the character walked through trees, cacti and rocks. Since this change, every drawn prop of meaningful size blocks the character. §9's "everything drawn stays inside a geometry-approved footprint" is what keeps that safe.

### Pipeline

- `placement.ts` gains the solid half of the footprint contract:
  - **`PROP_SOLID`:** a per-kind flag. Every kind is solid today: palm, shrub, rock, wood, cactus, dry-plant and windsock.
  - **`ExclusionAnalysis.pathNodes`:** the waypoints plus the ends of every verified walk, jump and mantle transition.
  - **`keepPathNodesClear`:** drops any solid prop whose footprint comes within `SOLID_NODE_CLEARANCE_RATIO` (1.25) character radii of a node. It removes nothing on a sound layout, because `testAnchor` already keeps footprints out of the far wider route corridors. It is the placement layer's own guarantee, not a new rule.
- **`assets/colliders.ts`** turns composed clusters into colliders. Each hero or supporting member is measured once from its unit mesh (cached per template) and gets one primitive in its own world transform:

  | Category | Collider |
  |---|---|
  | tree | capsule; radius = narrowest 5% slice between 2% and 42% of its height (above root flare, below the crown) |
  | cactus, marker | capsule; radius = column or post near the ground |
  | rock | box; 80% of the mesh's horizontal extent |
  | bush | cylinder; 80th-percentile body radius, 85% of the height |
  | dressing | box if flat (logs), else a cylinder like a bush |
  | grass, micro | none |

  Every collider is checked to stay inside its cluster's footprint radius. One that pokes out is trimmed horizontally by at most 35%, or dropped.
- **`decorLayer.ts`** exposes `handle.colliders`, for the members of drawn buckets plus the windsock pole. `BiomeLayer` hands them to `onColliders`, and `GameStage` passes them on to `GameSimulation.setPropColliders`. Switching the look replaces the set; Original, or unmounting, installs `[]`.
- **`game/core/propColliders.ts`** is the physics side. It holds the data type, the collision groups, and the three height classes (runtime body 0.175 m):
  - below autostep (~2.5 cm): skipped;
  - up to 2 body heights: a **ledge**, which can be jumped onto or mantled;
  - taller: a **wall**, which the mantle landing search ignores, so it is never a destination.
- Other physics behaviour:
  - A push within 25° of head-on into a round prop stops the character; a glancing push slides.
  - The camera boom ignores props.
  - A prop that would appear around the player waits until they walk clear.

### Budgets and cost

- **Collider budget:** `PROP_COLLIDER_BUDGET` = **400** per layout. Primaries come first, then companions tallest first, so a cut only loses the smallest companions.
- **Measured counts:** 63–155 colliders per layout on both bundled scans, across all five themed looks, standard and reduced:
  - Tropical standard is about 130–145;
  - Autumn standard is 155;
  - reduced layouts are 63–104.
- **Build time:** under 1 ms per layout (template profiles are cached).
- **Proximity activation:** Rapier charges about 1 µs per step for every *enabled* static collider, even with nothing near it. With 114 enabled colliders, `world.step` went from 7 to 120 µs.
  - So only props within `propActivationRadius(config)` of the character are enabled: mantle reach + landing inset + 6 steps of walking + 0.5 m, about 1.43 m.
  - The set is refreshed every 6 fixed steps and on every teleport. Disabled colliders cost nothing.
  - Typically 6–11 props are enabled, and `world.step` is back to baseline (about 12 µs versus 4–19 µs with no props).
- **Frame time:** `tmp-biome-integration/perf.mjs` on sample 0 (Rodin), p50 before → after:

  | Look | Before | After |
  |---|---|---|
  | Original | 16.7 ms | 16.7 ms |
  | Tropical | 16.7 ms | 16.7 ms |
  | Desert | 16.7 ms | 16.7 ms |
  | Desert reduced | 16.7 ms | 16.7 ms |

  There were 0 frames over 50 ms. During a stretch where Chrome was capped at 30 Hz, an A/B against a clean HEAD worktree read 33.3 ms for both builds in every look. The logs are in `nimbalyst-local/physics-collision/`.

### Tests

- `game/core/propColliders.test.ts` covers the controller:
  - trunk stop and jitter;
  - glancing slide;
  - rock face against a wall;
  - step-over, and jumping onto a boulder;
  - mantle onto a ledge but not a wall;
  - the camera;
  - deferred install;
  - replacement and the budget;
  - proximity activation.
- `assets/colliders.test.ts` runs both scans × five looks × standard and reduced:
  - checks primitives and footprints;
  - installs the colliders in the real world, then checks that the capsule standing on every path node, and swept along every route corridor, touches no prop.
- `adventureController.test.ts` drives generated adventures on both scans to completion through every look's solid props.

### For future biomes

- A new look's props become solid automatically, through `category`.
- A family whose mesh would make a poor collider can only be tuned in `assets/colliders.ts`, never by exceeding `PROP_UNIT_RADIUS`.
- Add the look to the two test loops above.
