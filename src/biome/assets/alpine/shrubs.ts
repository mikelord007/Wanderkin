/**
 * Alpine shrubs and ground dressing (Alpine art).
 *
 * Above the treeline, shrubs are low and half buried: they read as dark
 * needles and twigs POKING THROUGH snow, not as green blobs on it.
 *  - dwarf pine (krummholz): short conifer sprigs splayed out from one root,
 *    each a pair of snow-laden tiers, like a pine flattened by wind and snow;
 *  - buried shrub: a soft snow mound with pine tips or bare twigs breaking
 *    through its surface;
 *  - snow drift: a low, wind-shaped crescent of snow for the foot of trees,
 *    rocks and markers (grounds them in the snowfield);
 *  - winter grass: sparse straw-coloured blades.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { builderRandom, lobe, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";
import { coniferParts, snowRamp, type AlpineConiferOptions } from "./conifer.js";

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** A small sprig: three snow-laden tiers (a conifer top), light enough to repeat. */
function sprig(seed: number, snow: number): AlpineConiferOptions {
  return { seed, tiers: 3, width: 0.46, taper: 0.66, droop: 0.34, trunk: 0.04, points: 5, snow, underside: false };
}

export interface DwarfPineOptions {
  seed: number;
  /** Sprigs splayed from the root, 3–8. */
  sprigs: number;
  /** Outward tilt of the sprigs from vertical, radians (0.3 upright … 1.0 sprawling). */
  splay: number;
  snow: number;
}

/** Krummholz: sprigs of dwarf pine splayed out from one root, snow on every tier. */
export function dwarfPine(options: DwarfPineOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const count = Math.max(3, Math.min(8, Math.round(options.sprigs)));
    for (let i = 0; i < count; i += 1) {
      const yaw = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.6;
      // A taller, upright central sprig; the rest lower and sprawling.
      const centre = i === 0;
      const size = centre ? 0.62 : 0.34 + random() * 0.16;
      const tilt = centre ? 0.1 : options.splay * (0.75 + random() * 0.4);
      for (const part of coniferParts(sprig(options.seed * 17 + i, options.snow), tones)) {
        const g = part.geometry;
        g.scale(size, size, size);
        g.rotateZ(-tilt);
        g.rotateY(yaw);
        // Sprigs root a little way out from the centre, so the clump spreads.
        g.translate(Math.cos(yaw) * 0.06 * (centre ? 0 : 1), 0, -Math.sin(yaw) * 0.06 * (centre ? 0 : 1));
        kit.add(g, { color: "attribute", sway: part.sway === "attribute" ? 0.1 : part.sway, smooth: part.smooth });
      }
    }
    return kit.finish({ groundAo: { height: 0.2, strength: 0.3 } });
  };
}

export interface BuriedShrubOptions {
  seed: number;
  /** Things breaking through the mound: pine tips or bare twigs. */
  through: "pine" | "twigs";
  count: number;
}

/** A soft snow mound with pine tips or bare twigs breaking through it. */
export function buriedShrub(options: BuriedShrubOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const snow = snowRamp(tones);
    const mound = { rx: 0.36, ry: 0.26, rz: 0.32 };
    kit.add(lobe({ radius: [mound.rx, mound.ry, mound.rz], detail: 1, jitter: 0.1, seed: options.seed, floor: 0, center: [0, 0, 0] }), {
      color: (p, n) => rampAt(snow, clamp01(0.3 + 0.55 * n.y + 0.3 * p.y)),
      sway: 0,
      smooth: true,
    });
    // A lower shoulder of snow to one side: drifted, not a perfect dome.
    kit.add(lobe({ radius: [0.2, 0.14, 0.18], detail: 0, jitter: 0.12, seed: options.seed + 5, floor: 0, center: [0.26, 0, 0.1] }), {
      color: (p, n) => rampAt(snow, clamp01(0.3 + 0.55 * n.y + 0.3 * p.y)),
      sway: 0,
      smooth: true,
    });
    const wood = linearRamp(tones.bark ?? tones.trunk);
    for (let i = 0; i < options.count; i += 1) {
      const a = (i / options.count) * Math.PI * 2 + random() * 0.8;
      const d = 0.06 + random() * 0.2;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      // Surface height of the mound at (x, z).
      const k = 1 - (x / mound.rx) ** 2 - (z / mound.rz) ** 2;
      const y = mound.ry * Math.sqrt(Math.max(0, k)) - 0.05;
      if (options.through === "pine") {
        const size = 0.36 + random() * 0.2;
        const tilt = (random() - 0.5) * 0.5;
        const yaw = random() * Math.PI * 2;
        for (const part of coniferParts(sprig(options.seed * 13 + i, 0.7), tones)) {
          const g = part.geometry;
          g.scale(size, size, size);
          g.rotateZ(tilt);
          g.rotateY(yaw);
          g.translate(x, y, z);
          kit.add(g, { color: "attribute", sway: 0.2, smooth: part.smooth });
        }
      } else {
        // Bare twigs: a thin forked stem leaning out of the snow.
        const lean = 0.25 + random() * 0.35;
        const h = 0.3 + random() * 0.25;
        const end = new THREE.Vector3(x + Math.cos(a) * lean * h, y + h, z + Math.sin(a) * lean * h);
        const from = new THREE.Vector3(x, y - 0.05, z);
        kit.add(
          tube({ spine: (t) => from.clone().lerp(end, t), radius: (t) => 0.016 * (1 - 0.7 * t), rings: 2, sides: 4, cap: "point", color: (t) => rampAt(wood, 0.35 + 0.3 * t), sway: (t) => t * 0.6 }),
          { color: "attribute", sway: "attribute", smooth: true },
        );
        const fork = from.clone().lerp(end, 0.55);
        const tip = fork.clone().add(new THREE.Vector3(Math.cos(a + 1.1) * 0.1, 0.12, Math.sin(a + 1.1) * 0.1));
        kit.add(
          tube({ spine: (t) => fork.clone().lerp(tip, t), radius: (t) => 0.01 * (1 - 0.7 * t), rings: 1, sides: 3, cap: "point", color: () => rampAt(wood, 0.55), sway: () => 0.6 }),
          { color: "attribute", sway: "attribute", smooth: true },
        );
      }
    }
    return kit.finish({ groundAo: { height: 0.12, strength: 0.18 } });
  };
}

/**
 * A wind-shaped snow drift: a low crescent of snow, steep on the lee side
 * and long on the windward side (micro dressing at the foot of heroes).
 */
export function snowDrift(seed: number): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(seed);
    const kit = new MeshKit();
    const snow = snowRamp(tones);
    const color = (p: THREE.Vector3, n: THREE.Vector3) => rampAt(snow, clamp01(0.35 + 0.6 * n.y));
    const lobes = 3 + Math.floor(random() * 2);
    for (let i = 0; i < lobes; i += 1) {
      // Lobes along a gentle arc.
      const t = i / (lobes - 1) - 0.5;
      const cx = t * 0.8;
      const cz = -0.18 * Math.cos(t * Math.PI) + 0.1;
      const r = 0.24 + random() * 0.08;
      kit.add(lobe({ radius: [r * 1.3, r * 0.42, r], detail: i === 1 ? 1 : 0, jitter: 0.08, seed: seed * 7 + i, floor: 0, center: [cx, 0, cz] }), { color, sway: 0, smooth: true });
    }
    return kit.finish({ fit: "size", sink: 0.02 });
  };
}

/** Alpine shrubs: three dwarf pines (upright to sprawling) and two buried shrubs. */
export function alpineShrubVariants(): VariantBuilder[] {
  return [
    dwarfPine({ seed: 401, sprigs: 4, splay: 0.75, snow: 0.8 }),
    dwarfPine({ seed: 403, sprigs: 4, splay: 1.05, snow: 0.72 }),
    dwarfPine({ seed: 405, sprigs: 3, splay: 0.5, snow: 0.86 }),
    buriedShrub({ seed: 411, through: "pine", count: 3 }),
    buriedShrub({ seed: 413, through: "twigs", count: 6 }),
  ];
}
