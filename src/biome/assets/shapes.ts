/**
 * Shape primitives for biome asset builders: sculpted replacements for raw
 * cylinders, spheres and cones.
 *
 *  - {@link tube}: a ring-swept tube along a curved spine (trunks, cactus
 *    columns and arms, branches, driftwood) with tapering, ribs, segment
 *    bulges and a rounded or pointed cap.
 *  - {@link lobe}: a squashed, jittered, flat-bottomed blob (foliage masses,
 *    succulent pads).
 *  - {@link hull}: a faceted rock body with planar cuts and a flat base.
 *  - {@link blade}: a folded, drooping, optionally serrated ribbon (palm
 *    fronds, broad leaves, grass and dry blades).
 *
 * All are deterministic. Each returns a native-size BufferGeometry that the
 * caller hands to `MeshKit.add`, optionally with `color` / `aSway` attributes.
 */
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Stable hash in [0, 1) of up to three numbers and a seed. */
export function hash01(a: number, b = 0, c = 0, seed = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed * 19.19) * 43758.5453123;
  return s - Math.floor(s);
}

/** Small seeded stream for builders (mulberry32). */
export function builderRandom(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function attach(
  geometry: THREE.BufferGeometry,
  colors: number[] | null,
  sway: number[] | null,
): THREE.BufferGeometry {
  if (colors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (sway) geometry.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 1));
  return geometry;
}

// ---------------------------------------------------------------------------
// Tube

export interface TubeOptions {
  /** Centre line, t in [0, 1] from base to tip. */
  spine: (t: number) => THREE.Vector3;
  /** Radius at t and around-angle a (radians). */
  radius: (t: number, angle: number) => number;
  rings: number;
  sides: number;
  /** How the tip closes: a rounded dome, a point, or open. */
  cap?: "dome" | "point" | "open";
  /** Dome height as a multiple of the tip radius (default 1). */
  domeScale?: number;
  /** Close the base with a flat disc (default false: bases sit in the ground). */
  closeBase?: boolean;
  /** Linear vertex colour at t (dome vertices use t = 1 + k) and angle. */
  color?: ((t: number, angle: number) => THREE.Color) | undefined;
  sway?: ((t: number) => number) | undefined;
}

export function tube(options: TubeOptions): THREE.BufferGeometry {
  const { spine, radius, rings, sides } = options;
  const positions: number[] = [];
  const colors: number[] | null = options.color ? [] : null;
  const sway: number[] | null = options.sway ? [] : null;
  const index: number[] = [];

  // Parallel-transport frames along the spine, so tubes that turn
  // horizontal (cactus elbows, fallen logs) never twist or collapse.
  const frames: { point: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3; binormal: THREE.Vector3 }[] = [];
  let normal = new THREE.Vector3();
  for (let r = 0; r <= rings; r += 1) {
    const t = r / rings;
    const point = spine(t);
    const ahead = spine(Math.min(1, t + 1e-3));
    const behind = spine(Math.max(0, t - 1e-3));
    const tangent = ahead.sub(behind).normalize();
    if (r === 0) {
      const reference = Math.abs(tangent.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      normal = reference.sub(tangent.clone().multiplyScalar(reference.dot(tangent))).normalize();
    } else {
      normal = normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
    }
    frames.push({ point, tangent, normal: normal.clone(), binormal: new THREE.Vector3().crossVectors(tangent, normal) });
  }
  const pushVertex = (v: THREE.Vector3, t: number, angle: number) => {
    positions.push(v.x, v.y, v.z);
    if (colors) {
      const c = options.color!(t, angle);
      colors.push(c.r, c.g, c.b);
    }
    if (sway) sway.push(options.sway!(Math.min(1, t)));
  };
  const v = new THREE.Vector3();
  for (let r = 0; r <= rings; r += 1) {
    const t = r / rings;
    const f = frames[r]!;
    for (let s = 0; s < sides; s += 1) {
      const angle = (s / sides) * Math.PI * 2;
      const rr = radius(t, angle);
      v.copy(f.point).addScaledVector(f.normal, Math.cos(angle) * rr).addScaledVector(f.binormal, Math.sin(angle) * rr);
      pushVertex(v, t, angle);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < sides; s += 1) {
      const a = r * sides + s;
      const b = r * sides + ((s + 1) % sides);
      const c = (r + 1) * sides + s;
      const d = (r + 1) * sides + ((s + 1) % sides);
      index.push(a, b, d, a, d, c);
    }
  }

  const cap = options.cap ?? "dome";
  const tip = frames[rings]!;
  let lastRing = rings * sides;
  if (cap === "dome") {
    const domeRings = 2;
    const domeScale = options.domeScale ?? 1;
    for (let k = 1; k <= domeRings; k += 1) {
      const phi = (k / (domeRings + 1)) * (Math.PI / 2);
      const ringStart = positions.length / 3;
      for (let s = 0; s < sides; s += 1) {
        const angle = (s / sides) * Math.PI * 2;
        const rr = radius(1, angle) * Math.cos(phi);
        v.copy(tip.point)
          .addScaledVector(tip.tangent, radius(1, angle) * Math.sin(phi) * domeScale)
          .addScaledVector(tip.normal, Math.cos(angle) * rr)
          .addScaledVector(tip.binormal, Math.sin(angle) * rr);
        pushVertex(v, 1 + k / (domeRings + 1), angle);
      }
      for (let s = 0; s < sides; s += 1) {
        const a = lastRing + s;
        const b = lastRing + ((s + 1) % sides);
        const c = ringStart + s;
        const d = ringStart + ((s + 1) % sides);
        index.push(a, b, d, a, d, c);
      }
      lastRing = ringStart;
    }
    let mean = 0;
    for (let s = 0; s < sides; s += 1) mean += radius(1, (s / sides) * Math.PI * 2);
    mean /= sides;
    v.copy(tip.point).addScaledVector(tip.tangent, mean * domeScale);
    const apex = positions.length / 3;
    pushVertex(v, 2, 0);
    for (let s = 0; s < sides; s += 1) index.push(lastRing + s, lastRing + ((s + 1) % sides), apex);
  } else if (cap === "point") {
    const apex = positions.length / 3;
    v.copy(tip.point);
    pushVertex(v, 1, 0);
    for (let s = 0; s < sides; s += 1) index.push(lastRing + s, lastRing + ((s + 1) % sides), apex);
  }
  if (options.closeBase) {
    const centre = positions.length / 3;
    pushVertex(frames[0]!.point.clone(), 0, 0);
    for (let s = 0; s < sides; s += 1) index.push(s, centre, (s + 1) % sides);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  attach(geometry, colors, sway);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Lobe

export interface LobeOptions {
  radius: readonly [number, number, number];
  /** Icosahedron subdivision: 0 (20 faces) or 1 (80 faces). */
  detail: 0 | 1 | 2;
  /** Radial jitter as a fraction of the radius. */
  jitter: number;
  seed: number;
  /** Clamp vertices below this fraction of the y radius (flat underside). */
  floor?: number;
  center?: readonly [number, number, number];
}

export function lobe(options: LobeOptions): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(1, options.detail);
  raw.deleteAttribute("normal");
  raw.deleteAttribute("uv");
  const geometry = mergeVertices(raw);
  raw.dispose();
  const position = geometry.getAttribute("position");
  const [rx, ry, rz] = options.radius;
  const [cx, cy, cz] = options.center ?? [0, 0, 0];
  const floor = options.floor ?? -1;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k = 1 + (hash01(x * 3.1, y * 3.1, z * 3.1, options.seed) - 0.5) * 2 * options.jitter;
    const yy = Math.max(floor, y * k);
    position.setXYZ(i, cx + x * k * rx, cy + yy * ry, cz + z * k * rz);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Hull (rocks)

export interface HullOptions {
  scale: readonly [number, number, number];
  detail: 0 | 1;
  jitter: number;
  seed: number;
  /** Planes (unit-ish normal, offset in the unit sphere) that shave flat facets. */
  cuts?: readonly { normal: readonly [number, number, number]; offset: number }[];
  /** Flat base at this fraction of the y radius (e.g. -0.35). */
  floor: number;
}

export function hull(options: HullOptions): THREE.BufferGeometry {
  const raw = options.detail === 0 ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 1);
  raw.deleteAttribute("normal");
  raw.deleteAttribute("uv");
  const geometry = mergeVertices(raw);
  raw.dispose();
  const position = geometry.getAttribute("position");
  const p = new THREE.Vector3();
  const planes = (options.cuts ?? []).map((cut) => ({
    normal: new THREE.Vector3(...cut.normal).normalize(),
    offset: cut.offset,
  }));
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i);
    p.multiplyScalar(1 + (hash01(p.x * 2.3, p.y * 2.3, p.z * 2.3, options.seed) - 0.5) * 2 * options.jitter);
    for (const plane of planes) {
      const d = p.dot(plane.normal);
      if (d > plane.offset) p.addScaledVector(plane.normal, plane.offset - d);
    }
    p.y = Math.max(options.floor, p.y);
    position.setXYZ(i, p.x * options.scale[0], p.y * options.scale[1], p.z * options.scale[2]);
  }
  return geometry;
}

// ---------------------------------------------------------------------------
// Blade

export interface BladeOptions {
  length: number;
  segments: number;
  /** Half-width at t (0 at the base, 1 at the tip). */
  width: (t: number) => number;
  /** Height of the midrib at t (droop/rise), in native units. */
  lift: (t: number) => number;
  /** V-fold: edges sit this fraction of the half-width below the midrib. */
  fold?: number | undefined;
  /** Serrate the outline: every other row narrows to this fraction (leaflets). */
  serrate?: number | undefined;
  /** Sideways curve of the midrib at t (z offset). */
  sweep?: ((t: number) => number) | undefined;
  /** Linear colour at t and side (−1 edge, 0 midrib, 1 edge). */
  color?: ((t: number, side: number) => THREE.Color) | undefined;
  sway?: ((t: number) => number) | undefined;
}

/**
 * A blade along +X. Three vertices per row (edge, midrib, edge) so the fold
 * reads as a real leaf keel; a serrated outline reads as leaflets without
 * a triangle per leaflet.
 */
export function blade(options: BladeOptions): THREE.BufferGeometry {
  const { length, segments } = options;
  const fold = options.fold ?? 0.3;
  const positions: number[] = [];
  const colors: number[] | null = options.color ? [] : null;
  const sway: number[] | null = options.sway ? [] : null;
  const index: number[] = [];
  for (let r = 0; r <= segments; r += 1) {
    const t = r / segments;
    const x = t * length;
    const y = options.lift(t);
    const z = options.sweep ? options.sweep(t) : 0;
    let w = r === segments ? 0 : options.width(t);
    if (options.serrate !== undefined && r % 2 === 1) w *= options.serrate;
    for (const side of [-1, 0, 1]) {
      positions.push(x, y - (side === 0 ? 0 : fold * w), z + side * w);
      if (colors) {
        const c = options.color!(t, side);
        colors.push(c.r, c.g, c.b);
      }
      if (sway) sway.push(options.sway!(t));
    }
  }
  for (let r = 0; r < segments; r += 1) {
    const a = r * 3;
    const b = (r + 1) * 3;
    // left strip (edge −1 → midrib), right strip (midrib → edge +1); faces up.
    index.push(a, b, a + 1, a + 1, b, b + 1);
    index.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  attach(geometry, colors, sway);
  geometry.computeVertexNormals();
  return geometry;
}

/** Applies a matrix to a geometry in place and returns it (for chaining). */
export function place(geometry: THREE.BufferGeometry, transform: {
  rotateX?: number; rotateY?: number; rotateZ?: number; scale?: readonly [number, number, number];
  translate?: readonly [number, number, number];
}): THREE.BufferGeometry {
  if (transform.scale) geometry.scale(...transform.scale);
  if (transform.rotateZ) geometry.rotateZ(transform.rotateZ);
  if (transform.rotateX) geometry.rotateX(transform.rotateX);
  if (transform.rotateY) geometry.rotateY(transform.rotateY);
  if (transform.translate) geometry.translate(...transform.translate);
  return geometry;
}
