/** Integration-level contract checks across geometry, presentation and the
 * shared schema, on the geometry worker's representative fixtures (desk with
 * several heights, flat countertop, soft bed, poor reconstruction). */
import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, migrateSceneManifest, type SceneManifest } from "@shared/index.js";
import { capsuleHeight, toMiniatureScale } from "../game/core/characterScale.js";
import { prepareAdventure } from "./adventures.js";
import { acceptGeneratedAdventure } from "./adventureDraft.js";
import { GEOMETRY_FIXTURES } from "./geometryFixtures.js";
import { prepareBiomeLayout } from "./placement.js";
import { getBiomeDefinition } from "./presets.js";
import { adventureHudCopy } from "./missionCopy.js";
import type { AdventureTemplateId } from "./types.js";

const runtime = toMiniatureScale(DEFAULT_MOVEMENT_CONFIG);
const authored = DEFAULT_MOVEMENT_CONFIG;
const TEMPLATES: AdventureTemplateId[] = ["restore-portal", "reach-beacon"];

/** Everything that decides where the player goes and what they must reach. */
function traversal(manifest: SceneManifest) {
  const experience = manifest.experience;
  return {
    spawn: manifest.spawn,
    checkpoints: manifest.checkpoints.map(({ id, order, position, triggerRadius, safeRespawn }) => ({ id, order, position, triggerRadius, safeRespawn })),
    entities: manifest.entities.map((entity) => ({ id: entity.id, kind: entity.kind, transform: entity.transform,
      dimensions: "dimensions" in entity ? entity.dimensions : null })),
    collectibles: experience?.collectibles.map(({ id, transform, triggerRadius, order }) => ({ id, transform, triggerRadius, order })),
    portal: experience?.finishPortal ? { id: experience.finishPortal.id, transform: experience.finishPortal.transform } : null,
    mode: experience?.mode.kind === "explore"
      ? { kind: "explore", destinations: experience.mode.destinations.map(({ id, position }) => ({ id, position })) }
      : experience?.mode.kind === "collect"
        ? { kind: "collect", required: experience.mode.requiredCollectibleIds, portal: experience.mode.finishPortalId }
        : experience?.mode.kind,
  };
}

describe.each(GEOMETRY_FIXTURES.map((make) => [make().name, make] as const))("fixture %s", (_name, make) => {
  for (const template of TEMPLATES) {
    it(`${template}: runtime or authored input give the same authored-scale result (no double shrink)`, () => {
      const fixture = make();
      const fromRuntime = prepareAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: runtime, template, seed: "contract" });
      const fromAuthored = prepareAdventure({ manifest: fixture.manifest, assets: fixture.assets, movement: authored, template, seed: "contract" });
      expect(fromRuntime.ok).toBe(fromAuthored.ok);
      // Everything except generation timestamps must match exactly.
      const stable = (m: SceneManifest) => JSON.stringify({ ...m, updatedAt: null,
        courseValidation: { ...m.courseValidation, checkedAt: null } });
      expect(stable(fromRuntime.manifest)).toBe(stable(fromAuthored.manifest));
      if (fromRuntime.ok) {
        // Stored centres are AUTHORED capsule centres (surface + 0.37 m), never runtime ones.
        const lift = authored.characterHalfHeight + authored.characterRadius + 0.02;
        expect(lift).toBeCloseTo(0.37, 5);
        expect(fromRuntime.manifest.spawn.position[1] - lift).toBeGreaterThan(-1e-6);
      }
    });

    it(`${template}: the look never moves objectives, and the result survives the integration gate and loader`, () => {
      const fixture = make();
      const base = { manifest: fixture.manifest, assets: fixture.assets, movement: runtime, template, seed: "same-seed" };
      const neutral = prepareAdventure(base);
      const tropical = prepareAdventure({ ...base, definition: getBiomeDefinition("tropical"), quality: "standard" });
      const desert = prepareAdventure({ ...base, definition: getBiomeDefinition("desert"), quality: "reduced" });
      expect(tropical.ok).toBe(neutral.ok);
      expect(desert.ok).toBe(neutral.ok);
      if (!neutral.ok) {
        // An explicit refusal hands back the untouched source.
        expect(neutral.manifest).toBe(fixture.manifest);
        return;
      }
      expect(traversal(tropical.manifest)).toEqual(traversal(neutral.manifest));
      expect(traversal(desert.manifest)).toEqual(traversal(neutral.manifest));

      const accepted = acceptGeneratedAdventure(fixture.manifest, neutral.manifest, {
        template, seed: "same-seed", generator: 1, biome: { id: "desert", seed: "look" },
        levelId: "adventure-contract", now: "2026-09-25T00:00:00.000Z",
      });
      expect(accepted).toMatchObject({ ok: true });
      if (!accepted.ok) return;
      const reloaded = migrateSceneManifest(JSON.parse(JSON.stringify(accepted.manifest)));
      expect(reloaded.adventure).toEqual({ template, seed: "same-seed", generator: 1 });
      expect(reloaded.biome).toEqual({ id: "desert", seed: "look" });
      expect(traversal(reloaded)).toEqual(traversal(neutral.manifest));
      // Themed names come from the presentation path, not generation input.
      expect(adventureHudCopy(reloaded, getBiomeDefinition("desert"))?.title)
        .toBe(template === "restore-portal" ? "Awaken the oasis gate" : "Reach the oasis beacon");
    });
  }

  it("decoration scales props from the runtime body, and the look never changes gameplay data", () => {
    const fixture = make();
    const before = JSON.stringify(fixture.manifest);
    for (const id of ["tropical", "desert"] as const) {
      const definition = getBiomeDefinition(id);
      let layout;
      try {
        layout = prepareBiomeLayout({ manifest: fixture.manifest, assets: fixture.assets, movement: runtime, definition, seed: "look", quality: "standard" });
      } catch {
        continue; // Refusal is allowed; the hook keeps the current look.
      }
      const ceiling = definition.props.scaleRange[1] * capsuleHeight(runtime) * 1.001;
      for (const prop of layout.props) expect(prop.scale).toBeLessThanOrEqual(ceiling);
    }
    expect(JSON.stringify(fixture.manifest)).toBe(before);
  });
});
