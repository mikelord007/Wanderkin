/**
 * Desert cactus families (Desert art; built on the shared shape kit).
 *
 * Chunky, readable silhouettes at gameplay distance:
 *  - saguaro: a fat ribbed trunk with asymmetric arms that leave the trunk
 *    through a short knuckle, round a soft elbow and rise, domed at the tips;
 *  - column: a single tall ribbed column with a gentle curve;
 *  - organ pipe: five to seven columns fanning from one base;
 *  - barrel: a squat, bulging ribbed barrel with a flower crown;
 *  - prickly pear: thick oval pads joined rim to rim, with fruit;
 *  - agave / echeveria: blue-green succulent rosettes.
 * Ribs are real geometry; ridges are lighter than grooves and the tops are a
 * touch fresher, so they read under any light without texture noise.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { blade, builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

type Ramp = ReturnType<typeof linearRamp>;

/** A ribbed column along a spine, closed with a rounded dome. */
function ribbed(
  kit: MeshKit,
  spine: (t: number) => THREE.Vector3,
  radius: (t: number) => number,
  ribs: number,
  ramp: Ramp,
  rings: number,
  ribDepth = 0.1,
): void {
  kit.add(
    tube({
      spine,
      radius: (t, a) => radius(Math.min(1, t)) * (1 + ribDepth * Math.cos(ribs * a)),
      rings,
      sides: ribs * 2,
      cap: "dome",
      domeScale: 0.9,
      color: (t, a) => rampAt(ramp, Math.min(1, Math.max(0, 0.4 + 0.24 * Math.cos(ribs * a) + Math.min(1, t) * 0.14 + (t > 1 ? 0.08 : 0)))),
    }),
    { color: "attribute", smooth: true },
  );
}

export interface SaguaroArm {
  /** Where the arm leaves the trunk, 0..1 of the trunk height. */
  at: number;
  /** Direction around the trunk, radians. */
  angle: number;
  /** Horizontal reach of the elbow beyond the trunk surface (unit-ish). */
  reach: number;
  /** How far the arm rises after the elbow. */
  rise: number;
  /** Arm radius relative to the trunk (default 0.68). */
  thickness?: number | undefined;
}

export function saguaro(options: { arms: readonly SaguaroArm[]; radius?: number; curve?: number; ribs?: number; blossoms?: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const ramp = linearRamp(tones.cactus);
    const R = options.radius ?? 0.12;
    const ribs = options.ribs ?? 10;
    const curve = options.curve ?? 0;
    const spine = (t: number) => new THREE.Vector3(curve * t * t, t, 0);
    // Slightly pinched base, full body, gentle taper into the dome.
    const radius = (t: number) => R * (0.84 + 0.16 * Math.min(1, t / 0.1)) * (1 - 0.1 * t);
    ribbed(kit, spine, radius, ribs, ramp, 7);
    for (const arm of options.arms) {
      const start = spine(arm.at);
      const dir = new THREE.Vector3(Math.cos(arm.angle), 0, Math.sin(arm.angle));
      const r = R * (arm.thickness ?? 0.68);
      // Knuckle out of the trunk (a little upward), a soft elbow, then up.
      const knuckle = start.clone().addScaledVector(dir, R * 0.8).add(new THREE.Vector3(0, r * 0.3, 0));
      const elbow = knuckle.clone().addScaledVector(dir, arm.reach).add(new THREE.Vector3(0, r * 0.4, 0));
      const tip = elbow.clone().add(new THREE.Vector3(0, arm.rise, 0)).addScaledVector(dir, arm.reach * 0.12);
      const armSpine = (t: number) => {
        // Cubic Bézier start → knuckle → elbow → tip.
        const u = 1 - t;
        return start.clone().multiplyScalar(u * u * u)
          .addScaledVector(knuckle, 3 * u * u * t)
          .addScaledVector(elbow, 3 * u * t * t)
          .addScaledVector(tip, t * t * t);
      };
      ribbed(kit, armSpine, (t) => r * (1 - 0.08 * t), Math.max(6, ribs - 2), ramp, 6);
    }
    const blossoms = options.blossoms ?? 0;
    const top = spine(1);
    const random = builderRandom(options.seed);
    for (let i = 0; i < blossoms; i += 1) {
      const a = (i / Math.max(1, blossoms)) * Math.PI * 2 + random();
      kit.add(
        lobe({ radius: [R * 0.3, R * 0.2, R * 0.3], detail: 1, jitter: 0.1, seed: options.seed + i, center: [top.x + Math.cos(a) * R * 0.45, top.y + R * 0.78, top.z + Math.sin(a) * R * 0.45] }),
        { color: rampTone(tones.accent, { bias: 0.3 }), smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.12, strength: 0.32 } });
  };
}

/** Five to seven columns fanning from one base (organ pipe). */
export function organPipe(options: { stems: number; seed: number; ribs?: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones.cactus);
    const ribs = options.ribs ?? 7;
    for (let i = 0; i < options.stems; i += 1) {
      const centre = i === 0;
      const a = (i / options.stems) * Math.PI * 2 + random() * 0.5;
      const d = centre ? 0 : 0.06 + random() * 0.04;
      const h = centre ? 1 : 0.55 + random() * 0.4;
      const splay = centre ? 0 : 0.05 + random() * 0.06;
      const r = centre ? 0.075 : 0.058 + random() * 0.012;
      const base = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      ribbed(
        kit,
        // Rise out of the shared base, then straighten upward.
        (t) => base.clone().add(new THREE.Vector3(Math.cos(a) * splay * Math.sqrt(t), h * t, Math.sin(a) * splay * Math.sqrt(t))),
        (t) => r * (0.85 + 0.15 * Math.min(1, t / 0.12)) * (1 - 0.08 * t),
        ribs,
        ramp,
        6,
      );
    }
    return kit.finish({ groundAo: { height: 0.15, strength: 0.32 } });
  };
}

/** Squat, bulging ribbed barrel with a crown of small flowers. */
export function barrel(options: { ribs: number; squat: number; flowers: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const ramp = linearRamp(tones.cactus);
    const R = 0.5 * options.squat;
    const H = 1;
    ribbed(
      kit,
      (t) => new THREE.Vector3(0, H * 0.82 * t, 0),
      // Bulge in the middle, narrower at the ground, rounded shoulder.
      (t) => R * (0.78 + 0.32 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.8))),
      options.ribs,
      ramp,
      6,
      0.12,
    );
    const random = builderRandom(options.seed);
    const top = H * 0.82 + R * 0.55;
    for (let i = 0; i < options.flowers; i += 1) {
      const a = (i / options.flowers) * Math.PI * 2 + random() * 0.4;
      kit.add(
        lobe({ radius: [R * 0.16, R * 0.11, R * 0.16], detail: 1, jitter: 0.12, seed: options.seed + i, center: [Math.cos(a) * R * 0.32, top, Math.sin(a) * R * 0.32] }),
        { color: rampTone(tones.accent, { bias: 0.2 + random() * 0.2 }), smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.2, strength: 0.3 } });
  };
}

/** Thick oval pads joined rim to rim, with a few fruits on the top rims. */
export function pricklyPear(options: { pads: number; fruits: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones.cactus);
    type Pad = { c: THREE.Vector3; yaw: number; tilt: number; size: number };
    const pads: Pad[] = [{ c: new THREE.Vector3(0, 0.24, 0), yaw: random() * Math.PI, tilt: 0, size: 0.24 }];
    for (let i = 1; i < options.pads; i += 1) {
      const parent = pads[Math.min(pads.length - 1, Math.floor(random() * pads.length))]!;
      const side = random() < 0.5 ? -1 : 1;
      const size = parent.size * (0.72 + random() * 0.18);
      // Pads fan outward: each child leans away from the parent's axis.
      const tilt = parent.tilt * 0.5 + side * (0.45 + random() * 0.35);
      const yaw = parent.yaw + (random() - 0.5) * 0.7;
      // The child's lower rim sits on the parent's upper shoulder, in its plane.
      const rim = new THREE.Vector3(side * parent.size * 0.62, parent.size * 0.7, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), parent.tilt)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), parent.yaw);
      const up = new THREE.Vector3(0, size * 0.85, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
      pads.push({ c: parent.c.clone().add(rim).add(up), yaw, tilt, size });
    }
    pads.forEach((pad, i) => {
      const g = lobe({ radius: [pad.size * 0.72, pad.size, pad.size * 0.36], detail: 1, jitter: 0.05, seed: options.seed * 3 + i });
      g.rotateZ(pad.tilt);
      g.rotateY(pad.yaw);
      g.translate(pad.c.x, pad.c.y, pad.c.z);
      kit.add(g, { color: (p, n) => rampAt(ramp, Math.min(1, Math.max(0, 0.36 + n.y * 0.22 + p.y * 0.2 + (i % 2 ? -0.05 : 0.04)))), smooth: true });
    });
    const fruit = tones.fruit ?? tones.accent;
    const tops = [...pads].sort((a, b) => b.c.y - a.c.y).slice(0, Math.max(1, Math.ceil(pads.length / 2)));
    for (let i = 0; i < options.fruits; i += 1) {
      const pad = tops[i % tops.length]!;
      const along = (random() - 0.5) * pad.size * 0.9;
      const at = new THREE.Vector3(along, pad.size * 0.95, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), pad.tilt)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), pad.yaw)
        .add(pad.c);
      kit.add(lobe({ radius: [0.045, 0.06, 0.045], detail: 1, jitter: 0.05, seed: i + 40, center: [at.x, at.y, at.z] }), {
        color: rampTone(fruit, { heightWeight: 0.3 }),
        smooth: true,
      });
    }
    return kit.finish({ groundAo: { height: 0.15, strength: 0.28 } });
  };
}

/** Blue-green agave: thick, pointed, gently arching leaves. */
export function agave(options: { leaves: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones.succulent ?? tones.cactus);
    for (let i = 0; i < options.leaves; i += 1) {
      // Inner leaves stand up, outer ones arch out.
      const inner = i < options.leaves / 3;
      const yaw = (i / options.leaves) * Math.PI * 2 * 2.39 + random() * 0.3;
      const length = (inner ? 0.75 : 1) * (0.85 + random() * 0.25);
      const rise = inner ? 1.25 : 0.7 + random() * 0.25;
      const shade = (random() - 0.5) * 0.2;
      const leaf = blade({
        length,
        segments: 5,
        width: (t) => length * 0.12 * (1 - t) ** 0.8,
        lift: (t) => length * (Math.sin(rise) * t - (inner ? 0.1 : 0.35) * t * t),
        fold: 0.55,
        color: (t, side) => rampAt(ramp, Math.min(1, Math.max(0, 0.3 + t * 0.45 + (side === 0 ? 0.1 : 0) + shade))),
      });
      leaf.rotateY(yaw);
      kit.add(leaf, { color: "attribute", smooth: true, doubleSided: true });
    }
    return kit.finish({ fit: "size", groundAo: { height: 0.2, strength: 0.25 } });
  };
}

/** Echeveria: a low rosette of plump, pointed leaves in a spiral. */
export function echeveria(options: { leaves: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const succulent = tones.succulent ?? tones.cactus;
    for (let i = 0; i < options.leaves; i += 1) {
      const t = i / options.leaves;
      const yaw = i * 2.39996;
      const out = 0.1 + 0.3 * (1 - t);
      const size = 0.1 + 0.12 * (1 - t);
      const g = lobe({ radius: [size, size * 0.45, size * 0.6], detail: 1, jitter: 0.04, seed: options.seed + i });
      g.rotateZ(0.35 + t * 0.6);
      g.translate(out, size * 0.4 + t * 0.15, 0);
      g.rotateY(yaw + random() * 0.1);
      kit.add(g, { color: rampTone(succulent, { heightWeight: 0.5, bias: (t - 0.5) * 0.3 }), smooth: true });
    }
    return kit.finish({ fit: "size", groundAo: { height: 0.25, strength: 0.25 } });
  };
}
