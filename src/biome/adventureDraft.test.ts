import { describe, expect, it } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import lostColors from "../../shared/fixtures/lost-colors.json";
import { acceptGeneratedAdventure, type AdventureDraftOptions } from "./adventureDraft.js";

const source = lostColors as unknown as SceneManifest;

function generatedPortal(): SceneManifest {
  const copy = structuredClone(source);
  copy.courseValidation = { status: "validated", method: "test" };
  copy.experience = { ...copy.experience!, initialColorRestoration: 1 };
  copy.workflow = { stale: true } as never;
  copy.biome = { id: "desert", seed: "stale" };
  return copy;
}

function generatedBeacon(): SceneManifest {
  const copy = generatedPortal();
  copy.experience = {
    ...copy.experience!,
    mode: { kind: "explore", destinations: [{ id: "beacon", position: [1, 0.4, 1], label: "Beacon" }], optionalCollectibleIds: [] },
    collectibles: [],
    finishPortal: null,
  };
  return copy;
}

const options = (overrides: Partial<AdventureDraftOptions> = {}): AdventureDraftOptions => ({
  template: "restore-portal",
  seed: "seed:adventure:1",
  generator: 1,
  biome: { id: "tropical", seed: "look-seed" },
  levelId: "adventure-new",
  now: "2026-09-25T10:00:00.000Z",
  ...overrides,
});

describe("acceptGeneratedAdventure", () => {
  it("accepts a validated portal adventure and stamps a fresh private draft", () => {
    const result = acceptGeneratedAdventure(source, generatedPortal(), options());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.levelId).toBe("adventure-new");
    expect(result.manifest.createdAt).toBe("2026-09-25T10:00:00.000Z");
    expect(result.manifest.adventure).toEqual({ template: "restore-portal", seed: "seed:adventure:1", generator: 1 });
    expect(result.manifest.biome).toEqual({ id: "tropical", seed: "look-seed" });
    expect(result.manifest.workflow).toBeUndefined();
    expect(result.manifest.assets).toEqual(source.assets);
  });

  it("accepts a single-destination beacon and stores Original as no theme", () => {
    const result = acceptGeneratedAdventure(source, generatedBeacon(),
      options({ template: "reach-beacon", biome: { id: "original", seed: "x" } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.biome).toBeUndefined();
  });

  it("does not mutate its inputs", () => {
    const generated = generatedPortal();
    const before = JSON.stringify(generated);
    const sourceBefore = JSON.stringify(source);
    acceptGeneratedAdventure(source, generated, options());
    expect(JSON.stringify(generated)).toBe(before);
    expect(JSON.stringify(source)).toBe(sourceBefore);
  });

  it.each([
    ["source assets changed", (m: SceneManifest) => { m.assets = []; }],
    ["source meshes changed", (m: SceneManifest) => {
      const mesh = m.entities.find((e) => e.kind === "generated-mesh")!;
      mesh.transform = { ...mesh.transform, position: [9, 9, 9] };
    }],
    ["movement config changed", (m: SceneManifest) => { m.movementConfigId = "other"; }],
    ["course is not validated", (m: SceneManifest) => { m.courseValidation = { status: "failed" }; }],
    ["no checkpoints", (m: SceneManifest) => { m.checkpoints = []; }],
    ["new missions start fully coloured", (m: SceneManifest) => { m.experience = { ...m.experience!, initialColorRestoration: 0 }; }],
    ["portal is missing", (m: SceneManifest) => { m.experience = { ...m.experience!, finishPortal: null }; }],
    ["required fragments are inconsistent", (m: SceneManifest) => { m.experience = { ...m.experience!, collectibles: [] }; }],
    ["no mission", (m: SceneManifest) => { delete m.experience; }],
  ])("keeps the current world when %s", (reason, mutate) => {
    const generated = generatedPortal();
    mutate(generated);
    expect(acceptGeneratedAdventure(source, generated, options())).toEqual({ ok: false, reason });
  });

  it("rejects a mode that does not match the chosen adventure", () => {
    expect(acceptGeneratedAdventure(source, generatedBeacon(), options()).ok).toBe(false);
    expect(acceptGeneratedAdventure(source, generatedPortal(), options({ template: "reach-beacon" })).ok).toBe(false);
    const twoBeacons = generatedBeacon();
    if (twoBeacons.experience?.mode.kind === "explore") {
      twoBeacons.experience.mode = { ...twoBeacons.experience.mode,
        destinations: [...twoBeacons.experience.mode.destinations, { id: "b2", position: [0, 0, 0], label: "B" }] };
    }
    expect(acceptGeneratedAdventure(source, twoBeacons, options({ template: "reach-beacon" })).ok).toBe(false);
  });

  it("rejects a draft that the world loader would refuse", () => {
    const result = acceptGeneratedAdventure(source, generatedPortal(), options({ seed: "" }));
    expect(result.ok).toBe(false);
  });
});
