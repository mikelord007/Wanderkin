import { describe, expect, it } from "vitest";
import type { AssetReference, SceneManifest } from "@shared/index.js";
import { createEmptyManifest } from "@shared/index.js";
import { attachProvenance, resolveAssetForManifest } from "./manifestProvenance.js";

function baseManifest(): SceneManifest {
  const manifest = createEmptyManifest({
    levelId: "level-1",
    name: "Test level",
    seed: "seed-1",
    movementConfigId: "default-v1",
  });
  manifest.assets = [{ id: "placeholder-asset", url: "/tmp/placeholder.glb", sha256: "abc", sizeBytes: 10 }];
  manifest.entities = [
    {
      id: "mesh-1",
      kind: "generated-mesh",
      assetId: "placeholder-asset",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      collider: { kind: "triangle-mesh" },
    },
  ];
  return manifest;
}

const realAsset: AssetReference = {
  id: "asset-real-1",
  url: "/storage/asset-real-1.glb",
  sha256: "real-hash",
  sizeBytes: 1234,
  provenance: {
    providerId: "livepeer",
    capabilityUsed: "rodin-i3d",
    fallbackFired: null,
    providerJobId: "job-1",
    registeredModel: "fal-ai/hyper3d/rodin/v2.5",
    sourcePhotoOrder: [4, 1, 2, 3, 5],
    generatedAt: new Date().toISOString(),
  },
};

const sourcePhotos = [{ id: "p1", url: "/uploads/p1.jpg", order: 1 }];

describe("attachProvenance", () => {
  it("replaces the placeholder asset and repoints entity references to the real asset id", () => {
    const result = attachProvenance(baseManifest(), realAsset, sourcePhotos);
    expect(result.assets).toEqual([realAsset]);
    expect(result.entities[0]).toMatchObject({ assetId: "asset-real-1" });
    expect(result.photos).toEqual(sourcePhotos);
  });

  it("leaves entity assetId untouched when the real asset id happens to match", () => {
    const manifest = baseManifest();
    const sameIdAsset: AssetReference = { ...realAsset, id: "placeholder-asset" };
    const result = attachProvenance(manifest, sameIdAsset, sourcePhotos);
    expect(result.entities[0]).toMatchObject({ assetId: "placeholder-asset" });
    expect(result.assets).toEqual([sameIdAsset]);
  });

  it("keeps scene's asset list untouched when there is more than one asset (ambiguous mapping)", () => {
    const manifest = baseManifest();
    manifest.assets.push({ id: "second-asset", url: "/tmp/second.glb", sha256: "def", sizeBytes: 5 });
    const result = attachProvenance(manifest, realAsset, sourcePhotos);
    expect(result.assets).toBe(manifest.assets);
    expect(result.photos).toEqual(sourcePhotos);
  });

  it("falls back to scene's own photos when no source photos are available (e.g. a direct GLB import)", () => {
    const manifest = baseManifest();
    manifest.photos = [{ id: "scene-photo", url: "/tmp/scene.jpg", order: 1 }];
    const result = attachProvenance(manifest, realAsset, undefined);
    expect(result.photos).toEqual(manifest.photos);
  });
});

describe("resolveAssetForManifest", () => {
  const locallyCachedPhotos = [{ id: "local-1", url: "/uploads/local-1.jpg", order: 1 }];
  const serverPhotos = [{ id: "server-1", url: "/storage/server-1.jpg", order: 1 }];

  it("prefers the server's photos over the client's locally-cached ones when both are present", () => {
    const asset = { ...realAsset, photos: serverPhotos };
    const result = resolveAssetForManifest(asset, locallyCachedPhotos);
    expect(result.sourcePhotos).toEqual(serverPhotos);
  });

  it("falls back to the locally-cached photos when the server doesn't return any", () => {
    const result = resolveAssetForManifest(realAsset, locallyCachedPhotos);
    expect(result.sourcePhotos).toEqual(locallyCachedPhotos);
  });

  it("resolves to undefined when neither the server nor the client has photos (a plain GLB import)", () => {
    const result = resolveAssetForManifest(realAsset, undefined);
    expect(result.sourcePhotos).toBeUndefined();
  });

  it("strips the photos field off the asset so it never leaks into a manifest AssetReference entry", () => {
    const asset = { ...realAsset, photos: serverPhotos };
    const result = resolveAssetForManifest(asset, undefined);
    expect(result.cleanAsset).toEqual(realAsset);
    expect(result.cleanAsset).not.toHaveProperty("photos");
  });
});
