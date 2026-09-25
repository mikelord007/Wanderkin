/**
 * Framework-free biome decoration layer: everything the Tropical/Desert
 * themes draw on top of the untouched scan, owned by one handle with one
 * `dispose()`. Nothing here is ever given to physics, and every mesh opts out
 * of three.js raycasts, so decoration can never block movement, the camera
 * or picking.
 *
 * Draw calls are planned up front against the biome's budget, in priority
 * order: props (one instanced draw per kind), windsock, support patches,
 * water, particles. Anything that would exceed the budget is skipped and
 * recorded in `stats.skipped`.
 */
import * as THREE from "three";
import { effectiveBudget } from "../presets.js";
import type { BiomeDefinition, BiomeLayout, BiomePropKind, EffectsQuality } from "../types.js";
import {
  createParticleField,
  createSupportPatches,
  createWaterRing,
  type ParticleField,
} from "./atmosphereEffects.js";
import {
  createPropGeometry,
  PROP_UNIT_RADIUS,
  SHADOW_CASTING_KINDS,
  SWAYING_KINDS,
  type InstancedPropKind,
} from "./propGeometry.js";
import { createPropMaterial } from "./propMaterial.js";
import { layoutMatchesDefinition, selectProps, selectSurfacePatches, type SelectedProp } from "./selection.js";
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
  dropped: { invalid: number; kind: number; budget: number; clamped: number };
  skipped: string[];
}

export interface BiomeLayerHandle {
  readonly root: THREE.Group;
  readonly stats: Readonly<BiomeLayerStats>;
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

const INSTANCED_ORDER: readonly InstancedPropKind[] = ["palm", "rock", "shrub", "cactus", "dry-plant", "wood"];
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
    dropped: { invalid: 0, kind: 0, budget: 0, clamped: 0 },
    skipped: [],
  };
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  let particles: ParticleField | null = null;
  let windsock: Windsock | null = null;
  let disposed = false;
  let motion = reducedMotion ? 0 : 1;
  const wind = createWindUniforms(definition.wind, reducedMotion);
  root.userData.biomeStats = stats;

  const handle: BiomeLayerHandle = {
    root,
    stats,
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

  // ---- Props -------------------------------------------------------------
  const selection = selectProps(definition, layout, quality);
  stats.dropped = selection.dropped;
  const byKind = new Map<BiomePropKind, SelectedProp[]>();
  for (const selected of selection.props) {
    const list = byKind.get(selected.placement.kind) ?? [];
    list.push(selected);
    byKind.set(selected.placement.kind, list);
  }
  const propMaterial = createPropMaterial(wind);
  materials.push(propMaterial);

  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  for (const kind of INSTANCED_ORDER) {
    const list = byKind.get(kind);
    if (!list || list.length === 0) continue;
    if (!canDraw(`props:${kind}`, 1)) {
      stats.dropped.budget += list.length;
      continue;
    }
    const geometry = createPropGeometry(kind, definition.palette);
    geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, propMaterial, list.length);
    mesh.name = `biome-props:${kind}`;
    mesh.castShadow = castShadows && SHADOW_CASTING_KINDS.has(kind);
    mesh.receiveShadow = true;
    list.forEach(({ placement, height }, index) => {
      yaw.setFromAxisAngle(up, placement.yaw);
      if (SWAYING_KINDS.has(kind) || kind === "cactus" || kind === "wood") {
        rotation.copy(yaw); // plants and posts grow straight up
      } else {
        normal.set(placement.normal[0], placement.normal[1], placement.normal[2]).normalize();
        tilt.setFromUnitVectors(up, normal);
        rotation.identity().slerp(tilt, 0.8).multiply(yaw);
      }
      // Sink a hair so an uneven scan never shows a gap under the base.
      position.set(placement.position[0], placement.position[1] - height * 0.02, placement.position[2]);
      scale.setScalar(height);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    stats.propInstances += list.length;
    stats.propsByKind[kind] = list.length;
    track(mesh);
  }

  // ---- Windsock ----------------------------------------------------------
  const sockPlacement = byKind.get("windsock")?.[0];
  if (sockPlacement && canDraw("windsock", 2)) {
    windsock = createWindsock(definition, propMaterial, castShadows);
    geometries.push(...windsock.geometries);
    const { placement } = sockPlacement;
    const height = Math.min(sockPlacement.height, placement.radius / PROP_UNIT_RADIUS.windsock);
    windsock.group.position.set(placement.position[0], placement.position[1], placement.position[2]);
    windsock.group.scale.setScalar(height);
    windsock.update(0, motion);
    stats.windsock = true;
    stats.propInstances += 1;
    stats.propsByKind.windsock = 1;
    track(windsock.group);
  }

  // ---- Support patches -----------------------------------------------------
  const patches = selectSurfacePatches(definition, layout, quality);
  if (patches.length > 0 && canDraw("patches", 1)) {
    const owned = createSupportPatches(patches, definition, layout.seed);
    if (owned) {
      geometries.push(...owned.geometries);
      materials.push(...owned.materials);
      stats.patches = patches.length;
      track(owned.object);
    }
  }

  // ---- Water ring (only where geometry approved one) -----------------------
  if (definition.ambient.water && layout.water) {
    const owned = createWaterRing(layout.water, definition, wind);
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
  const effect = definition.ambient.effect;
  const particleCount = Math.max(0, Math.floor(budget.particles));
  if (effect !== "none" && particleCount > 0 && canDraw(`particles:${effect}`, 1)) {
    particles = createParticleField(effect, particleCount, layout, definition, wind);
    particles.object.visible = !reducedMotion;
    geometries.push(...particles.geometries);
    materials.push(...particles.materials);
    stats.particles = particleCount;
    track(particles.object);
  }

  return handle;
}
