# Level editor & manifest persistence

Owner: Level tools and persistence worker. Covers `src/editor/**`,
`server/levels.ts`, `server/levels.test.ts`.

## Client: `src/editor`

| File | Purpose |
| --- | --- |
| `LevelEditor.tsx` | Named export `LevelEditor`, the contract component from `docs/CONTRACTS.md` (`{ manifest, onSave, onPlay, onBack }`) plus optional `isPersisted`/`onExport` hooks for the portable-bundle UI. Orchestrates the panels below and the 3D preview. |
| `Preview3D.tsx` | React Three Fiber canvas: renders every manifest entity (generated mesh + helper geometry), spawn/checkpoint markers, and reports click-to-place hits and generated-mesh bounding boxes back up to `LevelEditor`. |
| `geometry.ts` | Pure math: capsule-center ⇄ surface-Y conversion, heading ⇄ quaternion, floor-align delta, calibration scale factor. Fully unit-tested. |
| `manifestEdits.ts` | Pure, immutable `SceneManifest` mutators (spawn, checkpoints, helper geometry, transforms, calibration). Every mutation calls `markManuallyAdjusted`, which flips `courseValidation.status` to `"manually-adjusted"` with an honest note — this editor cannot itself re-run controller/physics validation (that lives in `src/game`), so it never claims a course is still `"validated"` after an edit. |
| `draftStorage.ts` | localStorage draft persistence, keyed by `levelId` and the manifest's `updatedAt` at the time editing started (see "Unsaved draft persistence" below). |

### Capsule-center convention

Every `SpawnPoint.position` / `Checkpoint.position` in `shared/manifest.ts`
is the **capsule center**, not the standing surface: `surfaceY +
characterHalfHeight + characterRadius + a small skin margin`
(`shared/movement.ts` `DEFAULT_MOVEMENT_CONFIG`). `geometry.ts`'s
`capsuleCenterYAboveSurface` / `surfaceYBelowCapsuleCenter` implement this
conversion; `Preview3D`'s click-to-place raycast always reports a raw
surface hit point, and `LevelEditor.handleSurfaceClick` is the only place
that converts it to a capsule-center Y before writing it into the
manifest. Numeric position inputs edit the capsule-center Y directly (as
documented on the type).

### Preview loader

The preview uses `src/scene/loadAsset`, the same download/decode/cache used
by preparation and gameplay. Each manifest entity clones the cached scene
graph before mounting it, so two entities can share immutable geometry and
materials without sharing transform state. Helper visuals come from
`src/scene/createHelperGeometry`; in particular, a ramp is the same wedge
triangle mesh used by its collider, never a misleading box.

A failed or still-loading mesh renders a wireframe placeholder box, but a
placeholder is not clickable placement geometry. Click-to-place also checks
the real hit-face normal against the movement system's maximum walkable
slope. Empty space, walls, and over-steep faces therefore cannot be stored as
if they were safe spawn/checkpoint surfaces. Floor-align and calibration stay
disabled until the real asset bounds are available.

### Unsaved draft persistence

`draftStorage.ts` persists in-progress edits to `localStorage` under
`objectquest:editorDraft:<levelId>`, stamped with the manifest's
`updatedAt` **at the moment editing started** (`baseUpdatedAt`) — not the
in-progress draft's own content, which never gets a fresh `updatedAt`
until an actual save (server-stamped, see below).

On mount, `LevelEditor` calls `resolveDraft(levelId, manifest.updatedAt)`:

- **`fresh`** — the draft's `baseUpdatedAt` still matches the manifest
  just passed in; safe to auto-resume (shown as a light "restored your
  edits" banner with a Discard option).
- **`stale`** — the saved level's `updatedAt` has moved on since the
  draft was based off it (saved elsewhere, e.g. another tab/device).
  Resuming blind could silently overwrite that newer save, so the editor
  shows an explicit choice instead of picking for the user: "Resume my
  unsaved draft anyway" vs. "Discard it, use the latest saved version."
- **`none`** — nothing to restore.

The draft clears on a successful Save (the edits are now durable inside
the saved `SceneManifest`) or when the user explicitly discards it. Ordinary
navigation does not silently destroy recoverable work.

Known gap: this only guards the generation → preparation → save window.
Reloading mid-edit on an *already-saved* level you're re-editing
(`isNew: false`) uses the same mechanism and is covered; what's not
covered is detecting a save that happened in another tab of the *same*
browser while this tab is still open (no live polling for that) — the
staleness check only runs once, at mount.

## Server: `server/levels.ts`

Routes (per `docs/CONTRACTS.md`):

| Route | Method | Notes |
| --- | --- | --- |
| `/api/levels` | GET | `SceneManifest[]` |
| `/api/levels` | POST | Validates the body, assigns a fresh `levelId` if the one supplied is missing/unsafe/colliding, stamps `createdAt`/`updatedAt`, never overwrites an existing level. Returns 201. |
| `/api/levels/:id` | GET | 404 if unknown. |
| `/api/levels/:id` | PUT | Upserts at `:id`. Rejects an unsafe `:id` or a body whose `levelId` doesn't match the URL before validating anything else. Bumps `updatedAt` server-side. |
| `/api/levels/:id/export` | GET | Portable bundle (see below). |
| `/api/levels/import` | POST | Portable bundle → a **new** level (never overwrites). See the content-type note below — this is not a plain JSON request. |

### Validation and storage

`sceneManifestSchema` (zod) mirrors `shared/manifest.ts` field-for-field,
including a refinement that rejects checkpoints whose `order` isn't
unique and ascending from 0. Every write route rejects anything that
doesn't parse before it's ever persisted.

All levels live in one atomically-written index file,
`STORAGE_DIR/levels.json` (write-to-temp-then-rename, serialized through
an in-process queue so concurrent requests can't interleave a
read-modify-write — same durability guarantee as the Livepeer worker's
`JsonFileStore`). The in-memory index is a `Map`, not a plain object, so a
malicious or accidental `levelId` like `"__proto__"` can never pollute a
prototype; `isSafeLevelId` additionally bounds length/charset and
blocklists `__proto__`/`constructor`/`prototype` as defense in depth.

`LevelStore` accepts the process-wide `AssetStore` and `PhotoStore` instances.
Bundle import calls those services directly, so imported files receive the
same magic-byte/size validation and durable index records as ordinary uploads
and are immediately visible through `GET /api/assets/:id`. The server wiring
must pass the already-created stores rather than constructing isolated cached
indexes:

```ts
app.use(createLevelsRouter(new LevelStore(env.storageDir, assetStore, photoStore)));
```

### Import/export bundle format

```ts
interface LevelBundle {
  bundleVersion: 1;
  manifest: SceneManifest;
  assets: { filename: string; base64: string }[]; // GLBs referenced by manifest.assets
  photos: { filename: string; base64: string }[]; // source photos referenced by manifest.photos
}
```

Plain JSON, no zip dependency, per the brief. Export safely resolves both
durable `/api/assets|photos/files/...` URLs and bundled `/samples/...` files.
It is all-or-nothing: a missing file, unsafe/nonlocal URL, duplicate filename,
invalid file, or asset hash/size mismatch returns an explicit 422 instead of a
misleading incomplete bundle. Import:

- Validates the bundle (including the embedded manifest) with the same
  strict schema used everywhere else.
- Requires exactly one embedded file for every manifest asset/photo and
  rejects duplicate, ambiguous, or unreferenced mappings.
- Canonically decodes base64, verifies every GLB's declared hash and byte size,
  then preflights all GLB/photo validators before writing anything.
- Stores through `AssetStore`/`PhotoStore`, preserving asset provenance and
  indexing the minted IDs used by the existing API routes.
- Remaps the manifest's `assets[].id/url`, `photos[].id/url`, and every
  `generated-mesh` entity's `assetId` to the freshly-stored values before
  creating the imported level as a **new** level (never overwrites).
- Validates GLB/photo magic bytes and per-file size caps
  (150MB/20MB, matching `MAX_GLB_BYTES`/`MAX_PHOTO_BYTES`) on every
  embedded file before writing anything to disk.

**Content-type note (important for any client wiring this up):** import
is deliberately **not** `application/json`. `server/index.ts`'s global
`express.json({ limit: "10mb" })` body parser (owned by the Livepeer
worker, out of scope to edit) would reject any bundle embedding a
realistic GLB — even the bundled Tripo sample's ~2MB GLB becomes ~2.7MB
of base64, and Rodin's ~5MB becomes ~6.7MB, before the manifest/photos are
even added, so the combined bundle sits right at or over that 10MB cap.
Since `express.json()` only engages for `Content-Type: application/json`,
this route accepts the bundle as raw text under
`Content-Type: application/octet-stream` instead, bypassing the global
parser entirely and applying its own considerably larger bound
(`MAX_BUNDLE_TEXT_BYTES`, 220MB) via a route-scoped `express.text()`. A
client must `JSON.stringify` the bundle and POST it as the raw body with
that content-type, not via `fetch(url, { body: JSON.stringify(...) })`'s
default JSON content-type.

The start screen exposes **Import level bundle** beside the existing photo
and GLB creation paths. A successful import opens the newly persisted,
validated manifest in the editor; it never overwrites the source level.
Saved-level cards expose **Export**, and the editor exposes **Export** for a
saved state or **Save & export** when the level is new or has draft edits.
The latter always waits for the save to succeed before requesting the bundle,
so a failed save cannot silently download an older version.

## Testing

`server/levels.test.ts`: id safety (including
prototype-pollution-shaped ids), zod validation (valid/missing
fields/wrong schema version/corrupt checkpoint ordering/garbage input,
finite transforms/unit quaternions/nonzero scale/positive dimensions/reference
integrity/helper collider agreement),
`LevelStore` CRUD, atomicity under 20 concurrent creates, corrupted
`levels.json` surfacing as a real error rather than silent data loss, failed
atomic writes not leaking into the cache, sample/local export resolution,
strict export/import mapping and hash/size checks (including dedup-by-sha256 and a
byte-identical re-materialized file), and full HTTP-level tests
(`app.listen(0)` + real `fetch`, no new test dependency) covering every
route including the 400s for invalid bodies, mismatched PUT ids, and an
unsafe `:id`.

`src/editor/*.test.ts` (33 tests): the pure logic in `geometry.ts`,
`manifestEdits.ts`, and `draftStorage.ts`. `LevelEditor.tsx` and
`Preview3D.tsx` themselves aren't unit-tested — no DOM/React-Three-Fiber
testing library is installed and adding one is a dependency change out of
this worker's scope; this mirrors the same limitation already documented
for `src/ui`'s screen components.

## Known limitations

- No in-canvas text labels on preview placeholders (would need a
  font-loading dependency); the "loading…" / "preview unavailable" state
  surfaces via a DOM banner instead.
- Ramp helpers expose heading around Y; their rise/run comes from dimensions.
