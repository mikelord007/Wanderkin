/**
 * Framework-free biome decoration layer: everything the Tropical/Desert
 * themes draw on top of the untouched scan, owned by one handle with one
 * `dispose()`. Every mesh opts out of three.js raycasts, so decoration never
 * blocks the camera or picking. What blocks the character is separate data:
 * `colliders`, primitive shapes for the solid props this layer draws, which
 * the game installs in its physics world (`assets/colliders.ts`).
 *
 * Draw calls are planned up front against the biome's budget, in priority
 * order: props (each placement becomes a cluster from the biome's art, all
 * baked into at most four merged buckets, see `assets/batch.ts`), ground
 * contact decals, windsock, support patches, water, particles. Anything that would exceed the budget is skipped and
 * recorded in `stats.skipped`.
 */
import * as THREE from "three";
import { effectiveBudget } from "../presets.js";
import type { PropCollider } from "../../game/core/propColliders.js";
import type { BiomeDefinition, BiomeLayout, BiomePropKind, EffectsQuality } from "../types.js";
import {
  createParticleField,
  createSupportPatches,
  createWaterRing,
  type ParticleField,
} from "./atmosphereEffects.js";
import { bakeBucket, groupMembers, type BucketKey } from "../assets/batch.js";
import { getBiomeArt } from "../assets/biomes/index.js";
import { clusterColliders, windsockCollider } from "../assets/colliders.js";
import { composeLayout, type ComposedMember } from "../assets/compose.js";
import { createContactDecals } from "./contactDecals.js";
import { resolveBiomeLighting } from "../assets/lighting.js";
import type { AssetShading } from "../assets/types.js";
import { PROP_UNIT_RADIUS } from "./propGeometry.js";
import { createPropMaterial } from "./propMaterial.js";
import { layoutMatchesDefinition, selectProps, selectSurfacePatches } from "./selection.js";
import { createWindsock, type Windsock } from "./windsock.js";
import { createWindUniforms } from "./wind.js";

export interface BiomeLayerInput {
  definition: BiomeDefinition;
  layout: BiomeLayout | null;
  quality: EffectsQuality;
  reducedMotion: boolean;
}

export interface BiomeLayerStats {
  biomeId: BiomeDefinition["id"];
  /** Planned main-pass draw calls (shadow pass adds one per casting mesh). */
  drawCalls: number;
  drawCallBudget: number;
  shadowCasters: number;
  propInstances: number;
  propsByKind: Partial<Record<BiomePropKind, number>>;
  patches: number;
  particles: number;
  water: boolean;
  windsock: boolean;
  triangles: number;
  /** Clusters drawn (one per placement, windsock excluded). */
  clusters: number;
  /** Cluster members drawn, primaries included. */
  members: number;
  buckets: { key: BucketKey; members: number; triangles: number }[];
  /** Placements the biome's art has no composition for. */
  unstyled: number;
  /** Dressing members removed to honour the art's triangle budget. */
  trimmed: number;
  /** Ground contact decals (blobs and soil patches) under clusters. */
  contacts: number;
  /** Solid-prop colliders offered to physics (before its step-height skip). */
  colliders: number;
  dropped: { invalid: number; kind: number; budget: number; clamped: number };
  skipped: string[];
}

export interface BiomeLayerHandle {
  readonly root: THREE.Group;
  readonly stats: Readonly<BiomeLayerStats>;
  /** Primitive colliders for the solid props drawn; plain data, never disposed. */
  readonly colliders: readonly PropCollider[];
  /** World yaw of the windsock heading, or null when none is drawn. */
  readonly windsockYaw: number | null;
  readonly disposed: boolean;
  update(elapsedSeconds: number, deltaSeconds: number): void;
  setReducedMotion(reduced: boolean): void;
  /**
   * Marks the layer live again after a `dispose()` (React StrictMode runs
   * effect cleanup then setup on the same memoized handle). three.js
   * re-uploads disposed resources on next use, and the following `dispose()`
   * releases them again, so every mount cycle pairs with exactly one release.
   */
  retain(): void;
  /** Releases every GPU resource the layer created. Idempotent per retain. */
  dispose(): void;
}

const noRaycast: THREE.Object3D["raycast"] = () => {};

export function createBiomeLayer({ definition, layout, quality, reducedMotion }: BiomeLayerInput): BiomeLayerHandle {
  const root = new THREE.Group();
  root.name = `biome-layer:${definition.id}`;
  const budget = effectiveBudget(definition, quality);
  const stats: BiomeLayerStats = {
    biomeId: definition.id,
    drawCalls: 0,
    drawCallBudget: budget.drawCalls,
    shadowCasters: 0,
    propInstances: 0,
    propsByKind: {},
    patches: 0,
    particles: 0,
    water: false,
    windsock: false,
    triangles: 0,
    clusters: 0,
    members: 0,
    buckets: [],
    unstyled: 0,
    trimmed: 0,
    contacts: 0,
    colliders: 0,
    dropped: { invalid: 0, kind: 0, budget: 0, clamped: 0 },
    skipped: [],
  };
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  let particles: ParticleField | null = null;
  let windsock: Windsock | null = null;
  let disposed = false;
  const colliders: PropCollider[] = [];
  let motion = reducedMotion ? 0 : 1;
  const wind = createWindUniforms(definition.wind, reducedMotion);
  root.userData.biomeStats = stats;

  const handle: BiomeLayerHandle = {
    root,
    stats,
    colliders,
    get windsockYaw() {
      return windsock ? windsock.baseYaw : null;
    },
    get disposed() {
      return disposed;
    },
    update(elapsed, delta) {
      if (disposed) return;
      wind.uWindTime.value = elapsed;
      particles?.advance(delta, motion);
      windsock?.update(elapsed, motion);
    },
    setReducedMotion(reduced) {
      motion = reduced ? 0 : 1;
      wind.uWindMotion.value = motion;
      if (particles) particles.object.visible = !reduced;
      windsock?.update(0, motion);
    },
    retain() {
      disposed = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // GPU resources only: the graph stays intact so a StrictMode
      // re-render of the same handle re-uploads instead of going blank.
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };

  if (!layoutMatchesDefinition(definition, layout)) return handle;

  const castShadows = quality === "standard";
  const canDraw = (label: string, calls: number): boolean => {
    if (stats.drawCalls + calls > budget.drawCalls) {
      stats.skipped.push(`${label}: draw-call budget ${budget.drawCalls}`);
      return false;
    }
    stats.drawCalls += calls;
    return true;
  };
  const track = (object: THREE.Object3D) => {
    object.traverse((child) => {
      child.raycast = noRaycast;
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) return;
      const index = mesh.geometry.index;
      const vertices = index ? index.count : mesh.geometry.getAttribute("position").count;
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
      if (!(mesh as unknown as THREE.Points).isPoints) stats.triangles += (vertices / 3) * instances;
      if (mesh.castShadow) stats.shadowCasters += 1;
    });
    root.add(object);
  };

  // ---- Props: placements → clusters → merged buckets ----------------------
  const selection = selectProps(definition, layout, quality);
  stats.dropped = selection.dropped;
  const art = getBiomeArt(definition.id);
  const clustered = selection.props.filter(({ placement }) => placement.kind !== "windsock");
  const sockPlacement = selection.props.find(({ placement }) => placement.kind === "windsock");
  const shadingMaterials = new Map<AssetShading, THREE.MeshStandardMaterial>();
  const materialFor = (shading: AssetShading) => {
    let material = shadingMaterials.get(shading);
    if (!material) {
      material = createPropMaterial(wind, shading);
      shadingMaterials.set(shading, material);
      materials.push(material);
    }
    return material;
  };

  if (art && clustered.length > 0) {
    const composed = composeLayout(
      art,
      clustered.map(({ placement, height }) => ({ placement, height })),
      layout.seed,
      quality,
    );
    stats.unstyled = composed.unstyled;
    stats.trimmed = composed.trimmed;
    const undrawn = new Set<ComposedMember>();
    for (const [key, members] of groupMembers(composed.clusters, castShadows)) {
      if (!canDraw(`props:${key}`, 1)) {
        stats.dropped.budget += members.length;
        for (const member of members) undrawn.add(member);
        continue;
      }
      const bucket = bakeBucket(key, members);
      geometries.push(bucket.geometry);
      const mesh = new THREE.Mesh(bucket.geometry, materialFor(bucket.shading));
      mesh.name = `biome-props:${key}`;
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = true;
      stats.buckets.push({ key, members: bucket.members, triangles: bucket.triangles });
      stats.members += bucket.members;
      track(mesh);
    }
    // Ground contact: one instanced draw of blobs and soil patches.
    const contactStrength = resolveBiomeLighting(art.lighting).contactStrength;
    const contact = createContactDecals(
      composed.clusters,
      { ...art.ground, contactOpacity: art.ground.contactOpacity * contactStrength },
      layout.seed,
    );
    if (contact) {
      if (canDraw("contact", 1)) {
        geometries.push(...contact.geometries);
        materials.push(...contact.materials);
        stats.contacts = contact.object.count;
        track(contact.object);
      } else {
        for (const geometry of contact.geometries) geometry.dispose();
        for (const material of contact.materials) material.dispose();
      }
    }
    // What is drawn is what blocks: only members of drawn buckets collide.
    colliders.push(...clusterColliders(composed.clusters, (member) => !undrawn.has(member)).colliders);
    for (const cluster of composed.clusters) {
      stats.clusters += 1;
      stats.propInstances += 1;
      stats.propsByKind[cluster.kind] = (stats.propsByKind[cluster.kind] ?? 0) + 1;
    }
  } else if (clustered.length > 0) {
    stats.unstyled = clustered.length;
  }

  // ---- Windsock ----------------------------------------------------------
  if (sockPlacement && canDraw("windsock", 2)) {
    windsock = createWindsock(definition, materialFor("faceted"), castShadows);
    geometries.push(...windsock.geometries);
    const { placement } = sockPlacement;
    const height = Math.min(sockPlacement.height, placement.radius / PROP_UNIT_RADIUS.windsock);
    windsock.group.position.set(placement.position[0], placement.position[1], placement.position[2]);
    windsock.group.scale.setScalar(height);
    windsock.update(0, motion);
    stats.windsock = true;
    colliders.unshift(windsockCollider(placement, height));
    stats.propInstances += 1;
    stats.propsByKind.windsock = 1;
    track(windsock.group);
  }

  stats.colliders = colliders.length;

  // ---- Support patches -----------------------------------------------------
  const patches = selectSurfacePatches(definition, layout, quality);
  if (patches.length > 0 && canDraw("patches", 1)) {
    const owned = createSupportPatches(patches, definition, layout.seed, art?.ground.patches);
    if (owned) {
      geometries.push(...owned.geometries);
      materials.push(...owned.materials);
      stats.patches = patches.length;
      track(owned.object);
    }
  }

  // ---- Water ring (only where geometry approved one) -----------------------
  if (definition.ambient.water && layout.water) {
    const owned = createWaterRing(layout.water, definition, wind, art?.atmosphere?.water);
    if (!owned) stats.skipped.push("water: invalid ring");
    else if (canDraw("water", 1)) {
      geometries.push(...owned.geometries);
      materials.push(...owned.materials);
      stats.water = true;
      track(owned.object);
    } else {
      for (const geometry of owned.geometries) geometry.dispose();
      for (const material of owned.materials) material.dispose();
    }
  }

  // ---- Particles -------------------------------------------------------------
  // The art may restyle the definition's effect (snow, embers); never add one.
  const effect = definition.ambient.effect;
  const particleCount = Math.max(0, Math.floor(budget.particles));
  if (effect !== "none" && particleCount > 0 && canDraw(`particles:${effect}`, 1)) {
    particles = createParticleField(art?.atmosphere?.particles ?? effect, particleCount, layout, definition, wind, art?.atmosphere?.particleTint);
    particles.object.visible = !reducedMotion;
    geometries.push(...particles.geometries);
    materials.push(...particles.materials);
    stats.particles = particleCount;
    track(particles.object);
  }

  return handle;
}
