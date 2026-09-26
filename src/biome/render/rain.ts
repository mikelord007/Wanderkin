/**
 * Rain for looks whose art sets `atmosphere.rain` (Monsoon): streaks falling
 * around the camera and small splashes where they land. Two draws: one for
 * every streak, one for every splash.
 *
 * Drops are simulated on the CPU in a box that follows the camera's focus
 * (wrapped in world space, so walking never drags the rain along). Each
 * frame a drop falls, leans with the biome's wind, and is tested against
 * the layout's ground height field (`BiomeLayout.ground`, baked once by
 * geometry): an O(1) cell lookup, never a raycast. On landing it respawns
 * at the top of the box and, when the pool has a free slot, leaves a splash:
 * a ring spreading on the surface and a tiny crown of droplets, gone within
 * {@link SPLASH_LIFE} seconds. The streak and splash buffers are fixed-size
 * (2,000 drops and 200 splashes at most) and allocated once.
 *
 * Splashes land on the highest collision surface under the drop, which
 * includes the scan itself: a drop over the sofa seat splashes on the seat.
 * Cells on a ledge edge (a neighbour a quarter character height away) take
 * no splash, so a ring never floats beside a table edge; the drop still ends
 * there. Drops that fall outside the height field end on the water ring
 * when there is one, else below the scene, without a splash.
 *
 * Reduced motion keeps a quarter of the drops, slower, and no splashes.
 * Reduced effects halve the drops and the splash pool.
 */
import * as THREE from "three";
import type { RainStyle } from "../assets/types.js";
import { groundAt, type GroundSample } from "../groundHeights.js";
import type { BiomeGroundHeights, BiomeLayout, EffectsQuality } from "../types.js";
import type { OwnedObject } from "./atmosphereEffects.js";
import { seededRandom } from "./selection.js";
import { clampWindStrength, normalizedWind } from "./wind.js";

export const RAIN_MAX_DROPS = 2000;
export const SPLASH_POOL = 200;
/** Seconds a splash lives, from first contact to fully faded. */
export const SPLASH_LIFE = 0.3;
/** Shares of the drop count kept under reduced motion / reduced effects. */
export const RAIN_REDUCED_MOTION_SHARE = 0.25;
export const RAIN_REDUCED_QUALITY_SHARE = 0.5;

/** All sizes are multiples of the character height (`ground.unit`). */
const FALL_SPEED = 14;
const BOX_HALF = 7;
const ABOVE_CAMERA = 2.5;
const FOCUS_AHEAD = 4;
const STREAK_LENGTH = 0.45;
const STREAK_WIDTH = 0.012;
const SPLASH_SIZE = 0.16;

export interface RainInput {
  style: RainStyle;
  ground: BiomeGroundHeights;
  water: BiomeLayout["water"];
  /** Unit XZ downwind direction and 0–1 strength. */
  wind: { direction: readonly [number, number]; strength: number };
  quality: EffectsQuality;
  reducedMotion: boolean;
  seed: string;
}

/**
 * The CPU half of the rain: fixed pools and one allocation-free `step`.
 * Kept separate from the GPU objects so it is testable without WebGL.
 */
export class RainSimulation {
  /** x, y, z per drop (head of the streak). */
  readonly drops: Float32Array;
  /** x, y, z, birth time per splash slot; birth < -1e5 = never used. */
  readonly splashes: Float32Array;
  readonly maxDrops: number;
  readonly poolSize: number;
  readonly unit: number;
  readonly velocity = new THREE.Vector3();
  /** Drops simulated and drawn right now. */
  active = 0;
  splashesEnabled = true;
  /** Total splashes spawned (diagnostics and tests). */
  spawned = 0;
  /** Landings that found the pool full and left no splash. */
  skipped = 0;
  private cursor = 0;
  private readonly random: () => number;
  private readonly center = new THREE.Vector3(Number.NaN, 0, 0);
  private top = 0;
  private readonly sample: GroundSample = { height: 0, splash: false };
  private speedScale = 1;

  constructor(private readonly input: RainInput) {
    const intensity = Math.min(1, Math.max(0, Number.isFinite(input.style.intensity) ? input.style.intensity : 0));
    const qualityShare = input.quality === "reduced" ? RAIN_REDUCED_QUALITY_SHARE : 1;
    this.maxDrops = Math.floor(RAIN_MAX_DROPS * intensity * qualityShare);
    this.poolSize = input.quality === "reduced" ? SPLASH_POOL / 2 : SPLASH_POOL;
    this.unit = input.ground.unit;
    this.drops = new Float32Array(this.maxDrops * 3);
    this.splashes = new Float32Array(this.poolSize * 4);
    for (let i = 0; i < this.poolSize; i += 1) this.splashes[i * 4 + 3] = -1e6;
    this.random = seededRandom(`${input.seed}:rain`);
    this.setReducedMotion(input.reducedMotion);
  }

  get boxHalf(): number {
    return this.unit * BOX_HALF;
  }

  setReducedMotion(reduced: boolean): void {
    this.active = Math.floor(this.maxDrops * (reduced ? RAIN_REDUCED_MOTION_SHARE : 1));
    this.splashesEnabled = !reduced;
    this.speedScale = reduced ? 0.6 : 1;
    const [dx, dz] = normalizedWind(this.input.wind.direction);
    const speed = this.unit * FALL_SPEED * this.speedScale;
    const lean = speed * 0.35 * clampWindStrength(this.input.wind.strength);
    this.velocity.set(dx * lean, -speed, dz * lean);
  }

  /** Where drops land at (x, z): the surface height, or NaN for "keep falling". */
  landing(x: number, z: number, out: GroundSample): GroundSample {
    groundAt(this.input.ground, x, z, out);
    if (!Number.isNaN(out.height)) return out;
    const water = this.input.water;
    if (water && Math.hypot(x - water.center[0], z - water.center[2]) <= water.outerRadius) {
      out.height = water.center[1];
      out.splash = true;
    }
    return out;
  }

  /**
   * Moves the rain box to `focus` (world) with its top `top`, and advances
   * every active drop by `delta` seconds at clock time `time`.
   */
  step(delta: number, time: number, focus: THREE.Vector3, top: number): void {
    const half = this.boxHalf;
    const size = half * 2;
    const first = Number.isNaN(this.center.x);
    this.center.copy(focus);
    this.top = top;
    if (first) {
      // Fill the whole column at once, so rain is already falling on arrival.
      for (let i = 0; i < this.maxDrops; i += 1) this.respawn(i, true);
      return;
    }
    const dt = Math.min(Math.max(delta, 0), 0.1);
    if (dt === 0) return;
    const d = this.drops;
    const vx = this.velocity.x * dt;
    const vy = this.velocity.y * dt;
    const vz = this.velocity.z * dt;
    const floor = focus.y - half * 4;
    for (let i = 0; i < this.active; i += 1) {
      const o = i * 3;
      let x = d[o]! + vx;
      const y = d[o + 1]! + vy;
      let z = d[o + 2]! + vz;
      // World-space wrap: the box follows the camera, the drops do not.
      if (x < focus.x - half) x += size;
      else if (x > focus.x + half) x -= size;
      if (z < focus.z - half) z += size;
      else if (z > focus.z + half) z -= size;
      const ground = this.landing(x, z, this.sample);
      if (!Number.isNaN(ground.height) ? y <= ground.height : y < floor) {
        if (ground.splash && this.splashesEnabled && !Number.isNaN(ground.height)) this.splash(x, ground.height, z, time);
        this.respawn(i, false);
        continue;
      }
      d[o] = x;
      d[o + 1] = y;
      d[o + 2] = z;
    }
  }

  /** Claims the next pool slot if its splash has finished; else skips. */
  private splash(x: number, y: number, z: number, time: number): void {
    const o = this.cursor * 4;
    if (time - this.splashes[o + 3]! < SPLASH_LIFE) {
      this.skipped += 1;
      return;
    }
    this.splashes[o] = x;
    this.splashes[o + 1] = y;
    this.splashes[o + 2] = z;
    this.splashes[o + 3] = time;
    this.cursor = (this.cursor + 1) % this.poolSize;
    this.spawned += 1;
  }

  /** Splashes still visible at `time`. */
  liveSplashes(time: number): number {
    let live = 0;
    for (let i = 0; i < this.poolSize; i += 1) {
      const age = time - this.splashes[i * 4 + 3]!;
      if (age >= 0 && age < SPLASH_LIFE) live += 1;
    }
    return live;
  }

  private respawn(i: number, anywhere: boolean): void {
    const half = this.boxHalf;
    const x = this.center.x + (this.random() * 2 - 1) * half;
    const z = this.center.z + (this.random() * 2 - 1) * half;
    let y = this.top + this.random() * this.unit;
    if (anywhere) {
      const ground = this.landing(x, z, this.sample).height;
      const bottom = Number.isNaN(ground) ? this.top - half * 2 : ground;
      y = bottom + (this.top - bottom) * this.random();
    }
    this.drops[i * 3] = x;
    this.drops[i * 3 + 1] = y;
    this.drops[i * 3 + 2] = z;
  }
}

export interface RainLayer extends OwnedObject<THREE.Group> {
  readonly simulation: RainSimulation;
  /** Advance with the render camera (the box sits just ahead of it). */
  update(delta: number, elapsed: number, camera: THREE.Camera | null): void;
  setReducedMotion(reduced: boolean): void;
}

const DEFAULT_TINT = "#c2d0da";

export function createRain(input: RainInput): RainLayer | null {
  const simulation = new RainSimulation(input);
  if (simulation.maxDrops === 0) return null;
  const unit = simulation.unit;
  const color = new THREE.Color(input.style.tint ?? DEFAULT_TINT);

  // ---- Streaks: one camera-facing quad per drop, stretched along its fall.
  const streaks = new THREE.InstancedBufferGeometry();
  streaks.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
  streaks.setIndex([0, 1, 2, 0, 2, 3]);
  const dropAttribute = new THREE.InstancedBufferAttribute(simulation.drops, 3);
  dropAttribute.setUsage(THREE.DynamicDrawUsage);
  streaks.setAttribute("aDrop", dropAttribute);
  streaks.instanceCount = simulation.active;
  const streakUniforms = {
    uVelocityDir: { value: simulation.velocity.clone().normalize() },
    uLength: { value: unit * STREAK_LENGTH },
    uWidth: { value: unit * STREAK_WIDTH },
    uColor: { value: color },
    uOpacity: { value: 0.38 },
    uFocus: { value: new THREE.Vector3() },
    uHalf: { value: simulation.boxHalf },
    /** Drops closer to the camera than this fade out (never a smear on the lens). */
    uNear: { value: unit * 2.5 },
    /** World size of one pixel at unit distance (set per render). */
    uPixel: { value: 0.002 },
  };
  const streakMaterial = new THREE.ShaderMaterial({
    uniforms: streakUniforms,
    vertexShader: STREAK_VERTEX,
    fragmentShader: STREAK_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const streakMesh = new THREE.Mesh(streaks, streakMaterial);
  streakMesh.name = "biome-rain";
  streakMesh.frustumCulled = false;
  streakMesh.renderOrder = 2;
  streakMesh.onBeforeRender = (renderer, _scene, camera) => {
    const height = renderer.getContext().drawingBufferHeight;
    streakUniforms.uPixel.value = 2 / (Math.max(1, height) * camera.projectionMatrix.elements[5]!);
  };

  // ---- Splashes: a flat ring (part 0) and an upright droplet crown (part 1).
  const splashBase = new Float32Array([
    -1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, // ring quad, on the surface
    -1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0, // crown quad, faces the camera
  ]);
  const part = new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]);
  const splashes = new THREE.InstancedBufferGeometry();
  splashes.setAttribute("position", new THREE.BufferAttribute(splashBase, 3));
  splashes.setAttribute("aPart", new THREE.BufferAttribute(part, 1));
  splashes.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7]);
  const splashAttribute = new THREE.InstancedBufferAttribute(simulation.splashes, 4);
  splashAttribute.setUsage(THREE.DynamicDrawUsage);
  splashes.setAttribute("aSplash", splashAttribute);
  splashes.instanceCount = simulation.poolSize;
  const splashUniforms = {
    uTime: { value: 0 },
    uLife: { value: SPLASH_LIFE },
    uSize: { value: unit * SPLASH_SIZE },
    uColor: { value: color },
    uOpacity: { value: 0.6 },
    uFocus: streakUniforms.uFocus,
    uHalf: streakUniforms.uHalf,
  };
  const splashMaterial = new THREE.ShaderMaterial({
    uniforms: splashUniforms,
    vertexShader: SPLASH_VERTEX,
    fragmentShader: SPLASH_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const splashMesh = new THREE.Mesh(splashes, splashMaterial);
  splashMesh.name = "biome-rain-splashes";
  splashMesh.frustumCulled = false;
  splashMesh.renderOrder = 2;
  splashMesh.visible = simulation.splashesEnabled;

  const group = new THREE.Group();
  group.name = "biome-rain-layer";
  group.add(streakMesh, splashMesh);
  const forward = new THREE.Vector3();
  const look = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const sample: GroundSample = { height: 0, splash: false };

  return {
    object: group,
    geometries: [streaks, splashes],
    materials: [streakMaterial, splashMaterial],
    simulation,
    update(delta, elapsed, camera) {
      if (!camera) return;
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
      forward.normalize();
      // Centre the rain where the camera looks at the ground (the player
      // under the chase camera), at least a few character heights ahead.
      camera.getWorldDirection(look);
      const below = simulation.landing(camera.position.x, camera.position.z, sample).height;
      const drop = camera.position.y - (Number.isNaN(below) ? camera.position.y - unit * 4 : below);
      const ahead = look.y < -0.05 ? Math.min(unit * 7, Math.max(unit * FOCUS_AHEAD, (drop / -look.y) * Math.hypot(look.x, look.z))) : unit * FOCUS_AHEAD;
      focus.copy(camera.position).addScaledVector(forward, ahead);
      simulation.step(delta, elapsed, focus, camera.position.y + unit * ABOVE_CAMERA);
      streakUniforms.uFocus.value.copy(focus);
      splashUniforms.uTime.value = elapsed;
      streaks.instanceCount = simulation.active;
      dropAttribute.clearUpdateRanges();
      dropAttribute.addUpdateRange(0, simulation.active * 3);
      dropAttribute.needsUpdate = true;
      splashAttribute.needsUpdate = true;
    },
    setReducedMotion(reduced) {
      simulation.setReducedMotion(reduced);
      streakUniforms.uVelocityDir.value.copy(simulation.velocity).normalize();
      streaks.instanceCount = simulation.active;
      splashMesh.visible = simulation.splashesEnabled;
    },
  };
}

const STREAK_VERTEX = /* glsl */ `
  attribute vec3 aDrop;
  uniform vec3 uVelocityDir;
  uniform float uLength;
  uniform float uWidth;
  uniform vec3 uFocus;
  uniform float uHalf;
  uniform float uPixel;
  uniform float uNear;
  varying float vAlong;
  varying float vEdge;
  void main() {
    // Fade toward the rim of the rain box, so its square edge never shows.
    vEdge = 1.0 - smoothstep(0.65, 1.0, length(aDrop.xz - uFocus.xz) / uHalf);
    // Head at the drop, tail trailing back up along the fall direction.
    vec3 p = aDrop - uVelocityDir * (uLength * position.y);
    vec3 toCamera = cameraPosition - p;
    // (toCamera × fall) keeps the quad's front face toward the camera.
    vec3 side = normalize(cross(toCamera, uVelocityDir));
    // Never thinner than ~1.4 px, so distant streaks stay visible; thinned
    // ones get lighter so the rain does not thicken with distance.
    float distance = length(toCamera);
    float width = max(uWidth, 1.2 * uPixel * distance);
    vEdge *= clamp(uWidth / width, 0.5, 1.0) * smoothstep(uNear * 0.5, uNear, distance);
    p += side * (width * position.x);
    vAlong = position.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const STREAK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlong;
  varying float vEdge;
  void main() {
    // Brightest just behind the head, fading out toward the tail.
    float a = uOpacity * vEdge * (1.0 - smoothstep(0.25, 1.0, vAlong)) * smoothstep(0.0, 0.08, vAlong + 0.02);
    if (a < 0.005) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

const SPLASH_VERTEX = /* glsl */ `
  attribute vec4 aSplash;
  attribute float aPart;
  uniform float uTime;
  uniform float uLife;
  uniform float uSize;
  uniform vec3 uFocus;
  uniform float uHalf;
  varying vec2 vUv;
  varying float vPart;
  varying float vT;
  varying float vEdge;
  void main() {
    float t = (uTime - aSplash.w) / uLife;
    vEdge = 1.0 - smoothstep(0.6, 1.0, length(aSplash.xz - uFocus.xz) / uHalf);
    // Every splash a little different in size.
    float size = uSize * (0.7 + 0.6 * fract(sin(aSplash.w * 91.7 + aSplash.x * 13.1) * 43758.5));
    vUv = position.xz;
    vPart = aPart;
    vT = t;
    if (t < 0.0 || t > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // dead slot: outside the clip volume
      return;
    }
    vec3 centre = aSplash.xyz;
    vec3 p;
    if (aPart < 0.5) {
      // Ring: spreads fast, then slows.
      float r = size * (0.25 + 0.85 * (1.0 - (1.0 - t) * (1.0 - t)));
      p = centre + vec3(position.x * r, size * 0.03, position.z * r);
    } else {
      // Crown: a small camera-facing sprite standing on the splash.
      vUv = vec2(position.x, position.y);
      vec3 toCamera = cameraPosition - centre;
      vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCamera));
      float w = size * 0.9;
      p = centre + side * (position.x * w) + vec3(0.0, position.y * w * 1.1, 0.0);
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const SPLASH_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vPart;
  varying float vT;
  varying float vEdge;
  void main() {
    float fade = (1.0 - vT) * vEdge;
    float a;
    if (vPart < 0.5) {
      float d = length(vUv);
      a = smoothstep(0.55, 0.8, d) * (1.0 - smoothstep(0.85, 1.0, d)) * fade;
    } else {
      // Two tiny droplets flung up and out past the ring, gone by mid-life.
      float h = sin(3.14159 * min(1.0, vT * 1.6)) * 0.6;
      float spread = 0.45 + 0.5 * vT;
      float dots = max(
        1.0 - smoothstep(0.035, 0.07, length(vUv - vec2(-spread, h))),
        1.0 - smoothstep(0.035, 0.07, length(vUv - vec2(spread, h * 0.85))));
      a = dots * fade * (1.0 - smoothstep(0.35, 0.65, vT));
    }
    a *= uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;
