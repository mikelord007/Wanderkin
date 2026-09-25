import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, migrateSceneManifest, type HelperEntity, type SceneManifest } from "@shared/index.js";
import { toMiniatureScale } from "../game/core/characterScale.js";
import { validateExperiencePlacements } from "../game/placementValidation.js";
import { validateManifestCourse } from "../scene/course.js";
import { createRamp, helperEntityTriangles } from "../scene/helpers.js";
import { computeBounds } from "../scene/transform.js";
import {
  ADVENTURE_HELPER_PREFIX,
  ADVENTURE_MAX_ANALYSED_TRIANGLES,
  DEFAULT_ADVENTURE_BUDGET,
  FRAGMENT_TRIGGER_RADIUS,
  PORTAL_TRIGGER_RADIUS,
  adventureStructures,
  generateAdventure,
  isOwnGeneratedHelper,
  prepareAdventure,
} from "./adventures.js";
import {
  MAX_ANALYSED_TRIANGLES,
  analyzeManifest,
  assetGeometryFromLoaded,
  authoredCentreFromSurface,
  groundedTriggerReach,
  raycastDown,
  runtimeCentreFromAuthored,
  surfaceFromAuthoredCentre,
} from "./geometry.js";
import { ADVENTURE_TIME_BUDGET_MS, WorkDeadline } from "./workBudget.js";
import { bedFixture, boxSoup, countertopFixture, deskFixture, loadedAssets, lowCeilingFixture, poorFixture, sampleScanFixture } from "./geometryFixtures.js";
import { validateRoute } from "../scene/route.js";
import { getBiomeDefinition } from "./presets.js";
import { TriangleGrid } from "../scene/spatial.js";

const RUNTIME = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);
const AUTHORED = DEFAULT_MOVEMENT_CONFIG;

/** The production limit on a clock that never advances. Tests that check
 * layouts (not the budget) pass this so the wall-clock 2 s default cannot
 * refuse a slow scene on a loaded machine and fail them for an unrelated
 * reason. The budget itself is tested with step clocks below. */
const unhurried = () => new WorkDeadline(ADVENTURE_TIME_BUDGET_MS, () => 0);

describe("centre conventions", () => {
  it("round-trips authored centres and matches the simulation's re-seat", () => {
    const surface = [1, 2, 3] as const;
    const centre = authoredCentreFromSurface(surface, AUTHORED);
    expect(centre[1]).toBeCloseTo(2.37, 6);
    expect(surfaceFromAuthoredCentre(centre, AUTHORED)[1]).toBeCloseTo(2, 6);
    // GameSimulation lowers an authored centre by the half-height difference.
    expect(runtimeCentreFromAuthored(centre, AUTHORED, RUNTIME)[1]).toBeCloseTo(2 + 0.0875 + 0.02, 6);
  });

  it("gives every generated trigger a real on-foot reach", () => {
    expect(groundedTriggerReach(FRAGMENT_TRIGGER_RADIUS, AUTHORED, RUNTIME)).toBeGreaterThan(0.3);
    expect(groundedTriggerReach(PORTAL_TRIGGER_RADIUS, AUTHORED, RUNTIME)).toBeGreaterThan(0.6);
    // The trap generated objectives avoid: a trigger too small to reach on foot.
    expect(groundedTriggerReach(0.25, AUTHORED, RUNTIME)).toBe(0);
  });

  it("casts rays onto the first surface below", () => {
    const grid = new TriangleGrid(boxSoup([0, 0.5, 0], [2, 1, 2]), 0.36);
    const hit = raycastDown(grid, [0.3, 3, -0.2], 5)!;
    expect(hit.point[1]).toBeCloseTo(1, 5);
    expect(hit.normal[1]).toBeCloseTo(1, 5);
    expect(raycastDown(grid, [3, 3, 0], 5)).toBeNull();
  });
});

describe("prepareAdventure", () => {
  const cases = [deskFixture, countertopFixture, bedFixture, () => poorFixture(true), () => poorFixture(false)];

  it.each(cases.map((make) => [make().name, make] as const))("%s: both templates produce a validated, schema-valid draft", (_name, make) => {
    const fixture = make();
    for (const template of ["restore-portal", "reach-beacon"] as const) {
      const outcome = prepareAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template, seed: "t1" }, unhurried());
      expect(outcome.ok, outcome.diagnostics.join(" ")).toBe(true);
      const manifest = outcome.manifest;
      expect(manifest.levelId).not.toBe(fixture.manifest.levelId);
      expect(manifest.courseValidation.status).toBe("validated");
      expect(manifest.adventure).toMatchObject({ template, seed: "t1" });
      // Source assets and provenance untouched; the source object is not mutated.
      expect(manifest.assets).toEqual(fixture.manifest.assets);
      expect(fixture.manifest.experience).toBeUndefined();
      expect(() => migrateSceneManifest(manifest)).not.toThrow();
      // The publish gate agrees.
      const gate = validateExperiencePlacements(manifest, assetGeometryFromLoaded(fixture.assets));
      expect(gate.ok, JSON.stringify(gate.issues)).toBe(true);
      // Respawn chain is valid too.
      expect(validateManifestCourse(manifest, assetGeometryFromLoaded(fixture.assets)).report.allReachable).toBe(true);

      const experience = manifest.experience!;
      if (template === "restore-portal") {
        expect(experience.mode.kind).toBe("collect");
        expect(experience.collectibles).toHaveLength(3);
        expect(experience.finishPortal?.activation).toBe("all-required-collectibles");
      } else {
        expect(experience.mode.kind).toBe("explore");
        expect(experience.finishPortal).toBeNull();
      }
      // Generated helpers are explicit, game-marked colliders (a planner ramp
      // is a wedge, so its collider is its own triangles).
      for (const entity of manifest.entities.filter((e) => e.id.startsWith(ADVENTURE_HELPER_PREFIX))) {
        const helper = entity as HelperEntity;
        expect(helper.addedBy).toBe("game");
        expect(helper.collider.kind).toBe(helper.kind === "ramp" ? "triangle-mesh" : "box");
      }
    }
  });

  it("is deterministic for a seed and varies with the seed", () => {
    const fixture = deskFixture();
    const run = (seed: string) =>
      generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "restore-portal", seed }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    const a = run("same");
    const b = run("same");
    expect(b.chain).toEqual(a.chain);
    expect(b.manifest.entities).toEqual(a.manifest.entities);
    const others = ["other-1", "other-2", "other-3"].map((seed) => JSON.stringify(run(seed).chain));
    expect(others.some((chain) => chain !== JSON.stringify(a.chain))).toBe(true);
  });

  it("never lets the theme change the layout", () => {
    const fixture = bedFixture();
    const layouts = (["original", "tropical", "desert"] as const).map((id) => {
      const outcome = prepareAdventure({
        manifest: fixture.manifest,
        assets: fixture.assets,
        movement: RUNTIME,
        template: "restore-portal",
        seed: "theme",
        definition: getBiomeDefinition(id),
        quality: "standard",
      }, unhurried());
      if (!outcome.ok) throw new Error(outcome.reason);
      const { spawn, checkpoints, entities, experience } = outcome.manifest;
      return JSON.stringify({
        spawn,
        checkpoints,
        entities,
        positions: experience!.collectibles.map((c) => c.transform.position),
        portal: experience!.finishPortal!.transform.position,
      });
    });
    expect(new Set(layouts).size).toBe(1);
  });

  it("replaces its own structures on regeneration instead of stacking them", () => {
    const fixture = deskFixture();
    const first = prepareAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "reach-beacon", seed: "r1" }, unhurried());
    if (!first.ok) throw new Error(first.reason);
    const second = prepareAdventure({ manifest: first.manifest, assets: fixture.assets, movement: RUNTIME, template: "reach-beacon", seed: "r1" }, unhurried());
    if (!second.ok) throw new Error(second.reason);
    const generated = (manifest: SceneManifest) => manifest.entities.filter((e) => e.id.startsWith(ADVENTURE_HELPER_PREFIX));
    expect(generated(second.manifest)).toEqual(generated(first.manifest));
    expect(new Set(second.manifest.entities.map((e) => e.id)).size).toBe(second.manifest.entities.length);
  });

  it("keeps a valid source spawn exactly and never buries it", () => {
    const fixture = deskFixture();
    const detail = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "restore-portal", seed: "spawn" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    expect(detail.manifest.spawn.position).toEqual(fixture.manifest.spawn.position);
    const spawnSurface = surfaceFromAuthoredCentre(detail.manifest.spawn.position, AUTHORED);
    for (const entity of detail.manifest.entities.filter((e) => e.id.startsWith(ADVENTURE_HELPER_PREFIX))) {
      const bounds = computeBounds(helperEntityTriangles(entity as HelperEntity));
      const outside =
        spawnSurface[0] < bounds.min[0] - 0.5 || spawnSurface[0] > bounds.max[0] + 0.5 ||
        spawnSurface[2] < bounds.min[2] - 0.5 || spawnSurface[2] > bounds.max[2] + 0.5;
      expect(outside).toBe(true);
    }
  });

  it("puts every objective on a real surface with its trigger at the authored centre", () => {
    const fixture = countertopFixture();
    const detail = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "restore-portal", seed: "surface" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    const experience = detail.manifest.experience!;
    const points = [...experience.collectibles.map((c) => c.transform.position), experience.finishPortal!.transform.position];
    points.forEach((position, index) => {
      const surface = surfaceFromAuthoredCentre(position, AUTHORED);
      surface.forEach((value, axis) => expect(value).toBeCloseTo(detail.chain[index + 1]![axis]!, 9));
    });
  });

  it("adds a modest elevated route to a flat scene, and stairs to a multi-height one", () => {
    const flat = generateAdventure({ ...inputs(countertopFixture()), template: "reach-beacon", seed: "flat" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    expect(flat.structures.map((s) => s.kind)).toContain("platform-route");
    const desk = generateAdventure({ ...inputs(deskFixture()), template: "reach-beacon", seed: "desk" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    expect(desk.structures.map((s) => s.kind)).toContain("staircase");
    // Generated structures stay inside the existing floor footprint.
    for (const detail of [flat, desk]) {
      const floor = detail.manifest.entities.find((e) => e.kind === "floor") as HelperEntity;
      const floorBounds = computeBounds(helperEntityTriangles(floor));
      for (const entity of detail.manifest.entities.filter((e) => e.id.startsWith(ADVENTURE_HELPER_PREFIX))) {
        const bounds = computeBounds(helperEntityTriangles(entity as HelperEntity));
        expect(bounds.min[0]).toBeGreaterThanOrEqual(floorBounds.min[0]);
        expect(bounds.max[0]).toBeLessThanOrEqual(floorBounds.max[0]);
        expect(bounds.min[2]).toBeGreaterThanOrEqual(floorBounds.min[2]);
        expect(bounds.max[2]).toBeLessThanOrEqual(floorBounds.max[2]);
      }
    }
  });

  it("falls back to a simplified game floor for a floorless poor scan", () => {
    const detail = generateAdventure({ ...inputs(poorFixture(false)), template: "restore-portal", seed: "poor" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
    expect(detail.fallbackStage).toBe("game-floor");
    expect(detail.fallbackUsed).toBe(true);
    expect(detail.manifest.entities.some((e) => e.id === `${ADVENTURE_HELPER_PREFIX}floor`)).toBe(true);
  });

  it("reports failure without throwing and leaves the source untouched", () => {
    const fixture = deskFixture();
    // Nothing to stand on at all: a lone sliver of geometry and no floor.
    const manifest: SceneManifest = { ...fixture.manifest, entities: fixture.manifest.entities.filter((e) => e.kind === "generated-mesh") };
    const sliver = loadedAssets(fixture.manifest.assets[0]!.id, boxSoup([0, 0, 0], [0.05, 3, 0.05]));
    const outcome = prepareAdventure({ manifest, assets: sliver, movement: RUNTIME, template: "restore-portal", seed: "x" }, unhurried());
    // A simplified floor is still added, so even this is playable; the
    // point is that a missing asset is reported, not thrown.
    expect(typeof outcome.ok).toBe("boolean");
    const missing = prepareAdventure({ manifest, assets: new Map(), movement: RUNTIME, template: "restore-portal", seed: "x" }, unhurried());
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.reason).toBe("geometry-unavailable");
      expect(missing.manifest).toBe(manifest);
    }
  });

  it("refuses honestly when no playable layout exists, even after the floor fallback", () => {
    const fixture = lowCeilingFixture();
    // Unhurried, so the refusal comes from exhausting layouts, never the clock.
    const outcome = prepareAdventure({ ...inputs(fixture), template: "restore-portal", seed: "impossible" }, unhurried());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("no-playable-layout");
      expect(outcome.manifest).toBe(fixture.manifest);
    }
  });

  it("replaces only its own helpers, and only on worlds it generated", () => {
    const fixture = deskFixture();
    const foreign: HelperEntity = {
      id: `${ADVENTURE_HELPER_PREFIX}step-1-1-1`,
      kind: "box",
      transform: { position: [-5.5, 0.2, -3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      dimensions: [0.4, 0.4, 0.4],
      collider: { kind: "box", halfExtents: [0.2, 0.2, 0.2] },
      addedBy: "game",
    };
    // A world the generator never touched: a same-prefix entity is preserved,
    // and the generated ids steer around it.
    const untouched: SceneManifest = { ...fixture.manifest, entities: [...fixture.manifest.entities, foreign] };
    const outcome = prepareAdventure({ manifest: untouched, assets: fixture.assets, movement: RUNTIME, template: "reach-beacon", seed: "own" }, unhurried());
    if (!outcome.ok) throw new Error(outcome.reason);
    expect(outcome.manifest.entities).toContainEqual(foreign);
    expect(new Set(outcome.manifest.entities.map((e) => e.id)).size).toBe(outcome.manifest.entities.length);
    // Original, non-generated entities always survive regeneration.
    const again = prepareAdventure({ manifest: outcome.manifest, assets: fixture.assets, movement: RUNTIME, template: "reach-beacon", seed: "own-2" }, unhurried());
    if (!again.ok) throw new Error(again.reason);
    for (const entity of fixture.manifest.entities) expect(again.manifest.entities).toContainEqual(entity);
  });

  it("owns planner ramps too: themed, removed on regeneration, never stacked; foreign ramps kept", () => {
    const fixture = deskFixture();
    const first = prepareAdventure({ ...inputs(fixture), template: "reach-beacon", seed: "ramp" }, unhurried());
    if (!first.ok) throw new Error(first.reason);
    // What step 1 keeps when the course planner finds a ramp: renamed into
    // this module's namespace, still a triangle-mesh wedge.
    const plannerRamp = createRamp({ id: `${ADVENTURE_HELPER_PREFIX}planner-1`, start: [-5.2, 0, 3.6], end: [-5.2, 0.25, 2.6], width: 0.6 }).entity;
    // The original course planner's own ramp: same kind, not ours.
    const foreignRamp = createRamp({ id: "helper-ramp-7", start: [5.2, 0, 3.6], end: [5.2, 0.25, 2.6], width: 0.6 }).entity;
    const withRamps: SceneManifest = { ...first.manifest, entities: [...first.manifest.entities, plannerRamp, foreignRamp] };

    expect(isOwnGeneratedHelper(withRamps, plannerRamp)).toBe(true);
    expect(isOwnGeneratedHelper(withRamps, foreignRamp)).toBe(false);
    // Same prefix on a world the generator never produced: not ours.
    expect(isOwnGeneratedHelper({ ...fixture.manifest, entities: [...fixture.manifest.entities, plannerRamp] }, plannerRamp)).toBe(false);
    // Theming sees the planner ramp as a generated structure.
    expect(adventureStructures(withRamps)).toContainEqual(plannerRamp);
    expect(adventureStructures(withRamps)).not.toContainEqual(foreignRamp);

    const again = prepareAdventure({ ...inputs(fixture), manifest: withRamps, template: "reach-beacon", seed: "ramp" }, unhurried());
    if (!again.ok) throw new Error(again.reason);
    expect(again.manifest.entities).not.toContainEqual(plannerRamp);
    expect(again.manifest.entities).toContainEqual(foreignRamp);
    const generated = (manifest: SceneManifest) => manifest.entities.filter((e) => isOwnGeneratedHelper(manifest, e));
    // Regenerating once more keeps exactly one set of structures.
    const third = prepareAdventure({ ...inputs(fixture), manifest: again.manifest, template: "reach-beacon", seed: "ramp" }, unhurried());
    if (!third.ok) throw new Error(third.reason);
    expect(generated(third.manifest)).toEqual(generated(again.manifest));
    expect(third.manifest.entities.filter((e) => e.id === foreignRamp.id)).toHaveLength(1);
    expect(new Set(third.manifest.entities.map((e) => e.id)).size).toBe(third.manifest.entities.length);
  });

  it("makes every next objective reachable from each respawn point", () => {
    for (const make of [deskFixture, countertopFixture, bedFixture]) {
      const fixture = make();
      for (const template of ["restore-portal", "reach-beacon"] as const) {
        const detail = generateAdventure({ ...inputs(fixture), template, seed: "respawn" }, DEFAULT_ADVENTURE_BUDGET, unhurried());
        const analysis = analyzeManifest(detail.manifest, assetGeometryFromLoaded(fixture.assets), RUNTIME);
        const checkpoints = [...detail.manifest.checkpoints].sort((a, b) => a.order - b.order);
        // The chain is spawn, objectives..., exit; checkpoint k sits on a
        // chain point, and from its safe respawn the rest of the chain holds.
        for (const checkpoint of checkpoints) {
          const respawn = surfaceFromAuthoredCentre(checkpoint.safeRespawn.position, AUTHORED);
          const at = detail.chain.findIndex((point) => Math.hypot(point[0] - respawn[0], point[1] - respawn[1], point[2] - respawn[2]) < 1e-6);
          expect(at).toBeGreaterThan(0);
          const rest = validateRoute(analysis.surfaces, analysis.limits, [respawn, ...detail.chain.slice(at + 1)]);
          expect(rest.allReachable).toBe(true);
        }
      }
    }
  });

  it("measures inside the 1.5 s bound on the real scans", () => {
    const timings: Record<string, number> = {};
    for (const id of ["sample-rodin-room-corner", "sample-tripo-room-corner"]) {
      for (const authoredSteps of [false, true]) {
        const fixture = sampleScanFixture(id, authoredSteps);
        for (const template of ["restore-portal", "reach-beacon"] as const) {
          // Unhurried so a slow run fails the timing bound below with its
          // measured number, not as an opaque budget refusal.
          const started = performance.now();
          const outcome = prepareAdventure({ ...inputs(fixture), template, seed: "timing" }, unhurried());
          timings[`${fixture.name}/${template}`] = Math.round(performance.now() - started);
          expect(outcome.ok).toBe(true);
          // Real scans reach a raised surface (the old planner stayed on the floor).
          if (outcome.ok) {
            const spawnY = surfaceFromAuthoredCentre(outcome.manifest.spawn.position, AUTHORED)[1];
            const heights = outcome.manifest.checkpoints.map((c) => surfaceFromAuthoredCentre(c.position, AUTHORED)[1] - spawnY);
            expect(Math.max(...heights)).toBeGreaterThanOrEqual(0.5);
          }
        }
      }
    }
    console.info("prepareAdventure ms", timings);
    for (const ms of Object.values(timings)) expect(ms).toBeLessThan(1500);
  }, 60_000);
});

describe("adventure work budget", () => {
  /** Advances one unit per read: elapsed time equals the number of checks. */
  function stepClock(): () => number {
    let t = 0;
    return () => t++;
  }
  class StageLog extends WorkDeadline {
    readonly stages: string[] = [];
    override check(stage: string): void {
      this.stages.push(stage);
      super.check(stage);
    }
  }
  /** Layout only; `updatedAt`/`checkedAt` are wall-clock. */
  const layoutOf = (manifest: SceneManifest) => JSON.stringify({ ...manifest, updatedAt: null, courseValidation: { ...manifest.courseValidation, checkedAt: null } });

  it("spans both floorless attempts, refuses with the source untouched, and never changes a layout it allows", () => {
    const fixture = poorFixture(false);
    const request = { ...inputs(fixture), template: "restore-portal" as const, seed: "budget" };
    const source = JSON.stringify(fixture.manifest);
    const reference = generateAdventure(request, DEFAULT_ADVENTURE_BUDGET, unhurried());
    expect(reference.fallbackStage).toBe("game-floor");

    const counted = new StageLog(Infinity, stepClock());
    generateAdventure(request, DEFAULT_ADVENTURE_BUDGET, counted);
    const total = counted.checkCount;
    const secondAttempt = counted.stages.indexOf("the game-floor attempt");
    expect(secondAttempt).toBeGreaterThan(0);
    // Either attempt alone fits in `total - 1`, so a budget that restarted
    // per attempt would let the next request through.
    expect(Math.max(secondAttempt, total - secondAttempt)).toBeLessThanOrEqual(total - 1);

    // Exactly enough: the very same layout as with no budget at all.
    const enough = generateAdventure(request, DEFAULT_ADVENTURE_BUDGET, new WorkDeadline(total, stepClock()));
    expect(enough.chain).toEqual(reference.chain);
    expect(layoutOf(enough.manifest)).toBe(layoutOf(reference.manifest));

    // One unit short: refused on the last check, inside the second attempt.
    const short = new StageLog(total - 1, stepClock());
    const outcome = prepareAdventure(request, short);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("no-playable-layout");
      expect(outcome.manifest).toBe(fixture.manifest);
      expect(outcome.diagnostics.join(" ")).toMatch(/budget .*stopped before/);
    }
    expect(short.checkCount).toBe(total);
    expect(short.stages.indexOf("the game-floor attempt")).toBe(secondAttempt);
    expect(JSON.stringify(fixture.manifest)).toBe(source);
  });

  it("refuses scenes above the adventure triangle cap before analysing them", () => {
    expect(ADVENTURE_MAX_ANALYSED_TRIANGLES).toBeLessThanOrEqual(MAX_ANALYSED_TRIANGLES);
    const fixture = deskFixture();
    const count = ADVENTURE_MAX_ANALYSED_TRIANGLES + 1;
    const positions = new Float32Array(count * 9);
    for (let t = 0; t < count; t += 1) {
      const x = (t % 600) * 0.01 - 3;
      const z = Math.floor(t / 600) * 0.01 - 3;
      positions.set([x, 0.5, z, x, 0.5, z + 0.01, x + 0.01, 0.5, z], t * 9);
    }
    const dense = loadedAssets(fixture.manifest.assets[0]!.id, { positions, triangleCount: count });
    const deadline = new WorkDeadline(Infinity, stepClock());
    const outcome = prepareAdventure({ manifest: fixture.manifest, assets: dense, movement: RUNTIME, template: "reach-beacon", seed: "cap" }, deadline);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("no-playable-layout");
      expect(outcome.manifest).toBe(fixture.manifest);
      expect(outcome.diagnostics.join(" ")).toMatch(new RegExp(`at most ${ADVENTURE_MAX_ANALYSED_TRIANGLES}`));
    }
    expect(deadline.checkCount).toBe(0);
  });
});

function inputs(fixture: ReturnType<typeof deskFixture>) {
  return { manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME };
}
