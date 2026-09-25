import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { BiomePropKind, BiomePropPlacement } from "../types.js";
import { PROP_UNIT_RADIUS } from "../render/propGeometry.js";
import { seededRandom } from "../render/selection.js";
import { bakeBucket, groupMembers } from "./batch.js";
import { registeredBiomeArt } from "./biomes/index.js";
import { composeCluster, composeLayout, VariantPicker, type ComposedCluster } from "./compose.js";
import { MeshKit } from "./meshKit.js";
import type { AssetFamily, BiomeArt, BiomeTones, ToneRamp, VariantBuilder } from "./types.js";

const ramp = (hex: string): ToneRamp => ({ dark: hex, base: hex, light: hex });

/** An asymmetric test asset: a cone whose tip leans toward +X by `reach`. */
function leaning(reach: number, radius: number): VariantBuilder {
  return () => {
    const cone = new THREE.ConeGeometry(radius, 1, 7, 2);
    cone.translate(0, 0.5, 0);
    const p = cone.getAttribute("position");
    for (let i = 0; i < p.count; i += 1) p.setX(i, p.getX(i) + reach * p.getY(i));
    return new MeshKit().add(cone, { color: new THREE.Color(0.4, 0.6, 0.3), sway: (v) => v.y }).finish();
  };
}

function family(role: AssetFamily["role"], extra: Partial<AssetFamily> = {}): AssetFamily {
  return {
    role,
    category: "dressing",
    shading: role === "micro" ? "faceted" : "smooth",
    castShadow: role !== "micro",
    unitRadius: 0.9,
    triangleBudget: 200,
    variants: [leaning(0.3, 0.2), leaning(-0.2, 0.3), leaning(0, 0.45)],
    leanMax: 0.25,
    mirror: true,
    embed: [0.01, 0.04],
    ...extra,
  };
}

const tones = {
  foliage: ramp("#44aa55"), foliageAlt: ramp("#55aa44"), trunk: ramp("#886644"), rock: ramp("#888888"),
  soil: ramp("#ccaa88"), dry: ramp("#bbaa77"), cactus: ramp("#558844"), accent: ramp("#ff8844"),
  stoneTop: ramp("#ddccaa"), stoneSide: ramp("#aa8866"), stoneRecess: ramp("#664433"),
} satisfies BiomeTones;

/** A deliberately busy art: every kind gets a hero plus supporting and micro dressing. */
function busyArt(): BiomeArt {
  const kinds: BiomePropKind[] = ["palm", "shrub", "rock", "wood", "cactus", "dry-plant"];
  const preset = {
    id: "busy",
    primary: "hero",
    primaryOffset: 0.15,
    members: [
      { family: "support", count: [1, 3] as const, ring: [0.35, 0.8] as const, height: [0.2, 0.55] as const },
      { family: "micro", count: [2, 6] as const, ring: [0.25, 1] as const, height: [0.04, 0.18] as const },
    ],
  };
  return {
    id: "tropical",
    tones,
    families: {
      hero: family("hero", { alignToNormal: 0.5 }),
      support: family("supporting"),
      micro: family("micro", { leanMax: 0, mirror: false }),
    },
    compositions: Object.fromEntries(kinds.map((kind) => [kind, [{ preset, weight: 1 }]])),
    wall: { strata: [2, 4], stepping: 0.5, rounding: 0.5, notches: [0, 2], top: ramp("#ddccaa"), side: ramp("#aa8866"), recess: "#664433", rim: "#eeddbb" },
    ground: { contactColor: "#332211", contactOpacity: 0.4, contactScale: 0.9 },
    variation: { toneJitter: 0.05, hueJitterDeg: 6 },
    budgets: { triangles: { standard: 1_000_000, reduced: 1_000_000 }, membersPerCluster: { standard: 10, reduced: 5 } },
  };
}

function randomPlacement(random: () => number, index: number, kind: BiomePropKind): BiomePropPlacement {
  const height = 0.05 + random() * 0.6;
  const slope = random() * 0.5;
  const dir = random() * Math.PI * 2;
  return {
    id: `p${index}`,
    kind,
    position: [random() * 4 - 2, random(), random() * 4 - 2],
    normal: [Math.sin(slope) * Math.cos(dir), Math.cos(slope), Math.sin(slope) * Math.sin(dir)],
    scale: height,
    yaw: random() * Math.PI * 2,
    // Geometry reserves at least unit radius × height (+0.02 h).
    radius: height * (PROP_UNIT_RADIUS[kind] + 0.02 * random()),
  };
}

/** Largest horizontal distance / height of any drawn vertex relative to the cluster base. */
function measure(cluster: ComposedCluster) {
  let extent = 0;
  let top = -Infinity;
  const v = new THREE.Vector3();
  for (const member of cluster.members) {
    const p = member.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      v.set(p[i]!, p[i + 1]!, p[i + 2]!).applyMatrix4(member.matrix);
      extent = Math.max(extent, Math.hypot(v.x - cluster.base[0], v.z - cluster.base[2]));
      top = Math.max(top, v.y - cluster.base[1]);
    }
  }
  return { extent, top };
}

describe("composition framework", () => {
  it("keeps every member of every cluster inside the approved footprint and height", () => {
    const kinds: BiomePropKind[] = ["palm", "shrub", "rock", "wood", "cactus", "dry-plant"];
    for (const art of [busyArt(), ...registeredBiomeArt()]) {
      for (const quality of ["standard", "reduced"] as const) {
        const random = seededRandom(`containment:${art.id}:${quality}`);
        const picker = new VariantPicker("containment");
        for (let i = 0; i < 200; i += 1) {
          const placement = randomPlacement(random, i, kinds[i % kinds.length]!);
          const height = Math.min(placement.scale, placement.radius / PROP_UNIT_RADIUS[placement.kind]);
          const cluster = composeCluster(art, { placement, height }, `seed-${i}`, quality, picker);
          if (!cluster) continue;
          const allowed = Math.min(placement.radius, height * PROP_UNIT_RADIUS[placement.kind]);
          const { extent, top } = measure(cluster);
          expect(extent).toBeLessThanOrEqual(allowed + 1e-6);
          expect(top).toBeLessThanOrEqual(height + 1e-6);
          expect(cluster.members.length).toBeLessThanOrEqual(art.budgets.membersPerCluster[quality]);
        }
      }
    }
  });

  it("is deterministic for a seed: same variants, transforms and tones", () => {
    const art = busyArt();
    const random = seededRandom("det");
    const inputs = Array.from({ length: 40 }, (_, i) => {
      const placement = randomPlacement(random, i, "palm");
      return { placement, height: placement.scale };
    });
    const snapshot = () =>
      composeLayout(art, inputs, "layout-seed", "standard").clusters.map((cluster) =>
        cluster.members.map((m) => [m.familyId, m.variant, Array.from(m.matrix.elements), m.tone]),
      );
    expect(snapshot()).toEqual(snapshot());
    const other = composeLayout(art, inputs, "another-seed", "standard").clusters.map((c) => c.members.map((m) => m.variant));
    expect(other).not.toEqual(snapshot().map((c) => c.map((m) => m[1])));
  });

  it("budget drops only the tail: composing a prefix gives identical clusters", () => {
    const art = busyArt();
    const random = seededRandom("independent");
    const inputs = Array.from({ length: 12 }, (_, i) => {
      const placement = randomPlacement(random, i, "shrub");
      return { placement, height: placement.scale };
    });
    const all = composeLayout(art, inputs, "s", "standard").clusters;
    const some = composeLayout(art, inputs.slice(0, 7), "s", "standard").clusters;
    // Selection keeps placements in layout order and cuts the tail, and the
    // variant bags are consumed in that order, so the drawn prefix is stable.
    const key = (clusters: ComposedCluster[]) =>
      clusters.map((c) => c.members.map((m) => [m.variant, Array.from(m.matrix.elements)]));
    expect(key(some)).toEqual(key(all.slice(0, 7)));
  });

  it("spreads variants evenly and never repeats one back to back", () => {
    const f = family("hero");
    const picker = new VariantPicker("spread");
    const picks = Array.from({ length: 300 }, () => picker.next("hero", f));
    for (let i = 1; i < picks.length; i += 1) expect(picks[i]).not.toBe(picks[i - 1]);
    for (let v = 0; v < f.variants.length; v += 1) {
      const share = picks.filter((p) => p === v).length / picks.length;
      expect(share).toBeGreaterThan(0.25);
    }
  });

  it("reduced quality drops micro dressing; the triangle budget trims dressing, never primaries", () => {
    const art = busyArt();
    const random = seededRandom("budget");
    const inputs = Array.from({ length: 30 }, (_, i) => {
      const placement = randomPlacement(random, i, "rock");
      return { placement, height: placement.scale };
    });
    const reduced = composeLayout(art, inputs, "b", "reduced");
    expect(reduced.clusters.flatMap((c) => c.members).some((m) => m.role === "micro")).toBe(false);

    const loose = composeLayout(art, inputs, "b", "standard");
    const primaries = loose.clusters.reduce((sum, c) => sum + c.members[0]!.mesh.triangles, 0);
    const tight = composeLayout({ ...art, budgets: { ...art.budgets, triangles: { standard: primaries + 50, reduced: 0 } } }, inputs, "b", "standard");
    expect(tight.triangles).toBeLessThanOrEqual(primaries + 50);
    expect(tight.trimmed).toBeGreaterThan(0);
    expect(tight.clusters.length).toBe(loose.clusters.length);
    for (const cluster of tight.clusters) expect(cluster.members[0]!.role).toBe("hero");
  });

  it("bakes members into buckets with world positions, pivots and correct winding for mirrors", () => {
    const art = busyArt();
    const random = seededRandom("bake");
    const inputs = Array.from({ length: 20 }, (_, i) => {
      const placement = randomPlacement(random, i, "palm");
      return { placement, height: placement.scale };
    });
    const { clusters } = composeLayout(art, inputs, "bake", "standard");
    const groups = groupMembers(clusters, true);
    expect([...groups.keys()].every((key) => ["faceted:cast", "smooth:cast", "faceted:nocast", "smooth:nocast"].includes(key))).toBe(true);
    const unshadowed = groupMembers(clusters, false);
    expect([...unshadowed.keys()].every((key) => key.endsWith(":nocast"))).toBe(true);
    for (const [key, members] of groups) {
      const bucket = bakeBucket(key, members);
      const pos = bucket.geometry.getAttribute("position");
      const nor = bucket.geometry.getAttribute("normal");
      const pivot = bucket.geometry.getAttribute("aPivot");
      const index = bucket.geometry.index!;
      expect(bucket.triangles).toBe(members.reduce((s, m) => s + m.mesh.triangles, 0));
      // Every face's winding agrees with its (transformed) vertex normals, so
      // mirrored members are not culled inside out.
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
      let disagree = 0;
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(pos, index.getX(i));
        b.fromBufferAttribute(pos, index.getX(i + 1));
        c.fromBufferAttribute(pos, index.getX(i + 2));
        const face = b.clone().sub(a).cross(c.clone().sub(a));
        if (face.lengthSq() < 1e-14) continue;
        n.fromBufferAttribute(nor, index.getX(i));
        if (face.dot(n) <= 0) disagree += 1;
      }
      expect(disagree).toBe(0);
      for (let i = 0; i < pivot.count; i += 1) expect(pivot.getW(i)).toBeGreaterThan(0);
      bucket.geometry.dispose();
    }
    expect(clusters.flatMap((cl) => cl.members).some((m) => m.matrix.determinant() < 0)).toBe(true);
  });
});
