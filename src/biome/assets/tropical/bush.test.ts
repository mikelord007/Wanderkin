import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { TROPICAL_ART } from "../biomes/tropical.js";
import { linearRamp } from "../meshKit.js";
import { broadleafClump, leafGeometry, leafyBush, orientFacing, tropicalFlowers, tropicalGrass } from "./bush.js";

const tones = TROPICAL_ART.tones;
const round = leafyBush({
  masses: [{ c: [0, 0.3, 0], r: 0.3 }, { c: [0.22, 0.2, 0.1], r: 0.22 }, { c: [-0.2, 0.22, -0.1], r: 0.22 }],
  leaves: 24,
  leafSize: 1,
  seed: 3,
});

describe("tropical bush builders", () => {
  it("a leaf is a folded, rounded blade: 6 triangles, midrib above the edges", () => {
    const g = leafGeometry({ length: 1, width: 0.4, droop: 0.2, ramp: linearRamp(tones.foliage), shade: 0, sway: [0.2, 0.8] });
    expect(g.index!.count / 3).toBe(6);
    const p = g.getAttribute("position");
    expect(p.getY(5)).toBeGreaterThan(p.getY(3));
    expect(p.getY(5)).toBeGreaterThan(p.getY(4));
  });

  it("orientFacing points a part along dir with its face toward the given normal", () => {
    const g = leafGeometry({ length: 1, width: 0.4, droop: 0, ramp: linearRamp(tones.foliage), shade: 0, sway: [0, 0] });
    orientFacing(g, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0));
    const p = g.getAttribute("position");
    // Tip went up; the raised midrib now bulges toward +X.
    expect(p.getY(6)).toBeCloseTo(1, 5);
    expect(p.getX(5)).toBeGreaterThan(p.getX(3));
  });

  it("a leafy bush is masses plus a leaf fringe, not a single blob", () => {
    const mesh = round(tones);
    // 3 detail-1 masses (80 triangles each) + 24 double-sided leaves (12 each).
    expect(mesh.triangles).toBe(3 * 80 + 24 * 12);
    expect(mesh.maxY).toBeCloseTo(1, 5);
    // Several distinct greens: count clearly different vertex colours.
    const buckets = new Set<string>();
    for (let i = 0; i < mesh.colors.length; i += 3) buckets.add(`${Math.round(mesh.colors[i]! * 12)}:${Math.round(mesh.colors[i + 1]! * 12)}:${Math.round(mesh.colors[i + 2]! * 12)}`);
    expect(buckets.size).toBeGreaterThanOrEqual(8);
  });

  it("is deterministic", () => {
    const a = round(tones);
    const b = round(tones);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  it("broad-leaf clumps, grass and flowers stay within their unit budgets", () => {
    const clump = broadleafClump({ leaves: 6, leafLength: 0.46, leafWidth: 0.4, seed: 1 })(tones);
    expect(clump.maxY).toBeCloseTo(1, 5);
    expect(clump.triangles).toBeLessThanOrEqual(900);
    const grass = tropicalGrass({ blades: 7, splay: 0.5, seed: 1 })(tones);
    expect(grass.triangles).toBe(7 * 5 * 2);
    const flowers = tropicalFlowers({ stems: 3, seed: 1 })(tones);
    expect(flowers.triangles).toBeLessThanOrEqual(160);
  });
});
