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

const key = new THREE.DirectionalLight("#fff3e0", 2.4);
key.position.set(2.5, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -3;
scene.add(key);
scene.add(new THREE.HemisphereLight("#bcd7ff", "#4a3a52", 1.1));
const rim = new THREE.DirectionalLight("#9fd8ff", 1.0);
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

  const upholstery = new THREE.MeshStandardMaterial({ color: "#8a6f5c", roughness: 0.9 });
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(SOFA.length, SOFA.seat, SOFA.depth - SOFA.backThickness),
    upholstery,
  );
  seat.position.set(0, SOFA.seat / 2, (SOFA.backThickness) / 2);
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(SOFA.length, SOFA.height, SOFA.backThickness),
    upholstery,
  );
  back.position.set(0, SOFA.height / 2, -(SOFA.depth - SOFA.backThickness) / 2);
  for (const part of [seat, back]) {
    part.castShadow = true;
    part.receiveShadow = true;
    scene.add(part);
  }

  // Left: today's authored 0.70 m capsule. Right: the new 0.35 m one.
  for (const [index, height] of [0.7, 0.35].entries()) {
    const model = buildCharacter();
    const animator = new CharacterAnimator();
    const holder = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.add(model.group);
    holder.add(tilt);
    holder.position.set(-2 + index * 4, SOFA.seat + height / 2, 1.1);
    scene.add(holder);
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
    camera.position.set(1.5, 3.4, 9.5);
    camera.lookAt(0, 1.5, 0);
    renderer.render(scene, camera);
    label.textContent = `sofa scale: 0.70 m (left) vs 0.35 m (right)\nsofa ${SOFA.length} m long, ${SOFA.height} m tall, seat ${SOFA.seat} m`;
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
