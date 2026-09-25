# Opus visual/design review: scale, camera, surfaces, lighting and brand fit

Reviewer: fresh session for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`, user-requested Opus pass after the Sonnet workers finished.
Runtime model: **`claude-opus-5-5`** (Opus 5.5), taken from this session's own system context. I did not inspect API logs, so this is the runtime's self-report.
Reviewed product: `7ec73b2`. HEAD at the time was `b2106fc`, and everything after `7ec73b2` is docs only. The tracked tree was clean before and after this review.
Date: 2026-09-25.

> **Update:** F1, F2 and F6 were then implemented by this same session, as authorized by the coordinator, in product commit `b9a00e5`. See "Implementation" at the end. F3/F4 went to a separate worker. F5 is not authorized. The review sections below are left as written at review time, except where the implementation section explicitly corrects them.

## Verdict

**Not ready to call done. The smaller character is a real improvement; the surface/material work is not.**

- **Scale and camera: delivered.** At spawn the character is about 82 px of a 720 px frame, down from about 185 px at 0.35 m, and the desk and sofa read as giant, especially from under the desk. Two scale side-effects remain (F3 markers, F4 skating feet).
- **Surfaces: the one "known" region profile is inverted.** The sofa gets the wood treatment and the desk gets the fabric treatment. The only visible effect of the region work is wood-level gloss on the sofa seat. In Cartoon that gloss becomes magenta/cyan "oil-slick" bands. In Hand-painted and Watercolor it looks like wet lacquer.
- **The normal detail is too weak to see.** The weave/grain normal perturbation is world-anchored, so it is not screen-space noise. In gameplay it changes 0.3–0.5/255 on average and fewer than 1.6% of pixels, even directly under the character. The user cannot see tactile surfaces today.
- **Lighting.** The dark-tone floor works: under-desk near-black pixels go from 40% to 3%. The relight makes Cartoon furniture muddier. Cartoon's per-channel posterize still crushes the Tripo sample's furniture to black, which this refinement never touched.
- **Brand site: coherent.** I don't recommend any renaming or redesign. The main mismatch is between site and game: the landing page promises "your room", while the game is a green lawn and sky with clouds and trees.

## Method (bounded, isolated, read-only product)

- Harness: `nimbalyst-local/tmp-opus-visual-review/` (not committed, like earlier `tmp-*` folders). Disposable Vite on port 5211 with a **private `cacheDir` under the OS temp dir**, deleted afterwards. It had no `/api` proxy. Playwright `channel: "chrome"`, headless, 1280×720.
- **Every `/api` request was mocked in Playwright.** Read-only GET fixtures were built by `make-fixtures.ts` from the real `getSampleLevel()` manifests, with only an `experience.style.id` block added for Hand-painted and Watercolor. Every non-GET was aborted, and none occurred. Non-local hosts were blocked (none requested). Console and page errors: **0 in every capture run**. The one run with errors was my own broken transform anchor (Vite 500), fixed and re-run.
- **Serve-time review hooks only (no product file edited).** A Vite `transform` plugin exposes uniforms at a frozen camera pose:
  - bump amplitude, region roughness, detail fade and the dark floor
  - a region tint (orange = wood factor 1, blue = fabric)
  - region divider, blend and inversion
  - a luminance-posterize variant
  - a runtime "original unlit" toggle, which restores `emissiveMap`/black base on the relit material
  - an overview camera override, and access to the renderer for an environment-map test

  All A/B pairs are the same frame with one variable toggled. Exceptions are the under-desk pairs in `rodin-cartoon-play` and `rodin-watercolor`, where the boom was still easing (0.84→1.0). I re-shot those with a 1.8 s settle in the `rodin-poster` and `env` runs.
- Captured:
  - Cartoon via the real production "Play now" flow for both bundled samples
  - Hand-painted and Watercolor via mocked `/play/review-…` fixtures
  - Poses: spawn, running, under the desk overhang, beside the desk, the step approach, the mantle onto the elevated surface, looking down and across, the far end, plus external overview cameras
- Protected services afterwards: 5173 → 200, 15173 → 200, 8787 `/api/capabilities` → 200, 18799 `/api/capabilities` → 200. There were no provider, generation, upload, publish or save calls. I did not touch the saved world, the stash, Finish/App/sharing, or any product file.
- Curated evidence: `nimbalyst-local/screenshots/opus-visual-review/` (24 images, filenames below). The full raw set with logs and per-diff numbers is in `tmp-opus-visual-review/shots/*/log.txt`.

## Findings, most severe first

### F1 [High] The Rodin wood/fabric profile is inverted. The sofa is "wood" and the desk is "fabric".

- Evidence: `01-overview-front.png` vs `02-shipped-region-tint-INVERTED-…png`. The desk (laptop, drawers, legs) is entirely blue (fabric); the sofa body and cushions are orange (wood). The same result appears from three overview angles (`rodin-overview/91-*`).
- Root cause: `src/scene/samples.ts` names the elevated standable surface at y = 1.286, x −0.06…3.18 "the desk" (`RODIN_DESK_Y`, the checkpoint 2/3 comments). It is actually the **sofa seat**: the checkpoint 2/3 gems visibly sit on the sofa cushions in `01`. `materialRegions.ts` reused that label ("desk on +X, sofa on −X"), so wood went to x ≥ −0.06, which is the sofa.
- Consequences:
  - The sofa seat gets roughness ≈0.42 gloss.
    - Cartoon: `05-cartoon-sofa-seat-shipped-wood-gloss-rainbow.png` shows magenta/lavender/cyan contour bands across the seat.
    - Watercolor: `08` shows wet-lacquer streaks and a purple glint.
    - Hand-painted: `09` vs `10-…original-unlit` shows the same wet-lacquer look.
  - The desk gets matte "fabric".
  - The earlier evidence files `after-desk-relit-wood-grain.png` and `after-sofa-relit-fabric-weave.png` were captured on the opposite objects. Four earlier review passes did not catch this.
- Fix, small and scoped to `materialRegions.ts`/`styleMaterial.ts`:
  - Flip the sense so wood is at x below the divider.
  - Move the divider to about −0.6 m and narrow the blend from 0.4 to about 0.08.
  - Tint sweep (`03` at −0.5, `04` at −0.7): at −0.5 orange remains on the sofa's left arm; at −0.7 the desk's right front leg starts turning blue. The desk pedestal and the sofa arm overlap in X, so a single X plane cannot be perfect. Two measured bounding boxes would be cleaner if the boundary still shows.
  - Correct the "desk" wording in the `samples.ts` comments so the mislabel doesn't recur.
  - Result: `06-cartoon-sofa-seat-corrected-regions-only.png`. The rainbow gloss is gone, with the same pose and a single variable changed.

### F2 [High for Cartoon] Per-channel 5-step posterize crushes dark imported surfaces to black and turns smooth shading into hue bands

- `floor(c*5+0.5)/5` per channel sends any sRGB value below 0.1 to 0 and rounds R, G and B at different thresholds, so any smooth gradient (specular, shading) becomes coloured contours.
- **Tripo sample:** furniture is near-black. 24% of the spawn frame is near-black (`22-tripo-cartoon-spawn-black-furniture.png`).
  - This refinement never changed it: 0 materials relit, and the dark floor exists only for relit materials.
  - `tripo.glb` is **real PBR**: base colour, metallicRoughness and normal textures, `metallicFactor: 1`. Forcing metalness to 0 changed only 2.2% of pixels, so the black is **not** metal without an environment; it is dark albedo plus posterize crush.
  - A global RoomEnvironment (intensity 0.45) lifts it but washes the floor to lime (`tmp…/shots/tripo-env/`), so I don't recommend it.
- Fix, small, in `styleMaterial.ts`, for **imported asset materials only** (the `cloneStyledMaterial` path):
  - Quantize luminance into the same 5 bands with a non-zero lowest band, keeping hue.
  - Keep helper, floor and marker materials on the existing per-channel path. When I applied luminance bands globally, the bright spawn ring merged into the grass.
  - Evidence:
    - Tripo: `23-tripo-cartoon-spawn-luma-bands.png`, near-black 24% → 5%, with the furniture's structure readable.
    - Rodin seat: `07-…corrected-regions-plus-luma-bands.png` is a coherent warm brown sofa.
    - Rodin spawn, same frame (`rodin-poster/70-spawn-luma-poster.png`): the furniture reads as brown wood rather than olive/maroon.
  - Treat this as a Cartoon look change that needs the user's eye, not a claimed improvement.

### F3 [Medium] Checkpoint and destination markers were not rescaled. They are bigger than the hero and hide it.

- The core gem radius is `min(0.4*0.34, 0.16)` = 0.136 m, so a 0.27 m gem, about **1.55× the 0.175 m character**.
- It floats at the authored capsule-centre height (surface + 0.37 m), which is above the character's head.
- The 0.4 m translucent trigger halo is about 4.6 character-heights wide and washes over the whole frame near a checkpoint.
- Standing on a checkpoint and looking down, **the gem completely hides the character**:
  - Cartoon course: `11-cartoon-character-hidden-by-checkpoint-gem.png`
  - Watercolor explore: `12`, `13` (marker over the character)
- This works against "character much smaller than surrounding objects" by putting a bright object bigger than the hero next to it. It also hurts legibility.
- Fix, in `Checkpoints.tsx` and the explore destination mesh in `ModeEntities.tsx`:
  - Size the visual core relative to the character (about 0.35–0.5 × capsule height).
  - Place it at the re-seated height (about surface + 0.6 × authored).
  - Dim or hide the halo once a marker is collected.
  - Leave the trigger radius unchanged.

### F4 [Medium] Running feet skate about 4×

- `characterAnimator.ts:491` advances the stride at a fixed **8.4 rad per world metre** (about 0.374 m per footfall). The comment says this keeps "a believable fraction of the character's own leg length"; that was true for the 0.70 m body.
- At 0.175 m each footfall covers about **2.1 body-heights**, so the legs cycle much too slowly for the ground covered.
- Measured run speed is 1.89–1.95 m/s, about 11 body-heights/s; the jump is about 3.4 body-heights (already disclosed as a trade-off). The skating makes the brisk speed read as gliding.
- Fix: scale the stride rate by body size, e.g. `8.4 * (0.70 / capsuleHeight)^k`.
  - k = 1 is about 23 steps/s, a visual blur.
  - k ≈ 0.5–0.75 is a toy "scurry".
  - Judge it on video, not stills.

### F5 [Medium, mostly pre-existing: the biggest remaining "giant household" gap] The world reads as outdoors, not a room

- The Cartoon floor helper uses `surfaces[3]` (grass green). The backdrop is a sky gradient. `SceneEnvironment` adds clouds, trees and reeds. The whole corner is a slab floating in the sky (`21-overview-floating-island.png`).
- Turning away from the furniture shows only lawn and sky (`20-cartoon-facing-away-lawn-and-sky.png`).
- The landing page (`24-landing.png`) promises "Your sofa is a mountain range" next to a warm photo of a real room.
- The scale shrink is real, but the household context undercuts it every time the camera looks away from furniture.
- Smallest meaningful change, with no new geometry:
  - an interior palette per style (warm floorboard/rug floor tone, warm wall-tone backdrop and fog)
  - drop the outdoor dressing for these household worlds
- This is a product/art-direction choice, so the coordinator or user should approve it first; I haven't done it. Walls would be a larger step and I am not recommending them now.

### F6 [Medium] The "tactile surfaces" normal detail is too weak to perceive

- Pure bump A/B (roughness held, corrected mapping), with the sofa seat directly under the character:
  - Watercolor: mean |Δ| 0.46–0.53/255, 0.7–0.8% of pixels changed
  - Cartoon: 0.30–0.43/255, 1.3–1.5% of pixels changed
- At spawn and beside the desk: under 1% of pixels, in every style. (`12-watercolor-shipped-strength-detail-invisible.png`.)
- Causes:
  - The amplitude of 0.0035 gives only 3–5° of normal tilt.
  - `oqDetailFade` treats 130 **rad**/m as cycles/m (the actual rate is 20.7 cycles/m), so detail fades about 6× too early. It fades from about 1.3 m and is gone by about 4.6 m, and the chase boom is 1.0 m.
  - Wood rings at 28 rad/m have a 22 cm period, about 1.3 character-heights. That is plank-scale, not grain.
- With the fade corrected and 4× amplitude, the fabric reads as real upholstery ribbing (`13-watercolor-detail-x4-fade-off-visible-ribbing.png`).
- In Cartoon the detail only shows as halftone dots at posterize band edges unless F2 is done first.
- Recommendation, after F1/F2:
  - divide the fade frequency by 2π
  - raise fabric amplitude about 3×
  - raise wood grain frequency to a real grain scale along the long axis
  - verify for moiré **while moving**

### F7 [Low] The relit Cartoon spawn view is backlit and muddy

- The spawn heading faces into the key light, so the first furniture you see is its shadowed side.
- Relit vs original at the same pose (`14` vs `15`): the orange wood legs become dark olive. That is 14% of pixels changed and 4% lower mean luminance.
- F2's luminance bands largely fix this. Otherwise leave it.

### F8 [Low] Hand-painted is murky overall

- Mean luminance is 43–73/255 at several poses, and the relight lowered sampled poses a further 7–21%.
- The screen-anchored stroke/paper hash in Hand-painted and Watercolor is pre-existing screen-space noise, not part of this work.
- No change recommended beyond F2 and F5.

### Under-furniture darkness: acceptable

- The floor does its job: under the desk, 40% near-black with the floor off (`17`) vs 3% shipped (`16`).
- In Cartoon the underside becomes a smooth, detail-free warm-dark slab, because the floor is applied after posterize. In Watercolor it looks good (`19`).
- It is darker than the original unlit render (`18`) but reads as plausible shadow. Not a blocker.

### Evidence-accuracy corrections (information; no product change)

- The material checkpoint says every shipped GLB is a single black-base emissive bake. **False for `public/samples/tripo.glb`**, which is real PBR.
- "Tripo gets the universal relight" and `after-tripo-unknown-asset-safe-relight.png` are **false**. The structural guard correctly rejects Tripo; it gets no relight at all (0 relit materials).
- "No shipped sample has PBR metal maps" is false: Tripo ships a metallicRoughness map with `metallicFactor: 1`. In practice its metalness is about 0 (forcing 0 changed 2% of pixels), so there is still **no visible metal region**. The honest wording is "no perceptible metal", not "no metal maps".
- All desk/sofa labels in the material evidence are swapped (F1).

## Scale, camera and brand notes (no action needed)

- **Scale:** clearly smaller, consistent with the earlier ~45% pixel-height measurement. Under the desk the character is tiny against the legs and underside, and this is the best giant-scale read in the game (`16`, `19`).
- **Camera:** the open boom is 1.0 m at FOV 72. In tight spots it collapses to 0.25–0.6 m (under-overhang look-up: 0.246 m; far end of the seat: 0.30–0.62 m), and the character looks large again there. That is expected collision behaviour, not a regression.
- **Brand:** the landing page's warm green, cream and amber palette, the serif headline and the Wanderkin mark read coherently. The photo-to-world card is a strong proof point. No renaming or redesign recommended.

## Recommended next step (scoped; nothing implemented here)

One narrow implementation pass, in this order:

1. **F1** (`materialRegions.ts` sense and divider plus its test; `samples.ts` comment wording).
2. **F2** (`styleMaterial.ts`: asset-only luminance bands in Cartoon).
3. **F3** (`Checkpoints.tsx`, the `ModeEntities.tsx` destination mesh).
4. **F4** (`characterAnimator.ts` stride scaled by body size).

Verify each with this review's same-pose A/B method and zero console errors.

Then decide, with the user if the coordinator prefers:

- **F6:** detail strength and fade, only after F1/F2.
- **F5:** interior palette and dressing. This is a product direction call.

None of these is a new mechanic or a redesign. Each maps directly to the user's asks: "material lighting" (F1, F2, F6), "shrinking the character down" (F3, F4) and a convincing giant household (F5).

Subjective acceptance stays with the user's own play-test.

## Implementation: F1 + F2 + F6 (product commit `b9a00e5`)

Authorized by the coordinator after this review. Exclusive paths: `src/scene/materialRegions.ts`, `src/scene/styleMaterial.ts`, their tests, and comment-only edits to `src/scene/samples.ts`. Runtime was `claude-opus-5-5` (self-reported). F3/F4 (markers, stride) belong to a separate worker; I left their files untouched and unstaged. F5 is not authorized.

All three fixes live in `styleMaterial.ts`, and the commit tool stages whole files, so they share one product commit.

### Correction to my own review

F1 recommended "flip the sense, divider ≈ −0.6". **That was wrong.** I had read it off a perspective tint sweep. Measuring the real vertices (below) puts the true seam at **x ≈ −1.0**. A single X plane is not enough either, because the laptop sits on the desk. I implemented measured boxes instead.

### F1: the regions now come from the real geometry

- **Method.** I parsed `public/samples/rodin.glb` POSITION data and applied the sample manifest's own transform (uniform ×4.2208, no rotation). From that I built top-down height maps, slices and a front elevation, with the script at `tmp-opus-visual-review/analyze-rodin.mjs`. I then checked each box against the tint overlay in real Chrome from the front, back, side and junction views.
- **Measurements:**
  - **Desk** (x −4.0…−1.05): top plane at y ≈ 1.80–1.82, drawer pedestal side panel at x ≈ −1.65.
  - **Seam:** a full-height gap at **x ≈ −1.0**.
  - **Sofa:** left arm at x −0.95…−0.35 (top 1.9); seat at y 1.26–1.29, which is the course's elevated surface where checkpoints 2 and 3 sit; backrest to about 2.5 at z < −1.0.
  - **Laptop:** screen to 2.5 m at z ≈ −0.6.
    - The keyboard deck rises only 1–5 cm above the desk top. Vertices above the desk plane stop at z ≈ 0.3.
    - Towards the front, the reconstruction fuses the deck into the desk-plane triangles. The overlay against the texture shows the deck reaching z ≈ 0.8.
- **Profile:**
  - wood = desk box, capped just above the desk top at 1.835
  - fabric = sofa box from y 0.22, so the feet and floor patches stay neutral
  - neutral = a laptop box (x −3.25…−1.9, z −0.85…0.82, from y 1.78) and a mouse box (x −3.95…−3.2, z −0.55…0.05)
  - Everything standing above the desk top (bottles, vase) is outside all boxes, so it is neutral.
  - Edge softness is 0.01 m.
  - It is still keyed only to the actual loaded-bytes sha256. Unknown hashes still return `null`.
- **Boundary corrections found during verification.** I report these as the smallest precise fixes rather than assuming every desk-side triangle is wood:
  1. The first neutral box missed the keyboard deck: it was tinted wood in `26-laptop-tint`.
  2. A pure height cut can't separate the deck from the desk top, which is not perfectly flat. The tests caught that it would speckle the desk top.
  3. One large footprint box would have neutralised most of the desk top, which the tests also caught.

  The final shape is the two tight boxes above. Cost: the desk top directly under the laptop footprint loses grain. That is deliberate, since the laptop's front edge is geometrically fused with the desk there.
- **Shader:** box weights come from uniform arrays (`#define OQ_REGION_BOXES`). The normal is bumped separately per field and blended by weight, so a box edge can never become a height step or a false ridge. `classifyMaterialPoint` in `materialRegions.ts` is a CPU mirror of it for tests.
- **Regression tests** (`materialRegions.test.ts`), tied to measurement and identity rather than names:
  - 12 measured reference points: seat under checkpoints 2 and 3 → fabric; backrest and left arm → fabric; desk top (two spots) and pedestal → wood; desk leg → wood; laptop screen, fused deck, item above the desk and sofa foot → neutral.
  - Plus tests against **the real `rodin.glb` bytes**:
    - the bytes' sha256 equals the profile key
    - more than 95% of the seat and backrest vertices are fabric
    - more than 95% of the desk-top (beside the laptop) and pedestal vertices are wood
    - the sofa's left arm has 0 wood vertices
    - everything above y 1.9 on the desk side is neutral
    - the keyboard deck is under 2% wood
    - more than 75% of the mesh is covered, so the checks can't pass on empty boxes
  - **Mutation-checked:** swapping wood and fabric fails 10 tests; putting back the old −0.06 divider fails 5.

### F2: Cartoon bands imported assets by luminance

- For imported assets only (the `cloneStyledMaterial` path), Cartoon now quantizes **luminance** into the same 5 bands and rescales the colour to that band. The texture's hue is kept at every band.
- The lowest band is half a step (0.1), not black. Near-black texels ease toward neutral grey, so rescaling can't amplify hidden noise into saturated colour.
- Helper, floor and marker materials keep the original per-channel rounding. The program cache key includes `asset`/`helper`, and a test asserts this. When I applied luminance bands globally, the spawn ring merged into the grass.
- Genuine PBR maps are untouched: the Tripo material still has its base colour, metallic-roughness and normal maps, and the PBR-preservation tests still pass.
- Deterministic tests use a CPU mirror (`cartoonAssetBandColor`):
  - a warm brown with a rising sheen stays within 12° of its source hue, where per-channel rounding drifts more than 25° (red, yellow and grey bands)
  - dark non-black texture colours keep luminance above 0.09, where per-channel rounding gives 0
- Real Chrome, Tripo spawn, same deterministic spawn camera: `fix/20` (before, black with maroon patches) vs `fix/21` (after, readable dark brown). The Rodin sofa-seat rainbow gloss is gone (`fix/10-cartoon…` vs `fix/11-cartoon…`).

### F6: fade units and detail tuning

- **Fade units:** `oqDetailFade` now converts radians/m to cycles (×1/2π) and fades each field by its own frequency between 0.2 and 0.45 cycles per pixel (below Nyquist).
- **Fabric:** 130 rad/m weave (4.8 cm period in game, about 1.2 cm real). Amplitude 0.0035 → 0.008, tuned down from 0.0095 because at that strength the ribbing dominated the seat under the explorer in Hand-painted. Roughness 0.84–1.0 (matte).
- **Wood:** a new grain function (lines along X that wander and fade in and out along the board) replaces the 28 rad/m plank stripes. It runs at 120 rad/m with amplitude 0.003, reduced from 0.0045 because the first version read as regular corrugation. Roughness 0.52–0.72 (satin, down from the old 0.42 gloss).
- **Per-style strength:** Cartoon runs at **0.25**. At full strength, fine relief under 5 flat bands only dithers band edges into dotted/hatched contours (`fix/14-…REJECTED-dither`). Hand-painted and Watercolor run at full strength.
- **Result:**
  - Painted styles: visible woven upholstery on the sofa and wavy grain on the desk (`fix/11-*`, `fix/13-*`).
  - Cartoon: clean bands with a trace of relief; its material difference shows mainly as matte vs satin.
- **Moving-camera check:** `tmp-opus-visual-review/pan.mjs` does 9-frame sub-pixel pans (3 mm per frame) at mid and grazing distance over the seat and the desk, with the HUD hidden, measuring frame-to-frame |Δ|. Current vs baseline:

  | Metric | Result |
  | --- | --- |
  | Pixels jumping by more than 12 levels | Lower or within +0.06 percentage points of baseline in every style and pose (current 0.3–1.6%, baseline 0.4–2.5%; worst case Watercolor desk-mid 1.21% vs 1.14%) |
  | Mean frame delta | Equal or lower, except desk-grazing (+0.18 to +0.30/255) |

  The desk-grazing rise comes with no rise in jumping pixels (0.52–1.00% vs 0.52–1.64%), so it is gentle shading motion, not sparkle. Stills show no moiré at far, mid or grazing distance (`fix/22`, `fix/23`, `verify/final/*/30-*`, `31-*`).

### samples.ts (comments only)

- The `RODIN_DESK_Y` doc comment now says the surface is the sofa seat. The constant keeps its historical name.
- The step-flight comments say seat instead of desk. The checkpoint comments say "in front of the desk's left end", "on the sofa seat" and "across the seat … beside the sofa's left arm".
- Every changed line is a comment; constants, IDs, the route and geometry are unchanged. CRLF endings are preserved.

### Verification

- `npx tsc -p tsconfig.json --noEmit` and `npx tsc -p server/tsconfig.json --noEmit`: both exit 0.
- `npx vitest run src/scene src/game/assets src/game/render`: 11 files, **122/122 pass**. This run happened while the sibling worker's uncommitted render/animator edits were in the working tree. Per instruction, I did not run the full suite before both owners freeze.
- Real Chrome, two disposable Vite servers with **private cacheDirs under the OS temp dir**, both deleted afterwards:
  - 5212 served `styleMaterial.ts`/`materialRegions.ts` exactly as committed at `7ec73b2` (via a Vite `load` hook, no file changes)
  - 5211 served the working tree
  - Every `/api` call was mocked GET-only, and 0 requests were blocked
  - Identical scripted cameras (overview front/back/side/corner, desk/sofa junction from both sides, seat/arm/desk/pedestal/laptop close-ups, grazing views, dolly sequences) in all three styles
  - **0 console/page errors in every run**
- Production "Play now" flow, both samples: 0 errors, rendering and moving (`fix/30`, `fix/31`).
- The review hooks (tint overlay, overview camera, R3F state) existed only as serve-time transforms in `tmp-opus-visual-review/vite.review.config.mjs`. `grep -rn oqReview src shared` finds nothing in shipped source.
- Protected services afterwards: 5173 → 200, 15173 → 200, 8787 `/api/capabilities` → 200, 18799 `/api/capabilities` → 200. There were no provider, generation, upload, publish or save calls, and no storage, saved-world, stash or Finish changes.
- Disclosure: while I captured, the sibling F3/F4 worker was editing `Checkpoints.tsx`, `GameStage.tsx`, `ModeEntities.tsx`, `PlayerAvatar.tsx` and the animator. Both of my servers served those same working-tree files, so every material A/B pair differs only in my two files. Marker and avatar appearance in the frames reflects their work in progress, not a shipped state.

### Evidence (`nimbalyst-local/screenshots/opus-visual-review/fix/`)

- `01`/`02`: front tint, before (inverted) and after.
- `03`: back tint, after.
- `04`/`05`: junction from front and back.
- `06`/`07`: laptop and mouse neutral, including the fused deck at a grazing angle.
- `10`–`13`: sofa seat and desk top, before and after, for Cartoon, Hand-painted and Watercolor.
- `14`: the rejected full-strength Cartoon dither.
- `20`/`21`: Tripo Cartoon spawn, before and after.
- `22`/`23`: far and grazing views, no moiré.
- `30`/`31`: production Play-now smoke.

### Honest residuals

- **Boundary quality:**
  - Regions are boxes on one combined mesh. Small items on the desk top that lie flat below 1.835 m (for example the paper sheets right of the laptop) receive desk-wood detail.
  - The sofa's wooden feet are neutral rather than wood.
  - The desk top directly under the laptop footprint has no grain.
- **Scope of the fix:**
  - Only the one known Rodin asset has regions. Tripo and every user-generated asset get only the relight (Rodin-style bakes) and/or the Cartoon luminance bands.
  - No metal region exists or is claimed.
  - No semantic segmentation is claimed.
- **Cartoon:**
  - Cartoon deliberately shows only a trace of relief.
  - The luminance bands change the Cartoon look of all imported assets (warmer, readable darks, hue kept). The user should judge that visually; I don't claim they will accept it.
- **Environment-map experiment:** the RoomEnvironment test on Tripo remains review evidence only. A global environment washed out the floor, and the black Tripo crush is now handled by F2 instead.
- **Moving-camera evidence:** based on sub-pixel pans and stills. I have not reviewed it as video.
- **Not touched, owned elsewhere:** F3 markers, F4 stride, F5 environment/palette, and the pre-existing Tripo checkpoint-5 flake.
