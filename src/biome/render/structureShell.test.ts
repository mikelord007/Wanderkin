import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { registeredBiomeArt } from "../assets/biomes/index.js";
import { createStructureShell, SHELL_SINK, shellTolerance } from "./structureShell.js";

const CASES: { dimensions: [number, number, number]; scale: [number, number, number] }[] = [
  { dimensions: [0.36, 0.42, 0.36], scale: [1, 1, 1] }, // a generated stair step
  { dimensions: [1.8, 0.12, 0.36], scale: [1, 1, 1] }, // a bridge
  { dimensions: [1, 1, 1], scale: [0.5, 0.3, 1.2] }, // non-uniform authored box
  { dimensions: [0.2, 0.8, 0.25], scale: [-1, 1, 1] }, // mirrored, narrow
  { dimensions: [3, 0.5, 2], scale: [1, 1, 1] }, // large platform
];

describe("structure shells", () => {
  for (const art of registeredBiomeArt()) {
    for (const { dimensions, scale } of CASES) {
      it(`${art.id} ${dimensions.join("x")} @ ${scale.join(",")}: top equals and covers the collider top, sides within ±τ`, () => {
        const shell = createStructureShell({ dimensions, scale, style: art.wall, seed: `case-${dimensions.join()}` });
        const [w, h, d] = dimensions;
        const [hx, hy, hz] = [w / 2, h / 2, d / 2];
        const tau = shellTolerance(w * Math.abs(scale[0]), d * Math.abs(scale[2]));
        expect(tau).toBeLessThanOrEqual(0.012);
        expect(shell.tolerance.x * Math.abs(scale[0])).toBeCloseTo(tau, 10);
        expect(shell.tolerance.z * Math.abs(scale[2])).toBeCloseTo(tau, 10);

        const position = shell.mesh.geometry.getAttribute("position");
        const bottom = -hy - SHELL_SINK / Math.abs(scale[1]);
        for (let i = 0; i < position.count; i += 1) {
          expect(Math.abs(position.getX(i))).toBeLessThanOrEqual(hx + shell.tolerance.x + 1e-6);
          expect(Math.abs(position.getZ(i))).toBeLessThanOrEqual(hz + shell.tolerance.z + 1e-6);
          expect(position.getY(i)).toBeLessThanOrEqual(hy + 1e-6);
          expect(position.getY(i)).toBeGreaterThanOrEqual(bottom - 1e-6);
        }

        // The faces lying at exactly y = hy tile the whole collider top.
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        let topArea = 0;
        const corners = new Set<string>();
        let inward = 0;
        for (let i = 0; i < position.count; i += 3) {
          a.fromBufferAttribute(position, i);
          b.fromBufferAttribute(position, i + 1);
          c.fromBufferAttribute(position, i + 2);
          const normal = b.clone().sub(a).cross(c.clone().sub(a));
          const area = normal.length() / 2;
          if (area < 1e-14) continue;
          normal.normalize();
          if ([a, b, c].every((v) => Math.abs(v.y - hy) < 1e-6)) {
            expect(normal.y).toBeCloseTo(1, 6); // faces up
            topArea += area;
            for (const v of [a, b, c]) {
              if (Math.abs(Math.abs(v.x) - hx) < 1e-6 && Math.abs(Math.abs(v.z) - hz) < 1e-6) corners.add(`${Math.sign(v.x)},${Math.sign(v.z)}`);
            }
          } else if (Math.abs(normal.y) < 0.5) {
            // Walls face away from the box axis (never inside out).
            const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
            if (normal.x * centroid.x + normal.z * centroid.z <= 0) inward += 1;
          }
        }
        expect(topArea).toBeCloseTo(w * d, 5);
        expect(corners.size).toBe(4);
        expect(inward).toBe(0);
        shell.dispose();
      });
    }

    it(`${art.id}: deterministic per seed, varies across seeds`, () => {
      const make = (seed: string) => createStructureShell({ dimensions: [0.72, 0.42, 0.36], scale: [1, 1, 1], style: art.wall, seed });
      const one = make("s1");
      const again = make("s1");
      const other = make("s2");
      const arr = (s: ReturnType<typeof make>) => Array.from(s.mesh.geometry.getAttribute("position").array);
      expect(arr(one)).toEqual(arr(again));
      expect(arr(one)).not.toEqual(arr(other));
      for (const s of [one, again, other]) s.dispose();
    });
  }

  it("marks every stratum with a dark seam and staggered joints, so shade cannot flatten it into a box", () => {
    const base = registeredBiomeArt().find((art) => art.id === "tropical")!.wall;
    const style = { ...base, strata: [5, 5] as const, notches: [0, 0] as const };
    const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sideStats = (joints: readonly [number, number], seam: number) => {
      const shell = createStructureShell({ dimensions: [0.6, 0.5, 0.4], scale: [1, 1, 1], style: { ...style, joints, seam }, seed: "seams" });
      const pos = shell.mesh.geometry.getAttribute("position");
      const col = shell.mesh.geometry.getAttribute("color");
      const nrm = shell.mesh.geometry.getAttribute("normal");
      let sideTriangles = 0;
      let darkest = Infinity;
      let lightest = 0;
      for (let t = 0; t < pos.count; t += 3) {
        if (Math.abs(nrm.getY(t)) > 0.3) continue; // side walls only
        sideTriangles += 1;
        const l = luma(col.getX(t), col.getY(t), col.getZ(t));
        darkest = Math.min(darkest, l);
        lightest = Math.max(lightest, l);
      }
      shell.dispose();
      return { sideTriangles, contrast: lightest / Math.max(darkest, 1e-6) };
    };
    const plain = sideStats([0, 0], 0);
    const seamed = sideStats([0, 0], 0.8);
    const jointed = sideStats([6, 6], 0.8);
    // Joints split columns (seam strips are always there; `seam` sets their darkness).
    expect(jointed.sideTriangles).toBeGreaterThan(seamed.sideTriangles);
    // Seams push the darkest side tone well below the bands (linear luma ratio).
    expect(seamed.contrast).toBeGreaterThan(plain.contrast * 1.3);
    expect(seamed.contrast).toBeGreaterThan(4);
  });

  it("dispose releases its geometry and material exactly once, and it is never raycast", () => {
    const art = registeredBiomeArt()[0]!;
    const shell = createStructureShell({ dimensions: [1, 0.4, 0.5], scale: [1, 1, 1], style: art.wall, seed: "d" });
    let geometries = 0;
    let materials = 0;
    shell.mesh.geometry.addEventListener("dispose", () => { geometries += 1; });
    (shell.mesh.material as THREE.Material).addEventListener("dispose", () => { materials += 1; });
    shell.mesh.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(shell.mesh)).toHaveLength(0);
    shell.dispose();
    expect(geometries).toBe(1);
    expect(materials).toBe(1);
  });
});
