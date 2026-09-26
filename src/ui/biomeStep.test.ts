import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import {
  canBuildWorld, createCreationRecord, isUntouchedCreationRecord, resumeStep, withCreationBiome, withLockedBiome, withNewPhoto, withoutPhoto,
  type CreationRecord,
} from "./creationFlow.js";
import { toPendingWorld, worldBuildStages, worldChoicesLine } from "./pendingWorlds.js";
import { BIOME_STEP_COPY, BiomeStepScreen, BiomeStepView, type BiomeStepViewProps } from "./screens/BiomeStepScreen.js";

const NOW = "2026-09-26T21:00:00.000Z";
const selection = { style: "cartoon" as const, mode: "collect" as const, atmosphere: "" };
const photo = { id: "photo-1", url: "/photos/1.jpg", order: 1 };

function approvedAt(step: CreationRecord["step"], biome?: "monsoon" | "desert"): CreationRecord {
  return {
    ...createCreationRecord("world-1", NOW),
    step,
    photo,
    objectImage: { id: "cutout-1", url: "/cutouts/1.png" } as NonNullable<CreationRecord["objectImage"]>,
    selection: biome ? { ...selection, biome } : selection,
    preview: { cacheKey: "k", jobId: "p", asset: { id: "look-1", url: "/looks/1.png" } as never, selection, approvedAt: NOW },
    jobs: { object: { id: "o", state: "ready", kind: "image-edit" }, preview: { id: "p", state: "ready", kind: "image-edit" } },
  };
}

describe("the biome step in the creation flow", () => {
  it("is required: a world cannot be built until a biome is locked in", () => {
    expect(canBuildWorld(approvedAt("preview"))).toBe(false);
    expect(canBuildWorld(approvedAt("preview", "monsoon"))).toBe(true);
  });

  it("locks the first choice for good", () => {
    const locked = withLockedBiome(approvedAt("biome"), "monsoon", NOW);
    expect(locked.selection.biome).toBe("monsoon");
    expect(locked.step).toBe("biome");
    expect(withLockedBiome(locked, "desert", NOW)).toBe(locked);
  });

  it("is cleared only by a different photo or by removing the photo", () => {
    const locked = approvedAt("preview", "monsoon");
    expect(withNewPhoto(locked, photo, NOW).selection.biome).toBe("monsoon");
    expect(withNewPhoto(locked, { id: "photo-2", url: "/photos/2.jpg", order: 1 }, NOW).selection).toEqual(selection);
    expect(withoutPhoto(locked, NOW).selection).toEqual(selection);
    // The look, mode and atmosphere the player chose are kept.
    expect(withoutPhoto(locked, NOW).selection.mode).toBe("collect");
  });

  it("a creation saved at the preview step before biomes existed resumes at the biome step", () => {
    expect(resumeStep(approvedAt("preview"))).toBe("biome");
    expect(resumeStep(approvedAt("preview", "desert"))).toBe("preview");
    expect(resumeStep(approvedAt("customize"))).toBe("customize");
    expect(resumeStep(approvedAt("biome", "desert"))).toBe("biome");
  });

  it("a creation with a biome is never mistaken for an untouched one", () => {
    const fresh = createCreationRecord("w", NOW);
    expect(isUntouchedCreationRecord(fresh)).toBe(true);
    expect(isUntouchedCreationRecord({ ...fresh, selection: { ...fresh.selection, biome: "ember" } })).toBe(false);
  });
});

describe("carrying the biome through", () => {
  it("names it next to the look and the adventure", () => {
    expect(worldChoicesLine("cartoon", "collect", "monsoon")).toBe("Cartoon look · Monsoon Marsh · Collect");
    expect(worldChoicesLine("watercolor", "race")).toBe("Watercolor look · Race");
  });

  it("the build page and its card name it, and the course stage grows in it", () => {
    const building = { ...approvedAt("building", "monsoon"), jobs: { ...approvedAt("building").jobs, shape: { id: "s", state: "ready" as const, kind: "image-to-3d" as const } } };
    expect(worldBuildStages(building)[2]).toMatchObject({ id: "course", label: "Creating your Monsoon Marsh course" });
    expect(worldBuildStages({ ...building, selection })[2]?.label).toBe("Creating your course");
    expect(toPendingWorld(building)?.biome).toBe("monsoon");
  });

  it("is written into every prepared course, seeded by the course's own seed", () => {
    const manifest = { seed: "course-seed", name: "The Kettle Isles" } as Pick<SceneManifest, "seed" | "biome"> & { name: string };
    expect(withCreationBiome(manifest, approvedAt("ready", "monsoon"))).toEqual({ ...manifest, biome: { id: "monsoon", seed: "course-seed" } });
    // No biome chosen (an older creation, an import): nothing is added.
    expect(withCreationBiome(manifest, approvedAt("ready"))).toBe(manifest);
    expect(withCreationBiome(manifest, null)).toBe(manifest);
  });
});

describe("the biome step screen", () => {
  function render(overrides: Partial<BiomeStepViewProps> = {}) {
    return renderToStaticMarkup(createElement(BiomeStepView, {
      style: "cartoon", objectUrl: "/cutouts/1.png", picked: null, phase: "choose",
      onPick: vi.fn(), onLockIn: vi.fn(), onContinue: vi.fn(), onBack: vi.fn(), ...overrides,
    }));
  }
  const tileCount = (markup: string) => markup.match(/<input type="radio"/g)?.length ?? 0;

  it("is step 3 of 5, between Look and Preview", () => {
    const markup = render();
    expect(markup).toContain(BIOME_STEP_COPY.eyebrow);
    expect([...markup.matchAll(/<li[^>]*><span aria-hidden="true">[^<]*<\/span>([A-Za-z]+)<\/li>/g)].map((m) => m[1])).toEqual(["Photo", "Look", "Biome", "Preview", "World"]);
    expect(markup).toMatch(/<li aria-current="step"><span aria-hidden="true">3<\/span>Biome<\/li>/);
  });

  it("opens with Monsoon chosen, so Continue works straight away", () => {
    const markup = renderToStaticMarkup(createElement(BiomeStepScreen, { style: "cartoon", onLock: vi.fn(), onContinue: vi.fn(), onBack: vi.fn() }));
    expect([...markup.matchAll(/<input type="radio"[^>]*checked=""[^>]*value="([a-z]+)"/g)].map((m) => m[1])).toEqual(["monsoon"]);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it("each tile is a real render with what grows there: Monsoon first, Original last", () => {
    const markup = render({ picked: "monsoon" });
    expect([...markup.matchAll(/<input type="radio"[^>]*value="([a-z]+)"/g)].map((m) => m[1])).toEqual(["monsoon", "tropical", "desert", "alpine", "autumn", "ember", "original"]);
    expect(markup).toContain('src="/looks/monsoon.webp" srcSet="/looks/monsoon.webp 480w, /looks/monsoon@2x.webp 960w"');
    expect(markup).toContain("Palms, reeds, stilt huts, steady rain");
    expect(markup).toContain("Just the place in your photo, no scenery");
    // Original carries no colour chip; the six looks do.
    expect(markup.match(/class="oq-biome__chip"/g)).toHaveLength(6);
  });

  it("with nothing chosen, Continue waits for a choice", () => {
    const markup = render();
    expect(tileCount(markup)).toBe(7);
    expect(markup).not.toContain('checked=""');
    expect(markup).toContain(BIOME_STEP_COPY.lead);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it("chosen: the tile is selected and Continue is ready", () => {
    const markup = render({ picked: "monsoon" });
    expect(markup).toMatch(/<input type="radio"[^>]*checked=""[^>]*value="monsoon"/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it("locking: the tile becomes a full card that grows the world, then says Locked in", () => {
    const growing = render({ picked: "monsoon", lockedBiome: "monsoon", phase: "growing" });
    expect(tileCount(growing)).toBe(0);
    expect(growing).toContain('class="oq-biome-card" data-phase="growing" data-theme="monsoon"');
    expect(growing).toContain("Growing a Monsoon Marsh world for your object");
    expect(growing).toContain("oq-kit-spinner");
    expect(growing).toContain('src="/cutouts/1.png"');
    const locked = render({ picked: "monsoon", lockedBiome: "monsoon", phase: "locked" });
    expect(locked).toContain(`${BIOME_STEP_COPY.lockedIn}</p>`);
    expect(locked).not.toContain("oq-kit-spinner");
    // Nothing to press while it locks, not even Back.
    expect(growing).not.toContain("<button");
  });

  it("coming back: read-only, locked for this world, with no way to choose again", () => {
    const onContinue = vi.fn();
    const markup = render({ lockedBiome: "desert", onContinue });
    expect(tileCount(markup)).toBe(0);
    expect(markup).toContain(BIOME_STEP_COPY.lockedTitle);
    expect(markup).toContain(BIOME_STEP_COPY.lockedForWorld);
    expect(markup).toContain(BIOME_STEP_COPY.lockedNote);
    expect(markup).toContain(">Continue to preview</button>");
  });
});
