/**
 * Desert dressing (Desert art): tumbleweeds, a loose ball of curved dry twigs
 * that reads as "desert" at a glance and stays light at 150–250 triangles.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { builderRandom, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

export function tumbleweed(options: { twigs: number; seed: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const ramp = linearRamp(tones.dry);
    const radius = 0.5;
    const centre = new THREE.Vector3(0, radius * 0.9, 0);
    for (let i = 0; i < options.twigs; i += 1) {
      // Each twig is an arc across the ball's surface: a great-circle segment.
      const axis = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
      const start = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).cross(axis).normalize();
      const sweep = 1.4 + random() * 1.4;
      const r = radius * (0.72 + random() * 0.28);
      const shade = random();
      kit.add(
        tube({
          spine: (t) => start.clone().applyAxisAngle(axis, sweep * t).multiplyScalar(r).add(centre),
          radius: () => 0.016,
          rings: 4,
          sides: 3,
          cap: "open",
          color: () => rampAt(ramp, 0.3 + shade * 0.5),
        }),
        { color: "attribute", smooth: true },
      );
    }
    return kit.finish({ fit: "size", sink: 0.02 });
  };
}
