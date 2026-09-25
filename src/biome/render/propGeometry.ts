/**
 * Procedural low-poly biome props. Each kind is ONE merged, vertex-coloured
 * geometry so a whole kind draws as a single `InstancedMesh`.
 *
 * Every unit prop stands on y = 0, is exactly {@link UNIT_PROP_HEIGHT} tall,
 * and stays inside a vertical cylinder of radius `PROP_UNIT_RADIUS[kind]`.
 * A placement's world `scale` is therefore the prop's world height, and the
 * layer never lets `scale * PROP_UNIT_RADIUS[kind]` exceed the clearance
 * radius geometry approved (see `decorLayer.ts`).
 *
 * `aSway` (0..1) is how much a vertex follows the wind: 0 at the root, rising
 * toward leaf tips. Rigid kinds are all zero.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BiomeDefinition, BiomePropKind } from "../types.js";

export type InstancedPropKind = Exclude<BiomePropKind, "windsock">;

export const UNIT_PROP_HEIGHT = 1;

/** Conservative horizontal extent of each unit prop, measured from its axis. */
export const PROP_UNIT_RADIUS: Readonly<Record<BiomePropKind, number>> = {
  palm: 0.62,
  shrub: 0.8,
  rock: 0.9,
  wood: 0.36,
  cactus: 0.34,
  "dry-plant": 0.68,
  windsock: 0.62,
};

/** Kinds that sway with the wind; rigid kinds skip the sway shader. */
export const SWAYING_KINDS: ReadonlySet<BiomePropKind> = new Set(["palm", "shrub", "dry-plant"]);

/** Kinds tall/solid enough that their shadow helps ground them. */
export const SHADOW_CASTING_KINDS: ReadonlySet<BiomePropKind> = new Set(["palm", "rock", "cactus", "windsock"]);

type SwayFn = (y: number) => number;

function shade(hex: string, lightness: number, saturation = 0): THREE.Color {
  return new THREE.Color(hex).offsetHSL(0, saturation, lightness);
}

/**
 * Normalizes a primitive into the shared attribute layout (position, normal,
 * color, aSway; non-indexed) so every part of a kind can merge.
 */
function part(geometry: THREE.BufferGeometry, color: THREE.Color, sway: SwayFn | number = 0): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute("uv");
  flat.computeVertexNormals();
  const position = flat.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const swayValues = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    swayValues[i] = typeof sway === "number" ? sway : Math.min(1, Math.max(0, sway(position.getY(i))));
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  flat.setAttribute("aSway", new THREE.BufferAttribute(swayValues, 1));
  return flat;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error("Biome prop parts failed to merge");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Stable pseudo-random value in [0, 1) from a position; shared corners of a
 * non-indexed mesh hash identically, so jitter never tears faces apart. */
function positionHash(x: number, y: number, z: number, salt: number): number {
  const s = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + salt) * 43758.5453;
  return s - Math.floor(s);
}

function palm(palette: BiomeDefinition["palette"]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkHeight = 0.78;
  const trunk = new THREE.CylinderGeometry(0.035, 0.06, trunkHeight, 6, 5);
  trunk.translate(0, trunkHeight / 2, 0);
  const tp = trunk.getAttribute("position");
  for (let i = 0; i < tp.count; i += 1) {
    const t = tp.getY(i) / trunkHeight;
    tp.setX(i, tp.getX(i) + 0.1 * t * t);
  }
  parts.push(part(trunk, shade(palette.wood, 0.04), (y) => (y / trunkHeight) * 0.35));

  const crownX = 0.1;
  const crownY = trunkHeight;
  const frondCount = 7;
  for (let i = 0; i < frondCount; i += 1) {
    const angle = (i / frondCount) * Math.PI * 2 + 0.2;
    // A flattened cone laid on its side makes a pointed leaf that droops.
    const frond = new THREE.ConeGeometry(0.075, 0.42, 4, 2);
    frond.scale(1, 1, 0.22);
    frond.rotateZ(-Math.PI / 2); // tip now points +X
    frond.translate(0.21, 0, 0);
    const fp = frond.getAttribute("position");
    for (let v = 0; v < fp.count; v += 1) {
      const along = fp.getX(v) / 0.42;
      fp.setY(v, fp.getY(v) + 0.09 * along - 0.2 * along * along);
    }
    frond.rotateY(angle);
    frond.translate(crownX, crownY + 0.02, 0);
    const tone = i % 2 === 0 ? shade(palette.vegetation, 0.02) : shade(palette.vegetation, -0.06);
    parts.push(part(frond, tone, (y) => 0.4 + (1 - Math.abs(y - crownY) * 3) * 0.6));
  }
  for (let i = 0; i < 3; i += 1) {
    const nut = new THREE.IcosahedronGeometry(0.035, 0);
    const a = (i / 3) * Math.PI * 2;
    nut.translate(crownX + Math.cos(a) * 0.04, crownY - 0.03, Math.sin(a) * 0.04);
    parts.push(part(nut, shade(palette.wood, -0.12), 0.35));
  }
  const geometry = merge(parts);
  fitHeight(geometry);
  return geometry;
}

function shrub(palette: BiomeDefinition["palette"]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: Array<[number, number, number, number]> = [
    [0, 0.42, 0, 0.42],
    [0.26, 0.3, 0.1, 0.3],
    [-0.24, 0.28, -0.08, 0.3],
    [0.02, 0.3, -0.26, 0.28],
  ];
  blobs.forEach(([x, y, z, r], index) => {
    const blob = new THREE.IcosahedronGeometry(r, 0);
    blob.translate(x, y, z);
    const tone = shade(palette.vegetation, index === 0 ? 0.03 : -0.05 + index * 0.015);
    parts.push(part(blob, tone, (vy) => vy * 1.1));
  });
  const geometry = merge(parts);
  fitHeight(geometry);
  return geometry;
}

function rock(palette: BiomeDefinition["palette"]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const main = new THREE.DodecahedronGeometry(0.5, 0);
  const mp = main.getAttribute("position");
  for (let i = 0; i < mp.count; i += 1) {
    const x = mp.getX(i);
    const y = mp.getY(i);
    const z = mp.getZ(i);
    const k = 0.82 + positionHash(x, y, z, 1) * 0.3;
    mp.setXYZ(i, x * k * 1.25, y * k * 0.8, z * k * 1.05);
  }
  main.translate(0, 0.3, 0);
  parts.push(part(main, shade(palette.rock, 0)));
  const pebble = new THREE.DodecahedronGeometry(0.2, 0);
  pebble.scale(1.1, 0.7, 1);
  pebble.translate(0.3, 0.1, 0.24);
  parts.push(part(pebble, shade(palette.rock, -0.07)));
  const geometry = merge(parts);
  fitHeight(geometry, true);
  return geometry;
}

function wood(palette: BiomeDefinition["palette"]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const post = new THREE.BoxGeometry(0.11, 1, 0.11);
  post.translate(0, 0.5, 0);
  parts.push(part(post, shade(palette.wood, 0)));
  const board = new THREE.BoxGeometry(0.5, 0.2, 0.05);
  board.translate(0.08, 0.74, 0.07);
  board.rotateY(0.1);
  parts.push(part(board, shade(palette.wood, 0.1)));
  const band = new THREE.BoxGeometry(0.13, 0.05, 0.13);
  band.translate(0, 0.9, 0);
  parts.push(part(band, new THREE.Color(palette.accent)));
  const geometry = merge(parts);
  fitHeight(geometry);
  return geometry;
}

function cactus(palette: BiomeDefinition["palette"]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const green = shade(palette.vegetation, -0.04, -0.05);
  const column = new THREE.CapsuleGeometry(0.13, 0.72, 2, 7);
  column.translate(0, 0.49, 0);
  parts.push(part(column, green));
  const arm = (side: 1 | -1, height: number, reach: number) => {
    const elbow = new THREE.CapsuleGeometry(0.07, reach, 1, 5);
    elbow.rotateZ(Math.PI / 2);
    elbow.translate(side * (0.12 + reach / 2), height, 0);
    parts.push(part(elbow, green));
    const up = new THREE.CapsuleGeometry(0.07, 0.24, 1, 5);
    up.translate(side * (0.12 + reach), height + 0.14, 0);
    parts.push(part(up, shade(palette.vegetation, 0.02, -0.05)));
  };
  arm(1, 0.46, 0.12);
  arm(-1, 0.6, 0.1);
  const geometry = merge(parts);
  fitHeight(geometry);
  return geometry;
}

function dryPlant(palette: BiomeDefinition["palette"]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 9;
  const dry = shade(palette.sand, -0.12, -0.1);
  for (let i = 0; i < blades; i += 1) {
    const a = (i / blades) * Math.PI * 2 + (i % 2) * 0.3;
    const height = 0.7 + (i % 3) * 0.15;
    const blade = new THREE.ConeGeometry(0.035, height, 3, 1);
    blade.translate(0, height / 2, 0);
    blade.rotateZ(0.35 + (i % 3) * 0.12);
    blade.rotateY(a);
    parts.push(part(blade, i % 2 === 0 ? dry : shade(palette.vegetation, -0.08, -0.25), (y) => y));
  }
  const geometry = merge(parts);
  fitHeight(geometry);
  return geometry;
}

/** Rescales so the prop is exactly one unit tall with its base on y = 0.
 * `sink` rests the lowest point slightly below 0 so irregular bottoms (rocks)
 * never hover on an uneven scan. */
function fitHeight(geometry: THREE.BufferGeometry, sink = false): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const height = box.max.y - box.min.y;
  if (height > 0) geometry.translate(0, -box.min.y, 0);
  if (height > 0) geometry.scale(UNIT_PROP_HEIGHT / height, UNIT_PROP_HEIGHT / height, UNIT_PROP_HEIGHT / height);
  if (sink) geometry.translate(0, -0.08, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

const BUILDERS: Readonly<Record<InstancedPropKind, (palette: BiomeDefinition["palette"]) => THREE.BufferGeometry>> = {
  palm,
  shrub,
  rock,
  wood,
  cactus,
  "dry-plant": dryPlant,
};

export function createPropGeometry(kind: InstancedPropKind, palette: BiomeDefinition["palette"]): THREE.BufferGeometry {
  return BUILDERS[kind](palette);
}

/** Largest horizontal distance of any vertex from the prop's axis. */
export function horizontalExtent(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  let max = 0;
  for (let i = 0; i < position.count; i += 1) {
    max = Math.max(max, Math.hypot(position.getX(i), position.getZ(i)));
  }
  return max;
}
