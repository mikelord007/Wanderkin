/**
 * Visual harness for the authored character (see character-preview.html).
 * Renders the character alone in a neutral studio so the silhouette, the
 * materials and each animation state can be inspected and screenshotted.
 *
 * `?state=` picks what to show; `?grid=1` tiles all of them at once.
 */

import * as THREE from "three";
import { buildCharacter } from "../src/game/render/character/buildCharacter.js";
import {
  CharacterAnimator,
  type AnimatorInput,
} from "../src/game/render/character/characterAnimator.js";
import { LANTERN_LIGHT } from "../src/game/render/character/characterDesign.js";

/** Same derivation PlayerAvatar uses: the lantern light is world-space, so it
 * has to be sized from the character's real height. */
function applyLanternScale(model: ReturnType<typeof buildCharacter>, height: number): void {
  model.lanternLight.distance = height * LANTERN_LIGHT.rangeInHeights;
  model.lanternLight.intensity = LANTERN_LIGHT.intensityAtUnitHeight * height * height;
}

const WALK_SPEED = 2.2;

interface Scenario {
  name: string;
  input: (t: number) => Partial<AnimatorInput>;
}

const SCENARIOS: Scenario[] = [
  { name: "idle", input: () => ({ speed: 0 }) },
  { name: "walk", input: () => ({ speed: WALK_SPEED * 0.35 }) },
  { name: "run", input: () => ({ speed: WALK_SPEED }) },
  {
    name: "jump",
    input: (t) => {
      const cycle = t % 1.6;
      if (cycle < 0.55) return { speed: WALK_SPEED, grounded: false, verticalVelocity: 3.2 - cycle * 9 };
      if (cycle < 1.0) return { speed: WALK_SPEED, grounded: false, verticalVelocity: 3.2 - cycle * 9 };
      return { speed: WALK_SPEED, grounded: true, verticalVelocity: 0 };
    },
  },
  { name: "mantle", input: () => ({ speed: 0.4, grounded: false, mantling: true }) },
  {
    name: "turn",
    input: (t) => ({ speed: WALK_SPEED, yaw: Math.sin(t * 1.4) * 1.1 }),
  },
];

const params = new URLSearchParams(location.search);
const grid = params.get("grid") === "1";
const only = params.get("state");
const active = grid ? SCENARIOS : SCENARIOS.filter((s) => s.name === (only ?? "run"));

// preserveDrawingBuffer so the harness can read the canvas back as a PNG.
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#1a1622");

const key = new THREE.DirectionalLight("#fff3e0", 1.7);
key.position.set(2.5, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
scene.add(key);
scene.add(new THREE.HemisphereLight("#bcd7ff", "#4a3a52", 0.9));
const rim = new THREE.DirectionalLight("#9fd8ff", 0.7);
rim.position.set(-3, 2, -3);
scene.add(rim);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: "#6b5a78", roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// The real capsule, drawn as a wireframe, so the body can be checked against
// the collider it is supposed to live inside.
const HEIGHT = 1;
const RADIUS = 0.2571;

interface Subject {
  scenario: Scenario;
  model: ReturnType<typeof buildCharacter>;
  animator: CharacterAnimator;
  holder: THREE.Group;
  tilt: THREE.Group;
}

const subjects: Subject[] = active.map((scenario, index) => {
  const model = buildCharacter();
  const animator = new CharacterAnimator();
  const holder = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.add(model.group);
  holder.add(tilt);
  const columns = Math.ceil(Math.sqrt(active.length));
  holder.position.set(
    (index % columns) * 1.5 - ((columns - 1) * 1.5) / 2,
    HEIGHT / 2,
    Math.floor(index / columns) * 1.5,
  );
  scene.add(holder);

  if (params.get("capsule") === "1") {
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HEIGHT - 2 * RADIUS, 6, 16),
      new THREE.MeshBasicMaterial({ color: "#7cf4ff", wireframe: true, transparent: true, opacity: 0.25 }),
    );
    holder.add(capsule);
  }

  applyLanternScale(model, HEIGHT);
  return { scenario, model, animator, holder, tilt };
});

/**
 * Scale comparison. Assets are normalised so their longest horizontal extent
 * becomes 8 game metres (DEFAULT_ASSUMED_EXTENT_METERS), so a real 2 m sofa
 * ends up 8 m long, ~3.4 m tall and with a ~1.7 m seat. This puts a block of
 * exactly those proportions next to the character at the authored 0.70 m height
 * and at the new 0.35 m height.
 */
const SOFA = { length: 8, height: 3.4, depth: 3.4, seat: 1.68, backThickness: 0.7 };
const sofaSubjects: { holder: THREE.Group; model: ReturnType<typeof buildCharacter>; animator: CharacterAnimator; tilt: THREE.Group; height: number }[] = [];

if (params.get("scene") === "sofa") {
  for (const subject of subjects) scene.remove(subject.holder);
  subjects.length = 0;

  // ?under=1 raises the sofa on legs and puts the character in the gap
  // underneath, which is the space the miniature scale exists to open up.
  const under = params.get("under") === "1";
  const lift = under ? 0.55 : 0;
  const upholstery = new THREE.MeshStandardMaterial({ color: "#8a6f5c", roughness: 0.9 });
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(SOFA.length, SOFA.seat, SOFA.depth - SOFA.backThickness),
    upholstery,
  );
  seat.position.set(0, lift + SOFA.seat / 2, (SOFA.backThickness) / 2);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(SOFA.length, SOFA.height, SOFA.backThickness),
    upholstery,
  );
  back.position.set(0, lift + SOFA.height / 2, -(SOFA.depth - SOFA.backThickness) / 2);
  const legs: THREE.Mesh[] = [];
  if (under) {
    const legMaterial = new THREE.MeshStandardMaterial({ color: "#4e3b2f", roughness: 0.8 });
    for (const [lx, lz] of [[-3.6, 1.2], [3.6, 1.2], [-3.6, -1.2], [3.6, -1.2]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, lift, 0.4), legMaterial);
      leg.position.set(lx, lift / 2, lz);
      leg.castShadow = true;
      leg.receiveShadow = true;
      scene.add(leg);
      legs.push(leg);
    }
  }

  for (const part of [seat, back, ...legs]) {
    part.castShadow = true;
    part.receiveShadow = true;
    scene.add(part);
  }

  // Scale candidates, left to right: today's authored 0.70 m capsule, the
  // shipped 0.35 m miniature, then the further-reduction candidates under
  // exploration (?heights=0.7,0.35,0.2,0.175,0.15 overrides the list).
  const heightsParam = params.get("heights");
  const heights = heightsParam ? heightsParam.split(",").map(Number) : [0.7, 0.35];
  const spacing = under ? Math.min(2.4, 5 / heights.length) : Math.min(4, 16 / heights.length);
  for (const [index, height] of heights.entries()) {
    const model = buildCharacter();
    const animator = new CharacterAnimator();
    const holder = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.add(model.group);
    holder.add(tilt);
    holder.position.set(
      (index - (heights.length - 1) / 2) * spacing,
      under ? height / 2 : lift + SOFA.seat + height / 2,
      under ? 0.4 : 1.1,
    );
    scene.add(holder);
    applyLanternScale(model, height);
    sofaSubjects.push({ holder, model, animator, tilt, height });
  }
}

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100);
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const label = document.getElementById("label")!;
const clock = new THREE.Clock();
let elapsed = 0;
let frames = 0;

function frame(fixedDelta?: number): void {
  const dt = fixedDelta ?? Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  frames += 1;

  for (const subject of subjects) {
    const overrides = subject.scenario.input(elapsed);
    const yaw = overrides.yaw ?? 0;
    const pose = subject.animator.update({
      speed: 0,
      walkSpeed: WALK_SPEED,
      grounded: true,
      mantling: false,
      verticalVelocity: 0,
      yaw,
      deltaSeconds: dt,
      reducedMotion: false,
      ...overrides,
    });
    const bones = subject.model.rig.bones;
    for (let i = 0; i < bones.length; i += 1) {
      bones[i]!.rotation.set(pose.euler[i * 3]!, pose.euler[i * 3 + 1]!, pose.euler[i * 3 + 2]!);
    }
    subject.model.group.position.y = pose.bobY;
    subject.holder.rotation.y = yaw + (params.get("spin") === "1" ? elapsed * 0.6 : 0);
    subject.tilt.rotation.x = pose.leanX;
    subject.tilt.rotation.z = pose.leanZ;
    const lateral = HEIGHT / Math.sqrt(Math.max(pose.squash, 0.2));
    subject.tilt.scale.set(lateral, HEIGHT * pose.squash, lateral);
    subject.model.lanternMaterial.emissiveIntensity = 0.95 + pose.lanternPulse * 0.28;
  }

  for (const subject of sofaSubjects) {
    const pose = subject.animator.update({
      speed: WALK_SPEED,
      walkSpeed: WALK_SPEED,
      grounded: true,
      mantling: false,
      verticalVelocity: 0,
      yaw: 0,
      deltaSeconds: dt,
      reducedMotion: false,
    });
    const bones = subject.model.rig.bones;
    for (let i = 0; i < bones.length; i += 1) {
      bones[i]!.rotation.set(pose.euler[i * 3]!, pose.euler[i * 3 + 1]!, pose.euler[i * 3 + 2]!);
    }
    subject.model.group.position.y = pose.bobY;
    subject.tilt.rotation.x = pose.leanX;
    const lateral = subject.height / Math.sqrt(Math.max(pose.squash, 0.2));
    subject.tilt.scale.set(lateral, subject.height * pose.squash, lateral);
    subject.model.lanternMaterial.emissiveIntensity = 0.95 + pose.lanternPulse * 0.28;
  }

  if (sofaSubjects.length) {
    if (params.get("cam") === "game") {
      // The real third-person rig from src/game/render/cameraRig.ts, for the
      // subject whose height matches ?height=: boom = camera.distance, target
      // lifted by characterRadius * CAMERA_TARGET_LIFT_RATIO above the capsule
      // centre. Values are those of the scaled config for that height.
      const subject = sofaSubjects[params.get("height") === "0.7" ? 0 : 1]!;
      const radius = subject.height * 0.2571;
      const boom = 2.5 * (subject.height / 0.7);
      const pitch = 0.32;
      const target = new THREE.Vector3(
        subject.holder.position.x,
        subject.holder.position.y + radius * 0.7,
        subject.holder.position.z,
      );
      const direction = new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch));
      camera.position.copy(target).addScaledVector(direction, boom);
      camera.lookAt(target);
      renderer.render(scene, camera);
      label.textContent = `game camera, character ${subject.height.toFixed(2)} m, boom ${boom.toFixed(2)} m\nsofa ${SOFA.length} m long, ${SOFA.height} m tall, seat ${SOFA.seat} m`;
      if (fixedDelta === undefined) requestAnimationFrame(() => frame());
      return;
    }
    if (params.get("cam") === "closeup") {
      // Tight on the seat cushion (1.68 m tall, known reference) so the
      // sub-0.35 m candidates can be told apart from each other, which the
      // wide comparison (zoomed out to fit the whole 8 m sofa) cannot do.
      const under = params.get("under") === "1";
      const midX = sofaSubjects.reduce((sum, s) => sum + s.holder.position.x, 0) / sofaSubjects.length;
      const midY = sofaSubjects.reduce((sum, s) => sum + s.holder.position.y, 0) / sofaSubjects.length;
      const targetZ = under ? 0.4 : 1.1;
      const dz = 1.3 + sofaSubjects.length * 0.35;
      camera.position.set(midX + 0.35, midY + 0.35 + dz * 0.15, targetZ + dz);
      camera.lookAt(midX, midY, targetZ);
    } else {
      const spread = sofaSubjects.length;
      camera.position.set(1.5, 3.4 + spread * 0.35, 9.5 + spread * 1.1);
      camera.lookAt(0, 1.5, 0);
    }
    renderer.render(scene, camera);
    const heightsLabel = sofaSubjects.map((s) => `${s.height.toFixed(3)} m`).join(" | ");
    label.textContent = `sofa scale, left to right: ${heightsLabel}\nsofa ${SOFA.length} m long, ${SOFA.height} m tall, seat ${SOFA.seat} m`;
    if (fixedDelta === undefined) requestAnimationFrame(() => frame());
    return;
  }

  const spread = Math.ceil(Math.sqrt(active.length));
  const distance = grid ? 1.15 * spread + 1.6 : 2.1;
  const height = grid ? 1.3 * spread : 0.75;
  camera.position.set(0, height, distance);
  camera.lookAt(0, grid ? 0.4 : 0.5, grid ? (spread - 1) * 0.75 : 0);

  renderer.render(scene, camera);
  label.textContent = `${active.map((s) => s.name).join(" | ")}\nframes ${frames}  t ${elapsed.toFixed(1)}s`;
  if (fixedDelta === undefined) requestAnimationFrame(() => frame());
}

// Headless browsers throttle requestAnimationFrame off-screen, so expose a
// deterministic stepper the screenshot harness can drive directly.
(window as unknown as { advance: (seconds: number, step?: number) => number }).advance = (
  seconds,
  step = 1 / 60,
) => {
  const count = Math.max(1, Math.round(seconds / step));
  for (let i = 0; i < count; i += 1) frame(step);
  return elapsed;
};

frame();
