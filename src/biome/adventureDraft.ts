/** Integration gate for generated adventures.
 *
 * The generator already validates reachability. This is an independent,
 * cheap structural check before the playable world is replaced: the source
 * scan must be untouched, the course must be marked validated, and the mode
 * must match the template. Anything unexpected keeps the current world. */
import {
  ADVENTURE_GENERATOR_VERSION,
  sceneManifestReaderSchema,
  type AdventureTemplateId,
  type SceneBiomeId,
  type SceneManifest,
} from "@shared/index.js";

export interface AdventureDraftOptions {
  template: AdventureTemplateId;
  seed: string;
  generator: typeof ADVENTURE_GENERATOR_VERSION;
  /** Look to keep with the draft. Original is stored as no theme. */
  biome: { id: SceneBiomeId; seed: string };
  levelId: string;
  now: string;
}

export type AdventureDraftResult = { ok: true; manifest: SceneManifest } | { ok: false; reason: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function acceptGeneratedAdventure(
  source: SceneManifest,
  generated: SceneManifest,
  options: AdventureDraftOptions,
): AdventureDraftResult {
  if (!same(generated.assets, source.assets)) return { ok: false, reason: "source assets changed" };
  if (!same(generated.photos, source.photos)) return { ok: false, reason: "source photos changed" };
  if (generated.movementConfigId !== source.movementConfigId) return { ok: false, reason: "movement config changed" };
  if (!same(generated.calibration, source.calibration)) return { ok: false, reason: "calibration changed" };
  const sourceMeshes = source.entities.filter((entity) => entity.kind === "generated-mesh");
  const keptMeshes = generated.entities.filter((entity) => entity.kind === "generated-mesh");
  if (!same(keptMeshes, sourceMeshes)) return { ok: false, reason: "source meshes changed" };

  if (generated.courseValidation.status !== "validated") return { ok: false, reason: "course is not validated" };
  if (generated.checkpoints.length === 0) return { ok: false, reason: "no checkpoints" };

  const experience = generated.experience;
  if (!experience) return { ok: false, reason: "no mission" };
  if (experience.initialColorRestoration !== 1) return { ok: false, reason: "new missions start fully coloured" };
  if (options.template === "restore-portal") {
    const mode = experience.mode;
    if (mode.kind !== "collect") return { ok: false, reason: "portal mission must collect" };
    const ids = new Set(experience.collectibles.map((item) => item.id));
    if (mode.requiredCount < 1 || mode.requiredCollectibleIds.length !== mode.requiredCount
      || !mode.requiredCollectibleIds.every((id) => ids.has(id))) {
      return { ok: false, reason: "required fragments are inconsistent" };
    }
    if (!experience.finishPortal || experience.finishPortal.id !== mode.finishPortalId) {
      return { ok: false, reason: "portal is missing" };
    }
  } else {
    const mode = experience.mode;
    if (mode.kind !== "explore" || mode.destinations.length !== 1) {
      return { ok: false, reason: "beacon mission must have exactly one destination" };
    }
  }

  const { workflow: _workflow, biome: _biome, adventure: _adventure, ...rest } = generated;
  const manifest: SceneManifest = {
    ...rest,
    levelId: options.levelId,
    createdAt: options.now,
    updatedAt: options.now,
    ...(options.biome.id === "original" ? {} : { biome: options.biome }),
    adventure: { template: options.template, seed: options.seed, generator: options.generator },
  };
  const parsed = sceneManifestReaderSchema.safeParse(manifest);
  if (!parsed.success) {
    return { ok: false, reason: `draft is not a loadable world: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  }
  return { ok: true, manifest };
}
