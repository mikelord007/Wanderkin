/**
 * Tropical markers for the `wood` placements: bamboo poles of different
 * heights lashed together with a dry-fibre band, so way-markers feel like
 * island craft rather than generic signposts.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";
import { addTrunk } from "./palm.js";

export interface BambooOptions {
  /** Poles: base x, z, height, lean (native units). */
  poles: readonly (readonly [number, number, number, number])[];
  /** Height of the lashing band, fraction of the shortest pole. */
  lash?: number;
  seed: number;
}

export function bambooPoles(options: BambooOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const bamboo = linearRamp(tones.bamboo ?? tones.foliageAlt);
    const fibre = linearRamp(tones.dry);
    options.poles.forEach(([x, z, height, lean], i) => {
      addTrunk(kit, {
        height,
        lean,
        leanYaw: Math.atan2(z, x) + i * 0.3,
        bow: 1,
        segments: Math.max(3, Math.round(height / 0.26)),
        baseRadius: 0.034,
        topRatio: 0.85,
        origin: [x, 0, z],
      }, bamboo);
    });
    // Lashing: a loose loop around the bundle.
    const shortest = Math.min(...options.poles.map((p) => p[2]));
    const y = shortest * (options.lash ?? 0.72);
    let cx = 0;
    let cz = 0;
    for (const [x, z] of options.poles) {
      cx += x / options.poles.length;
      cz += z / options.poles.length;
    }
    const reach = Math.max(...options.poles.map(([x, z]) => Math.hypot(x - cx, z - cz))) + 0.04;
    kit.add(
      tube({
        spine: (t) => new THREE.Vector3(cx + Math.cos(t * Math.PI * 2) * reach, y + 0.008 * Math.sin(t * Math.PI * 6), cz + Math.sin(t * Math.PI * 2) * reach),
        radius: () => 0.012,
        rings: 10,
        sides: 3,
        cap: "open",
        // Dark fibre, so the band reads against the pale-green bamboo.
        color: (t) => rampAt(fibre, 0.12 + 0.12 * Math.sin(t * Math.PI * 4)),
      }),
      { color: "attribute", smooth: true },
    );
    return kit.finish({ groundAo: { height: 0.1, strength: 0.25 } });
  };
}
