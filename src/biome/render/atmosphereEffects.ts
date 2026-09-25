/**
 * Cheap atmosphere pieces: GPU-driven drifting dust/motes, the
 * geometry-approved water ring, and translucent sand/grass support patches.
 * Each returns an object plus the resources the caller must dispose.
 */
import * as THREE from "three";
import type { BiomeDefinition, BiomeLayout, BiomeSurfacePatch } from "../types.js";
import type { GroundPatchStyle, ParticlePreset, WaterStyle } from "../assets/types.js";
import type { WindUniforms } from "./wind.js";
import { seededRandom } from "./selection.js";

export interface OwnedObject<T extends THREE.Object3D> {
  object: T;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

export interface ParticleField extends OwnedObject<THREE.Points> {
  /** Advance the shared drift offset; continuous and wrapped to the box. */
  advance(delta: number, motion: number): void;
}

/** Every particle look: the definition's ambient effects plus art presets. */
export type ParticleLook = "dust" | "motes" | ParticlePreset;

interface ParticleTuning {
  /** Share of the scene height the box fills. */
  height: number;
  /** Exponent on the unit-height distribution (>1 hugs the ground). */
  lowBias: number;
  size: number;
  color: (definition: BiomeDefinition) => string;
  opacity: number;
  bob: number;
  /** Horizontal drift speed: base + per unit wind strength (× extent). */
  speed: readonly [number, number];
  /** Vertical drift (× extent per second); negative falls. */
  rise: number;
  /** Horizontal flutter amplitude (× box width). */
  flutter: number;
  additive: boolean;
}

const PARTICLE_LOOKS: Record<ParticleLook, ParticleTuning> = {
  dust: { height: 0.55, lowBias: 1.8, size: 0.0045, color: (d) => d.palette.sand, opacity: 0.4, bob: 0.02, speed: [0.05, 0.1], rise: 0, flutter: 0.004, additive: false },
  motes: { height: 1.1, lowBias: 1, size: 0.0055, color: () => "#fff6d8", opacity: 0.55, bob: 0.05, speed: [0.012, 0.02], rise: 0.006, flutter: 0.004, additive: false },
  // Slow flakes falling through the whole scene, drifting with the wind.
  snow: { height: 1.2, lowBias: 1, size: 0.005, color: () => "#fbfdff", opacity: 0.8, bob: 0.01, speed: [0.01, 0.03], rise: -0.02, flutter: 0.012, additive: false },
  // Sparks lifting off the ground, glowing (additive), thinning with height.
  embers: { height: 0.9, lowBias: 1.4, size: 0.0035, color: () => "#ff8a3a", opacity: 0.9, bob: 0.03, speed: [0.008, 0.02], rise: 0.018, flutter: 0.008, additive: true },
};

export function createParticleField(
  effect: ParticleLook,
  count: number,
  layout: BiomeLayout,
  definition: BiomeDefinition,
  wind: WindUniforms,
): ParticleField {
  const look = PARTICLE_LOOKS[effect];
  const { min, max } = layout.bounds;
  const size = new THREE.Vector3(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const extent = Math.max(size.x, size.y, size.z, 1e-3);
  // A little wider than the scene so drift enters from outside it; dust
  // hugs the lower part of the volume, motes fill the whole height.
  const pad = extent * 0.15;
  const boxMin = new THREE.Vector3(min[0] - pad, min[1], min[2] - pad);
  const boxSize = new THREE.Vector3(size.x + pad * 2, Math.max(size.y * look.height, extent * 0.2), size.z + pad * 2);

  // Dust and motes keep their original seeds and streams (unchanged fields).
  const random = seededRandom(`${layout.seed}:particles:${effect}`);
  const base = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    base[i * 3] = random();
    base[i * 3 + 1] = look.lowBias !== 1 ? Math.pow(random(), look.lowBias) : random();
    base[i * 3 + 2] = random();
    rand[i] = random();
  }
  const geometry = new THREE.BufferGeometry();
  // `position` doubles as the unit-box coordinate; three needs it for the draw count.
  geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
  geometry.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
  geometry.boundingSphere = new THREE.Sphere(
    boxMin.clone().addScaledVector(boxSize, 0.5),
    boxSize.length() / 2,
  );

  const drift = new THREE.Vector3();
  const uniforms = {
    ...wind,
    uBoxMin: { value: boxMin },
    uBoxSize: { value: boxSize },
    uDrift: { value: drift },
    uPointSize: { value: extent * look.size },
    uViewportScale: { value: 400 },
    uColor: { value: new THREE.Color(look.color(definition)) },
    uOpacity: { value: look.opacity },
    uBob: { value: look.bob },
    uFlutter: { value: look.flutter },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: look.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
  });
  const points = new THREE.Points(geometry, material);
  points.name = `biome-particles:${effect}`;
  points.frustumCulled = true;
  points.onBeforeRender = (renderer, _scene, camera) => {
    const height = renderer.getContext().drawingBufferHeight;
    uniforms.uViewportScale.value = height * 0.5 * camera.projectionMatrix.elements[5]!;
  };

  const speed = extent * (look.speed[0] + look.speed[1] * wind.uWindStrength.value);
  const rise = extent * look.rise;
  return {
    object: points,
    geometries: [geometry],
    materials: [material],
    advance(delta, motion) {
      if (!(delta > 0) || motion <= 0) return;
      const step = Math.min(delta, 0.1) * motion;
      drift.x = (drift.x + wind.uWindDir.value.x * speed * step) % boxSize.x;
      drift.z = (drift.z + wind.uWindDir.value.y * speed * step) % boxSize.z;
      drift.y = (drift.y + rise * step) % boxSize.y;
    },
  };
}

const PARTICLE_VERTEX = /* glsl */ `
  attribute float aRand;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxSize;
  uniform vec3 uDrift;
  uniform float uPointSize;
  uniform float uViewportScale;
  uniform float uWindTime;
  uniform float uWindMotion;
  uniform float uBob;
  uniform float uFlutter;
  varying float vAlpha;
  void main() {
    vec3 p = position * uBoxSize + uDrift;
    float t = uWindTime * uWindMotion;
    p.y += sin(t * (0.6 + aRand) + aRand * 6.2831) * uBoxSize.y * uBob;
    p.x += sin(t * 0.9 + aRand * 11.0) * uBoxSize.x * uFlutter;
    p = mod(p, uBoxSize);
    // Fade out near every face of the box so wrap-around never pops.
    vec3 edge = min(p, uBoxSize - p) / (uBoxSize * 0.12);
    vAlpha = clamp(min(min(edge.x, edge.z), edge.y), 0.0, 1.0) * (0.55 + 0.45 * aRand);
    vec4 mv = modelViewMatrix * vec4(uBoxMin + p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uPointSize * (0.6 + 0.8 * aRand) * uViewportScale / max(-mv.z, 1e-3), 1.0, 18.0);
  }
`;

const PARTICLE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * vAlpha * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------ */
/* Water ring                                                          */
/* ------------------------------------------------------------------ */

/** Returns null unless geometry supplied a sane ring. */
export function createWaterRing(
  water: NonNullable<BiomeLayout["water"]>,
  definition: BiomeDefinition,
  wind: WindUniforms,
  style: WaterStyle = "liquid",
): OwnedObject<THREE.Mesh> | null {
  const { center, innerRadius, outerRadius } = water;
  if (![center[0], center[1], center[2], innerRadius, outerRadius].every(Number.isFinite)) return null;
  if (!(innerRadius > 0) || !(outerRadius > innerRadius * 1.05)) return null;
  // The approved ring is below every playable support surface, so the area
  // inside it (under the scene) is filled at the same level as shallows.
  // Otherwise a round ring around a rectangular floor leaves open sky
  // between the floor's sides and the shore.
  const geometry = new THREE.CircleGeometry(outerRadius, 96);
  geometry.rotateX(-Math.PI / 2);
  const material =
    style === "frozen"
      ? frozenWaterMaterial(definition, innerRadius, outerRadius)
      : style === "lava"
        ? lavaWaterMaterial(definition, wind, innerRadius, outerRadius)
        : liquidWaterMaterial(definition, wind, innerRadius, outerRadius);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "biome-water";
  mesh.position.set(center[0], center[1], center[2]);
  mesh.receiveShadow = true;
  // Before gameplay markers (checkpoint rings use renderOrder 1), so
  // decoration can never paint over a spawn or checkpoint disc.
  mesh.renderOrder = 0;
  return { object: mesh, geometries: [geometry], materials: [material] };
}

function liquidWaterMaterial(definition: BiomeDefinition, wind: WindUniforms, innerRadius: number, outerRadius: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: definition.palette.water,
    roughness: 0.22,
    metalness: 0.02,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const waterUniforms = {
    uWindTime: wind.uWindTime,
    uWindMotion: wind.uWindMotion,
    uWaterInner: { value: innerRadius },
    uWaterOuter: { value: outerRadius },
    uWaterWave: { value: (Math.PI * 2) / Math.max(innerRadius * 0.12, 1e-3) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = `varying vec3 oqWaterLocal;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      oqWaterLocal = transformed;`,
    );
    shader.fragmentShader = `
      varying vec3 oqWaterLocal;
      uniform float uWindTime;
      uniform float uWindMotion;
      uniform float uWaterInner;
      uniform float uWaterOuter;
      uniform float uWaterWave;
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        float r = length(oqWaterLocal.xz);
        float span = uWaterOuter - uWaterInner;
        float t = uWindTime * uWindMotion;
        // Two slanted wave trains plus a slow radial swell; no grid.
        float ripple = 0.4 * sin(dot(oqWaterLocal.xz, vec2(0.82, 0.57)) * uWaterWave + t * 1.1)
          + 0.35 * sin(dot(oqWaterLocal.xz, vec2(-0.39, 0.92)) * uWaterWave * 1.37 - t * 0.8)
          + 0.25 * sin(length(oqWaterLocal.xz) * uWaterWave * 0.45 - t * 0.6);
        float depth = smoothstep(uWaterInner * 0.85, uWaterInner + span * 0.5, r);
        diffuseColor.rgb *= mix(1.22, 0.78, depth) * (0.97 + 0.04 * ripple);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.97, 0.95), (1.0 - depth) * 0.22);
        diffuseColor.a *= 1.0 - smoothstep(uWaterOuter - span * 0.25, uWaterOuter, r);
      }`,
    );
  };
  material.customProgramCacheKey = () => "objectquest-biome-water-v1";
  return material;
}

/** Cell-border distance (F2 − F1): crack and seam lines, no texture. */
const CELL_EDGE_GLSL = /* glsl */ `
  float oqWaterHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float oqWaterCell(vec2 p) {
    vec2 g = floor(p); vec2 f = fract(p);
    float f1 = 8.0; float f2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = o + vec2(oqWaterHash(g + o), oqWaterHash(g + o + 17.0)) - f;
      float d = dot(c, c);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
    return sqrt(f2) - sqrt(f1);
  }
`;

/**
 * Frozen: flat, pale and still. No time uniform at all (nothing ripples),
 * a frosted shore band and faint static pressure cracks.
 */
function frozenWaterMaterial(definition: BiomeDefinition, innerRadius: number, outerRadius: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(definition.palette.water).lerp(new THREE.Color("#f4f9ff"), 0.35),
    roughness: 0.42,
    metalness: 0.02,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const uniforms = {
    uWaterInner: { value: innerRadius },
    uWaterOuter: { value: outerRadius },
    uWaterCell: { value: 1 / Math.max(innerRadius * 0.22, 1e-3) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 oqWaterLocal;
${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      oqWaterLocal = transformed;`,
    );
    shader.fragmentShader = `
      varying vec3 oqWaterLocal;
      uniform float uWaterInner;
      uniform float uWaterOuter;
      uniform float uWaterCell;
      ${CELL_EDGE_GLSL}
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        float r = length(oqWaterLocal.xz);
        float span = uWaterOuter - uWaterInner;
        float depth = smoothstep(uWaterInner * 0.85, uWaterInner + span * 0.5, r);
        diffuseColor.rgb *= mix(1.1, 0.9, depth);
        float crack = 1.0 - smoothstep(0.015, 0.05, oqWaterCell(oqWaterLocal.xz * uWaterCell));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 1.0), crack * 0.35 + (1.0 - depth) * 0.3);
        diffuseColor.a *= 1.0 - smoothstep(uWaterOuter - span * 0.25, uWaterOuter, r);
      }`,
    );
  };
  material.customProgramCacheKey = () => "objectquest-biome-water-frozen-v1";
  return material;
}

/**
 * Lava: a dark cooling crust broken by glowing seams that drift slowly
 * (the wind clock, so reduced motion holds it still). Emissive, so it reads
 * as a light source without a light.
 */
function lavaWaterMaterial(definition: BiomeDefinition, wind: WindUniforms, innerRadius: number, outerRadius: number): THREE.MeshStandardMaterial {
  const hot = new THREE.Color(definition.palette.water);
  const material = new THREE.MeshStandardMaterial({
    color: hot,
    emissive: hot,
    emissiveIntensity: 1,
    roughness: 0.85,
    metalness: 0,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const uniforms = {
    uWindTime: wind.uWindTime,
    uWindMotion: wind.uWindMotion,
    uWaterInner: { value: innerRadius },
    uWaterOuter: { value: outerRadius },
    uWaterCell: { value: 1 / Math.max(innerRadius * 0.16, 1e-3) },
    uLavaCrust: { value: hot.clone().multiplyScalar(0.07) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 oqWaterLocal;
${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      oqWaterLocal = transformed;`,
    );
    shader.fragmentShader = `
      varying vec3 oqWaterLocal;
      uniform float uWindTime;
      uniform float uWindMotion;
      uniform float uWaterInner;
      uniform float uWaterOuter;
      uniform float uWaterCell;
      uniform vec3 uLavaCrust;
      ${CELL_EDGE_GLSL}
      ${shader.fragmentShader}`
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float oqLavaGlow = 0.0;
        {
          float r = length(oqWaterLocal.xz);
          float span = uWaterOuter - uWaterInner;
          float t = uWindTime * uWindMotion;
          vec2 p = oqWaterLocal.xz * uWaterCell + vec2(t * 0.04, -t * 0.03);
          float seam = 1.0 - smoothstep(0.03, 0.16, oqWaterCell(p));
          // Hotter toward the open pool, crusted at the shore.
          float depth = smoothstep(uWaterInner * 0.85, uWaterInner + span * 0.5, r);
          oqLavaGlow = seam * (0.75 + 0.25 * sin(t * 0.9 + oqWaterHash(floor(p)) * 6.2831)) * mix(1.0, 0.55, depth);
          diffuseColor.rgb = mix(uLavaCrust, diffuseColor.rgb, seam);
          diffuseColor.a *= 1.0 - smoothstep(uWaterOuter - span * 0.2, uWaterOuter, r);
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance *= oqLavaGlow;`,
      );
  };
  material.customProgramCacheKey = () => "objectquest-biome-water-lava-v1";
  return material;
}

/* ------------------------------------------------------------------ */
/* Translucent support patches                                         */
/* ------------------------------------------------------------------ */

export function createSupportPatches(
  patches: readonly BiomeSurfacePatch[],
  definition: BiomeDefinition,
  seed: string,
  style?: GroundPatchStyle,
): OwnedObject<THREE.InstancedMesh> | null {
  if (patches.length === 0) return null;
  const litter = (style?.litter ?? []).slice(0, 3);
  const geometry = new THREE.CircleGeometry(1, 28);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const litterUniforms = {
    uLitter0: { value: new THREE.Color(litter[0] ?? "#ffffff") },
    uLitter1: { value: new THREE.Color(litter[1] ?? litter[0] ?? "#ffffff") },
    uLitter2: { value: new THREE.Color(litter[2] ?? litter[0] ?? "#ffffff") },
  };
  if (litter.length > 0) material.defines = { OQ_LITTER: "" };
  material.onBeforeCompile = (shader) => {
    if (litter.length > 0) Object.assign(shader.uniforms, litterUniforms);
    shader.vertexShader = `varying vec3 oqPatchLocal;\nvarying float oqPatchSeed;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      oqPatchLocal = transformed;
      #ifdef USE_INSTANCING
        oqPatchSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 50.0;
      #else
        oqPatchSeed = 0.0;
      #endif`,
    );
    shader.fragmentShader = `
      varying vec3 oqPatchLocal;
      varying float oqPatchSeed;
      #ifdef OQ_LITTER
        uniform vec3 uLitter0;
        uniform vec3 uLitter1;
        uniform vec3 uLitter2;
      #endif
      float oqPatchHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float oqPatchNoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(oqPatchHash(i), oqPatchHash(i + vec2(1.0, 0.0)), u.x),
                   mix(oqPatchHash(i + vec2(0.0, 1.0)), oqPatchHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        vec2 q = oqPatchLocal.xz;
        float r = length(q);
        // Wobbly outline from noise on the unit direction (no atan seam),
        // plus interior noise, so patches read as drifts, not discs.
        float wob = oqPatchNoise(q / max(r, 1e-4) * 1.7 + oqPatchSeed);
        float edgeR = 0.55 + 0.42 * wob;
        float n = oqPatchNoise(q * 3.2 + oqPatchSeed);
        // A crisp, stylised drift outline: a wide soft falloff read as a
        // blurry smear when a patch sat close to the chase camera.
        float edge = 1.0 - smoothstep(edgeR - 0.07, edgeR, r + (n - 0.5) * 0.16);
        // Smooth mottling only: hashed cells scale with the patch and read
        // as pixel blocks on large patches seen up close.
        float mottle = oqPatchNoise(q * 7.0 + oqPatchSeed * 1.3);
        diffuseColor.rgb *= 0.93 + 0.12 * mottle;
        diffuseColor.a *= edge * (0.7 + 0.3 * oqPatchNoise(q * 9.0 - oqPatchSeed));
        #ifdef OQ_LITTER
        {
          // Leaf litter: one small rotated leaf per cell (some cells empty),
          // opaque-ish over the translucent ground tint, inside the outline.
          vec2 g = q * 7.0 + oqPatchSeed;
          vec2 cell = floor(g);
          float h = oqPatchHash(cell);
          float h2 = oqPatchHash(cell + 17.31);
          vec2 d = fract(g) - 0.5 - (vec2(h, h2) - 0.5) * 0.4;
          float ang = h * 6.2831;
          d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
          float leaf = (1.0 - smoothstep(0.15, 0.19, length(d * vec2(1.0, 2.1)))) * step(0.22, h2);
          vec3 fleck = h2 < 0.55 ? uLitter0 : (h2 < 0.8 ? uLitter1 : uLitter2);
          diffuseColor.rgb = mix(diffuseColor.rgb, fleck * (0.85 + 0.3 * h), leaf);
          diffuseColor.a = mix(diffuseColor.a, 0.9 * edge, leaf);
        }
        #endif
        if (diffuseColor.a < 0.02) discard;
      }`,
    );
  };
  material.customProgramCacheKey = () => (litter.length > 0 ? "objectquest-biome-patch-litter-v1" : "objectquest-biome-patch-v2");

  const mesh = new THREE.InstancedMesh(geometry, material, patches.length);
  mesh.name = "biome-support-patches";
  mesh.receiveShadow = true;
  // Before gameplay markers (checkpoint rings use renderOrder 1), so
  // decoration can never paint over a spawn or checkpoint disc.
  mesh.renderOrder = 0;
  const random = seededRandom(`${seed}:patch-tones`);
  // Decals are not style-graded like the surfaces under them, so they are
  // pre-saturated a little to avoid reading as grey smudges.
  const sand = new THREE.Color(definition.surface.color).offsetHSL(0, 0.04, 0.03);
  const grass = new THREE.Color(definition.palette.vegetation).offsetHSL(0, -0.04, -0.02);
  const tints = (style?.tints ?? []).filter((tint) => tint.weight > 0);
  const tintColors = tints.map((tint) => new THREE.Color(tint.color).offsetHSL(0, 0.04, 0));
  const tintTotal = tints.reduce((sum, tint) => sum + tint.weight, 0);
  const pickTint = (pick: number): THREE.Color => {
    let acc = 0;
    for (let i = 0; i < tints.length; i += 1) {
      acc += tints[i]!.weight / tintTotal;
      if (pick < acc) return tintColors[i]!;
    }
    return tintColors[tintColors.length - 1]!;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const tone = new THREE.Color();
  patches.forEach((patch, index) => {
    normal.set(patch.normal[0], patch.normal[1], patch.normal[2]).normalize();
    quaternion.setFromUnitVectors(up, normal);
    const lift = patch.radius * 0.01;
    matrix.compose(
      new THREE.Vector3(
        patch.position[0] + normal.x * lift,
        patch.position[1] + normal.y * lift,
        patch.position[2] + normal.z * lift,
      ),
      quaternion,
      new THREE.Vector3(patch.radius, 1, patch.radius),
    );
    mesh.setMatrixAt(index, matrix);
    const pick = random();
    if (tints.length > 0) {
      tone.copy(pickTint(pick));
    } else {
      // Framework default (no art patch style): sand, plus grass on Tropical.
      const useGrass = definition.id === "tropical" && pick < 0.6;
      tone.copy(useGrass ? grass : sand);
    }
    tone.offsetHSL(0, 0, (random() - 0.5) * 0.06);
    mesh.setColorAt(index, tone);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { object: mesh, geometries: [geometry], materials: [material] };
}
