/**
 * Real-controller evidence for generated adventures.
 *
 * The conservative validator is not the character controller, so this drives
 * the actual Rapier `GameSimulation` at the runtime (miniature) body size
 * along the validated route of each generated adventure — over generated
 * stairs, stepping platforms and jumps — and checks that every objective's
 * real trigger fires, in order, without falling out of the level.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, type SceneManifest, type Vec3 } from "@shared/index.js";
import { toMiniatureScale } from "../game/core/characterScale.js";
import { initRapier } from "../game/core/physicsWorld.js";
import { GameSimulation, NEUTRAL_INPUT } from "../game/core/simulation.js";
import type { Transition } from "../scene/route.js";
import { generateAdventure, type AdventureGenerationDetail } from "./adventures.js";
import { bedFixture, countertopFixture, deskFixture, poorFixture, sampleScanFixture, type GeometryFixture } from "./geometryFixtures.js";

const RUNTIME = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);

beforeAll(async () => {
  await initRapier();
});

interface Trigger {
  id: string;
  position: Vec3;
  radius: number;
}

function triggersOf(manifest: SceneManifest): Trigger[] {
  const experience = manifest.experience!;
  if (experience.mode.kind === "collect") {
    return [
      ...experience.collectibles.map((f) => ({ id: f.id, position: f.transform.position, radius: f.triggerRadius })),
      { id: experience.finishPortal!.id, position: experience.finishPortal!.transform.position, radius: experience.finishPortal!.triggerRadius },
    ];
  }
  if (experience.mode.kind === "explore") {
    // Route checkpoints first (their real sphere triggers), then the beacon
    // with the fixed 0.7 m destination radius of `modes/proximity.ts`.
    const route = manifest.checkpoints.slice(0, -1).map((c) => ({ id: c.id, position: c.position, radius: c.triggerRadius }));
    return [...route, ...experience.mode.destinations.map((d) => ({ id: d.id, position: d.position, radius: 0.7 }))];
  }
  return [];
}

/**
 * Walks the validated transitions: steer at each next surface point, jump on
 * jump legs, take the mantle the controller offers on mantle legs.
 */
async function drive(fixture: GeometryFixture, detail: AdventureGenerationDetail) {
  const simulation = await GameSimulation.create({
    manifest: detail.manifest,
    config: DEFAULT_MOVEMENT_CONFIG,
    assetGeometry: new Map([...fixture.assets].map(([id, asset]) => [id, asset.collision])),
    miniature: true,
  });
  const reached: string[] = [];
  let respawns = 0;
  let failure = "";
  try {
    const triggers = triggersOf(detail.manifest);
    const legs = detail.report.segments.map((segment) => segment.transitions);
    for (let i = 0; i < 30; i += 1) simulation.stepFixed(NEUTRAL_INPUT);

    const hit = (trigger: Trigger) => {
      const p = simulation.playerPosition;
      return Math.hypot(p.x - trigger.position[0], p.y - trigger.position[1], p.z - trigger.position[2]) <= trigger.radius;
    };

    for (let leg = 0; leg < legs.length; leg += 1) {
      const transitions: readonly Transition[] = legs[leg]!;
      const goal = triggers[leg]!;
      let index = 0;
      // Jump legs: a short run-up back along the leg, then a running jump,
      // as a player would take it. The validator's jump model assumes the
      // take-off happens at walking speed.
      let phase: "approach" | "runup" | "charge" | "air" = "approach";
      let phaseSteps = 0;
      // Steps without getting closer; a stuck player tries a hop, like a
      // person would, but never while still progressing.
      let stalled = 0;
      let best = Infinity;
      for (let step = 0; step < 60 * 90 && !hit(goal); step += 1) {
        const transition = transitions[Math.min(index, transitions.length - 1)];
        const p = simulation.playerPosition;
        const feet = p.y - RUNTIME.characterHalfHeight - RUNTIME.characterRadius;
        const isJump = transition?.kind === "jump";
        const rise = transition ? transition.heightChange : 0;
        let target: Vec3 = transition ? transition.to : goal.position;
        if (isJump && phase === "runup" && transition) {
          const dir = [transition.to[0] - transition.from[0], transition.to[2] - transition.from[2]];
          const length = Math.hypot(dir[0]!, dir[1]!) || 1;
          target = [transition.from[0] - (dir[0]! / length) * 0.3, transition.from[1], transition.from[2] - (dir[1]! / length) * 0.3];
        }
        const dx = target[0] - p.x;
        const dz = target[2] - p.z;
        const distance = Math.hypot(dx, dz);
        const arrived = distance < 0.12 && Math.abs(feet - target[1]) < 0.2 && phase !== "runup";
        if (arrived && index < transitions.length) {
          index += 1;
          phase = "approach";
          phaseSteps = 0;
          stalled = 0;
          best = Infinity;
          continue;
        }
        if (distance < best - 0.01) {
          best = distance;
          stalled = 0;
        } else {
          stalled += 1;
        }

        let jump = false;
        phaseSteps += 1;
        if (isJump && transition && simulation.isGrounded) {
          // A gap or climb needs momentum; dropping down does not.
          const needsMomentum = rise > -0.3;
          if (phase === "approach") {
            phase = needsMomentum ? "runup" : "charge";
            phaseSteps = 0;
          } else if (phase === "runup" && (distance < 0.06 || phaseSteps > 30)) {
            phase = "charge";
            phaseSteps = 0;
          } else if (phase === "charge") {
            const fromDistance = Math.hypot(transition.from[0] - p.x, transition.from[2] - p.z);
            const ahead = (transition.to[0] - transition.from[0]) * (p.x - transition.from[0]) + (transition.to[2] - transition.from[2]) * (p.z - transition.from[2]) >= 0;
            if ((fromDistance < 0.08 || ahead) && (!needsMomentum || simulation.measuredHorizontalSpeed > 1.2 || phaseSteps > 40)) {
              jump = true;
              phase = "air";
            }
          } else if (phase === "air" && phaseSteps > 10) {
            // Landed short: try again from here.
            phase = "approach";
          }
        }
        simulation.stepFixed({
          ...NEUTRAL_INPUT,
          forward: phase === "charge" || phase === "air" ? 1 : distance > 0.03 ? (distance < 0.25 ? 0.5 : 1) : 0,
          cameraYaw: Math.atan2(dx, dz),
          jump: jump || (stalled > 90 && stalled % 60 === 0 && simulation.isGrounded),
          // A climb leg may be taken as the mantle the controller offers.
          mantle: (transition?.kind === "mantle" || (isJump && rise > 0.25)) && simulation.mantleTarget !== null && !simulation.isMantling,
        });
        if (phase === "air" && jump) phaseSteps = 0;
        for (const event of simulation.drainEvents()) {
          if (event.type === "respawn") respawns += 1;
        }
      }
      if (!hit(goal)) {
        const p = simulation.playerPosition;
        failure = `stuck on leg ${leg} (${goal.id}) at transition ${index}/${transitions.length} ${
          transitions[index]?.kind ?? "-"
        } → ${transitions[index]?.to.map((n) => n.toFixed(2)).join() ?? "-"}; player ${[p.x, p.y, p.z].map((n) => n.toFixed(2)).join()}`;
        break;
      }
      reached.push(goal.id);
    }
    return { reached, triggers: triggers.map((t) => t.id), respawns, failure };
  } finally {
    simulation.dispose();
  }
}

const CASES: [string, () => GeometryFixture][] = [
  ["desk with several heights (generated stairs)", deskFixture],
  ["flat countertop (generated stepped route with a jump)", countertopFixture],
  ["irregular soft bed (generated stairs)", bedFixture],
  ["poor reconstruction", () => poorFixture(true)],
  ["poor reconstruction without a floor (fallback floor)", () => poorFixture(false)],
  ["real Rodin scan without authored steps", () => sampleScanFixture("sample-rodin-room-corner")],
  ["real Tripo scan without authored steps", () => sampleScanFixture("sample-tripo-room-corner")],
];

describe("generated adventures are completable by the real controller at miniature scale", () => {
  it.each(CASES)("%s — restore the portal", async (_label, make) => {
    const fixture = make();
    const detail = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "restore-portal", seed: `controller-${fixture.name}` });
    // The adventure really climbs: its last fragment is on an elevated surface.
    const floor = detail.chain[0]![1];
    expect(Math.max(...detail.chain.map((point) => point[1] - floor))).toBeGreaterThanOrEqual(0.5);
    const result = await drive(fixture, detail);
    expect(result.reached, result.failure).toEqual(result.triggers);
    expect(result.respawns).toBe(0);
  }, 120_000);

  it.each(CASES)("%s — reach the beacon", async (_label, make) => {
    const fixture = make();
    const detail = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "reach-beacon", seed: `controller-${fixture.name}` });
    const floor = detail.chain[0]![1];
    expect(detail.chain.at(-1)![1] - floor).toBeGreaterThanOrEqual(0.5);
    const result = await drive(fixture, detail);
    expect(result.reached, result.failure).toEqual(result.triggers);
    expect(result.respawns).toBe(0);
  }, 120_000);

  it("crosses the generated jump gap on a flat scene", async () => {
    const fixture = countertopFixture();
    const detail = generateAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: RUNTIME, template: "reach-beacon", seed: "controller-countertop" });
    expect(detail.structures.map((structure) => structure.kind)).toContain("platform-route");
    const jumps = detail.report.segments.flatMap((segment) => segment.transitions).filter((t) => t.kind === "jump" && Math.abs(t.heightChange) < 0.05);
    expect(jumps.length).toBeGreaterThan(0);
    const result = await drive(fixture, detail);
    expect(result.reached, result.failure).toEqual(result.triggers);
  }, 120_000);
});
