import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type SceneManifest } from "@shared/index.js";
import { capsuleHeight, toMiniatureScale } from "../game/core/characterScale.js";
import { createGameFloor, helperEntityTriangles } from "../scene/helpers.js";
import { validateRoute } from "../scene/route.js";
import { computeBounds } from "../scene/transform.js";
import { DEFAULT_ADVENTURE_BUDGET, generateAdventure } from "./adventures.js";
import { analyzeManifest, assetGeometryFromLoaded, helperEntitiesOf, raycastDown, surfaceFromAuthoredCentre } from "./geometry.js";
import { bedFixture, countertopFixture, deskFixture, poorFixture, sampleScanFixture, type GeometryFixture } from "./geometryFixtures.js";
import {
  PROP_FOOTPRINT_RATIO,
  SKIRT_BUDGET_SHARE,
  SKIRT_PER_STRUCTURE,
  computeGameplayExclusions,
  footprintDistance,
  groveOrder,
  groveScale,
  prepareBiomeLayout,
  segmentDistance,
} from "./placement.js";
import { getBiomeDefinition } from "./presets.js";
import { PROP_UNIT_RADIUS } from "./render/propGeometry.js";
import type { BiomeLayout, BiomeId } from "./types.js";
import { seededRandom } from "./render/selection.js";
import { ADVENTURE_TIME_BUDGET_MS, WorkDeadline } from "./workBudget.js";

const RUNTIME = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);
const BODY = capsuleHeight(RUNTIME);

/** The production limit on a clock that never advances: these tests only need
 * a generated adventure to decorate, so a loaded machine must not turn a slow
 * generation into a 2 s budget refusal (the budget has its own tests). */
const unhurried = () => new WorkDeadline(ADVENTURE_TIME_BUDGET_MS, () => 0);

function layoutFor(fixture: { manifest: SceneManifest; assets: GeometryFixture["assets"] }, biome: BiomeId, seed = "layout", quality: "standard" | "reduced" = "standard"): BiomeLayout {
  return prepareBiomeLayout({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, definition: getBiomeDefinition(biome), seed, quality });
}

/** Independent re-check of every guarantee a prop placement makes. */
function assertPropsSafe(fixture: { manifest: SceneManifest; assets: GeometryFixture["assets"] }, layout: BiomeLayout) {
  const analysis = analyzeManifest(fixture.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
  const definition = getBiomeDefinition(layout.biomeId);
  const [low, high] = definition.props.scaleRange;
  for (const prop of layout.props) {
    expect(definition.props.kinds).toContain(prop.kind);
    // Sized from the runtime character, within the biome's range.
    expect(prop.scale).toBeGreaterThanOrEqual(BODY * low - 1e-9);
    expect(prop.scale).toBeLessThanOrEqual(BODY * high + 1e-9);
    // Covers what the renderer draws.
    expect(prop.radius).toBeGreaterThanOrEqual(prop.scale * PROP_UNIT_RADIUS[prop.kind] - 1e-9);
    // Rests on the surface: rays across the footprint land at its height
    // (the guaranteed rim samples, plus looser mid-radius samples).
    const tolerance = Math.max(0.05, prop.radius * 0.25);
    for (const [fraction, slack] of [[0.8, 0], [0.4, 0.03]] as const) {
      const r = prop.radius * fraction;
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
        const hit = raycastDown(analysis.grid, [prop.position[0] + dx, prop.position[1] + 0.3, prop.position[2] + dz], 0.6);
        expect(hit, `${prop.id} unsupported`).not.toBeNull();
        expect(Math.abs(hit!.point[1] - prop.position[1])).toBeLessThanOrEqual(tolerance + slack + 1e-6);
      }
    }
    expect(prop.normal[1]).toBeGreaterThanOrEqual(definition.surface.upwardNormalMin - 1e-6);
    // Nothing of the scan inside its volume.
    expect(
      analysis.grid.intersectsBox(
        [prop.position[0] - prop.radius, prop.position[1] + 0.08, prop.position[2] - prop.radius],
        [prop.position[0] + prop.radius, prop.position[1] + prop.scale, prop.position[2] + prop.radius],
      ),
      `${prop.id} intersects the scan`,
    ).toBe(false);
  }
  // No two props overlap.
  for (let i = 0; i < layout.props.length; i += 1) {
    for (let j = i + 1; j < layout.props.length; j += 1) {
      const a = layout.props[i]!;
      const b = layout.props[j]!;
      const vertical = a.position[1] < b.position[1] + b.scale && b.position[1] < a.position[1] + a.scale;
      if (vertical) expect(Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2])).toBeGreaterThanOrEqual(a.radius + b.radius);
    }
  }
}

/** Props stay out of the actual validated route of the manifest's mission. */
function assertRouteClear(fixture: { manifest: SceneManifest; assets: GeometryFixture["assets"] }, layout: BiomeLayout) {
  const analysis = analyzeManifest(fixture.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
  const authored = analysis.authored;
  const experience = fixture.manifest.experience!;
  const chain = [
    surfaceFromAuthoredCentre(fixture.manifest.spawn.position, authored),
    ...experience.collectibles.map((c) => surfaceFromAuthoredCentre(c.transform.position, authored)),
    ...(experience.mode.kind === "explore" ? experience.mode.destinations.map((d) => surfaceFromAuthoredCentre(d.position, authored)) : []),
    ...(experience.finishPortal ? [surfaceFromAuthoredCentre(experience.finishPortal.transform.position, authored)] : []),
  ];
  const report = validateRoute(analysis.surfaces, analysis.limits, chain);
  expect(report.allReachable).toBe(true);
  const body = authored.characterRadius;
  for (const prop of layout.props) {
    const base = prop.position;
    const tip = [prop.position[0], prop.position[1] + prop.scale, prop.position[2]] as const;
    for (const segment of report.segments) {
      for (const transition of segment.transitions) {
        expect(segmentDistance(base, tip, transition.from, transition.to), `${prop.id} on the route`).toBeGreaterThan(prop.radius + body);
      }
    }
    for (const point of chain) {
      expect(segmentDistance(base, tip, point, point), `${prop.id} on an objective`).toBeGreaterThan(prop.radius + 0.5);
    }
  }
}

const FIXTURES = [deskFixture, countertopFixture, bedFixture, () => poorFixture(true)];

describe("prepareBiomeLayout", () => {
  it("returns nothing for Original", () => {
    const layout = layoutFor(deskFixture(), "original");
    expect(layout.props).toHaveLength(0);
    expect(layout.patches).toHaveLength(0);
    expect(layout.water).toBeNull();
  });

  it.each(FIXTURES.map((make) => [make().name, make] as const))("%s: every themed look's props are supported, fitted and apart", (_name, make) => {
    const fixture = make();
    for (const biome of ["tropical", "desert", "alpine", "autumn", "ember", "monsoon"] as const) {
      const layout = layoutFor(fixture, biome);
      expect(layout.props.length).toBeGreaterThan(0);
      assertPropsSafe(fixture, layout);
    }
  });

  it.each(FIXTURES.map((make) => [make().name, make] as const))("%s: props stay off a generated adventure's route, jumps and objectives", (_name, make) => {
    const fixture = make();
    for (const template of ["restore-portal", "reach-beacon"] as const) {
      const adventure = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template, seed: "route" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
      const played = { manifest: adventure.manifest, assets: fixture.assets };
      for (const biome of ["tropical", "desert", "alpine", "autumn", "ember", "monsoon"] as const) {
        const layout = layoutFor(played, biome);
        expect(layout.props.length).toBeGreaterThan(0);
        assertPropsSafe(played, layout);
        assertRouteClear(played, layout);
        // Nothing decorates the generated structures themselves.
        for (const entity of adventure.manifest.entities.filter((e) => e.id.startsWith("adventure-") && e.kind !== "floor")) {
          const [cx, cy, cz] = entity.transform.position;
          const [w, h, d] = (entity as { dimensions: readonly number[] }).dimensions;
          const top = cy + h! / 2;
          for (const prop of layout.props) {
            // Standing on (or sunk into) the structure; a prop on a desk top
            // high above a step under the desk is not "on" it.
            const onTop =
              Math.abs(prop.position[0] - cx) < w! / 2 + prop.radius &&
              Math.abs(prop.position[2] - cz) < d! / 2 + prop.radius &&
              prop.position[1] < top + 0.3 &&
              prop.position[1] + prop.scale > cy - h! / 2;
            expect(onTop, `${prop.id} on ${entity.id}`).toBe(false);
          }
        }
      }
    }
  });

  it("decorates real scans quickly and safely", () => {
    for (const id of ["sample-rodin-room-corner", "sample-tripo-room-corner"]) {
      const fixture = sampleScanFixture(id, true);
      const started = performance.now();
      const layout = layoutFor(fixture, "tropical");
      expect(performance.now() - started).toBeLessThan(2000);
      expect(layout.props.some((prop) => prop.kind === "palm")).toBe(true);
      assertPropsSafe(fixture, layout);
    }
  });

  it("dresses the foot of generated structures with rocks, outside their footprint and off the route", () => {
    for (const id of ["sample-rodin-room-corner", "sample-tripo-room-corner"]) {
      const fixture = sampleScanFixture(id, true);
      const boxes = helperEntitiesOf(fixture.manifest).filter((entity) => entity.kind !== "floor").map((entity) => computeBounds(helperEntityTriangles(entity)));
      expect(boxes.length).toBeGreaterThan(0);
      for (const biome of ["tropical", "desert", "alpine", "autumn", "ember", "monsoon"] as const) {
        const layout = layoutFor(fixture, biome);
        const skirts = layout.props.filter((prop) => prop.id.includes("-skirt-"));
        expect(skirts.length, `${id} ${biome} skirts`).toBeGreaterThan(0);
        expect(skirts.length).toBeLessThanOrEqual(Math.max(1, Math.floor(getBiomeDefinition(biome).budget.props * SKIRT_BUDGET_SHARE)));
        for (const prop of skirts) {
          expect(prop.kind).toBe("rock");
          const distances = boxes.map((box) => footprintDistance(prop.position[0], prop.position[2], box));
          // Never on or against a structure (testAnchor keeps 0.1 clear of every helper box).
          for (const [k, d] of distances.entries()) {
            const box = boxes[k]!;
            const overlapsVertically = prop.position[1] + prop.scale > box.min[1] && prop.position[1] < box.max[1] + 0.2;
            if (overlapsVertically) expect(d, `${prop.id} vs structure ${k}`).toBeGreaterThanOrEqual(0.1 + prop.radius - 1e-9);
          }
          // ...but at the foot of one: within a couple of grid cells of it.
          expect(Math.min(...distances)).toBeLessThanOrEqual(0.1 + prop.radius + 0.75);
          // Off the route, spawn, checkpoints and objectives.
          const tip: [number, number, number] = [prop.position[0], prop.position[1] + prop.scale, prop.position[2]];
          for (const zone of layout.exclusions) {
            expect(segmentDistance(prop.position, tip, zone.start, zone.end)).toBeGreaterThanOrEqual(zone.radius + prop.radius - 1e-9);
          }
        }
        // Adjacent steps share borders, so bound the total, not the nearest box.
        expect(skirts.length).toBeLessThanOrEqual(SKIRT_PER_STRUCTURE * boxes.length);
        expect(layout.exclusions.length).toBeGreaterThan(0);
        assertPropsSafe(fixture, layout);
      }
    }
  });

  it("gives every requested kind a share of the layout on real scans, standard and reduced", () => {
    for (const id of ["sample-rodin-room-corner", "sample-tripo-room-corner"]) {
      const fixture = sampleScanFixture(id, true);
      for (const biome of ["tropical", "desert", "alpine", "autumn", "ember", "monsoon"] as const) {
        const standard = layoutFor(fixture, biome);
        const reduced = layoutFor(fixture, biome, "layout", "reduced");
        for (const kind of getBiomeDefinition(biome).props.kinds) {
          if (kind === "windsock") continue;
          expect(standard.props.filter((p) => p.kind === kind).length, `${id} ${biome} ${kind} standard`).toBeGreaterThan(0);
          expect(reduced.props.filter((p) => p.kind === kind).length, `${id} ${biome} ${kind} reduced`).toBeGreaterThan(0);
        }
        expect(standard.props.length).toBeGreaterThan(reduced.props.length);
      }
    }
  });

  it("a kind that keeps failing cannot starve the kinds planned after it (fair attempt shares)", () => {
    // Oversized trees fail almost everywhere on a cramped scan; before the fix
    // they spent the whole attempt budget and nothing smaller was placed.
    const fixture = sampleScanFixture("sample-tripo-room-corner", true);
    const tropical = getBiomeDefinition("tropical");
    const oversized = { ...tropical, props: { ...tropical.props, scaleRange: [2.6, 3.2] as [number, number] } };
    const layout = prepareBiomeLayout({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, definition: oversized, seed: "starve", quality: "standard" });
    for (const kind of ["shrub", "rock", "wood"] as const) {
      expect(layout.props.filter((p) => p.kind === kind && !p.id.includes("-skirt-")).length, kind).toBeGreaterThan(0);
    }
    // Same seed, same layout: the shares are deterministic.
    const again = prepareBiomeLayout({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, definition: oversized, seed: "starve", quality: "standard" });
    expect(again.props).toEqual(layout.props);
  });

  it("places exactly one windsock in the desert and none in the tropics", () => {
    const fixture = deskFixture();
    expect(layoutFor(fixture, "desert").props.filter((p) => p.kind === "windsock")).toHaveLength(1);
    expect(layoutFor(fixture, "tropical").props.filter((p) => p.kind === "windsock")).toHaveLength(0);
  });

  it("is reproducible for a seed, varies with it, and honours reduced quality", () => {
    const fixture = bedFixture();
    const a = layoutFor(fixture, "tropical", "same");
    expect(layoutFor(fixture, "tropical", "same")).toEqual(a);
    expect(JSON.stringify(layoutFor(fixture, "tropical", "other").props)).not.toBe(JSON.stringify(a.props));
    const reduced = layoutFor(fixture, "tropical", "same", "reduced");
    expect(reduced.props.length).toBeLessThanOrEqual(a.props.length);
    expect(reduced.props.length).toBeLessThanOrEqual(Math.floor(getBiomeDefinition("tropical").budget.props * 0.5));
  });

  it("goes sparse, without tall props, when the current route cannot be proven", () => {
    const fixture = deskFixture();
    // A checkpoint floating in mid-air: no provable leg to it.
    const manifest: SceneManifest = {
      ...fixture.manifest,
      checkpoints: [{ id: "floating", order: 0, position: [0, 6, 0], triggerRadius: 0.4, safeRespawn: { position: [0, 6, 0], headingRadians: 0 } }],
    };
    const analysis = analyzeManifest(manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
    expect(computeGameplayExclusions(manifest, analysis).certain).toBe(false);
    const layout = layoutFor({ manifest, assets: fixture.assets }, "tropical");
    expect(layout.props.length).toBeLessThanOrEqual(Math.floor(getBiomeDefinition("tropical").budget.props * 0.3));
    expect(layout.props.some((p) => p.kind === "palm")).toBe(false);
  });

  it("reserves jump take-offs, landings and mantle climbs", () => {
    const fixture = countertopFixture();
    const adventure = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "reach-beacon", seed: "controller-countertop" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    const analysis = analyzeManifest(adventure.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
    const exclusions = computeGameplayExclusions(adventure.manifest, analysis);
    expect(exclusions.certain).toBe(true);
    const jumps = adventure.report.segments.flatMap((s) => s.transitions).filter((t) => t.kind !== "walk");
    expect(jumps.length).toBeGreaterThan(0);
    for (const transition of jumps) {
      for (const end of [transition.from, transition.to]) {
        const covered = exclusions.exclusions.some((zone) => segmentDistance(end, end, zone.start, zone.end) <= zone.radius - 0.3);
        expect(covered).toBe(true);
      }
    }
  });

  it("follows the race order even when the checkpoint array is stored out of order", () => {
    const fixture = deskFixture();
    const adventure = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "restore-portal", seed: "race-order" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    const sorted = [...adventure.manifest.checkpoints].sort((a, b) => a.order - b.order);
    expect(sorted.length).toBeGreaterThanOrEqual(3);
    const race: SceneManifest = {
      ...adventure.manifest,
      checkpoints: sorted,
      experience: {
        ...adventure.manifest.experience!,
        collectibles: [],
        mode: { kind: "race", countdownSeconds: 3, orderedCheckpointIds: sorted.map((c) => c.id), restartPolicy: "full-reset" },
      },
    };
    // Same checkpoints, same `order` fields, stored in a different array order.
    const permuted: SceneManifest = { ...race, checkpoints: [sorted[2]!, sorted[0]!, ...sorted.slice(3), sorted[1]!] };
    expect(permuted.checkpoints.map((c) => c.id)).not.toEqual(race.checkpoints.map((c) => c.id));

    const analysis = analyzeManifest(race, assetGeometryFromLoaded(fixture.assets), RUNTIME);
    const expected = computeGameplayExclusions(race, analysis);
    const actual = computeGameplayExclusions(permuted, analysis);
    expect(actual.certain).toBe(true);
    expect(actual.waypoints).toEqual(expected.waypoints);
    expect(actual.exclusions).toEqual(expected.exclusions);
    // The race legs run spawn → checkpoints in race order → portal.
    const surfaces = sorted.map((c) => surfaceFromAuthoredCentre(c.position, analysis.authored));
    expect(actual.waypoints.slice(1, 1 + surfaces.length)).toEqual(surfaces);
  });

  it("puts water only below a game floor that is the lowest support", () => {
    const fixture = deskFixture();
    const layout = layoutFor(fixture, "tropical");
    expect(layout.water).not.toBeNull();
    const analysis = analyzeManifest(fixture.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
    const lowest = Math.min(...analysis.surfaces.standable.map((patch) => patch.point[1]));
    expect(layout.water!.center[1]).toBeLessThan(lowest);
    expect(layoutFor(fixture, "desert").water).toBeNull();
    expect(layoutFor(poorFixture(false), "tropical").water).toBeNull();
    // A floor smaller than the scan: the scene would hang over the water.
    const shrunk: SceneManifest = {
      ...fixture.manifest,
      entities: fixture.manifest.entities.map((entity) =>
        entity.kind === "floor" ? createGameFloor({ id: entity.id, bounds: { min: [-1, 0, -1], max: [1, 0, 1] }, margin: 0 }) : entity,
      ),
    };
    const refused = layoutFor({ manifest: shrunk, assets: fixture.assets }, "tropical");
    expect(refused.water).toBeNull();
    expect(refused.diagnostics.join(" ")).toMatch(/floor's edge|below the game floor/);
  });

  it("keeps surface treatment local and within the coverage cap", () => {
    const fixture = deskFixture();
    const layout = layoutFor(fixture, "desert");
    const definition = getBiomeDefinition("desert");
    expect(layout.patches.length).toBeGreaterThan(0);
    expect(layout.patches.length).toBeLessThanOrEqual(definition.budget.patches);
    const analysis = analyzeManifest(fixture.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
    const cell = analysis.surfaceOptions.cellSize;
    const standableArea = analysis.surfaces.standable.length * cell * cell;
    const covered = layout.patches.reduce((sum, patch) => sum + Math.PI * patch.radius ** 2, 0);
    expect(covered).toBeLessThanOrEqual(standableArea * definition.surface.patchCoverage + Math.PI * (cell * 4.3) ** 2);
    for (const patch of layout.patches) expect(patch.normal[1]).toBeGreaterThan(0.8);
  });

  it("keeps its clearance ratios at least the renderer's", () => {
    for (const kind of Object.keys(PROP_UNIT_RADIUS) as (keyof typeof PROP_UNIT_RADIUS)[]) {
      expect(PROP_FOOTPRINT_RATIO[kind]).toBeGreaterThanOrEqual(PROP_UNIT_RADIUS[kind]);
    }
  });

  // ---- Composition-aware ordering (environment upgrade, Phase 5) ----------
  // Only the ORDER in which safe spots are tried changes; every placement
  // above still passes the unchanged anchor test (all tests above run on it).

  it("orders candidates grove-first: a deterministic permutation with spaced centres", () => {
    const points = Array.from({ length: 400 }, (_, i) => [(i % 20) * 0.1, 0, Math.floor(i / 20) * 0.1] as [number, number, number]);
    const order = points.map((_, i) => (i * 37) % 400); // a fixed scramble
    const first = groveOrder(points, order, seededRandom("g"), 0.6, 0.25);
    const again = groveOrder(points, order, seededRandom("g"), 0.6, 0.25);
    expect(first.order).toEqual(again.order);
    expect([...first.order].sort((a, b) => a - b)).toEqual([...order].sort((a, b) => a - b));
    expect(first.inGrove.size).toBeGreaterThan(0);
    expect(first.inGrove.size).toBeLessThan(points.length); // open ground remains
    // Every grove candidate comes before any open-ground candidate.
    const lastGrove = Math.max(...first.order.map((index, rank) => (first.inGrove.has(index) ? rank : -1)));
    const firstOpen = first.order.findIndex((index) => !first.inGrove.has(index));
    expect(lastGrove).toBeLessThan(firstOpen);
  });

  it("gives sparser biomes groves further apart, and keeps most props in groves", () => {
    const tropical = groveScale(BODY, getBiomeDefinition("tropical").props.density);
    const desert = groveScale(BODY, getBiomeDefinition("desert").props.density);
    expect(desert.spacing).toBeGreaterThan(tropical.spacing);
    expect(desert.reach).toBeLessThan(tropical.reach);
    expect(tropical.openShare).toBeLessThanOrEqual(0.3);
  });

  it.each([deskFixture, countertopFixture, bedFixture].map((make) => [make().name, make] as const))(
    "%s: desert props gather into groves with open sand between them",
    (_name, make) => {
      const fixture = make();
      const layout = layoutFor(fixture, "desert", "groves");
      const analysis = analyzeManifest(fixture.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
      const cell = analysis.surfaceOptions.cellSize;
      const area = analysis.surfaces.standable.length * cell * cell;
      const props = layout.props;
      expect(props.length).toBeGreaterThan(5);
      // Clark–Evans ratio: 1 = random scatter, < 1 = clustered.
      let sum = 0;
      for (const a of props) {
        let best = Infinity;
        for (const b of props) if (a !== b) best = Math.min(best, Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]));
        sum += best;
      }
      const ratio = sum / props.length / (0.5 * Math.sqrt(area / props.length));
      expect(ratio).toBeLessThan(0.9);
    },
  );
});
