import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getBiomeDefinition } from "../presets.js";
import type { BiomeId, BiomeLayout, BiomePropKind, BiomePropPlacement } from "../types.js";
import { createBiomeLayer } from "./decorLayer.js";
import { WINDSOCK_LENGTH } from "./windsock.js";
import { downwindYaw, normalizedWind } from "./wind.js";

function placement(id: string, kind: BiomePropKind, x: number, z: number, scale = 0.2): BiomePropPlacement {
  return { id, kind, position: [x, 0, z], normal: [0, 1, 0], scale, yaw: x * 3, radius: scale };
}

function fixtureLayout(biomeId: BiomeId, extraProps: BiomePropPlacement[] = []): BiomeLayout {
  const kinds: BiomePropKind[] = ["palm", "shrub", "rock", "wood", "cactus", "dry-plant"];
  const props: BiomePropPlacement[] = [];
  for (let i = 0; i < 60; i += 1) {
    const kind = kinds[i % kinds.length]!;
    props.push(placement(`p${i}`, kind, -1.5 + (i % 10) * 0.3, -1.5 + Math.floor(i / 10) * 0.5));
  }
  props.push(placement("sock", "windsock", 1.6, 1.6, 0.3));
  return {
    biomeId,
    seed: "fixture-seed",
    props: [...props, ...extraProps],
    patches: Array.from({ length: 30 }, (_, i) => ({
      position: [-1.5 + (i % 6) * 0.6, i % 2 === 0 ? 0 : 0.75, -1.5 + Math.floor(i / 6) * 0.6] as const,
      normal: [0, 1, 0] as const,
      radius: 0.25,
    })),
    exclusions: [],
    bounds: { min: [-2, 0, -2], max: [2, 1, 2] },
    water: { center: [0, -0.02, 0], innerRadius: 2.9, outerRadius: 6 },
    diagnostics: [],
  };
}

function collectResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  return { geometries, materials };
}

describe("biome decoration layer", () => {
  it("draws nothing for Original or a layout prepared for another biome", () => {
    const original = createBiomeLayer({
      definition: getBiomeDefinition("original"),
      layout: fixtureLayout("original"),
      quality: "standard",
      reducedMotion: false,
    });
    expect(original.root.children).toHaveLength(0);
    expect(original.stats.drawCalls).toBe(0);
    const mismatch = createBiomeLayer({
      definition: getBiomeDefinition("desert"),
      layout: fixtureLayout("tropical"),
      quality: "standard",
      reducedMotion: false,
    });
    expect(mismatch.root.children).toHaveLength(0);
    const missing = createBiomeLayer({
      definition: getBiomeDefinition("desert"),
      layout: null,
      quality: "standard",
      reducedMotion: false,
    });
    expect(missing.root.children).toHaveLength(0);
  });

  for (const id of ["tropical", "desert"] as const) {
    it(`${id}: props merged into a few buckets, only its own kinds, inside every budget`, () => {
      const definition = getBiomeDefinition(id);
      const layer = createBiomeLayer({ definition, layout: fixtureLayout(id), quality: "standard", reducedMotion: false });
      const { stats } = layer;
      expect(stats.drawCalls).toBeGreaterThan(0);
      expect(stats.drawCalls).toBeLessThanOrEqual(definition.budget.drawCalls);
      expect(stats.propInstances).toBeLessThanOrEqual(definition.budget.props);
      expect(stats.patches).toBeLessThanOrEqual(definition.budget.patches);
      expect(stats.particles).toBeLessThanOrEqual(definition.budget.particles);
      for (const kind of Object.keys(stats.propsByKind)) expect(definition.props.kinds).toContain(kind);
      expect(stats.dropped.kind).toBeGreaterThan(0); // the fixture offers every kind
      expect(stats.unstyled).toBe(0);

      // The actual draw count matches the plan.
      let draws = 0;
      layer.root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh || (child as THREE.Points).isPoints) draws += 1;
      });
      expect(draws).toBe(stats.drawCalls);
      // Contract (v2, env upgrade): every variant of every kind is baked into
      // at most four merged buckets (faceted/smooth x cast/no-cast) instead of
      // one InstancedMesh per kind, so draw calls do not grow with variants.
      const propMeshes = layer.root.children.filter((child) => child.name.startsWith("biome-props:"));
      expect(propMeshes.length).toBe(stats.buckets.length);
      expect(propMeshes.length).toBeLessThanOrEqual(4);
      expect(propMeshes.every((mesh) => !(mesh as THREE.InstancedMesh).isInstancedMesh)).toBe(true);
      expect(stats.buckets.reduce((sum, bucket) => sum + bucket.members, 0)).toBe(stats.members);
      expect(stats.clusters).toBe(stats.propInstances - (stats.windsock ? 1 : 0));
      layer.dispose();
    });
  }

  it("tropical gets water only because geometry approved a ring; desert never does", () => {
    const tropical = createBiomeLayer({ definition: getBiomeDefinition("tropical"), layout: fixtureLayout("tropical"), quality: "standard", reducedMotion: false });
    expect(tropical.stats.water).toBe(true);
    const noRing = { ...fixtureLayout("tropical"), water: null };
    expect(createBiomeLayer({ definition: getBiomeDefinition("tropical"), layout: noRing, quality: "standard", reducedMotion: false }).stats.water).toBe(false);
    const badRing = { ...fixtureLayout("tropical"), water: { center: [0, 0, 0] as const, innerRadius: 3, outerRadius: 2 } };
    expect(createBiomeLayer({ definition: getBiomeDefinition("tropical"), layout: badRing, quality: "standard", reducedMotion: false }).stats.water).toBe(false);
    expect(createBiomeLayer({ definition: getBiomeDefinition("desert"), layout: fixtureLayout("desert"), quality: "standard", reducedMotion: false }).stats.water).toBe(false);
  });

  it("reduced quality draws fewer props and particles and casts no prop shadows", () => {
    const definition = getBiomeDefinition("desert");
    const many = Array.from({ length: 200 }, (_, i) => placement(`m${i}`, "rock", -1.9 + (i % 20) * 0.19, -1.9 + Math.floor(i / 20) * 0.38, 0.1));
    const standard = createBiomeLayer({ definition, layout: fixtureLayout("desert", many), quality: "standard", reducedMotion: false });
    const reduced = createBiomeLayer({ definition, layout: fixtureLayout("desert", many), quality: "reduced", reducedMotion: false });
    expect(standard.stats.propInstances).toBe(definition.budget.props);
    expect(reduced.stats.propInstances).toBeLessThan(standard.stats.propInstances);
    expect(reduced.stats.particles).toBeLessThan(standard.stats.particles);
    expect(reduced.stats.shadowCasters).toBe(0);
    expect(standard.stats.shadowCasters).toBeGreaterThan(0);
  });

  it("drops invalid placements and never enlarges a prop past its cleared radius", () => {
    const bad: BiomePropPlacement[] = [
      { ...placement("nan", "rock", 0, 0), position: [Number.NaN, 0, 0] },
      { ...placement("far", "rock", 0, 0), position: [50, 0, 0] },
      { ...placement("neg", "rock", 0, 0), scale: -1 },
      placement("p0", "rock", 0, 0), // duplicate id
    ];
    const tight = { ...placement("tight", "rock", 0.1, 0.1, 0.4), radius: 0.09 };
    const layer = createBiomeLayer({
      definition: getBiomeDefinition("desert"),
      layout: fixtureLayout("desert", [...bad, tight]),
      quality: "standard",
      reducedMotion: false,
    });
    expect(layer.stats.dropped.invalid).toBe(4);
    expect(layer.stats.dropped.clamped).toBeGreaterThanOrEqual(1);

    // Alone in a layout, every baked vertex of the over-tall rock stays in
    // the 0.09 clearance cylinder (props are merged now, so check vertices).
    const alone = { ...fixtureLayout("desert"), props: [tight] };
    const single = createBiomeLayer({ definition: getBiomeDefinition("desert"), layout: alone, quality: "standard", reducedMotion: false });
    let vertices = 0;
    single.root.traverse((child) => {
      if (!child.name.startsWith("biome-props:")) return;
      const position = (child as THREE.Mesh).geometry.getAttribute("position");
      for (let i = 0; i < position.count; i += 1) {
        vertices += 1;
        expect(Math.hypot(position.getX(i) - 0.1, position.getZ(i) - 0.1)).toBeLessThanOrEqual(0.09 + 1e-6);
        expect(position.getY(i)).toBeLessThanOrEqual(0.4 + 1e-6);
      }
    });
    expect(vertices).toBeGreaterThan(0);
  });

  it("grounds every cluster with contact decals that stay inside its footprint", () => {
    for (const id of ["tropical", "desert"] as const) {
      const layout = fixtureLayout(id);
      const layer = createBiomeLayer({ definition: getBiomeDefinition(id), layout, quality: "standard", reducedMotion: false });
      const contact = layer.root.getObjectByName("biome-contact") as THREE.InstancedMesh;
      expect(contact).toBeDefined();
      expect(layer.stats.contacts).toBeGreaterThanOrEqual(layer.stats.clusters);
      expect(contact.renderOrder).toBe(0);
      expect((contact.material as THREE.Material).depthWrite).toBe(false);
      const byPosition = layout.props.map((p) => p);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      for (let i = 0; i < contact.count; i += 1) {
        contact.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        const owner = byPosition.find((p) => Math.hypot(p.position[0] - position.x, p.position[2] - position.z) < 1e-3)!;
        expect(owner).toBeDefined();
        expect(Math.max(scale.x, scale.z)).toBeLessThanOrEqual(owner.radius + 1e-9);
      }
      layer.dispose();
    }
  });

  it("is non-colliding: no three.js raycast ever hits decoration", () => {
    const layer = createBiomeLayer({ definition: getBiomeDefinition("tropical"), layout: fixtureLayout("tropical"), quality: "standard", reducedMotion: false });
    layer.root.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(new THREE.Vector3(-1.5, 5, -1.5), new THREE.Vector3(0, -1, 0));
    expect(raycaster.intersectObject(layer.root, true)).toHaveLength(0);
  });

  it("windsock tail points downwind, matching the shared wind the dust uses", () => {
    const definition = getBiomeDefinition("desert");
    const layer = createBiomeLayer({ definition, layout: fixtureLayout("desert"), quality: "standard", reducedMotion: true });
    expect(layer.stats.windsock).toBe(true);
    const sock = layer.root.getObjectByName("biome-windsock-sock")!;
    layer.root.updateMatrixWorld(true);
    const base = sock.localToWorld(new THREE.Vector3(0, 0, 0));
    const tip = sock.localToWorld(new THREE.Vector3(WINDSOCK_LENGTH, 0, 0));
    const [wx, wz] = normalizedWind(definition.wind.direction);
    const dx = tip.x - base.x;
    const dz = tip.z - base.z;
    const angle = Math.acos((dx * wx + dz * wz) / Math.hypot(dx, dz));
    expect(angle).toBeLessThan((1 * Math.PI) / 180);
    expect(tip.y).toBeLessThan(base.y); // it droops, it does not point up
    expect(layer.windsockYaw).toBeCloseTo(downwindYaw(definition.wind.direction), 10);

    // Animated flutter stays close to that heading.
    layer.setReducedMotion(false);
    for (const t of [0.3, 1.7, 4.2]) {
      layer.update(t, 1 / 60);
      layer.root.updateMatrixWorld(true);
      const b = sock.localToWorld(new THREE.Vector3());
      const e = sock.localToWorld(new THREE.Vector3(WINDSOCK_LENGTH, 0, 0));
      const a = Math.acos(((e.x - b.x) * wx + (e.z - b.z) * wz) / Math.hypot(e.x - b.x, e.z - b.z));
      expect(a).toBeLessThan((8 * Math.PI) / 180);
    }
  });

  it("downwindYaw turns local +X onto the wind for every heading", () => {
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      const dir: [number, number] = [Math.cos(a), Math.sin(a)];
      const v = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), downwindYaw(dir));
      expect(v.x).toBeCloseTo(dir[0], 10);
      expect(v.z).toBeCloseTo(dir[1], 10);
    }
  });

  it("reduced motion freezes animation without rebuilding", () => {
    const layer = createBiomeLayer({ definition: getBiomeDefinition("desert"), layout: fixtureLayout("desert"), quality: "standard", reducedMotion: false });
    const dust = layer.root.getObjectByName("biome-particles:dust")!;
    const children = layer.root.children.length;
    layer.setReducedMotion(true);
    expect(dust.visible).toBe(false);
    expect(layer.root.children.length).toBe(children);
    layer.setReducedMotion(false);
    expect(dust.visible).toBe(true);
  });

  it("disposes every geometry and material exactly once; repeated switching never accumulates", () => {
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    let created = 0;
    const sequence: BiomeId[] = ["tropical", "desert", "original"];
    for (let round = 0; round < 20; round += 1) {
      const id = sequence[round % sequence.length]!;
      const layer = createBiomeLayer({ definition: getBiomeDefinition(id), layout: fixtureLayout(id), quality: round % 2 ? "reduced" : "standard", reducedMotion: false });
      const { geometries, materials } = collectResources(layer.root);
      created += geometries.size + materials.size;
      for (const g of geometries) g.addEventListener("dispose", () => { expect(disposedGeometries.has(g)).toBe(false); disposedGeometries.add(g); });
      for (const m of materials) m.addEventListener("dispose", () => { expect(disposedMaterials.has(m)).toBe(false); disposedMaterials.add(m); });
      layer.dispose();
      layer.dispose(); // idempotent
      expect(layer.disposed).toBe(true);
      for (const g of geometries) expect(disposedGeometries.has(g)).toBe(true);
      for (const m of materials) expect(disposedMaterials.has(m)).toBe(true);
    }
    expect(disposedGeometries.size + disposedMaterials.size).toBe(created);
  });

  it("pairs each retain with one release (StrictMode cleanup/setup)", () => {
    const layer = createBiomeLayer({ definition: getBiomeDefinition("tropical"), layout: fixtureLayout("tropical"), quality: "standard", reducedMotion: false });
    const { geometries } = collectResources(layer.root);
    const first = [...geometries][0]!;
    let releases = 0;
    first.addEventListener("dispose", () => { releases += 1; });
    layer.retain();
    layer.dispose(); // StrictMode's simulated unmount
    layer.retain(); // and remount
    expect(layer.disposed).toBe(false);
    layer.dispose(); // real unmount
    layer.dispose();
    expect(releases).toBe(2);
    expect(layer.disposed).toBe(true);
  });

  it("is deterministic for the same layout and seed", () => {
    const make = () => createBiomeLayer({ definition: getBiomeDefinition("tropical"), layout: fixtureLayout("tropical"), quality: "standard", reducedMotion: false });
    const a = make();
    const b = make();
    expect(a.stats).toEqual(b.stats);
    const pa = a.root.getObjectByName("biome-support-patches") as THREE.InstancedMesh;
    const pb = b.root.getObjectByName("biome-support-patches") as THREE.InstancedMesh;
    expect(Array.from(pa.instanceMatrix.array)).toEqual(Array.from(pb.instanceMatrix.array));
    expect(Array.from(pa.instanceColor!.array)).toEqual(Array.from(pb.instanceColor!.array));
  });
});
