# Cross-worker integration contracts

`shared/*` contains the versioned data contracts. This document records the
implemented module, UI, and server boundaries around them. New fields described
as additive or optional must remain safe for older consumers to ignore.

## Game runtime (`src/game`, owner: Player and camera)

```ts
interface GameViewProps {
  manifest: SceneManifest; // shared/manifest.ts
  onExit: () => void;
  onComplete: () => void;
  onProgress?: (snapshot: GameSnapshot) => void;
}

interface GameSnapshot {
  loading: boolean;
  error: string | null;
  ready: boolean; // scene + physics + first frame ready; play only enabled here
  paused: boolean;
  checkpointsCollected: number;
  checkpointsTotal: number;
  nextCheckpointId: string | null;
  mantlePromptVisible: boolean;
  stage?: "idle" | "downloading" | "decoding" | "building-physics" | "starting" | "running";
  downloadedBytes?: number;
  totalBytes?: number | null; // null means the server supplied no usable total
  completed?: boolean;
}
```

The four trailing snapshot fields are approved additive fields. `ready` becomes
true only after scene, physics, and the first rendered frame are ready.
`GameView` reads only `SceneManifest` plus `MovementConfig`; it never receives a
provider or generation-job shape.

## Scene preparation (`src/scene`, owner: Scene preparation)

```ts
interface PrepareAssetOptions {
  assumedExtentMeters?: number; // default shared/manifest.ts DEFAULT_ASSUMED_EXTENT_METERS
  measuredDimension?: { description: string; meters: number };
  seed?: string;
  provenance?: AssetProvenance;
  photos?: readonly PhotoReference[];
}

function prepareAsset(
  assetUrl: string,
  options?: PrepareAssetOptions,
  onProgress?: (
    stage: "downloading" | "decoding" | "analyzing" | "validating",
    detail?: AssetLoadProgress,
  ) => void,
): Promise<{ manifest: SceneManifest; courseCandidates: SceneManifest[] }>;

interface SceneAssetProgress {
  stage: "downloading" | "decoding";
  loadedBytes: number;
  totalBytes: number | null;
}

function loadSceneAsset(
  url: string,
  onProgress?: (progress: SceneAssetProgress) => void,
): Promise<{
  scene: THREE.Group;
  collision: { vertices: Float32Array; indices: Uint32Array };
}>;
```

The byte fields are named `loadedBytes` and `totalBytes`, not the superseded
draft names `loaded`/`total`. The scene and collision are asset-local; consumers
apply the manifest entity transform identically. The URL-keyed cache shares
in-flight and successful loads, replays current progress to late listeners,
and evicts failures so retrying the same URL performs a new request.

`src/scene/samples.ts` (owned by Scene preparation) exports hand-authored
sample `SceneManifest`s for the bundled Rodin/Tripo GLBs in
`public/samples`, satisfying "bundled sample playable without credentials."

## Level editor (`src/editor`, owner: Level tools and persistence)

```ts
interface LevelEditorProps {
  manifest: SceneManifest;
  isPersisted?: boolean;
  onSave: (manifest: SceneManifest) => SceneManifest | Promise<SceneManifest>;
  onExport?: (manifest: SceneManifest) => void | Promise<void>;
  onPlay: (manifest: SceneManifest) => void;
  onBack: () => void;
}
```

Edits are immutable `SceneManifest` changes. Any course-affecting edit changes
validation to `manually-adjusted`; the editor does not claim physics validation.
`onSave` returns the authoritative saved manifest, including server-assigned IDs
and timestamps, and the editor adopts that value before clearing its draft or
exporting. `isPersisted` distinguishes an unsaved prepared level from an
existing server level. When `onExport` is supplied, dirty levels are saved and
the authoritative result is exported; export never races a stale client copy.
Unsaved drafts are a client-side convenience in `localStorage`, keyed by level
ID and the saved manifest's `updatedAt`. They are not an authoritative server
store.

## Product UI (`src/App.tsx` + `src/ui`, owner: Product UI)

Owns top-level routing between start/photos/generation/preparation/play/
finish screens and composes `GameView` and `LevelEditor` from the contracts
above.

Portable level UI is implemented: the start screen imports a bundle as a new
level and exports saved levels, while the editor offers Export or Save & export.
The client sends imports as `application/octet-stream` so the route-specific
bundle limit applies. This implemented contract is not yet a browser-acceptance
claim; the final round-trip result belongs in `docs/QA.md`.

`AssetReference` remains the shared manifest asset shape. The server may return
the additive transport shape below from `GET /api/assets/:id`:

```ts
type StoredAssetRecord = AssetReference & { photos?: PhotoReference[] };
```

`photos` records the source images for a generated asset. Before inserting the
asset into a manifest, the client removes that additive property and writes the
resolved photo list to `SceneManifest.photos`. Server metadata wins over a
stale client cache when present.

## Persistence stores

The server creates one process-wide instance of each authoritative store:

- `PhotoStore(storageDir)` validates and indexes uploaded source photos and
  supplies their bytes to provider adapters.
- `AssetStore(storageDir)` validates and content-addresses GLBs. Its stored
  record may include additive source `photos`.
- `JobStore(storageDir)` owns public job state plus private idempotency,
  provider-poll, original-request, and upload-URL-cache data.
- `LevelStore(storageDir, assetStore, photoStore)` owns saved manifests and
  uses the same asset/photo instances for portable bundle imports.

The shared instances are part of the contract: constructing separate
`AssetStore` or `PhotoStore` objects for the levels router can leave their
in-memory indexes incoherent, so an imported file may not be visible through
the ordinary asset/photo routes. The approved server registration is:

```ts
app.use(
  createLevelsRouter(
    new LevelStore(env.storageDir, assetStore, photoStore),
  ),
);
```

Server JSON indexes use serialized, temp-file-then-rename writes. A failed
write must not mutate the in-memory snapshot.

`env.storageDir` is required to be an absolute path before constructing these
stores because Express `sendFile` rejects relative filenames. The minimal fix
originated as `fee23ab` and is integrated on main as `c445875`, with a
full-server relative-`STORAGE_DIR` regression test.

## Server API (owner: Livepeer integration for provider/job routes; Level
tools for persistence routes)

| Route | Method | Notes |
| --- | --- | --- |
| `/api/capabilities` | GET | `ProviderCapabilityDescriptor[]` (shared/provider.ts) |
| `/api/uploads` | POST | multipart photo upload, returns `PhotoReference[]` |
| `/api/photos/files/:name` | GET | stored photo bytes referenced by `PhotoReference.url` |
| `/api/assets/import` | POST | multipart validated hand-imported GLB, returns `StoredAssetRecord` |
| `/api/assets/:id` | GET | stored asset metadata, including optional additive `photos` |
| `/api/assets/files/:filename` | GET | stored GLB bytes |
| `/api/jobs` | POST | body includes `Idempotency-Key` header; reconciles an existing job with the same key instead of starting a duplicate |
| `/api/jobs/:id` | GET | current `GenerationJob` (shared/job.ts) |
| `/api/jobs/:id/retry` | POST | reconciles the existing provider job; never submits a second generation |
| `/api/levels` | GET, POST | list / create saved `SceneManifest`s |
| `/api/levels/:id` | GET, PUT | load / save one level |
| `/api/levels/:id/export` | GET | strict portable manifest + embedded local files bundle |
| `/api/levels/import` | POST | strict bundle import as a new level; uses route-scoped size handling |

Bundle export/import is all-or-nothing: every local asset/photo reference must
resolve and validate. Imports preserve provenance, verify declared asset
hashes/sizes, reject ambiguous mappings, store through the shared stores, remap
fresh IDs/URLs, and never overwrite an existing level.

## Verification status (2026-09-18)

- Both `rodin-i3d` and `tripo-mv3d` capabilities are confirmed available
  today against the Livepeer MCP endpoint.
- A bounded real Rodin run succeeded after an initial submission failed due to
  an invalid seed and the input was corrected. Application job `411dc7d9` /
  provider job `mjob_cfb2286bf2b5` produced a 5,029,388-byte local GLB with
  verified SHA-256
  `71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42`.
  Registered-model provenance was resolved from live capability metadata; the
  result did not provide a direct `served_model_id`.
- Observed sample bounds (source: `rodin-provenance.json` /
  `tripo-provenance.json`): Rodin extents width 1.895m / height 0.603m /
  depth 0.676m; Tripo extents width 0.602m / height 0.376m / depth 1.039m
  (Tripo's sample is additionally rotated ~+90° about Y relative to Rodin's).
- Normalization target: scale each asset so its longest horizontal
  dimension is ~8 game meters (`DEFAULT_ASSUMED_EXTENT_METERS`,
  `shared/manifest.ts`), with the toy capsule around 0.5–0.7m tall
  (`DEFAULT_MOVEMENT_CONFIG`, `shared/movement.ts` uses 0.7m). This is a
  documented, arbitrary game-scale choice, not a measured room scale.

- Both sample manifests contain five checkpoints and elevated furniture routes.
  Each course was completed to the finish screen and replayed in real Chromium
  with the actual controller. This acceptance applies to the authored samples,
  not arbitrary generated courses; generic preparation remains conservative,
  records uncertainty, and may require editor adjustment.
- The viewport/root layout and oversized-request response defects are fixed.
  Precise automated counts, browser evidence, and caveats are maintained in
  `docs/QA.md` rather than duplicated here.
- Portable import/export controls completed a real Chrome
  save/download/import/reload round trip against isolated storage. The existing
  real Rodin GLB also completed preparation, stable candidate switching,
  editor save, and reload without a new provider submission.
