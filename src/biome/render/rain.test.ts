import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { groundAt, sampleGroundHeights } from "../groundHeights.js";
import { boxSoup } from "../geometryFixtures.js";
import { mergeTriangleSoups } from "../../scene/transform.js";
import { TriangleGrid } from "../../scene/spatial.js";
import type { BiomeGroundHeights } from "../types.js";
import {
  createRain,
  RAIN_MAX_DROPS,
  RAIN_REDUCED_MOTION_SHARE,
  RainSimulation,
  SPLASH_LIFE,
  SPLASH_POOL,
  type RainInput,
} from "./rain.js";

const UNIT = 0.175;

/** A 4 × 4 floor at y = 0 with a 1 × 1 table whose top is at y = 0.8. */
function tableScene() {
  const soup = mergeTriangleSoups([boxSoup([0, -0.05, 0], [4, 0.1, 4]), boxSoup([1, 0.4, 1], [1, 0.8, 1])]);
  const grid = new TriangleGrid(soup, 0.25);
  return sampleGroundHeights(grid, { min: [-2, 0, -2], max: [2, 0.8, 2] }, UNIT)!;
}

/** A flat field at `height` everywhere (no edges). */
function flatField(height: number): BiomeGroundHeights {
  const cols = 64;
  return {
    origin: [-8, -8],
    cell: 0.25,
    cols,
    rows: cols,
    heights: new Float32Array(cols * cols).fill(height),
    edge: new Uint8Array(cols * cols),
    unit: UNIT,
  };
}

function input(overrides: Partial<RainInput> = {}): RainInput {
  return {
    style: { intensity: 1 },
    ground: flatField(0),
    water: null,
    wind: { direction: [0.6, 0.8], strength: 0.45 },
    quality: "standard",
    reducedMotion: false,
    seed: "test",
    ...overrides,
  };
}

function run(sim: RainSimulation, seconds: number, from = 0, fps = 60) {
  const focus = new THREE.Vector3(0, 0, 0);
  const steps = Math.round(seconds * fps);
  for (let i = 0; i <= steps; i += 1) sim.step(1 / fps, from + i / fps, focus, 1.5);
  return from + steps / fps;
}

describe("ground height field", () => {
  it("returns the highest surface under each cell: the table top over the table, the floor elsewhere", () => {
    const field = tableScene();
    const out = { height: 0, splash: false };
    expect(groundAt(field, 1, 1, out).height).toBeCloseTo(0.8, 3);
    expect(out.splash).toBe(true);
    expect(groundAt(field, -1, -1, out).height).toBeCloseTo(0, 3);
    expect(out.splash).toBe(true);
  });

  it("marks ledge edges (no splash) and reports open sky outside the grid", () => {
    const field = tableScene();
    const out = { height: 0, splash: false };
    // Just inside the table's edge: the neighbouring cell is the floor 0.8 below.
    groundAt(field, 1.5 - field.cell * 0.5, 1, out);
    expect(out.splash).toBe(false);
    groundAt(field, 50, 50, out);
    expect(Number.isNaN(out.height)).toBe(true);
    expect(out.splash).toBe(false);
  });

  it("is bounded: at most 128 cells per axis and never finer than a tenth of the character", () => {
    const field = tableScene();
    expect(field.cols).toBeLessThanOrEqual(128);
    expect(field.rows).toBeLessThanOrEqual(128);
    expect(field.cell).toBeGreaterThanOrEqual(UNIT * 0.1 - 1e-9);
    expect(field.heights.length).toBe(field.cols * field.rows);
  });
});

describe("rain simulation", () => {
  it("never exceeds 2,000 drops or 200 splashes, and scales with intensity and quality", () => {
    expect(new RainSimulation(input()).maxDrops).toBe(RAIN_MAX_DROPS);
    expect(new RainSimulation(input({ style: { intensity: 5 } })).maxDrops).toBe(RAIN_MAX_DROPS);
    expect(new RainSimulation(input({ style: { intensity: 0.5 } })).maxDrops).toBe(RAIN_MAX_DROPS / 2);
    expect(new RainSimulation(input({ style: { intensity: Number.NaN } })).maxDrops).toBe(0);
    const reduced = new RainSimulation(input({ quality: "reduced" }));
    expect(reduced.maxDrops).toBe(RAIN_MAX_DROPS / 2);
    expect(reduced.poolSize).toBe(SPLASH_POOL / 2);
    const sim = new RainSimulation(input());
    run(sim, 3);
    expect(sim.drops.length).toBe(RAIN_MAX_DROPS * 3);
    expect(sim.splashes.length).toBe(SPLASH_POOL * 4);
    expect(sim.liveSplashes(3)).toBeLessThanOrEqual(SPLASH_POOL);
    expect(sim.spawned).toBeGreaterThan(SPLASH_POOL);
    // The pool was the limit, so some landings were skipped rather than overwriting live splashes.
    expect(sim.skipped).toBeGreaterThan(0);
  });

  it("drops stay in the box around the focus, above the ground, and fall with the wind", () => {
    const sim = new RainSimulation(input());
    run(sim, 2);
    const half = sim.boxHalf;
    for (let i = 0; i < sim.active; i += 1) {
      expect(Math.abs(sim.drops[i * 3]!)).toBeLessThanOrEqual(half + 1e-4);
      expect(Math.abs(sim.drops[i * 3 + 2]!)).toBeLessThanOrEqual(half + 1e-4);
      expect(sim.drops[i * 3 + 1]!).toBeGreaterThan(0);
    }
    expect(sim.velocity.y).toBeLessThan(0);
    expect(sim.velocity.x).toBeGreaterThan(0);
    expect(sim.velocity.z).toBeGreaterThan(0);
  });

  it("splashes land at the ground height and are gone within the splash life", () => {
    const sim = new RainSimulation(input({ ground: flatField(0.3) }));
    const end = run(sim, 1);
    let checked = 0;
    for (let i = 0; i < sim.poolSize; i += 1) {
      const birth = sim.splashes[i * 4 + 3]!;
      if (birth < 0) continue;
      expect(sim.splashes[i * 4 + 1]).toBeCloseTo(0.3, 5);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
    expect(SPLASH_LIFE).toBeLessThanOrEqual(0.3);
    // With rain stopped (no further steps) every splash has faded a life later.
    expect(sim.liveSplashes(end + SPLASH_LIFE + 1e-3)).toBe(0);
  });

  it("splashes on the table top over the table, never on a ledge edge", () => {
    const field = tableScene();
    const sim = new RainSimulation(input({ ground: field }));
    run(sim, 2);
    const out = { height: 0, splash: false };
    let onTable = 0;
    for (let i = 0; i < sim.poolSize; i += 1) {
      if (sim.splashes[i * 4 + 3]! < 0) continue;
      const [x, y, z] = [sim.splashes[i * 4]!, sim.splashes[i * 4 + 1]!, sim.splashes[i * 4 + 2]!];
      groundAt(field, x, z, out);
      expect(out.splash).toBe(true);
      expect(y).toBeCloseTo(out.height, 5);
      if (y > 0.5) onTable += 1;
    }
    expect(onTable).toBeGreaterThan(0);
  });

  it("lands on the water ring outside the height field, and nowhere over open sky", () => {
    const small: BiomeGroundHeights = { ...flatField(0), origin: [-0.1, -0.1], cols: 1, rows: 1, heights: new Float32Array([0]), edge: new Uint8Array(1) };
    const water = { center: [0, -0.2, 0] as [number, number, number], innerRadius: 0.4, outerRadius: 0.6 };
    const out = { height: 0, splash: false };
    const sim = new RainSimulation(input({ ground: small, water }));
    expect(sim.landing(0.5, 0, out).height).toBeCloseTo(-0.2);
    expect(out.splash).toBe(true);
    expect(Number.isNaN(sim.landing(5, 5, out).height)).toBe(true);
    const dry = new RainSimulation(input({ ground: small }));
    run(dry, 1);
    for (let i = 0; i < dry.poolSize; i += 1) {
      if (dry.splashes[i * 4 + 3]! >= 0) expect(Math.hypot(dry.splashes[i * 4]!, dry.splashes[i * 4 + 2]!)).toBeLessThan(0.2);
    }
  });

  it("reduced motion keeps a quarter of the drops, falls slower and never splashes", () => {
    const normal = new RainSimulation(input());
    const calm = new RainSimulation(input({ reducedMotion: true }));
    expect(calm.active).toBe(Math.floor(RAIN_MAX_DROPS * RAIN_REDUCED_MOTION_SHARE));
    expect(Math.abs(calm.velocity.y)).toBeLessThan(Math.abs(normal.velocity.y));
    run(calm, 2);
    expect(calm.spawned).toBe(0);
    calm.setReducedMotion(false);
    expect(calm.active).toBe(RAIN_MAX_DROPS);
    run(calm, 1, 3);
    expect(calm.spawned).toBeGreaterThan(0);
  });

  it("is deterministic for a seed and allocation-stable", () => {
    const a = new RainSimulation(input());
    const b = new RainSimulation(input());
    run(a, 1);
    run(b, 1);
    expect(Array.from(a.drops.slice(0, 30))).toEqual(Array.from(b.drops.slice(0, 30)));
    const buffer = a.drops;
    run(a, 1, 2);
    expect(a.drops).toBe(buffer);
  });
});

describe("rain layer", () => {
  it("draws streaks and splashes in two meshes and owns every resource it creates", () => {
    const rain = createRain(input())!;
    const meshes: THREE.Mesh[] = [];
    rain.object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
    });
    expect(meshes.map((m) => m.name).sort()).toEqual(["biome-rain", "biome-rain-splashes"]);
    for (const mesh of meshes) {
      expect(rain.materials).toContain(mesh.material);
      expect(rain.geometries).toContain(mesh.geometry);
      expect(mesh.castShadow).toBe(false);
    }
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1, 2);
    rain.update(1 / 60, 0, camera);
    rain.update(1 / 60, 1 / 60, camera);
    rain.setReducedMotion(true);
    expect(meshes.find((m) => m.name === "biome-rain-splashes")!.visible).toBe(false);
    expect((meshes.find((m) => m.name === "biome-rain")!.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(rain.simulation.active);
  });

  it("draws nothing at zero intensity", () => {
    expect(createRain(input({ style: { intensity: 0 } }))).toBeNull();
  });
});

describe("rain in the biome layer (real scan)", () => {
  it("Monsoon draws rain within the draw budget, other looks never do, and props go glossy", async () => {
    const { DEFAULT_MOVEMENT_CONFIG } = await import("@shared/index.js");
    const { toMiniatureScale } = await import("../../game/core/characterScale.js");
    const { sampleScanFixture } = await import("../geometryFixtures.js");
    const { prepareBiomeLayout } = await import("../placement.js");
    const { getBiomeDefinition } = await import("../presets.js");
    const { createBiomeLayer } = await import("./decorLayer.js");
    const fixture = sampleScanFixture("sample-rodin-room-corner", true);
    const movement = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);
    const layer = (id: "monsoon" | "alpine", quality: "standard" | "reduced") => {
      const definition = getBiomeDefinition(id);
      const layout = prepareBiomeLayout({ manifest: fixture.manifest, assets: fixture.assets, movement, definition, seed: "rain", quality });
      return createBiomeLayer({ definition, layout, quality, reducedMotion: false });
    };
    const names = (root: THREE.Object3D) => {
      const out: string[] = [];
      root.traverse((child) => out.push(child.name));
      return out;
    };
    for (const quality of ["standard", "reduced"] as const) {
      const monsoon = layer("monsoon", quality);
      expect(monsoon.stats.drawCalls).toBeLessThanOrEqual(monsoon.stats.drawCallBudget);
      expect(monsoon.stats.skipped).toEqual([]);
      expect(monsoon.stats.rainDrops).toBe(quality === "standard" ? RAIN_MAX_DROPS : RAIN_MAX_DROPS / 2);
      expect(names(monsoon.root)).toContain("biome-rain");
      expect(names(monsoon.root)).toContain("biome-rain-splashes");
      let glossy = 0;
      monsoon.root.traverse((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (child.name.startsWith("biome-props") && material) {
          expect(material.roughness).toBeLessThan(0.8);
          glossy += 1;
        }
      });
      expect(glossy).toBeGreaterThan(0);
      const camera = new THREE.PerspectiveCamera();
      camera.position.set(0, 1, 1);
      monsoon.update(0, 1 / 60, camera);
      monsoon.update(1 / 60, 1 / 60, camera);
      monsoon.update(2 / 60, 1 / 60); // no camera: rain just holds
      monsoon.dispose();
      const alpine = layer("alpine", quality);
      expect(alpine.stats.rainDrops).toBe(0);
      expect(names(alpine.root).some((name) => name.startsWith("biome-rain"))).toBe(false);
      alpine.dispose();
    }
  });
});
