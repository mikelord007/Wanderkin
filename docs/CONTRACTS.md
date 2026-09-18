# Cross-worker integration contracts

Beyond `shared/*` (the versioned data contracts every worker imports),
these are the call/prop shapes the parallel workers build to. They are not
implemented by the foundation worker — each owning worker defines the
concrete code, but must keep to this shape so integration doesn't require
renegotiating the boundary.

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
}
```

`GameView` reads only `SceneManifest` + `MovementConfig`
(`shared/movement.ts`) — never a provider or job shape.

## Scene preparation (`src/scene`, owner: Scene preparation)

```ts
interface PrepareAssetOptions {
  assumedExtentMeters?: number; // default shared/manifest.ts DEFAULT_ASSUMED_EXTENT_METERS
  measuredDimension?: { description: string; meters: number };
}

function prepareAsset(
  assetUrl: string,
  options: PrepareAssetOptions,
  onProgress?: (stage: "downloading" | "decoding" | "analyzing" | "validating") => void,
): Promise<{ manifest: SceneManifest; courseCandidates: SceneManifest[] }>;
```

Geometry loaded here (normalized transforms, colliders) is reused by the
game runtime rather than re-parsed — `src/game` consumes the manifest
`entities`/`assets`, not raw GLB nodes.

`src/scene/samples.ts` (owned by Scene preparation) exports hand-authored
sample `SceneManifest`s for the bundled Rodin/Tripo GLBs in
`public/samples`, satisfying "bundled sample playable without credentials."

## Level editor (`src/editor`, owner: Level tools and persistence)

```ts
interface LevelEditorProps {
  manifest: SceneManifest;
  onSave: (manifest: SceneManifest) => void;
  onPlay: (manifest: SceneManifest) => void;
  onBack: () => void;
}
```

## Product UI (`src/App.tsx` + `src/ui`, owner: Product UI)

Owns top-level routing between start/photos/generation/preparation/play/
finish screens once the scaffold is ready; composes `GameView` and
`LevelEditor` from the contracts above.

## Server API (owner: Livepeer integration for provider/job routes; Level
tools for persistence routes)

| Route | Method | Notes |
| --- | --- | --- |
| `/api/capabilities` | GET | `ProviderCapabilityDescriptor[]` (shared/provider.ts) |
| `/api/uploads` | POST | multipart photo upload, returns `PhotoReference[]` |
| `/api/jobs` | POST | body includes `Idempotency-Key` header; reconciles an existing job with the same key instead of starting a duplicate |
| `/api/jobs/:id` | GET | current `GenerationJob` (shared/job.ts) |
| `/api/jobs/:id/retry` | POST | reconciles the existing provider job; never submits a second generation |
| `/api/levels` | GET, POST | list / create saved `SceneManifest`s |
| `/api/levels/:id` | GET, PUT | load / save one level |

Import/export routes may be added by the Level tools worker as needed,
serializing `SceneManifest` JSON directly.

## Status notes from live verification (2026-09-18)

- Both `rodin-i3d` and `tripo-mv3d` capabilities are confirmed available
  today against the Livepeer MCP endpoint.
- Keyless `spend_cap` read reports $100 remaining / $0 spent. No caps were
  changed and no generation job was submitted during foundation work.
- Observed sample bounds (source: `rodin-provenance.json` /
  `tripo-provenance.json`): Rodin extents width 1.895m / height 0.603m /
  depth 0.676m; Tripo extents width 0.602m / height 0.376m / depth 1.039m
  (Tripo's sample is additionally rotated ~+90° about Y relative to Rodin's).
- Normalization target: scale each asset so its longest horizontal
  dimension is ~8 game meters (`DEFAULT_ASSUMED_EXTENT_METERS`,
  `shared/manifest.ts`), with the toy capsule around 0.5–0.7m tall
  (`DEFAULT_MOVEMENT_CONFIG`, `shared/movement.ts` uses 0.7m). This is a
  documented, arbitrary game-scale choice, not a measured room scale.

Physics/course validation logic is not implemented by the foundation
worker — this document exists so the Scene preparation and Player/camera
workers do not have to renegotiate these shapes mid-flight.
