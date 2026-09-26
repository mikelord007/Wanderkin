# Bundled samples

## The landing's four worlds (`desk/`, `plane/`, `shoe/`, `car/`)

Four worlds the owner made in the app on 2026-09-26, bundled on 2026-09-27
so anyone can play them from the landing without signing in. Built by
`nimbalyst-local/design/shots/landing-samples/build-bundle.py` from a
read-only export of the account's storage. Their manifests live in
`src/game/landingWorlds/<slug>.json` and are registered in
`src/game/landingWorlds.ts`.

Each folder holds:

- `model.glb`: the world's Rodin reconstruction, a byte-identical copy (the
  manifest's `sha256` and `sizeBytes` are checked by
  `src/game/landingWorlds.test.ts`).
- `music.mp3`: the world's own generated soundtrack, byte-identical.
- `card.webp`: the owner's own in-game screenshot of the world, cropped only
  to the card's aspect (16:9 for the featured Desk, 16:10 for the rest) by
  trimming empty ground at the foot, Lanczos-resized, WebP q80. No metadata
  chunks (each file holds only the VP8 image).

The manifests keep each world's course, look and decoration seed exactly
(`biome.seed` is what lays out the scenery). Nothing ties them to the
account: no source photos (`photos` is empty), no workflow or server job
ids, and the level, asset, entity and audio ids are new.

| Folder | Title | Look / seed | GLB | MP3 | Card |
|---|---|---|---|---|---|
| `desk/` | The Desk on the Beach | Tropical Island, `asset:0ef4536a` | 5,353,920 B | 558,696 B | 1600×900, 55,878 B |
| `plane/` | Plane in the Snow | Snowy Alpine, `asset:47f3873d` | 4,816,724 B | 903,095 B | 1280×800, 34,914 B |
| `shoe/` | Boot in the Rain | Monsoon Marsh, `asset:ac903dc5` | 6,920,100 B | 643,124 B | 1280×800, 57,016 B |
| `car/` | Car in the Dunes | Desert, `asset:10979f3c` | 6,179,156 B | 501,018 B | 1280×800, 40,332 B |

## The original samples (files at this folder's root)

`rodin.glb`, `tripo.glb`, their provenance JSON and `photo-1..5.jpg` belong
to the original hand-authored samples (`src/scene/samples.ts`,
`src/game/bundledSamples.ts`). They are no longer on the landing but stay
registered: their `/play/` links still work, and the biome and adventure
tests use their geometry.
