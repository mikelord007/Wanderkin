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

## Shared visual styles

The runtime consumes the canonical definitions in `shared/style.ts`; it does
not maintain a renderer-only copy of the style schema. `GameView` normally
resolves the style and optional atmosphere from `manifest.experience`, with
optional `styleId`, `atmosphere`, and `colorRestoration` props available for
preview and live gameplay progression. Legacy manifests remain Cartoon at full
colour.

Each definition drives one coordinated render treatment:

- **Cartoon** uses high-saturation colour blocking, quantized surface values,
  crisp game-added edges, bright fill, and rounded floating-island props.
- **Hand-painted** uses warmer storybook lighting, directional brush variation,
  softer contrast, and painted trees or atmosphere-selected scenery.
- **Watercolor** uses pastel lighting, translucent wash/grain variation, a
  paper-like backdrop, and sparse reeds or atmosphere-selected scenery.

Generated GLB materials are cloned before shader customization, so switching or
disposing a level cannot mutate the loader cache. Game-added floors, ramps, and
boxes receive a high-contrast outline using their actual geometry. Checkpoints
retain emissive cores and readable rings in every palette. Decorative scenery
is deterministic, outside collision, and limited to three or five small props;
the atmosphere string only selects from the fixed cloud/tree/rock/reed set.

`colorRestoration` is clamped to 0..1 and kept as a mutable material uniform.
At zero, world materials are desaturated while checkpoints and the player stay
legible; at one, the selected style's colour is fully restored. The resolver is
covered against the Rodin-backed Lost Colors fixture, including its initial
zero value and authored two-fragment step. Worker 5 can update the public prop
without rebuilding geometry or replacing materials.

`prefers-reduced-motion: reduce` disables decorative cloud drift, checkpoint
bobbing/spin, walk bob, limb swing, squash/stretch, lean, and antenna pulsing.
It does not alter collision, input, camera control, or the colour-restoration
state.

No new rendering dependency is used. In particular, the implementation avoids
a full-screen post-processing pass; the visible treatment is lighting, small
decorative meshes, edge lines on game-added platforms, and a compact material
shader on imported meshes.

### Visual and frame-time evidence

The actual `GameView` was captured at 1280×720 for all three styles on both
bundled samples. Full-colour captures are in `docs/evidence/style-*-rodin.png`
and `docs/evidence/style-*-tripo.png`; the same Rodin view at the restoration
endpoints is in `style-restoration-0.png` and `style-restoration-1.png`.

Frame intervals were sampled in the same Playwright Chromium headless process:
30 warm-up intervals, then 120 measured intervals per case, with the pre-play
HTML invitation hidden. The historical baseline is revision `e857d24`.

| Sample | Historical mean | Cartoon | Hand-painted | Watercolor |
| --- | ---: | ---: | ---: | ---: |
| Rodin | 116.801 ms | 139.578 ms (+19.5%) | 140.134 ms (+20.0%) | 141.244 ms (+20.9%) |
| Tripo | 111.940 ms | 131.384 ms (+17.4%) | 133.051 ms (+18.9%) | 130.967 ms (+17.0%) |

The absolute intervals are not a frame-rate claim: this headless environment is
software-rendered or timer-throttled, and even the unstyled baseline is around
112–117 ms. The comparison is useful only as a same-host regression signal.
The style overhead stayed in a narrow 17.0–20.9% range after reducing scenery
and specializing each shader; current captures produced no console errors. The
historical page logged two unrelated `/api/levels` 500s because its product
server was not running. Hardware-accelerated browser QA must still confirm the
smooth-jumping target before release. Raw observations are recorded in
`docs/evidence/style-render-baseline.json` and
`docs/evidence/style-render-performance.json`; the reproducible harness is
`scripts/spike/measure-baseline.ts` plus `capture-style-evidence.ts`.

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
