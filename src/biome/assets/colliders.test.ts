/**
 * Solid props on the real bundled scans, for every themed look, standard and
 * reduced: the colliders the decoration layer hands to physics are cheap
 * primitives, stay inside their geometry-approved footprints, fit the budget,
 * and — installed in the real Rapier world — never touch the capsule standing
 * on any node of the verified route (spawn, checkpoints, objectives, every
 * walk/jump/mantle end) nor sweep into it along any route corridor.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type SceneManifest } from "@shared/index.js";
import { capsuleHeight, toMiniatureScale } from "../../game/core/characterScale.js";
import { initRapier } from "../../game/core/physicsWorld.js";
import { PROP_COLLIDER_BUDGET, isPropGroups, isValidPropCollider, type PropCollider } from "../../game/core/propColliders.js";
import { GameSimulation } from "../../game/core/simulation.js";
import { generateAdventure, DEFAULT_ADVENTURE_BUDGET } from "../adventures.js";
import { analyzeManifest, assetGeometryFromLoaded } from "../geometry.js";
import { sampleScanFixture, type GeometryFixture } from "../geometryFixtures.js";
import { computeGameplayExclusions, prepareBiomeLayout } from "../placement.js";
import { getBiomeDefinition } from "../presets.js";
import { createBiomeLayer } from "../render/decorLayer.js";
import type { BiomeId, BiomeLayout, EffectsQuality } from "../types.js";
import { ADVENTURE_TIME_BUDGET_MS, WorkDeadline } from "../workBudget.js";

const RUNTIME = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);
const THEMED: readonly BiomeId[] = ["tropical", "desert", "alpine", "autumn", "ember"];
const SCANS = ["sample-rodin-room-corner", "sample-tripo-room-corner"] as const;
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const onlyProps = (collider: { collisionGroups(): number }) => isPropGroups(collider.collisionGroups());

beforeAll(async () => {
  await initRapier();
});

function collidersFor(manifest: SceneManifest, fixture: GeometryFixture, biome: BiomeId, quality: EffectsQuality) {
  const definition = getBiomeDefinition(biome);
  const layout = prepareBiomeLayout({ manifest, assets: fixture.assets, movement: RUNTIME, definition, seed: `solid-${biome}`, quality });
  const layer = createBiomeLayer({ definition, layout, quality, reducedMotion: false });
  layer.dispose();
  return { layout, colliders: layer.colliders };
}

/** Every collider is a valid primitive inside its own placement's footprint cylinder. */
function assertInsideFootprints(layout: BiomeLayout, colliders: readonly PropCollider[]) {
  const byId = new Map(layout.props.map((prop) => [prop.id, prop]));
  for (const collider of colliders) {
    expect(isValidPropCollider(collider), collider.id).toBe(true);
    expect(["capsule", "cylinder", "cuboid"]).toContain(collider.shape.kind);
    const prop = byId.get(collider.id.split(":")[0]!);
    expect(prop, collider.id).toBeDefined();
    const gap = Math.hypot(collider.position.x - prop!.position[0], collider.position.z - prop!.position[2]);
    expect(gap + collider.reach, collider.id).toBeLessThanOrEqual(prop!.radius + 1e-6);
    expect(collider.height, collider.id).toBeLessThanOrEqual(prop!.scale * 1.001);
  }
}

/** Installs the colliders in the real world and probes the route with the capsule. */
async function assertRouteClear(manifest: SceneManifest, fixture: GeometryFixture, colliders: readonly PropCollider[], label: string) {
  const simulation = await GameSimulation.create({
    manifest,
    config: DEFAULT_MOVEMENT_CONFIG,
    assetGeometry: new Map([...fixture.assets].map(([id, asset]) => [id, asset.collision])),
    miniature: true,
  });
  try {
    const stats = simulation.setPropColliders(colliders);
    expect(stats.installed, label).toBeGreaterThan(0);
    // Nothing solid appeared around the spawn.
    expect(stats.deferred, label).toBe(0);
    const { world } = simulation.scene;
    const RAPIER = await initRapier();
    const { characterRadius: radius, characterHalfHeight: half } = simulation.config;
    const lift = half + radius + 0.01;
    const capsule = new RAPIER.Capsule(half, radius);
    const exclusion = computeGameplayExclusions(manifest, analyzeManifest(manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME));
    expect(exclusion.pathNodes.length, label).toBeGreaterThan(1);
    for (const node of exclusion.pathNodes) {
      const centre = { x: node[0], y: node[1] + lift, z: node[2] };
      const hit = world.intersectionWithShape(centre, IDENTITY, capsule, undefined, undefined, undefined, undefined, onlyProps);
      expect(hit, `${label}: a prop collider sits on route node ${node.map((n) => n.toFixed(2))}`).toBeNull();
    }
    for (const zone of exclusion.exclusions) {
      const [sx, sy, sz] = zone.start;
      const [ex, ey, ez] = zone.end;
      if (Math.hypot(ex - sx, ey - sy, ez - sz) < 1e-6) continue;
      const hit = world.castShape({ x: sx, y: sy + lift, z: sz }, IDENTITY, { x: ex - sx, y: ey - sy, z: ez - sz }, capsule, 0, 1, true, undefined, undefined, undefined, undefined, onlyProps);
      expect(hit, `${label}: a prop collider blocks the ${zone.reason} corridor from ${zone.start.map((n) => n.toFixed(2))}`).toBeNull();
    }
    return stats;
  } finally {
    simulation.dispose();
  }
}

describe("solid biome props on the real scans", () => {
  it("Original draws no props and hands physics nothing", () => {
    const fixture = sampleScanFixture(SCANS[0], true);
    const { colliders } = collidersFor(fixture.manifest, fixture, "original", "standard");
    expect(colliders).toEqual([]);
  });

  for (const scan of SCANS) {
    it(`${scan}: every themed look's colliders are primitives inside their footprints, and never touch the authored course`, async () => {
      const fixture = sampleScanFixture(scan, true);
      for (const biome of THEMED) {
        for (const quality of ["standard", "reduced"] as const) {
          const { layout, colliders } = collidersFor(fixture.manifest, fixture, biome, quality);
          const label = `${scan} ${biome} ${quality}`;
          expect(colliders.length, label).toBeGreaterThan(0);
          expect(colliders.length, label).toBeLessThanOrEqual(PROP_COLLIDER_BUDGET);
          // Trees, rocks and bushes all block, so the look is solid through
          // and through, not just its heroes.
          expect(new Set(colliders.map((c) => c.shape.kind)).size, label).toBeGreaterThanOrEqual(2);
          assertInsideFootprints(layout, colliders);
          await assertRouteClear(fixture.manifest, fixture, colliders, label);
        }
      }
    }, 240_000);

    it(`${scan}: a generated adventure's fragments, portal and route stay clear of solid props in every look`, async () => {
      const fixture = sampleScanFixture(scan);
      const detail = generateAdventure(
        { manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "restore-portal", seed: `solid-${scan}` },
        DEFAULT_ADVENTURE_BUDGET,
        new WorkDeadline(ADVENTURE_TIME_BUDGET_MS, () => 0),
      );
      for (const biome of THEMED) {
        const { layout, colliders } = collidersFor(detail.manifest, fixture, biome, "standard");
        assertInsideFootprints(layout, colliders);
        await assertRouteClear(detail.manifest, fixture, colliders, `${scan} adventure ${biome}`);
      }
    }, 240_000);
  }

  it("the placement layer drops a solid prop that would stand on a route node", async () => {
    const { keepPathNodesClear, SOLID_NODE_CLEARANCE_RATIO } = await import("../placement.js");
    const clearance = RUNTIME.characterRadius * SOLID_NODE_CLEARANCE_RATIO;
    const body = capsuleHeight(RUNTIME);
    const rock = { id: "prop-rock-1", kind: "rock" as const, position: [0, 0, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number], scale: 0.2, yaw: 0, radius: 0.18 };
    // A node right beside the footprint: dropped. Far away, or a tier above
    // the prop's top: kept.
    expect(keepPathNodesClear([rock], [[0.18 + clearance * 0.5, 0, 0]], clearance, body)).toEqual([]);
    expect(keepPathNodesClear([rock], [[0.18 + clearance * 1.5, 0, 0]], clearance, body)).toEqual([rock]);
    expect(keepPathNodesClear([rock], [[0.1, 0.5, 0]], clearance, body)).toEqual([rock]);
  });
});
