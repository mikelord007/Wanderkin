/**
 * Cactus families: tall ribbed columns, branching saguaros with asymmetric
 * elbowed arms, squat barrels, clustered columns and pad (prickly-pear)
 * cacti. Ribs are real geometry (alternating ridge/groove vertices), lit
 * ridges and darker grooves come from the tone ramp, and every column ends
 * in a rounded dome.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

export interface CactusArm {
  /** Height on the trunk where the arm leaves, 0..1 of the trunk. */
  at: number;
  /** Direction around the trunk, radians. */
  angle: number;
  /** Horizontal reach and upward rise, native units. */
  reach: number;
  rise: number;
  /** Arm radius relative to the trunk. */
  thickness?: number | undefined;
}

export interface CactusOptions {
  height: number;
  radius: number;
  ribs: number;
  /** Rib depth as a fraction of the radius. */
  ribDepth?: number | undefined;
  /** Sideways curve of the trunk top, native units. */
  curve?: number | undefined;
  arms?: readonly CactusArm[] | undefined;
  /** Small accent blossoms on the crown. */
  blossoms?: number | undefined;
  ramp?: string | undefined;
}

function ribbedColumn(
  kit: MeshKit,
  spine: (t: number) => THREE.Vector3,
  radius: (t: number) => number,
  ribs: number,
  ribDepth: number,
  ramp: ReturnType<typeof linearRamp>,
  rings: number,
): void {
  kit.add(
    tube({
      spine,
      radius: (t, a) => radius(t) * (1 + ribDepth * Math.cos(ribs * a)),
      rings,
      sides: ribs * 2,
      cap: "dome",
      domeScale: 0.85,
      // Ridges catch light, grooves stay darker; the top is a touch fresher.
      color: (t, a) => rampAt(ramp, Math.min(1, Math.max(0, 0.42 + 0.22 * Math.cos(ribs * a) + Math.min(1, t) * 0.12))),
    }),
    { color: "attribute", smooth: true },
  );
}

export function cactus(options: CactusOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "cactus"] ?? tones.cactus);
    const ribDepth = options.ribDepth ?? 0.09;
    const curve = options.curve ?? 0;
    const H = options.height;
    const R = options.radius;
    const spine = (t: number) => new THREE.Vector3(curve * t * t, H * t, 0);
    // Slightly pinched base, full body, gentle taper to the dome.
    const radius = (t: number) => R * (0.86 + 0.14 * Math.min(1, t / 0.12)) * (1 - 0.12 * t);
    ribbedColumn(kit, spine, radius, options.ribs, ribDepth, ramp, 7);
    for (const arm of options.arms ?? []) {
      const start = spine(arm.at);
      const dir = new THREE.Vector3(Math.cos(arm.angle), 0, Math.sin(arm.angle));
      const elbow = start.clone().addScaledVector(dir, arm.reach + R * 0.6);
      const end = elbow.clone().add(new THREE.Vector3(0, arm.rise, 0));
      // Quadratic Bézier: out of the trunk, round the elbow, straight up.
      const armSpine = (t: number) => {
        const a = start.clone().lerp(elbow, t);
        const b = elbow.clone().lerp(end, t);
        return a.lerp(b, t);
      };
      const r = R * (arm.thickness ?? 0.62);
      ribbedColumn(kit, armSpine, (t) => r * (1 - 0.1 * t), Math.max(5, options.ribs - 2), ribDepth, ramp, 6);
    }
    const blossoms = options.blossoms ?? 0;
    const top = spine(1);
    for (let i = 0; i < blossoms; i += 1) {
      const a = (i / Math.max(1, blossoms)) * Math.PI * 2 + 0.4;
      kit.add(
        lobe({ radius: [R * 0.32, R * 0.22, R * 0.32], detail: 0, jitter: 0.1, seed: i + 5, center: [top.x + Math.cos(a) * R * 0.45, top.y + R * 0.72, top.z + Math.sin(a) * R * 0.45] }),
        { color: new THREE.Color(tones.accent.light), smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.12, strength: 0.3 } });
  };
}

/** Several short columns growing from one spot. */
export function cactusCluster(options: { stems: number; seed: number; ribs: number; ramp?: string }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones[options.ramp ?? "cactus"] ?? tones.cactus);
    for (let i = 0; i < options.stems; i += 1) {
      const a = (i / options.stems) * Math.PI * 2 + random() * 0.6;
      const d = i === 0 ? 0 : 0.1 + random() * 0.04;
      const h = i === 0 ? 1 : 0.45 + random() * 0.35;
      const lean = i === 0 ? 0 : 0.05 + random() * 0.05;
      const base = new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d);
      const r = i === 0 ? 0.11 : 0.07 + random() * 0.015;
      ribbedColumn(
        kit,
        (t) => base.clone().add(new THREE.Vector3(Math.cos(a) * lean * t, h * t, Math.sin(a) * lean * t)),
        (t) => r * (0.88 + 0.12 * Math.min(1, t / 0.15)) * (1 - 0.1 * t),
        options.ribs,
        0.1,
        ramp,
        5,
      );
    }
    return kit.finish({ groundAo: { height: 0.15, strength: 0.3 } });
  };
}

/** Squat ribbed barrel cactus (supporting / dressing). */
export function barrelCactus(options: { ribs: number; squat: number; ramp?: string; blossoms?: number }): VariantBuilder {
  return cactus({ height: 1, radius: 0.5 * options.squat, ribs: options.ribs, ribDepth: 0.12, ramp: options.ramp, blossoms: options.blossoms });
}

/** Prickly-pear style: flattened oval pads stacked at angles. */
export function padCactus(options: { pads: number; seed: number; ramp?: string }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = tones[options.ramp ?? "cactus"] ?? tones.cactus;
    const light = linearRamp(ramp);
    type Pad = { c: THREE.Vector3; yaw: number; tilt: number; size: number };
    const pads: Pad[] = [{ c: new THREE.Vector3(0, 0.22, 0), yaw: random() * Math.PI, tilt: 0, size: 0.22 }];
    for (let i = 1; i < options.pads; i += 1) {
      const parent = pads[Math.floor(random() * pads.length)]!;
      const side = random() < 0.5 ? -1 : 1;
      const yaw = parent.yaw + (random() - 0.5) * 0.6;
      const size = parent.size * (0.7 + random() * 0.2);
      const tilt = side * (0.15 + random() * 0.25);
      // Grow from the parent's rim, in the parent's own plane (its local X
      // after rotateY(yaw) is (cos yaw, 0, -sin yaw)), so pads always join.
      const c = parent.c.clone().add(new THREE.Vector3(Math.cos(parent.yaw) * side * parent.size * 0.45, parent.size * 1.05, -Math.sin(parent.yaw) * side * parent.size * 0.45));
      pads.push({ c, yaw, tilt, size });
    }
    pads.forEach((pad, i) => {
      const g = lobe({ radius: [pad.size * 0.78, pad.size, pad.size * 0.28], detail: 1, jitter: 0.06, seed: options.seed + i });
      g.rotateZ(pad.tilt);
      g.rotateY(pad.yaw);
      g.translate(pad.c.x, pad.c.y, pad.c.z);
      kit.add(g, { color: (p, n) => rampAt(light, Math.min(1, Math.max(0, 0.35 + n.y * 0.25 + p.y * 0.25))), smooth: true });
    });
    return kit.finish({ groundAo: { height: 0.15, strength: 0.25 } });
  };
}
