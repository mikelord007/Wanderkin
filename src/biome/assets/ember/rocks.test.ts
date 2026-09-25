/**
 * Ember rock builders: the shapes carry the design (flat lit hex tops,
 * craters that face inward, glass blades on a flat base), so pin them.
 * Budgets, radii and heights per family are covered by validate.test.ts.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { EMBER_ART } from "../biomes/ember.js";
import { variantMesh } from "../compose.js";
import type { UnitMesh } from "../types.js";
import { cinderCone, columnCluster, emberRocks, emberSpires, hexColumn, latticeCell, lavaLobes } from "./rocks.js";

const tones = EMBER_ART.tones;
const luminance = (mesh: UnitMesh, i: number) => 0.2126 * mesh.colors[i * 3]! + 0.7152 * mesh.colors[i * 3 + 1]! + 0.0722 * mesh.colors[i * 3 + 2]!;

function faces(mesh: UnitMesh) {
  const out: { normal: THREE.Vector3; centre: THREE.Vector3; lum: number }[] = [];
  const p = (i: number) => new THREE.Vector3(mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!);
  for (let t = 0; t < mesh.index.length; t += 3) {
    const [a, b, c] = [mesh.index[t]!, mesh.index[t + 1]!, mesh.index[t + 2]!];
    const normal = new THREE.Vector3().crossVectors(p(b).sub(p(a)), p(c).sub(p(a)));
    if (normal.lengthSq() < 1e-14) continue;
    out.push({ normal: normal.normalize(), centre: p(a).add(p(b)).add(p(c)).multiplyScalar(1 / 3), lum: (luminance(mesh, a) + luminance(mesh, b) + luminance(mesh, c)) / 3 });
  }
  return out;
}

describe("basalt columns", () => {
  it("a column is a closed-topped hexagonal prism with outward faces", () => {
    const g = hexColumn({ x: 0, z: 0, radius: 0.1, height: 1 }, 1);
    const position = g.getAttribute("position");
    expect(position.count / 3).toBe(28);
    g.computeVertexNormals();
    const normal = g.getAttribute("normal");
    let up = 0;
    for (let i = 0; i < position.count; i += 3) {
      const n = new THREE.Vector3().fromBufferAttribute(normal, i);
      const c = new THREE.Vector3().fromBufferAttribute(position, i);
      // Every face turns away from the axis or up: none point inward/down.
      expect(n.y > 0.5 || n.x * c.x + n.z * c.z > 0).toBe(true);
      if (n.y > 0.99) up += 1;
    }
    expect(up).toBe(4);
    expect(hexColumn({ x: 0, z: 0, radius: 0.1, height: 1, joint: 0.5 }, 1).getAttribute("position").count / 3).toBe(52);
  });

  it("lattice cells pack columns edge to edge", () => {
    const [x, z] = latticeCell(1, 0, 0.2);
    const [x2, z2] = latticeCell(0, 1, 0.2);
    expect(Math.hypot(x, z)).toBeCloseTo(0.2, 6);
    expect(Math.hypot(x2, z2)).toBeCloseTo(0.2, 6);
  });

  it("flat tops are pale ash, clearly lighter than the dark sides", () => {
    const mesh = columnCluster({ seed: 1, columns: [{ x: 0, z: 0, radius: 0.1, height: 1 }, { x: 0.18, z: 0, radius: 0.1, height: 0.6 }] })(tones);
    const all = faces(mesh);
    const tops = all.filter((f) => f.normal.y > 0.95);
    const sides = all.filter((f) => Math.abs(f.normal.y) < 0.2);
    const mean = (list: typeof all) => list.reduce((s, f) => s + f.lum, 0) / list.length;
    expect(tops.length).toBeGreaterThan(0);
    expect(mean(tops)).toBeGreaterThan(mean(sides) * 2);
  });

  it("fallen pieces lie on a flat side, longer than tall", () => {
    const mesh = columnCluster({ seed: 2, fit: "size", fallen: true, columns: [{ x: 0, z: 0, radius: 0.12, height: 0.7 }] })(tones);
    expect(mesh.maxY - mesh.minY).toBeLessThan(0.45);
    // A flat face rests on the ground: several faces point straight down.
    expect(faces(mesh).filter((f) => f.normal.y < -0.99).length).toBeGreaterThanOrEqual(2);
  });
});

describe("cinder cones and lava", () => {
  it("the crater faces inward and glows only when asked", () => {
    const hot = cinderCone({ seed: 3, glow: true })(tones);
    const cold = cinderCone({ seed: 3 })(tones);
    const magma = new THREE.Color(tones.magma!.base);
    const red = (mesh: UnitMesh) => {
      let n = 0;
      for (let i = 0; i < mesh.colors.length / 3; i += 1) {
        const r = mesh.colors[i * 3]!;
        const g = mesh.colors[i * 3 + 1]!;
        if (r > magma.r * 0.5 && r > g * 4) n += 1;
      }
      return n;
    };
    expect(red(hot)).toBeGreaterThan(10);
    expect(red(cold)).toBe(0);
    expect(hot.positions).toEqual(cold.positions);
    // Inward-facing faces exist near the top (a real crater, not a cap).
    const crater = faces(hot).filter((f) => f.centre.y > 0.7 && f.normal.x * f.centre.x + f.normal.z * f.centre.z < 0);
    expect(crater.length).toBeGreaterThan(8);
  });

  it("molten toes glow at the ground only", () => {
    const mesh = lavaLobes({ seed: 5, glow: true, lobes: [[0, 0, 0.4, 0.6, 0.32]] })(tones);
    let lowRed = 0;
    let highRed = 0;
    for (let i = 0; i < mesh.positions.length / 3; i += 1) {
      const isRed = mesh.colors[i * 3]! > mesh.colors[i * 3 + 1]! * 4 && mesh.colors[i * 3]! > 0.15;
      if (!isRed) continue;
      if (mesh.positions[i * 3 + 1]! < 0.15) lowRed += 1;
      else highRed += 1;
    }
    expect(lowRed).toBeGreaterThan(0);
    expect(highRed).toBe(0);
  });
});

describe("the Ember rock set", () => {
  it("offers distinct silhouettes: tall slender spires and wide low heroes", () => {
    const aspect = (mesh: UnitMesh) => mesh.radius / (mesh.maxY - mesh.minY);
    const spires = emberSpires().map((b) => aspect(variantMesh(tones, b)));
    const heroes = emberRocks().hero.map((b) => aspect(variantMesh(tones, b)));
    expect(Math.max(...spires)).toBeLessThanOrEqual(0.34);
    expect(Math.max(...heroes)).toBeGreaterThan(0.6);
    expect(Math.min(...heroes)).toBeLessThan(0.45);
    // No two heroes share a footprint-to-height ratio and triangle count.
    const keys = emberRocks().hero.map((b) => { const m = variantMesh(tones, b); return `${aspect(m).toFixed(3)}:${m.triangles}`; });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is deterministic", () => {
    const [a] = emberRocks().hero;
    const [b] = emberRocks().hero;
    expect(Array.from(a!(tones).positions)).toEqual(Array.from(b!(tones).positions));
    expect(Array.from(a!(tones).colors)).toEqual(Array.from(b!(tones).colors));
  });
});
