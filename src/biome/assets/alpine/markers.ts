/**
 * Alpine trail markers (Alpine art): the only hand-made things on the
 * mountain. They stay within the narrow `wood` footprint (radius ≤ 0.36 of
 * their height) and read by silhouette:
 *  - stone cairn: flat stones stacked into a tapering tower, snow on every
 *    ledge, a pointed top stone;
 *  - trail pole: a tall weathered pole with painted red bands and a snow cap
 *    (the red sits far from the collectible's amber hue);
 *  - log teepee: three or four poles leaning together, lashed at the top,
 *    snow caught in the crotch.
 */
import * as THREE from "three";
import { linearRamp, MeshKit, rampAt, rampTone } from "../meshKit.js";
import { builderRandom, hull, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";
import { snowRamp } from "./conifer.js";
import { snowPillow } from "./rocks.js";

/** Stacked flat stones, each resting on the one below, snow on each ledge. */
export function cairn(options: { seed: number; stones: number; lean?: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const snow = snowRamp(tones);
    const snowColor = (_p: THREE.Vector3, n: THREE.Vector3) => rampAt(snow, Math.min(1, Math.max(0, 0.25 + 0.7 * n.y)));
    let y = 0;
    const lean = options.lean ?? 0;
    for (let i = 0; i < options.stones; i += 1) {
      const f = i / Math.max(1, options.stones - 1);
      const top = i === options.stones - 1;
      const w = 0.3 * (1 - 0.45 * f) * (0.9 + random() * 0.2);
      const h = top ? 0.2 : 0.1 + random() * 0.05;
      const g = hull({
        scale: [w, h, w * (0.8 + random() * 0.2)],
        detail: 0,
        jitter: 0.1,
        seed: options.seed * 11 + i,
        floor: -0.45,
        cuts: top ? [] : [{ normal: [(random() - 0.5) * 0.3, 1, (random() - 0.5) * 0.3], offset: 0.55 }],
      });
      g.rotateY(random() * Math.PI);
      g.translate(lean * y + (random() - 0.5) * 0.03, y + 0.45 * h, (random() - 0.5) * 0.03);
      const { rock, snow: pad } = snowPillow(g, { threshold: 0.6, depth: 0.025, overhang: 0.012 });
      kit.add(rock, { color: rampTone(tones.rock, { heightWeight: 0.1, bias: i % 2 ? -0.2 : 0.05 }) });
      if (pad.getAttribute("position").count > 0) kit.add(pad, { color: snowColor });
      y += (0.45 + 0.5) * h * 0.95;
    }
    return kit.finish({ sink: 0.03, groundAo: { height: 0.12, strength: 0.3 } });
  };
}

/** A tall weathered trail pole with red painted bands and a snow cap. */
export function trailPole(options: { seed: number; lean?: number; bands?: number }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const kit = new MeshKit();
    const wood = linearRamp(tones.bark ?? tones.trunk);
    const paint = linearRamp(tones.paint ?? tones.accent);
    const snow = snowRamp(tones);
    const lean = options.lean ?? 0.02;
    const bands = options.bands ?? 2;
    const spine = (t: number) => new THREE.Vector3(lean * t, t, 0);
    const radius = (t: number) => 0.07 * (1 - 0.2 * t);
    kit.add(
      tube({
        spine,
        radius: (t, a) => radius(t) * (1 + 0.06 * Math.cos(a * 2 + options.seed)),
        rings: 4,
        sides: 6,
        cap: "dome",
        domeScale: 0.5,
        color: (t, a) => rampAt(wood, 0.3 + 0.35 * Math.max(0, Math.cos(a)) + 0.2 * Math.min(1, t)),
      }),
      { color: "attribute" },
    );
    // Painted sleeves in the upper third: crisp bands, not a sampled gradient.
    for (let b = 0; b < bands; b += 1) {
      const from = 0.64 + b * 0.13;
      kit.add(
        tube({
          spine: (t) => spine(from + t * 0.07),
          radius: (t) => radius(from + t * 0.07) * 1.1,
          rings: 1,
          sides: 6,
          cap: "open",
          color: (_t, a) => rampAt(paint, 0.35 + 0.45 * Math.max(0, Math.cos(a))),
        }),
        { color: "attribute" },
      );
    }
    // A cap of snow on the pole's head, bulging past its rim.
    const cap = hull({ scale: [0.1, 0.05, 0.1], detail: 0, jitter: 0.08, seed: options.seed, floor: -0.3 });
    const head = spine(1);
    cap.translate(head.x, head.y + 0.015, head.z);
    kit.add(cap, { color: (_p, n) => rampAt(snow, Math.min(1, Math.max(0, 0.3 + 0.65 * n.y))) });
    return kit.finish({ groundAo: { height: 0.1, strength: 0.3 } });
  };
}

/** Three or four poles leaning together, lashed at the top, snow in the crotch. */
export function logTeepee(options: { seed: number; poles: 3 | 4 }): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const wood = linearRamp(tones.bark ?? tones.trunk);
    const snow = snowRamp(tones);
    const apex = new THREE.Vector3(0, 0.82, 0);
    for (let i = 0; i < options.poles; i += 1) {
      const a = (i / options.poles) * Math.PI * 2 + (random() - 0.5) * 0.4;
      const foot = new THREE.Vector3(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
      // Poles cross at the lashing and poke out a little above it.
      const end = apex.clone().add(apex.clone().sub(foot).multiplyScalar(0.2));
      const shade = random() * 0.2;
      kit.add(
        tube({
          spine: (t) => foot.clone().lerp(end, t),
          radius: (t) => 0.032 * (1 - 0.35 * t),
          rings: 3,
          sides: 5,
          cap: "dome",
          domeScale: 0.4,
          color: (t, ang) => rampAt(wood, 0.25 + shade + 0.3 * Math.max(0, Math.sin(ang)) + 0.15 * Math.min(1, t)),
        }),
        { color: "attribute" },
      );
    }
    // Lashing band and a small snow cushion caught where the poles cross.
    const band = new THREE.TorusGeometry(0.045, 0.012, 4, 8);
    band.rotateX(Math.PI / 2);
    band.translate(apex.x, apex.y - 0.03, apex.z);
    kit.add(band, { color: rampTone(tones.dry, { bias: -0.2 }) });
    const cushion = hull({ scale: [0.07, 0.035, 0.07], detail: 0, jitter: 0.1, seed: options.seed, floor: -0.2 });
    cushion.translate(apex.x, apex.y + 0.01, apex.z);
    kit.add(cushion, { color: (_p, n) => rampAt(snow, 0.4 + 0.5 * n.y) });
    return kit.finish({ groundAo: { height: 0.1, strength: 0.3 } });
  };
}

/** The Alpine markers: two cairns, two trail poles and a log teepee. */
export function alpineMarkerVariants(): VariantBuilder[] {
  return [
    cairn({ seed: 501, stones: 6 }),
    cairn({ seed: 503, stones: 5, lean: 0.06 }),
    trailPole({ seed: 505, bands: 2 }),
    trailPole({ seed: 507, lean: -0.05, bands: 1 }),
    logTeepee({ seed: 509, poles: 3 }),
  ];
}
