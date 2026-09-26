# Landing imagery

Every image here is a real render of the bundled sample worlds, captured
from the running app in Chrome (no AI image generation, no stock). The game
HUD was hidden for capture; nothing else was altered. Recaptured 2026-09-25
for the light (v3) landing with the disposable harness
`nimbalyst-local/tmp-ui-redesign/capture-worlds.mjs` (short walks and a
raised camera so the explorer and the furniture fill the frame), then cropped
and encoded to WebP with Chrome's own encoder.

| File | Size | What it shows | World / look |
|---|---|---|---|
| `step-reconstruction.webp` | 800×600, transparent | The bundled desk-and-sofa 3D reconstruction (`/samples/rodin.glb`) as the landing preview renders it | n/a |
| `step-explore.webp` | 1200×900 (4:3 crop) | The explorer beside the portal ring, under the desk | The Lost Colors of Teacup Island, Original |
| `world-lost-colors.webp` | 1600×900 | The explorer between the portal ring, a colour fragment and a giant sofa leg | The Lost Colors of Teacup Island, Tropical Island look |
| `world-teacup-wander.webp` | 1280×720 | Under the sofa among the island shrubs | Teacup Island Wander, Tropical Island look |
| `world-desk-sofa.webp` | 1280×720 | A fragment and a sofa leg the size of a tower on desert sand | The desk & sofa adventure, Desert look |
| `world-different-perspective.webp` | 1280×720 | Under the sofa, green floor | A different perspective (Tripo), Original |
| `library-alpine.webp` | 960×720 (4:3 crop) | The explorer under the sofa among snowy pines; the front print on the landing's "Your worlds" card | The desk & sofa adventure, Snowy Alpine look |
| `library-autumn.webp` | 960×720 (4:3 crop) | The explorer between a mossy rock and a red autumn tree; the back print on the same card | A different perspective (Tripo), Autumn Forest look |

| `finale-sofa.webp` | 800×1000 (4:5 crop) | The explorer standing on the sofa seat, the sofa back and the desk with its laptop beyond; the final call to action dissolves the room photo into it | The desk & sofa adventure, Original look (spawn moved to the sofa-seat checkpoint in the capture harness only) |

## `corner.glb`: the turntable model (1.47 MB)

A lighter copy of the bundled reconstruction `/samples/rodin.glb` (4.98 MB)
for the landing's "same corner" turntable, written by
`nimbalyst-local/tmp-ui-redesign/build-corner-glb.mjs` with no new
dependencies. The positions, UVs and indices are byte-for-byte the same
(47,618 vertices, 50,000 triangles). The normals are dropped: the material
is emissive-only (a baked, shaded texture on a black base colour), so
lighting never reads them. The 2048 px PNG texture (3.15 MB) is re-encoded
as a 2048 px JPEG at quality 0.8 (212 KB), which core glTF supports.

The two `library-*` renders were captured 2026-09-26 with the same harness to replace the old standalone arch illustration; `finale-sofa.webp` was captured the same day with `capture-sofa.mjs`. Total about 185 KB. The landing labels the cards shown in a theme look.
