/**
 * Alpine conifers (Alpine art; built on the shared mesh kit).
 *
 * A snow-laden conifer reads through its TIERS: stacked, drooping skirts of
 * branches, each carrying a pad of snow on its upper face with the green
 * branch tips hanging out from under it and a dark underside. Snow is not a
 * recolour here but part of each tier's shape:
 *  - the snow line runs out along every branch ridge and retreats in the
 *    notches between them, so each tier shows a white star on a green skirt;
 *  - the snow pad is lifted slightly above the branch surface, so it has a
 *    visible thickness and the fringe below it drops away more steeply;
 *  - upper tiers catch more snow than lower, sheltered ones.
 * Faces carry their own flat colour (lit snow / shaded blue snow / needles /
 * dark underside / bark), so the tonal breaks stay crisp at any distance.
 *
 * Variety comes from the design, not the seed: tier count, width, taper,
 * droop, spacing (dense spruce vs airy larch), a wind-bent crown (longer
 * branches downwind), trunk lean, and an old dead leader (snag) on veterans.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt } from "../meshKit.js";
import { builderRandom, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

export interface AlpineConiferOptions {
  seed: number;
  /** Stacked branch tiers, 3–7. */
  tiers: number;
  /** Bottom tier radius relative to the tree height. */
  width: number;
  /** How much tiers narrow toward the top, 0.5 … 0.85 (default 0.74). */
  taper?: number;
  /** How far branch tips hang below their tier's base, relative to tier height. */
  droop: number;
  /** Bare trunk showing under the lowest tier, fraction of the height. */
  trunk: number;
  /** Branch tips per tier (the top tiers get a couple fewer). */
  points: number;
  /** How far snow reaches out along the branches, 0 (none) … 0.9. */
  snow: number;
  /** Share of tiers, from the top, carrying full snow (default 1); lower ones get a light dusting. */
  snowTiers?: number;
  /** Crown lean: horizontal offset of the top over the base, fraction of the height. */
  lean?: number;
  /** Wind-bent crown: branches this much longer downwind (+x) than upwind, 0 … 0.5. */
  wind?: number;
  /** Air between tiers: 0 dense and overlapping … 0.6 airy with trunk showing. */
  gap?: number;
  /** Bare dead leader above the crown, fraction of the height (0 = none). */
  snag?: number;
  /** Needle ramps (default foliage / foliageAlt, alternating by tier). */
  ramps?: readonly [string, string];
}

type Vec = THREE.Vector3;

/** Non-indexed triangle soup with one flat colour per face. */
class Soup {
  readonly positions: number[] = [];
  readonly colors: number[] = [];

  tri(a: Vec, b: Vec, c: Vec, color: (normalY: number) => THREE.Color): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const col = color(n.y);
    for (const v of [a, b, c]) {
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(col.r, col.g, col.b);
    }
  }

  quad(a: Vec, b: Vec, c: Vec, d: Vec, color: (normalY: number) => THREE.Color): void {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    return g;
  }
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Snow ramp for the snow pads: the "snow" tone if the biome has one, else stoneTop. */
export function snowRamp(tones: BiomeTones) {
  return linearRamp(tones.snow ?? tones.stoneTop);
}

export function alpineConifer(options: AlpineConiferOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const parts: { geometry: THREE.BufferGeometry; sway: number | ((p: THREE.Vector3) => number) | "attribute"; smooth: boolean }[] = [];
    const bark = linearRamp(tones.bark ?? tones.trunk);
    const needleA = linearRamp(tones[options.ramps?.[0] ?? "foliage"] ?? tones.foliage);
    const needleB = linearRamp(tones[options.ramps?.[1] ?? "foliageAlt"] ?? tones.foliageAlt);
    const snow = snowRamp(tones);
    const tiers = Math.max(3, Math.min(7, Math.round(options.tiers)));
    const taper = options.taper ?? 0.74;
    const gap = options.gap ?? 0;
    const lean = options.lean ?? 0;
    const wind = options.wind ?? 0;
    const snag = options.snag ?? 0;
    const snowTiers = options.snowTiers ?? 1;

    // Crown extent: the top tier's apex sits at yTop; a snag rises above it.
    const yTop = 1 - snag;
    const spine = (y: number) => new THREE.Vector3(lean * y ** 1.5, y, 0);
    // Evenly spaced apexes; tier heights overlap unless `gap` opens them up.
    // Solve for the lowest apex so its drooping tips land at the trunk line.
    const k = 1.6 - gap;
    const shrink = (f: number) => 1 - 0.3 * f;
    const lift0 = k * (1 + options.droop);
    const a0 = (options.trunk + (lift0 * yTop) / (tiers - 1)) / (1 + lift0 / (tiers - 1));
    const step = (yTop - a0) / (tiers - 1);

    // Trunk: tapered, flared at the root, following the lean; hidden in the crown.
    const trunkTop = snag > 0 ? 1 : yTop - step * 0.5;
    const trunkGeometry = tube({
        spine: (t) => spine(trunkTop * t),
        radius: (t, a) => 0.04 * (1 - 0.75 * t) * (1 + 0.7 * (1 - Math.min(1, t / 0.12)) ** 2) * (1 + 0.08 * Math.cos(a * 3 + options.seed)),
        rings: snag > 0 ? 6 : 3,
        sides: 6,
        cap: "point",
        color: (t, a) => {
          // Weathered silver-grey on the dead leader, bark below.
          const dead = snag > 0 && t * trunkTop > yTop - step * 0.4;
          const c = rampAt(bark, 0.25 + 0.3 * Math.max(0, Math.cos(a)) + 0.15 * t);
          return dead ? c.lerp(snow.dark, 0.55) : c;
        },
        sway: (t) => t * t * 0.25,
      });
    if (snag > 0) {
      // Two broken branch stubs on the dead leader.
      for (let s = 0; s < 2; s += 1) {
        const y = yTop + snag * (0.3 + s * 0.3);
        const from = spine(y);
        const angle = random() * Math.PI * 2;
        const to = from.clone().add(new THREE.Vector3(Math.cos(angle) * 0.07, 0.03, Math.sin(angle) * 0.07));
        parts.push({
          geometry: tube({ spine: (t) => from.clone().lerp(to, t), radius: (t) => 0.012 * (1 - 0.6 * t), rings: 1, sides: 4, cap: "point", color: () => rampAt(bark, 0.55).lerp(snow.dark, 0.5) }),
          sway: 0.25,
          smooth: true,
        });
      }
    }

    parts.push({ geometry: trunkGeometry, sway: "attribute", smooth: true });
    const soup = new Soup();
    for (let i = 0; i < tiers; i += 1) {
      const f = i / (tiers - 1);
      const h = step * k * shrink(f);
      const apexY = a0 + step * i;
      const baseY = apexY - h;
      const centre = spine(baseY);
      const radius = options.width * (1 - taper * f) * (0.94 + random() * 0.12);
      const points = Math.max(5, options.points - Math.round(2 * f));
      const ring = points * 2;
      const turn = random() * Math.PI * 2;
      const apex = spine(apexY);
      const under = centre.clone().add(new THREE.Vector3(0, h * 0.12, 0));
      const snowy = (1 - f) < snowTiers + 1e-9;
      const reach = options.snow * (snowy ? 0.85 + 0.15 * f : 0.45);
      const needle = i % 2 === 0 ? needleA : needleB;
      const shade = (random() - 0.5) * 0.12;

      const outer: Vec[] = [];
      const shoulder: Vec[] = [];
      const lip: Vec[] = [];
      for (let q = 0; q < ring; q += 1) {
        const tip = q % 2 === 0;
        const angle = turn + (q / ring) * Math.PI * 2 + (random() - 0.5) * 0.14;
        const downwind = 1 + wind * Math.cos(angle);
        const r = radius * downwind * (tip ? 0.9 + random() * 0.1 : 0.66);
        const y = baseY + (tip ? -options.droop * h * (0.8 + random() * 0.4) : options.droop * h * 0.22);
        const o = new THREE.Vector3(centre.x + Math.cos(angle) * r, y, centre.z + Math.sin(angle) * r);
        outer.push(o);
        // Snow runs out along each branch ridge and retreats in the notches.
        const s = clamp01(reach * (tip ? 0.9 + random() * 0.1 : 0.76));
        const pad = apex.clone().lerp(o, s);
        pad.y += h * 0.1 * options.snow * (tip ? 1 : 0.6);
        shoulder.push(pad);
        // The pad's front edge: a short, nearly vertical band of snow that
        // shows from the low gameplay camera, where the tops are grazing.
        const edge = pad.clone().lerp(o, 0.12);
        edge.y -= h * 0.2 * reach;
        lip.push(edge);
      }
      const snowColor = (ny: number) => rampAt(snow, clamp01(0.3 + 0.6 * ny + 0.1 * f));
      const needleColor = (ny: number) => rampAt(needle, clamp01(0.18 + 0.42 * Math.max(0, ny) + 0.22 * f + shade));
      const undersideColor = () => rampAt(needle, 0.04).multiplyScalar(0.8);
      for (let q = 0; q < ring; q += 1) {
        const n = (q + 1) % ring;
        if (reach > 0.02) {
          soup.tri(apex, shoulder[n]!, shoulder[q]!, snowColor);
          soup.quad(shoulder[q]!, shoulder[n]!, lip[n]!, lip[q]!, snowColor);
          soup.quad(lip[q]!, lip[n]!, outer[n]!, outer[q]!, needleColor);
        } else {
          soup.tri(apex, outer[n]!, outer[q]!, needleColor);
        }
        soup.tri(under, outer[q]!, outer[n]!, undersideColor);
      }
    }
    parts.push({ geometry: soup.geometry(), sway: (p) => 0.12 + p.y * 0.45, smooth: false });
    // Leaning and wind-bent crowns: set the base back so the crown's mass
    // sits over the footprint centre and the tree fits at full size.
    let minX = Infinity;
    let maxX = -Infinity;
    for (const { geometry } of parts) {
      const position = geometry.getAttribute("position");
      for (let v = 0; v < position.count; v += 1) {
        minX = Math.min(minX, position.getX(v));
        maxX = Math.max(maxX, position.getX(v));
      }
    }
    const setBack = -0.5 * (minX + maxX) * 0.85;
    for (const { geometry, sway, smooth } of parts) {
      geometry.translate(setBack, 0, 0);
      kit.add(geometry, { color: "attribute", sway, smooth });
    }
    return kit.finish({ groundAo: { height: 0.12, strength: 0.3 } });
  };
}

/**
 * The Alpine hero conifers: five distinct designs.
 *  - spruce: tall, dense, regular tiers, heavy snow;
 *  - fir: broad and squat, deep drooping skirts under thick snow;
 *  - wind-bent pine: leaning, branches streaming downwind, lighter snow;
 *  - larch: slender and airy, trunk showing between the tiers;
 *  - veteran: fewer, ragged tiers under a bare dead leader.
 */
export function alpineConiferVariants(): VariantBuilder[] {
  return [
    alpineConifer({ seed: 101, tiers: 6, width: 0.36, taper: 0.78, droop: 0.3, trunk: 0.06, points: 8, snow: 0.84 }),
    alpineConifer({ seed: 103, tiers: 4, width: 0.5, taper: 0.7, droop: 0.4, trunk: 0.08, points: 10, snow: 0.88 }),
    alpineConifer({ seed: 107, tiers: 5, width: 0.34, taper: 0.66, droop: 0.24, trunk: 0.1, points: 7, snow: 0.62, lean: 0.1, wind: 0.5, gap: 0.15 }),
    alpineConifer({ seed: 109, tiers: 7, width: 0.3, taper: 0.8, droop: 0.2, trunk: 0.12, points: 7, snow: 0.66, snowTiers: 0.7, gap: 0.45, lean: 0.025 }),
    alpineConifer({ seed: 113, tiers: 4, width: 0.44, taper: 0.66, droop: 0.34, trunk: 0.14, points: 9, snow: 0.76, snag: 0.14, lean: -0.03, wind: -0.22 }),
  ];
}

/** Young conifers and snow-buried saplings (supporting members of a stand). */
export function youngConiferVariants(): VariantBuilder[] {
  return [
    alpineConifer({ seed: 201, tiers: 3, width: 0.44, taper: 0.7, droop: 0.36, trunk: 0.05, points: 7, snow: 0.82 }),
    alpineConifer({ seed: 203, tiers: 4, width: 0.34, taper: 0.76, droop: 0.28, trunk: 0.08, points: 7, snow: 0.7 }),
    alpineConifer({ seed: 205, tiers: 3, width: 0.5, taper: 0.62, droop: 0.42, trunk: 0.02, points: 8, snow: 0.9 }),
  ];
}
