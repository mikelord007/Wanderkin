# Biome visuals checkpoint (FROZEN)

- Owner session: 359d554d (visuals worker). Model: `claude-opus-5-5` (Claude Opus 5.5).
- Base: `main` @ 2193c5c. Status: source frozen 2026-09-25, **uncommitted**. Integration worker ad9320dd is the sole combined committer.
- No provider/paid calls. No storage writes. Protected ports 5173/8787/15173/18799 untouched. Harness ports 15987/15988 used and closed.

## Owned files (sha256 prefix at freeze)

| File | sha256[0:12] |
|---|---|
| src/biome/presets.ts | 7bebade733c3 |
| src/biome/presets.test.ts | 0cec2ebbc3b1 |
| src/biome/render/BiomeLayer.tsx | f531e8e68614 |
| src/biome/render/decorLayer.ts | c76bc1733baf |
| src/biome/render/decorLayer.test.ts | 6f26e2292f74 |
| src/biome/render/atmosphereEffects.ts | 9337f663bfab |
| src/biome/render/propGeometry.ts | 5e4604a5280e |
| src/biome/render/propGeometry.test.ts | fce341903cc5 |
| src/biome/render/propMaterial.ts | 00ec4519dc43 |
| src/biome/render/selection.ts | 2cf78dc66874 |
| src/biome/render/surfaceBlend.ts | 75f9f2e71d9b |
| src/biome/render/surfaceBlend.test.ts | 93ba5d172e99 |
| src/biome/render/wind.ts | ea4aebafae9e |
| src/biome/render/windsock.ts | bcd21f213dd1 |
| src/game/render/SceneLighting.tsx (optional `biome` prop) | 6eced3929ac4 |
| src/game/render/SceneLighting.test.ts | 575a57d0726b |
| src/game/render/SceneEntities.tsx (optional `biomeSurface` prop) | 452eafb1a5d4 |

Unchanged: `SceneEnvironment.tsx`, `src/scene/styleMaterial.ts`, `src/biome/types.ts` (integration-owned).
Evidence (optional to commit): `nimbalyst-local/tmp-biome-visuals/` (harness.tsx, shoot.mjs, prod.mjs, shots/).

## API (as wired by integration in GameStage)

- `getBiomeDefinition(id)`, `effectiveBudget(def, quality)` — `src/biome/presets.ts`.
- `<BiomeLayer definition layout quality reducedMotion />` — props, patches (decals), water, particles, windsock. Null for Original / mismatched layout.
- `<SceneLighting biome={themed ? def : null} />` — sky/fog/sun/ambient/hemisphere; null = byte-identical Original path.
- `<SceneEntities biomeSurface={useMemo(() => biomeSurfaceTreatment(def, layout, quality))} />` — uniform-only tint on CLONED materials: scan = localized upward patch tint; helper floor = flat sand; helper structures (steps/ramps/`adventure-*`) = wood. Never touches cached source materials.
- Conventions: wind.direction = unit XZ DOWNWIND; lighting.direction = scene→sun; fog near/far × scene radius; placement.scale = world height; `PROP_UNIT_RADIUS` (imported by geometry — frozen): palm .62, shrub .8, rock .9, wood .36, cactus .34, dry-plant .68, windsock .62.

## Verification

- Unit: 63 pass (presets, render/*, SceneLighting, styleMaterial regression). `tsc -p tsconfig.json` 0 errors at freeze.
- Harness (real Chrome GPU, stand-in layout — NOT prepareBiomeLayout): Rodin+Tripo × Original/Tropical/Desert × 5 views + reduced + reduced-motion. 0 console errors. Original after 6 switch cycles **pixel-identical (0/921,600)**; geometries/textures back to baseline; programs plateau (8), no growth. Windsock tail within 1° of downwind (unit test).
- Real app (current working tree, prepareBiomeLayout + generated Restore the Portal on both samples; shots `tmp-biome-visuals/shots/prod-0|1/`): Desert floor sand, structures wood, spawn ring visible, windsock/portal visible; Tropical island + water horizon, palms/shrubs/rocks. Counts: Rodin original 25 geo/29 draws → tropical 29/33 → desert 30/32.

## Fixes made from real-app inspection

1. Integration's "desert on lawn" shots came from a stale no-watch Vite; current tree renders sand floor.
2. Helper tint made flat (grain crossed Cartoon per-channel posterize thresholds → blotches).
3. Decal mottling smooth (hashed cells looked pixelated on large patches).
4. Decals/water `renderOrder` 0 so checkpoint/spawn rings (renderOrder 1) always draw on top — fixes weak/absent spawn disc.
5. Warmer fill light in both biomes (shadowed sand turned olive under Cartoon).

## Open items (not visuals-owned)

- **Defect (integration/physics):** intermittent `pageerror: Cannot read properties of undefined (reading 'castShape')` when a new adventure replaces the world pre-start on Rodin (2 of 3 runs; 0 of 3 Tripo). No visuals code calls Rapier.
- ModeEntities pointLight mount/unmount → light-count shader recompile on pickup/portal (integration measuring).
- Geometry: avoid props on small recognizable objects (stand-in harness put rocks on the laptop; real layout not observed doing so in prod shots).

## Subjective limitations

- Cartoon style posterizes per channel, so sand shade bands (lit peach vs shaded tan) are style-driven; other styles unaffected.
- Swaying plants cast static shadows. Prop camera-fade not verified during live chase-camera play. Water fills inside the approved ring at the same (below-all-support) level — reversible single line in atmosphereEffects.ts if a strict ring is preferred.

## Next step

Integration (ad9320dd) includes the owned file list above in the combined commit after its own verification. No further visuals edits unless requested.
