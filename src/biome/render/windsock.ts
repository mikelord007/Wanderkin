/**
 * A striped windsock whose tail points DOWNWIND along the shared wind. Its
 * direction is set once from `downwindYaw`; animation only adds a small
 * flutter around that heading, so it can never disagree with the dust and
 * foliage. Unit height 1 with its base on y = 0, like every biome prop.
 */
import * as THREE from "three";
import type { BiomeDefinition } from "../types.js";
import { clampWindStrength, downwindYaw } from "./wind.js";

export const WINDSOCK_PIVOT = new THREE.Vector3(0.03, 0.93, 0);
export const WINDSOCK_LENGTH = 0.56;

export interface Windsock {
  group: THREE.Group;
  /** The rotating sock; local +X runs from the pole out to the tail. */
  sock: THREE.Group;
  geometries: THREE.BufferGeometry[];
  baseYaw: number;
  droop: number;
  update(elapsed: number, motion: number): void;
}

function colored(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute("uv");
  flat.computeVertexNormals();
  const count = flat.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) color.toArray(colors, i * 3);
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  flat.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(count), 1));
  // Local pivot at the mesh origin, unit height: the prop shader's fade then
  // scales with the windsock's world size. It never sways (aSway = 0).
  const pivots = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) pivots[i * 4 + 3] = 1;
  flat.setAttribute("aPivot", new THREE.BufferAttribute(pivots, 4));
  return flat;
}

export function createWindsock(
  definition: BiomeDefinition,
  material: THREE.Material,
  castShadow: boolean,
): Windsock {
  const { palette, wind } = definition;
  const strength = clampWindStrength(wind.strength);
  const pole = new THREE.CylinderGeometry(0.018, 0.026, 0.95, 6);
  pole.translate(0, 0.475, 0);
  const cap = new THREE.SphereGeometry(0.03, 8, 6);
  cap.translate(0, 0.96, 0);
  const foot = new THREE.CylinderGeometry(0.07, 0.09, 0.04, 8);
  foot.translate(0, 0.02, 0);
  const wood = new THREE.Color(palette.wood);
  const poleParts = [colored(pole, wood), colored(cap, new THREE.Color(palette.accent)), colored(foot, wood.clone().offsetHSL(0, 0, -0.08))];

  // Four stripes of a tapering, open cone laid along +X.
  const stripes = 4;
  const sockParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < stripes; i += 1) {
    const x0 = (i / stripes) * WINDSOCK_LENGTH;
    const x1 = ((i + 1) / stripes) * WINDSOCK_LENGTH;
    const r0 = 0.09 - (i / stripes) * 0.045;
    const r1 = 0.09 - ((i + 1) / stripes) * 0.045;
    const band = new THREE.CylinderGeometry(r1, r0, x1 - x0, 10, 1, true);
    band.rotateZ(-Math.PI / 2); // cylinder +Y axis now runs along +X
    band.translate((x0 + x1) / 2, 0, 0);
    sockParts.push(colored(band, new THREE.Color(i % 2 === 0 ? palette.accent : "#f7f3ea")));
  }
  const ring = new THREE.TorusGeometry(0.09, 0.008, 4, 12);
  ring.rotateY(Math.PI / 2);
  sockParts.push(colored(ring, new THREE.Color("#3a3a3a")));

  const poleMesh = new THREE.Mesh(mergeAll(poleParts), material);
  poleMesh.castShadow = castShadow;
  poleMesh.receiveShadow = true;
  const sockGeometry = mergeAll(sockParts, true);
  const sockMesh = new THREE.Mesh(sockGeometry, material);
  sockMesh.castShadow = castShadow;
  const sock = new THREE.Group();
  sock.name = "biome-windsock-sock";
  sock.position.copy(WINDSOCK_PIVOT);
  sock.add(sockMesh);

  const group = new THREE.Group();
  group.name = "biome-windsock";
  group.add(poleMesh, sock);

  const baseYaw = downwindYaw(wind.direction);
  // Limp at no wind, nearly horizontal in a strong one.
  const droop = -(1 - strength) * 0.85 - 0.08;
  sock.rotation.set(0, baseYaw, droop);

  return {
    group,
    sock,
    geometries: [poleMesh.geometry, sockGeometry],
    baseYaw,
    droop,
    update(elapsed, motion) {
      const flutter = motion * (0.05 + 0.06 * strength);
      sock.rotation.y = baseYaw + Math.sin(elapsed * 3.1) * flutter * 0.6;
      sock.rotation.z = droop + Math.sin(elapsed * 4.3 + 1.2) * flutter;
    },
  };
}

function mergeAll(parts: THREE.BufferGeometry[], doubleSided = false): THREE.BufferGeometry {
  // Double-sided look for the open sock without a second material: append
  // each part again with reversed winding and flipped normals.
  const out: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    out.push(part);
    if (!doubleSided) continue;
    const back = part.clone();
    const position = back.getAttribute("position") as THREE.BufferAttribute;
    const normal = back.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i += 3) {
      for (const attribute of [position, normal, back.getAttribute("color") as THREE.BufferAttribute]) {
        const a = [attribute.getX(i + 1), attribute.getY(i + 1), attribute.getZ(i + 1)] as const;
        attribute.setXYZ(i + 1, attribute.getX(i + 2), attribute.getY(i + 2), attribute.getZ(i + 2));
        attribute.setXYZ(i + 2, a[0], a[1], a[2]);
      }
    }
    for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
    out.push(back);
  }
  let vertexCount = 0;
  for (const g of out) vertexCount += g.getAttribute("position").count;
  const merged = new THREE.BufferGeometry();
  for (const [name, size] of [["position", 3], ["normal", 3], ["color", 3], ["aSway", 1], ["aPivot", 4]] as const) {
    const array = new Float32Array(vertexCount * size);
    let offset = 0;
    for (const g of out) {
      const source = g.getAttribute(name).array as Float32Array;
      array.set(source, offset);
      offset += source.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  for (const g of out) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}
