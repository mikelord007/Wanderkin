import type { AssetReference, PhotoReference, SceneManifest } from "@shared/index.js";

/**
 * Scene's manifest carries whatever placeholder asset entry prepareAsset()
 * created from the raw GLB, but only the server's AssetReference (fetched
 * via GET /api/assets/:id) carries real provenance (provider/job/model,
 * source photo order). Replace the placeholder with the real one, and
 * attach the originating job's PhotoReference[] so the manifest keeps the
 * distinction between generated approximation and added game geometry
 * intact, and the source photos survive into the saved level.
 */
export function attachProvenance(
  manifest: SceneManifest,
  asset: AssetReference,
  sourcePhotos: PhotoReference[] | undefined,
): SceneManifest {
  if (manifest.assets.length !== 1) {
    // Ambiguous which placeholder maps to this asset — leave scene's
    // output untouched rather than guessing.
    return sourcePhotos ? { ...manifest, photos: sourcePhotos } : manifest;
  }
  const placeholder = manifest.assets[0]!;
  const idChanged = placeholder.id !== asset.id;
  return {
    ...manifest,
    assets: [asset],
    entities: idChanged
      ? manifest.entities.map((entity) =>
          entity.kind === "generated-mesh" && entity.assetId === placeholder.id
            ? { ...entity, assetId: asset.id }
            : entity,
        )
      : manifest.entities,
    photos: sourcePhotos ?? manifest.photos,
  };
}
