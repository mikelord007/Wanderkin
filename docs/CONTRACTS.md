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

The smallest share bootstrap lives in `src/App.tsx`: a pathname matching
`/share/:shareId` takes precedence over local creation-resume state and opens
the public friend landing. The landing reads only `GET /api/shares/:shareId`
and enters `PlayScreen` with the immutable manifest; it never calls upload or
generation routes. Shared Race play uses the publication `versionId` as its
client-side world identity and labels the creator target unverified, so local
times cannot be compared across later private publications.

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
| `/api/levels/:id/publish` | POST | create a new immutable `PublishedLevelVersion` and `shareId` from the current private save |
| `/api/levels/:id/publications` | GET | list immutable versions created from a private level |
| `/api/shares/:shareId` | GET | public read of one immutable version; source photos are absent unless explicitly included |
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

## ObjectQuest v2 shared contracts (2026-09-24)

The v2 contracts extend the v1 manifest; they do not replace it. The canonical
reference data is `shared/fixtures/lost-colors.json`, and provider/job examples
are in `shared/fixtures/generation-job-cases.json`.

### Versioning and legacy reads

- `SceneManifest.schemaVersion` remains `1`. The v2 additions are optional,
  additive fields and therefore are not an incompatible envelope change.
- `SceneManifest.experience` and `SceneManifest.media` may be absent on old
  saved levels and bundled samples.
- Each new contract family carries its own version constant from
  `shared/schema-version.ts`: experience, style, quest, media, generation, and
  published level.
- A v2-only consumer must call `migrateSceneManifest(unknown)` from
  `shared/manifest-migration.ts`. It validates the legacy envelope and new
  blocks, then adds deterministic Explore/cartoon/quest defaults in memory.
  It does not mutate its input or claim that legacy content was generated.
- `sceneManifestReaderSchema` is the compatible read boundary. The legacy
  fixture proves a pre-v2 saved manifest still parses and hydrates.

Important integration gap: the current `server/levels.ts` has a separate Zod
object that strips unknown keys. Until Worker 7 switches it to the shared
compatible reader (or mirrors every additive field with passthrough-safe
behavior), saving a v2 manifest through that route will discard `experience`,
`media`, and normalized asset generation provenance. This is a persistence
integration requirement, not permission for other workers to edit that file
without its owner/orchestrator.

### Style contract

`shared/style.ts` exports `STYLE_DEFINITIONS` for exactly three `StyleId`
values: `cartoon`, `hand-painted`, and `watercolor`. Every definition drives:

- preview and geometry-reference prompt fragments plus negative constraints;
- scene, fragment, and portal colors;
- lighting values;
- tone mapping, saturation/contrast, outlines, bloom, paper/wash treatment,
  and reduced-motion-compatible ambient motion;
- environment sky, ground, prop, and particle prompts;
- music, ambience, collection, and portal audio prompts; and
- UI accent colors, including a focus-ring color.

Workers must consume this definition rather than create separate style enums
or hard-coded palettes in UI, renderer, or audio code. An optional atmosphere
is stored on `StyleSelection`; choosing a local style does not itself authorize
a billable generation request. `approvedPreviewAssetId` identifies the exact
durable preview approved for the build.

### Experience and game-mode contract

`SceneManifest.experience` is a `LevelExperience` containing one style
selection, one discriminated `GameModeData`, validated quest copy, authored
color fragments, an optional finish portal, and initial color restoration.

- `explore`: destinations and optional collectible IDs; no mandatory timer.
- `collect`: required collectible IDs/count, a finish-portal reference, and one
  monotonic 0..1 restoration step per required fragment.
- `race`: countdown, ordered checkpoint IDs, full-reset restart policy,
  optional finish portal, and an optional local personal best.

Color fragments and the finish portal are authored entities in the experience
block rather than additions to the existing `SceneEntity` union. That preserves
v1 renderer/editor exhaustiveness while Workers 5 and 7 add explicit v2
handling. Spawn/checkpoint/fragment/portal transforms use the existing
right-handed, Y-up, game-metre convention.

Quest text is data only: `title`, `intro`, `objective`, and
`narrationScript`. It may add flavor around supported mechanics; it cannot
define executable rules or establish course reachability.

### Generation jobs and provenance

`shared/generation.ts` defines one provider-neutral request/result union for:

| `GenerationJobKind` | Output |
| --- | --- |
| `image-to-3d` | Manifest `AssetReference` |
| `image-edit` | Durable generated image |
| `text` | Validated text/optional structured value |
| `music` | Music `AudioAssetReference` |
| `sfx` | SFX or ambience `AudioAssetReference` |
| `tts` | Narration `AudioAssetReference` |
| `video` | Animated-postcard `VideoAssetReference` |

Every request has a schema version, kind, requested capability, idempotency
key, and game-asset purpose. `GenerationJob` keeps its legacy image-to-3D
fields and adds optional `kind`, normalized `request`, `result`, and
`provenance` so old durable job records remain readable.

`GenerationProvenance` records provider, requested and actually served
capability, served model, application/provider job IDs, requested/start/end and
derived timing values, and reported cost. `reportedCost: null` means unknown;
it never means free. Missing served fields remain `null` rather than being
invented from the request. Provider adapters may expose additional diagnostics
privately, but downstream code consumes this normalized shape.

### Audio and video references

`shared/media.ts` separates audio (`music`, `ambience`, `sfx`, `narration`)
from video (`animated-postcard`, `gameplay-highlight`). References are durable,
content-addressed, typed by MIME/duration, and carry normalized provenance.
Audio also records loop/default gain and optional transcript. Video records
dimensions and an honest source label: `generated-animation` or
`gameplay-capture`. A generated postcard must never be labeled as gameplay.

`SceneManifest.media` is optional and contains independent audio/video arrays.
Optional media failure must not invalidate the mesh, course, saved level,
publication, replay, or share link.

### Immutable publishing

`PublishedLevelVersion` in `shared/publishing.ts` contains a unique
`versionId`, stable `shareId`, source level/update identity, publication time,
a fully hydrated manifest snapshot, challenge, and an explicit
`includesSourcePhotos` privacy decision. A publication is copied and frozen:
editing the private source later requires a new version/share and cannot alter
an existing recipient experience or race target.

Creation workflow/job metadata is never copied into the public manifest.
Source photos default to private and are copied only when
`includesSourcePhotos: true` is explicitly supplied to the publish request.

Race challenge verification is currently `personal-unverified`. No worker may
describe client-submitted times as authoritative or cheat-proof without a new
server-verification architecture and acceptance evidence.
