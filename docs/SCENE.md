# Scene preparation and bundled levels

`src/scene` owns GLB loading, geometry inspection, normalization, collision
extraction, authored sample manifests, and conservative course preparation. It
produces `SceneManifest` data; the player remains provider-agnostic and uses the
same runtime for every level.

## Public integration API

- `prepareAsset(url, options, onProgress)` downloads and analyzes an imported
  GLB, normalizes it, adds a neutral game floor, and returns a primary manifest
  plus deterministic course candidates. A caller-supplied seed and provenance
  are preserved.
- `loadSceneAsset(url, onProgress)` returns an asset-local Three.js group and
  asset-local indexed collision triangles. Its progress has separate
  `downloading` and `decoding` stages with `loadedBytes` and a nullable
  `totalBytes`.
- `loadAsset` is the fuller preparation-facing loader. It also returns the
  triangle soup, inspection, byte count, and SHA-256.
- `SAMPLE_LEVELS` and `getSampleLevel(id)` expose the Rodin and Tripo bundled
  manifests.
- `buildManifestScene` and `buildManifestCollision` apply the same manifest
  transform to the same source geometry. Helper ramps render and collide as the
  same triangular wedge rather than as a box.

The loader cache is keyed by URL. Concurrent callers share the in-flight
promise and late listeners receive the latest progress event. Successful loads
are retained for replay/remount. Failed promises are evicted, so retrying the
same URL performs a new request; callers do not need a cache-busting query.

## Geometry and normalization

The GLB geometry reader bakes glTF node transforms into asset-local triangles.
`normalizeAsset` then establishes the manifest transform:

1. infer or accept an explicit up axis;
2. rotate to right-handed Y-up;
3. align the footprint's principal direction, with creator yaw adjustment when
   supplied;
4. uniformly scale the longest horizontal extent to the chosen game extent;
5. center horizontally and put the lowest vertex at `y = 0`.

The default eight-metre extent is a documented game-scale assumption, not a
real-world room measurement. A creator-provided measured dimension is recorded
in calibration metadata. Generated meshes always use triangle-mesh collision;
a single room-sized box is never substituted.

The dependency-free GLB geometry path deliberately rejects compression or
accessor features it cannot reproduce exactly. Refusal is preferable to a
collider that silently differs from the rendered model.

## Bundled courses

Both `public/samples/rodin.glb` and `public/samples/tripo.glb` have explicit
five-checkpoint manifests and retain their recorded Livepeer provenance. Each
adds a neutral floor and a visible helper staircase, then places checkpoints on
the floor and on measured elevated furniture surfaces. Spawn and checkpoint
positions are capsule centres, not surface coordinates.

Rodin is normalized without yaw correction. Tripo receives the measured +90°
Y rotation. The Tripo course uses the reachable lower elevated furniture tier;
its separate upper tier is not represented as reachable because it lies beyond
the default mantle envelope without another helper flight.

`npx tsx src/scene/tools/verify-samples.ts` rebuilds world collision from the
real GLBs and checks every spawn-to-checkpoint segment with the conservative
walk/jump/mantle validator. The automated scene tests also pin asset hashes,
five-checkpoint structure, helper floors, mantle transitions, and contact with
generated furniture geometry.

## Validation meaning and limitations

Generic course preparation samples usable surfaces, checks capsule clearance,
builds transitions from `DEFAULT_MOVEMENT_CONFIG`, and uses a safety factor
plus swept bounding-box tests. If the evidence is incomplete it returns an
unvalidated course for creator editing; it does not promote proximity alone to
proof of reachability.

The Rodin helper climb is additionally covered by the real headless Rapier
`GameSimulation` test in `src/game/core/authoredCourse.test.ts`. Both bundled
courses pass the conservative geometry validator, and both assets are exercised
by the shared headless game runtime. A real-browser end-to-end completion is
still required before claiming browser playability, especially for the full
Tripo course. Texture decoding warnings seen in Node do not affect geometry or
collision and are not expected in a browser.
