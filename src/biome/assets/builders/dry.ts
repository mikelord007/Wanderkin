/**
 * Dry vegetation and wooden markers: twiggy scrub with sparse leaf clumps,
 * and hand-made posts and signs (the only deliberately man-made shapes, so
 * they may be straight-edged, but they are still bevelled and weathered).
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

/**
 * Desert scrub (sagebrush-like): forking woody stems under a loose, rounded
 * canopy of small leaf clumps, so the silhouette is a soft dome with twigs
 * showing through rather than bare sticks.
 */
export function scrub(options: { stems: number; seed: number; clumps: number; ramp?: string; leafRamp?: string }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const wood = linearRamp(tones[options.ramp ?? "trunk"] ?? tones.trunk);
    const tips: THREE.Vector3[] = [];
    for (let i = 0; i < options.stems; i += 1) {
      const a = (i / options.stems) * Math.PI * 2 + random() * 0.7;
      const lean = 0.35 + random() * 0.3;
      const h = 0.55 + random() * 0.3;
      const end = new THREE.Vector3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h);
      const bow = (random() - 0.5) * 0.15;
      kit.add(
        tube({
          spine: (t) => new THREE.Vector3(end.x * t + bow * Math.sin(Math.PI * t), end.y * t, end.z * t),
          radius: (t) => 0.028 * (1 - 0.7 * t),
          rings: 3,
          sides: 4,
          cap: "point",
          color: (t) => rampAt(wood, 0.3 + t * 0.3),
          sway: (t) => t * 0.8,
        }),
        { color: "attribute", sway: "attribute", smooth: true },
      );
      // One fork near the top.
      const from = end.clone().multiplyScalar(0.6);
      const fork = from.clone().add(new THREE.Vector3(Math.cos(a + 0.9) * 0.18, 0.2, Math.sin(a + 0.9) * 0.18));
      kit.add(
        tube({ spine: (t) => from.clone().lerp(fork, t), radius: (t) => 0.016 * (1 - 0.7 * t), rings: 2, sides: 3, cap: "point", color: () => rampAt(wood, 0.45), sway: () => 0.7 }),
        { color: "attribute", sway: "attribute", smooth: true },
      );
      tips.push(end, fork);
    }
    const leaves = tones[options.leafRamp ?? "dry"] ?? tones.dry;
    // Canopy: overlapping clumps over the tips (spread across stems and forks).
    const count = options.clumps;
    for (let i = 0; i < count; i += 1) {
      const tip = tips[(i * 3) % tips.length]!;
      const r = 0.11 + random() * 0.05;
      kit.add(
        lobe({ radius: [r, r * 0.75, r], detail: 1, jitter: 0.18, seed: options.seed + i, center: [tip.x * 0.92, tip.y - 0.03, tip.z * 0.92] }),
        { color: rampTone(leaves, { heightWeight: 0.35, bias: (random() - 0.5) * 0.3 }), sway: 0.8, smooth: true },
      );
    }
    return kit.finish({ groundAo: { height: 0.2, strength: 0.25 } });
  };
}

/** Hand-made signpost: tapered post, one or two weathered planks, a lashing band. */
export function signpost(options: { planks: 1 | 2; seed: number; lean?: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const wood = linearRamp(tones.trunk);
    const lean = options.lean ?? 0.04;
    kit.add(
      tube({
        spine: (t) => new THREE.Vector3(lean * t, t, 0),
        radius: (t, a) => 0.05 * (1 - 0.15 * t) * (1 + 0.08 * Math.cos(a * 3 + options.seed)),
        rings: 3,
        sides: 6,
        cap: "point",
        color: (t, a) => rampAt(wood, 0.3 + 0.3 * Math.max(0, Math.cos(a)) + t * 0.1),
      }),
      { color: "attribute" },
    );
    for (let p = 0; p < options.planks; p += 1) {
      const y = 0.72 - p * 0.2;
      const width = 0.3 + random() * 0.06;
      const board = new THREE.BoxGeometry(width, 0.11, 0.035, 2, 1, 1);
      const pos = board.getAttribute("position");
      // Arrow tip on one end and a weathered, slightly skewed outline.
      for (let i = 0; i < pos.count; i += 1) {
        const x = pos.getX(i);
        if (x > width / 2 - 1e-6) pos.setX(i, x + 0.05 * (1 - Math.abs(pos.getY(i)) / 0.055));
        pos.setY(i, pos.getY(i) + x * 0.06 * (p ? -1 : 1));
      }
      board.rotateY((random() - 0.5) * 0.5 + p * 2.6);
      board.translate(lean * y, y, 0);
      kit.add(board, { color: rampTone(tones.trunk, { bias: 0.35, heightWeight: 0 }) });
    }
    const band = new THREE.TorusGeometry(0.052, 0.012, 4, 8);
    band.rotateX(Math.PI / 2);
    band.translate(lean * 0.86, 0.86, 0);
    kit.add(band, { color: new THREE.Color(tones.accent.base) });
    return kit.finish({ groundAo: { height: 0.1, strength: 0.3 } });
  };
}

/** Plain weathered post with a rope lashing (fence or mooring post). */
export function post(options: { seed: number; lean?: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const wood = linearRamp(tones.trunk);
    const lean = options.lean ?? 0.03;
    kit.add(
      tube({
        spine: (t) => new THREE.Vector3(lean * t, t, 0),
        radius: (t, a) => 0.07 * (1 - 0.2 * t) * (1 + 0.07 * Math.cos(a * 2 + options.seed)),
        rings: 3,
        sides: 6,
        cap: "dome",
        domeScale: 0.35,
        color: (t, a) => rampAt(wood, 0.25 + 0.35 * Math.max(0, Math.cos(a)) + t * 0.15),
      }),
      { color: "attribute" },
    );
    for (const y of [0.62, 0.7]) {
      const band = new THREE.TorusGeometry(0.066, 0.013, 4, 8);
      band.rotateX(Math.PI / 2);
      band.translate(lean * y, y, 0);
      kit.add(band, { color: new THREE.Color(tones.dry.light) });
    }
    return kit.finish({ groundAo: { height: 0.1, strength: 0.3 } });
  };
}
