import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { DEFAULT_MOVEMENT_CONFIG, migrateSceneManifest, type SceneManifest } from "@shared/index.js";
import { toMiniatureScale } from "./core/characterScale.js";
import { validateExperiencePlacements } from "./placementValidation.js";
import { LANDING_WORLDS } from "./landingWorlds.js";
import desk from "./landingWorlds/desk.json";
import plane from "./landingWorlds/plane.json";
import shoe from "./landingWorlds/shoe.json";
import car from "./landingWorlds/car.json";
import { prepareBiomeLayout } from "../biome/placement.js";
import { getBiomeDefinition } from "../biome/presets.js";
import { lookName, manifestBiomeId } from "../biome/lookCatalog.js";
import { validateManifestCourse } from "../scene/course.js";
import { extractGlbTriangles } from "../scene/glb.js";
import { toIndexedMesh } from "../scene/transform.js";
import type { LoadedSceneAsset } from "../scene/runtime.js";
import type { TriangleSoup } from "../scene/types.js";

const EXPECTED = [
  { slug: "desk", json: desk, levelId: "sample-desk-beach", name: "The Desk on the Beach", biome: { id: "tropical", seed: "asset:0ef4536a" }, look: "Tropical Island" },
  { slug: "plane", json: plane, levelId: "sample-plane-snow", name: "Plane in the Snow", biome: { id: "alpine", seed: "asset:47f3873d" }, look: "Snowy Alpine" },
  { slug: "shoe", json: shoe, levelId: "sample-boot-rain", name: "Boot in the Rain", biome: { id: "monsoon", seed: "asset:ac903dc5" }, look: "Monsoon Marsh" },
  { slug: "car", json: car, levelId: "sample-car-dunes", name: "Car in the Dunes", biome: { id: "desert", seed: "asset:10979f3c" }, look: "Desert" },
] as const;

function publicFile(url: string): Buffer {
  return readFileSync(path.join(process.cwd(), "public", url.replace(/^\//, "")));
}

function geometryOf(manifest: SceneManifest): Map<string, TriangleSoup> {
  const geometry = new Map<string, TriangleSoup>();
  for (const asset of manifest.assets) {
    const bytes = publicFile(asset.url);
    geometry.set(asset.id, extractGlbTriangles(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
  }
  return geometry;
}

describe("the landing's four bundled worlds", () => {
  it("are the Desk, Plane, Shoe and Car, in that order", () => {
    expect(LANDING_WORLDS.map((world) => world.levelId)).toEqual(EXPECTED.map((world) => world.levelId));
    expect(LANDING_WORLDS.map((world) => world.name)).toEqual(EXPECTED.map((world) => world.name));
  });

  it.each(EXPECTED)("$slug parses through the manifest migration unchanged", ({ json }) => {
    expect(migrateSceneManifest(json)).toEqual(json);
  });

  it.each(EXPECTED)("$slug keeps its own look and decoration seed, locked in play", ({ json, biome, look }) => {
    const manifest = migrateSceneManifest(json);
    expect(manifest.biome).toEqual(biome);
    expect(manifest.seed).toBe(biome.seed);
    expect(lookName(manifestBiomeId(manifest))).toBe(look);
  });

  it.each(EXPECTED)("$slug is detached from the account and needs no /api", ({ slug, json }) => {
    const text = JSON.stringify(json);
    expect(text).not.toContain("/api/");
    expect(text).not.toMatch(/ownerId|"job_|level-[0-9a-f]{8}/);
    expect(json).not.toHaveProperty("workflow");
    expect(json.photos).toEqual([]);
    const urls = [...json.assets.map((asset) => asset.url), ...json.media.audio.map((audio) => audio.url)];
    expect(urls).toEqual([`/samples/${slug}/model.glb`, `/samples/${slug}/music.mp3`]);
  });

  it.each(EXPECTED)("$slug ships its model and soundtrack byte for byte", ({ json }) => {
    for (const file of [...json.assets, ...json.media.audio]) {
      const bytes = publicFile(file.url);
      expect(bytes.byteLength).toBe(file.sizeBytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    }
    const [music] = json.media.audio;
    expect(json.media.audio).toHaveLength(1);
    expect(music).toMatchObject({ kind: "music", mimeType: "audio/mpeg", loop: true });
  });

  it.each(EXPECTED)("$slug has a card image under 200 KB", ({ slug }) => {
    const card = path.join(process.cwd(), "public/samples", slug, "card.webp");
    expect(existsSync(card)).toBe(true);
    expect(statSync(card).size).toBeLessThan(200_000);
    // A bare VP8 image: no EXIF, XMP or ICC chunks.
    const bytes = readFileSync(card);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(bytes.subarray(12, 16).toString("latin1")).toBe("VP8 ");
  });

  it.each(EXPECTED)("$slug has a validated course and valid placements on its real geometry", ({ json }) => {
    const manifest = migrateSceneManifest(json);
    const geometry = geometryOf(manifest);
    const { validation, report } = validateManifestCourse(manifest, geometry, DEFAULT_MOVEMENT_CONFIG);
    expect(validation.status).toBe("validated");
    expect(report.segments).toHaveLength(5);
    expect(report.segments.every((segment) => segment.reachable)).toBe(true);
    expect(validateExperiencePlacements(manifest, geometry).ok).toBe(true);
  }, 60_000);

  it.each(EXPECTED)("$slug decorates in its own look from its own seed", ({ json, biome }) => {
    const manifest = migrateSceneManifest(json);
    const assets = new Map<string, LoadedSceneAsset>();
    for (const [id, soup] of geometryOf(manifest)) {
      assets.set(id, { scene: new THREE.Group(), collision: toIndexedMesh(soup), sha256: null });
    }
    const layout = prepareBiomeLayout({
      manifest, assets, movement: toMiniatureScale(DEFAULT_MOVEMENT_CONFIG),
      definition: getBiomeDefinition(biome.id), seed: biome.seed, quality: "standard",
    });
    expect(layout.biomeId).toBe(biome.id);
    expect(layout.seed).toBe(`${biome.seed}:${biome.id}`);
    expect(layout.props.length).toBeGreaterThan(0);
  }, 60_000);
});
