import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyMaterialPoint,
  getKnownMaterialProfile,
  type MaterialRegionProfile,
  type Vec3Tuple,
} from "./materialRegions.js";
import { getSampleLevel } from "./samples.js";

const RODIN_SHA256 = "c750cb2c1fcd2197f8c373b791703bc90073075e11d08cafb0be4d84012d54b8";
const RODIN_GLB = path.resolve(__dirname, "../../public/samples/rodin.glb");

function rodinProfile(): MaterialRegionProfile {
  const profile = getKnownMaterialProfile(RODIN_SHA256);
  if (!profile) throw new Error("Rodin profile missing");
  return profile;
}

describe("getKnownMaterialProfile", () => {
  it("returns a box profile for the exact known Rodin sample hash", () => {
    const profile = getKnownMaterialProfile(RODIN_SHA256);
    expect(profile).not.toBeNull();
    expect(new Set(profile?.boxes.map((box) => box.kind))).toEqual(new Set(["fabric", "neutral", "wood"]));
    expect(profile?.edgeSoftness).toBeGreaterThan(0);
  });

  it("returns null for the Tripo sample and any other hash", () => {
    expect(getKnownMaterialProfile("e473288cd9e4b999aaf01631e228510ab24e114a2707eb718d3e5381c240cb64")).toBeNull();
    expect(getKnownMaterialProfile("not-a-real-hash")).toBeNull();
  });

  it("returns null for missing hashes instead of guessing", () => {
    expect(getKnownMaterialProfile(null)).toBeNull();
    expect(getKnownMaterialProfile(undefined)).toBeNull();
    expect(getKnownMaterialProfile("")).toBeNull();
  });
});

/**
 * Points read off the real mesh's world-space vertices and checked against
 * what the object visibly is. An earlier profile took the course's "desk"
 * label at face value and painted the sofa as wood; these pin the actual
 * pieces, so swapping kinds or sliding a boundary into the wrong piece fails.
 */
describe("Rodin measured reference points", () => {
  const cases: { name: string; point: Vec3Tuple; expected: "wood" | "fabric" | "neutral" }[] = [
    { name: "sofa seat under checkpoint 2 (course surface, y 1.286)", point: [2.1, 1.286, 0.354], expected: "fabric" },
    { name: "sofa seat under checkpoint 3", point: [0.3, 1.286, -0.006], expected: "fabric" },
    { name: "sofa backrest", point: [1.5, 2.4, -1.3], expected: "fabric" },
    { name: "sofa left arm top", point: [-0.8, 1.85, 0.3], expected: "fabric" },
    { name: "desk top plane, clear of the laptop and mouse", point: [-3.6, 1.8, 0.6], expected: "wood" },
    { name: "desk top plane right of the laptop", point: [-1.5, 1.8, 0.2], expected: "wood" },
    { name: "laptop keyboard deck, fused into the desk plane at its front", point: [-2.6, 1.81, 0.6], expected: "neutral" },
    { name: "desk drawer pedestal side panel", point: [-1.65, 1.0, 0.0], expected: "wood" },
    { name: "desk leg near the floor", point: [-3.35, 0.2, -1.3], expected: "wood" },
    { name: "laptop screen on the desk", point: [-2.8, 2.3, -0.6], expected: "neutral" },
    { name: "item standing on the desk above its top", point: [-3.3, 2.2, -1.1], expected: "neutral" },
    { name: "sofa foot", point: [-0.9, 0.05, 1.0], expected: "neutral" },
  ];

  for (const { name, point, expected } of cases) {
    it(`classifies the ${name} as ${expected}`, () => {
      const { wood, fabric } = classifyMaterialPoint(rodinProfile(), point);
      expect(wood).toBeCloseTo(expected === "wood" ? 1 : 0, 3);
      expect(fabric).toBeCloseTo(expected === "fabric" ? 1 : 0, 3);
    });
  }
});

/**
 * Same check against the actual shipped bytes: hash them (the profile key),
 * place every vertex with the sample manifest's own transform, and require
 * each piece's geometric signature to land in the right region.
 */
describe("Rodin profile against the real mesh", () => {
  const bytes = readFileSync(RODIN_GLB);

  function worldVertices(): Vec3Tuple[] {
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const binStart = 20 + jsonLength + 8;
    const accessor = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
    const view = gltf.bufferViews[accessor.bufferView];
    const stride = view.byteStride ?? 12;
    const entity = getSampleLevel("sample-rodin-room-corner")?.entities.find((e) => e.kind === "generated-mesh");
    if (!entity || entity.kind !== "generated-mesh") throw new Error("Rodin mesh entity missing");
    const { position, scale, rotation } = entity.transform;
    expect([rotation[0], rotation[1], rotation[2], rotation[3]]).toEqual([0, 0, 0, 1]);
    const out: Vec3Tuple[] = [];
    for (let i = 0; i < accessor.count; i += 1) {
      const offset = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + i * stride;
      out.push([
        bytes.readFloatLE(offset) * scale[0] + position[0],
        bytes.readFloatLE(offset + 4) * scale[1] + position[1],
        bytes.readFloatLE(offset + 8) * scale[2] + position[2],
      ]);
    }
    return out;
  }

  const vertices = worldVertices();
  const profile = rodinProfile();
  const classified = vertices.map((point) => ({ point, ...classifyMaterialPoint(profile, point) }));
  const isWood = (c: { wood: number }) => c.wood > 0.5;
  const isFabric = (c: { fabric: number }) => c.fabric > 0.5;

  it("is keyed to the hash of the bytes it was measured on", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(RODIN_SHA256);
  });

  it("puts the elevated course surface, a seat with a tall backrest behind it, in fabric", () => {
    const seat = classified.filter(
      (c) => c.point[1] > 1.24 && c.point[1] < 1.33 && c.point[0] > -0.2 && c.point[0] < 2.8 && c.point[2] > -0.3 && c.point[2] < 1.0,
    );
    const backrest = classified.filter((c) => c.point[1] > 2.3 && c.point[2] < -1.0 && c.point[0] > -0.9);
    expect(seat.length).toBeGreaterThan(150);
    expect(backrest.length).toBeGreaterThan(150);
    expect(seat.filter(isFabric).length / seat.length).toBeGreaterThan(0.95);
    expect(backrest.filter(isFabric).length / backrest.length).toBeGreaterThan(0.95);
  });

  it("puts the desk top plane (y ≈ 1.8, beside the laptop) and its drawer pedestal in wood", () => {
    const top = classified.filter(
      (c) => c.point[1] > 1.76 && c.point[1] < 1.82 && c.point[0] > -1.8 && c.point[0] < -1.15 && c.point[2] > -0.8 && c.point[2] < 0.9,
    );
    const pedestal = classified.filter(
      (c) => c.point[0] > -1.7 && c.point[0] < -1.1 && c.point[1] > 0.3 && c.point[1] < 1.5,
    );
    expect(top.length).toBeGreaterThan(150);
    expect(pedestal.length).toBeGreaterThan(100);
    expect(top.filter(isWood).length / top.length).toBeGreaterThan(0.95);
    expect(pedestal.filter(isWood).length / pedestal.length).toBeGreaterThan(0.95);
  });

  it("keeps the sofa's left arm, beside the pedestal, out of the wood", () => {
    const arm = classified.filter(
      (c) => c.point[0] > -0.95 && c.point[0] < -0.4 && c.point[1] > 1.75 && c.point[2] > -0.5 && c.point[2] < 1.1,
    );
    expect(arm.length).toBeGreaterThan(50);
    expect(arm.filter(isWood).length).toBe(0);
    expect(arm.filter(isFabric).length / arm.length).toBeGreaterThan(0.95);
  });

  it("leaves everything standing on the desk (laptop, bottles) neutral", () => {
    const onDesk = classified.filter((c) => c.point[0] < -1.1 && c.point[1] > 1.9);
    expect(onDesk.length).toBeGreaterThan(200);
    expect(onDesk.filter((c) => isWood(c) || isFabric(c)).length).toBe(0);
  });

  it("keeps the laptop's keyboard deck, lying almost flush on the desk, out of the wood", () => {
    const deck = classified.filter(
      (c) => c.point[0] > -3.1 && c.point[0] < -2.1 && c.point[2] > -0.4 && c.point[2] < 0.3 && c.point[1] > 1.82 && c.point[1] < 1.9,
    );
    expect(deck.length).toBeGreaterThan(100);
    expect(deck.filter(isWood).length / deck.length).toBeLessThan(0.02);
  });

  it("covers most of the mesh, so the checks above are not passing on empty boxes", () => {
    const covered = classified.filter((c) => isWood(c) || isFabric(c)).length;
    // About a fifth of the vertices are the laptop, desk-top items, sofa feet
    // and floor patches, which stay neutral on purpose.
    expect(covered / classified.length).toBeGreaterThan(0.75);
  });
});
