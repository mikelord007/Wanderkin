/**
 * The character mesh is generated, so these check the properties that would
 * actually show up as visible defects: inside-out lighting, a body that pokes
 * out of its own collider, broken skin weights, or an unwelded seam.
 */

import { describe, expect, it } from "vitest";
import {
  CHARACTER_PARTS,
  CHARACTER_UNIT_HALF_WIDTH,
  FACE_ANCHORS,
  HEAD_RING_HEIGHTS,
  headSurfaceV,
  type PartDefinition,
} from "./characterDesign.js";
import {
  ATLAS_WHITE_UV,
  FACE_UV_ORIGIN,
  FACE_UV_SPAN,
  buildCharacterMeshData,
  sectionFrame,
} from "./characterGeometry.js";
import { BONE_NAMES } from "./characterRig.js";

const data = buildCharacterMeshData(BONE_NAMES);

function vertex(index: number): [number, number, number] {
  return [
    data.positions[index * 3]!,
    data.positions[index * 3 + 1]!,
    data.positions[index * 3 + 2]!,
  ];
}

function normalAt(index: number): [number, number, number] {
  return [
    data.normals[index * 3]!,
    data.normals[index * 3 + 1]!,
    data.normals[index * 3 + 2]!,
  ];
}

describe("character mesh", () => {
  it("is a single indexed mesh covering every authored part", () => {
    expect(data.vertexCount).toBeGreaterThan(600);
    expect(data.indices.length % 3).toBe(0);
    for (const part of CHARACTER_PARTS) {
      const range = data.partRanges.get(part.name);
      expect(range, `missing part ${part.name}`).toBeDefined();
      expect(range!.count).toBeGreaterThan(part.sides);
    }
  });

  it("indexes only vertices that exist", () => {
    let max = -1;
    for (const index of data.indices) max = Math.max(max, index);
    expect(max).toBe(data.vertexCount - 1);
  });

  it("has unit-length normals that face outward from the surface", () => {
    // Sampled against each ring's own centre: a normal pointing inward is the
    // signature of a flipped winding, which renders as a black, inside-out body.
    for (const part of CHARACTER_PARTS) {
      const range = data.partRanges.get(part.name)!;
      const columns = part.sides + 1;
      for (let r = 1; r < part.rings.length - 1; r += 1) {
        const ring = part.rings[r]!;
        for (let c = 0; c < part.sides; c += 1) {
          const index = range.start + r * columns + c;
          const [px, py, pz] = vertex(index);
          const [nx, ny, nz] = normalAt(index);
          expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
          const outward =
            (px - ring.at[0]) * nx + (py - ring.at[1]) * ny + (pz - ring.at[2]) * nz;
          expect(outward, `${part.name} ring ${r} column ${c} faces inward`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("stands exactly one unit tall with the soles on the capsule floor", () => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (let v = 0; v < data.vertexCount; v += 1) {
      const y = data.positions[v * 3 + 1]!;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    // Soles sit a hair below the capsule's lowest point so the character never
    // looks like it is hovering (the controller holds the capsule a skin width
    // off the floor anyway); the crown stays inside the capsule.
    expect(minY).toBeGreaterThan(-0.512);
    expect(minY).toBeLessThan(-0.495);
    expect(maxY).toBeLessThan(0.5);
    expect(maxY - minY).toBeGreaterThan(0.94);
  });

  it("stays inside its own collider, so the visible body never clips through walls", () => {
    for (let v = 0; v < data.vertexCount; v += 1) {
      const x = data.positions[v * 3]!;
      const z = data.positions[v * 3 + 2]!;
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(CHARACTER_UNIT_HALF_WIDTH);
    }
  });

  it("gives every vertex normalized skin weights bound to real bones", () => {
    for (let v = 0; v < data.vertexCount; v += 1) {
      let total = 0;
      for (let slot = 0; slot < 4; slot += 1) {
        const weight = data.skinWeights[v * 4 + slot]!;
        const bone = data.skinIndices[v * 4 + slot]!;
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(bone).toBeLessThan(BONE_NAMES.length);
        total += weight;
      }
      expect(total).toBeCloseTo(1, 5);
    }
  });

  it("maps only the head into the face atlas and everything else onto flat white", () => {
    for (const part of CHARACTER_PARTS) {
      const range = data.partRanges.get(part.name)!;
      for (let v = range.start; v < range.start + range.count; v += 1) {
        const u = data.uvs[v * 2]!;
        const w = data.uvs[v * 2 + 1]!;
        if (part.faceMapped) {
          expect(u).toBeGreaterThanOrEqual(FACE_UV_ORIGIN - 1e-6);
          expect(u).toBeLessThanOrEqual(FACE_UV_ORIGIN + FACE_UV_SPAN + 1e-6);
          expect(w).toBeGreaterThanOrEqual(FACE_UV_ORIGIN - 1e-6);
          expect(w).toBeLessThanOrEqual(FACE_UV_ORIGIN + FACE_UV_SPAN + 1e-6);
        } else {
          expect(u).toBeCloseTo(ATLAS_WHITE_UV[0], 5);
          expect(w).toBeCloseTo(ATLAS_WHITE_UV[1], 5);
        }
      }
    }
  });

  it("welds the UV seam so lighting is continuous around each part", () => {
    for (const part of CHARACTER_PARTS) {
      const range = data.partRanges.get(part.name)!;
      const columns = part.sides + 1;
      for (let r = 0; r < part.rings.length; r += 1) {
        const first = range.start + r * columns;
        const duplicate = first + part.sides;
        const a = vertex(first);
        const b = vertex(duplicate);
        for (let axis = 0; axis < 3; axis += 1) expect(a[axis]!).toBeCloseTo(b[axis]!, 5);
        expect(normalAt(first)).toEqual(normalAt(duplicate));
      }
    }
  });

  it("keeps the head's face pointing forward in the atlas", () => {
    // theta = 0 lands on +Z; that column must sit at the centre of the art
    // region, or the eyes are drawn on the back of the head.
    const head = CHARACTER_PARTS.find((part) => part.faceMapped)!;
    const range = data.partRanges.get(head.name)!;
    const columns = head.sides + 1;
    const frontColumn = head.sides / 2;
    const index = range.start + 3 * columns + frontColumn;
    expect(vertex(index)[2]).toBeGreaterThan(0);
    expect(data.uvs[index * 2]!).toBeCloseTo(FACE_UV_ORIGIN + FACE_UV_SPAN / 2, 5);
  });

  it("leaves the face clear of the goggle band", () => {
    // The first version of this design put the goggles straight across the
    // eyes, because the face art was positioned in UV space by eye while the
    // head's UVs actually run along its ring index. Everything on the face has
    // to sit below the lowest goggle ring.
    const goggles = CHARACTER_PARTS.find((part) => part.name === "goggles")!;
    const lowestBand = Math.min(...goggles.rings.map((ring) => ring.at[1]));
    for (const [feature, height] of Object.entries(FACE_ANCHORS)) {
      if (feature.startsWith("cap")) {
        expect(height, `${feature} should be above the goggles`).toBeGreaterThan(lowestBand);
      } else {
        expect(height, `${feature} is hidden behind the goggles`).toBeLessThan(lowestBand);
      }
    }
  });

  it("converts a face height to the head's sweep parameter", () => {
    // Exactly the conversion the face art depends on; a linear height→V
    // assumption would fail here because the head's rings are not evenly spaced.
    const last = HEAD_RING_HEIGHTS.length - 1;
    expect(headSurfaceV(HEAD_RING_HEIGHTS[0]!)).toBe(0);
    expect(headSurfaceV(HEAD_RING_HEIGHTS[last]!)).toBe(1);
    expect(headSurfaceV(-5)).toBe(0);
    expect(headSurfaceV(5)).toBe(1);
    for (let i = 0; i <= last; i += 1) {
      expect(headSurfaceV(HEAD_RING_HEIGHTS[i]!)).toBeCloseTo(i / last, 9);
    }
    // Monotonic across the whole span.
    let previous = -1;
    for (let step = 0; step <= 100; step += 1) {
      const height = 0.19 + (step / 100) * 0.3;
      const v = headSurfaceV(height);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  it("puts the eye height on skin, not on the cap", () => {
    const head = CHARACTER_PARTS.find((part) => part.name === "head")!;
    const eyeRing = head.rings.find((ring) => ring.at[1] === FACE_ANCHORS.eyes);
    expect(eyeRing?.zone).toBe("skin");
    const crownRing = head.rings.find((ring) => ring.at[1] > FACE_ANCHORS.capBrim);
    expect(crownRing?.zone).toBe("cap");
  });

  it("builds a stable cross-section frame even when a sweep runs along +Z", () => {
    const straightUp = sectionFrame({ x: 0, y: 1, z: 0 });
    expect(straightUp.localZ.z).toBeCloseTo(1, 6);
    expect(Math.abs(straightUp.localX.x)).toBeCloseTo(1, 6);

    const alongZ = sectionFrame({ x: 0, y: 0, z: 1 });
    for (const value of [
      alongZ.localX.x,
      alongZ.localX.y,
      alongZ.localX.z,
      alongZ.localZ.x,
      alongZ.localZ.y,
      alongZ.localZ.z,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(Math.hypot(alongZ.localX.x, alongZ.localX.y, alongZ.localX.z)).toBeCloseTo(1, 6);
  });

  it("rejects a design that names a bone the rig does not have", () => {
    const broken: PartDefinition = {
      name: "broken",
      sides: 4,
      startCap: "open",
      endCap: "open",
      rings: [
        { at: [0, 0, 0], rx: 0.1, zone: "suit", weights: [{ bone: "tail", weight: 1 }] },
        { at: [0, 0.1, 0], rx: 0.1, zone: "suit", weights: [{ bone: "tail", weight: 1 }] },
      ],
    };
    expect(() => buildCharacterMeshData(BONE_NAMES, [broken])).toThrow(/tail/);
  });
});
