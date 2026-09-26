/**
 * Monsoon markers: wooden stilt huts and rain lanterns, the only built
 * things in the marsh. Huts stand on four splayed stilts above the flood
 * line, with a plank deck, board walls with a dark doorway, a steep
 * overhanging thatch roof that sheds the rain, and a leaning ladder. The
 * rain lantern is a post under a little roof with a red paper lantern.
 *
 * Every part is a bevel-free box or tube pushed off square (tapered,
 * tilted, staggered) so nothing reads as a raw primitive, and all of it is
 * faceted timber and thatch. Footprints stay inside the `wood` kind's narrow
 * radius, so huts are tall and slim: stilts are most of the height.
 */
import * as THREE from "three";
import { MeshKit, rampTone } from "../meshKit.js";
import { builderRandom, tube } from "../shapes.js";
import type { BiomeTones, UnitMesh, VariantBuilder } from "../types.js";

function box(w: number, h: number, d: number, at: readonly [number, number, number], options: { rotY?: number; rotX?: number; rotZ?: number; taper?: number } = {}): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (options.taper) {
    // Narrow the top face: timber posts and roof ridges are never true boxes.
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i += 1) {
      if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * (1 - options.taper), p.getY(i), p.getZ(i) * (1 - options.taper));
    }
  }
  if (options.rotZ) g.rotateZ(options.rotZ);
  if (options.rotX) g.rotateX(options.rotX);
  if (options.rotY) g.rotateY(options.rotY);
  g.translate(at[0], at[1], at[2]);
  return g;
}

export interface StiltHutOptions {
  /** Stilt height (native units; the hut body is ~0.26, the roof ~0.26). */
  stilts: number;
  /** Half the deck width. */
  half: number;
  seed: number;
  /** Roof pitch: 0 hipped-low … 1 steep. */
  pitch: number;
  ladder?: boolean;
  lantern?: boolean;
}

export function stiltHut(options: StiltHutOptions): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(options.seed);
    const kit = new MeshKit();
    const wood = rampTone(tones.plank ?? tones.trunk, { heightWeight: 0.2 });
    const dark = new THREE.Color((tones.plank ?? tones.trunk).dark).multiplyScalar(0.55);
    const thatch = rampTone(tones.thatch ?? tones.dry, { heightWeight: 0.4 });
    const S = options.stilts;
    const a = options.half;
    // Stilts: splayed outward a little at the foot, darker (wet) low down.
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const foot = new THREE.Vector3(sx * a * 1.08, 0, sz * a * 1.08);
      const head = new THREE.Vector3(sx * a * 0.92, S + 0.02, sz * a * 0.92);
      kit.add(tube({ spine: (t) => foot.clone().lerp(head, t), radius: (t) => 0.018 * (1 - 0.25 * t), rings: 2, sides: 5, cap: "open" }), { color: wood });
    }
    // Cross brace between two stilts.
    kit.add(box(0.012, 0.012, a * 2.1, [a, S * 0.45, 0], { rotX: 0.5 }), { color: wood });
    // Deck: planks with thin gaps, slightly uneven.
    const planks = 5;
    for (let i = 0; i < planks; i += 1) {
      const w = (a * 2.3) / planks - 0.006;
      const x = -a * 1.15 + (i + 0.5) * ((a * 2.3) / planks);
      kit.add(box(w, 0.022, a * 2.3 + (random() - 0.5) * 0.03, [x, S + 0.03 + (random() - 0.5) * 0.004, 0]), { color: wood });
    }
    // Walls: a board box set back from the deck edge, darker toward the base.
    const wall = a * 0.78;
    const wallH = 0.22;
    const floorY = S + 0.041;
    kit.add(box(wall * 2, wallH, wall * 2, [0, floorY + wallH / 2, 0], { taper: 0.03 }), { color: wood });
    // Vertical batten strips on the walls read as boards.
    for (let i = -2; i <= 2; i += 1) {
      for (const side of [1, -1]) {
        kit.add(box(0.012, wallH * 0.96, 0.008, [(i / 2.5) * wall, floorY + wallH / 2, side * (wall + 0.004)]), { color: wood });
      }
    }
    // Doorway (a dark recess) and a small window.
    kit.add(box(wall * 0.55, wallH * 0.72, 0.01, [0, floorY + wallH * 0.36, wall + 0.009]), { color: dark });
    kit.add(box(0.01, wallH * 0.3, wall * 0.5, [wall + 0.006, floorY + wallH * 0.6, 0]), { color: dark });
    // Thatch roof: two steep slabs meeting at a ridge, overhanging the deck.
    const eave = floorY + wallH;
    const rise = 0.14 + options.pitch * 0.14;
    const span = a * 1.3;
    const slope = Math.atan2(rise, span);
    const length = Math.hypot(rise, span);
    for (const side of [1, -1]) {
      kit.add(
        box(length, 0.05, a * 2.5, [side * span * 0.5, eave + rise * 0.5, 0], { rotZ: side * -slope, taper: 0.08 }),
        { color: thatch },
      );
      // A shaggy lower fringe on each eave.
      kit.add(box(0.05, 0.04, a * 2.55, [side * span * 0.98, eave - 0.012, 0], { rotZ: side * -slope * 1.4 }), { color: thatch });
    }
    kit.add(box(0.05, 0.04, a * 2.6, [0, eave + rise + 0.012, 0], { taper: 0.4 }), { color: thatch });
    if (options.ladder) {
      // A ladder leaning against the deck edge, rails and rungs.
      const foot = a * 1.15 + S * 0.35;
      const angle = Math.atan2(foot - a * 1.1, S);
      for (const off of [-0.04, 0.04]) {
        kit.add(box(0.012, Math.hypot(S, foot - a * 1.1), 0.012, [(foot + a * 1.1) / 2, S / 2, off + a * 0.3], { rotZ: angle }), { color: wood });
      }
      for (let r = 1; r <= 4; r += 1) {
        const t = r / 5;
        kit.add(box(0.01, 0.01, 0.09, [foot - (foot - a * 1.1) * t, S * t, a * 0.3]), { color: wood });
      }
    }
    if (options.lantern) {
      const lantern = rampTone(tones.lantern ?? tones.accent, { heightWeight: 0.5 });
      kit.add(box(0.05, 0.07, 0.05, [span * 0.8, eave - 0.07, a * 1.05], { taper: 0.2 }), { color: lantern });
    }
    return kit.finish({ groundAo: { height: 0.12, strength: 0.3 } });
  };
}

/** A rain lantern: a post under a little roof, a red paper lantern hung below. */
export function rainLantern(seed: number): VariantBuilder {
  return (tones: BiomeTones): UnitMesh => {
    const random = builderRandom(seed);
    const kit = new MeshKit();
    const wood = rampTone(tones.plank ?? tones.trunk, { heightWeight: 0.3 });
    const thatch = rampTone(tones.thatch ?? tones.dry, { heightWeight: 0.4 });
    const lantern = rampTone(tones.lantern ?? tones.accent, { heightWeight: 0.6 });
    const lean = (random() - 0.5) * 0.04;
    kit.add(tube({ spine: (t) => new THREE.Vector3(lean * t, 0.82 * t, 0), radius: (t) => 0.03 * (1 - 0.3 * t), rings: 3, sides: 5, cap: "open" }), { color: wood });
    // Arm and lantern.
    kit.add(box(0.2, 0.02, 0.02, [lean + 0.09, 0.74, 0]), { color: wood });
    kit.add(box(0.1, 0.13, 0.1, [lean + 0.16, 0.62, 0], { taper: 0.25 }), { color: lantern });
    kit.add(box(0.12, 0.018, 0.12, [lean + 0.16, 0.69, 0]), { color: wood });
    // Little roof over the post head.
    for (const side of [1, -1]) kit.add(box(0.2, 0.03, 0.26, [lean + side * 0.07, 0.88, 0], { rotZ: side * -0.55 }), { color: thatch });
    // Stones around the foot.
    kit.add(box(0.12, 0.04, 0.12, [0, 0.01, 0], { rotY: 0.4, taper: 0.3 }), { color: rampTone(tones.rock) });
    return kit.finish({ groundAo: { height: 0.15, strength: 0.3 } });
  };
}

export function monsoonMarkerVariants(): VariantBuilder[] {
  return [
    stiltHut({ stilts: 0.42, half: 0.14, seed: 501, pitch: 0.7, ladder: true }),
    stiltHut({ stilts: 0.5, half: 0.12, seed: 502, pitch: 1, lantern: true }),
    stiltHut({ stilts: 0.34, half: 0.15, seed: 503, pitch: 0.4, ladder: true, lantern: true }),
    rainLantern(511),
  ];
}
