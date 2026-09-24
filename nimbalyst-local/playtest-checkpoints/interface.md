# Checkpoint — interface / branding owner

- Session: Nimbalyst Claude Code worker, coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
- Model (from runtime environment block, not inferred from alias): **Opus 5**, exact model ID `claude-opus-5`.
- Baseline commit: `1de4f28` on recognized MAIN.
- Items owned: 1, 2, 3, 4, 5, 7, 8, 9.

## Exclusive paths (only these get edited/committed)

```
src/ui/theme/*
src/ui/components/*        EXCEPT PlayFrame.tsx, AudioControls.tsx
src/ui/screens/*           EXCEPT PlayScreen.tsx, FinishScreen.tsx, CaptureScreen.tsx
src/editor/*
src/styles.css
index.html
src/brand.ts               (new, exported for peers)
public/brand/*             (new)
public/style-previews/*    (new)
nimbalyst-local/playtest-checkpoints/interface.md
narrowly-named new tests
```

Never touched: `src/App.tsx`, `src/main.tsx`, `src/game/*`, `src/capture/*`, `src/audio/*`,
shared schemas, package deps, `server/*`, `storage/*`.

## Decisions

### Name (item 1) — **Mousehold**

Portmanteau of *mouse* + *household*: the household seen from a mouse's-eye view.
Says the whole product in one word — ordinary domestic objects, and you are tiny inside them.
Short, ownable, warm, no trademark collision in the app space.

- Wordmark: `Mousehold`
- Tagline: `Everything is enormous when you're this small.`
- Short descriptor: `Turn a photo of an everyday object into a tiny world you can run around in.`

### Logo (item 2)

Original authored SVG. A mousehole arch knocked out of a rounded square; inside the arch,
a hill horizon and a small sun. Reads as "a doorway into a little world"; legible at 16 px.
Exported as `src/ui/components/Logo.tsx` + `public/brand/*.svg` + favicon.

### Direction

Palette: deep ivy/pine ground, marigold light, warm plaster paper. Deliberately NOT the
cream + terracotta + high-contrast-serif default. Display face self-hosted OFL (Fraunces),
body stays system-ui.

## Status

- [x] Read plan, surveyed owned files, chose name + logo concept.
- [x] `src/brand.ts` + `Logo.tsx` + favicon/boot screen/brand assets (items 1, 2)
- [x] Name/logo export message sent to coordinator; ownership of `src/ui/api.ts`
      brand copy granted back in reply (still to do).
- [x] Tokens + global type/spacing rebuild (items 3, 4, 5)
- [x] Landing rebuild, verified at 1440 / 820 / 390
- [x] Create step 2 Look/Adventure layout (item 8), verified at 1280 / 390
- [x] Genuine same-source style variants generated + wired in (item 9)
- [x] Editor visual consistency (item 7), verified at 1440 / 820 / 390
- [x] `src/ui/api.ts` brand copy + bundle filename (granted by coordinator)
- [x] Contrast pass over the legacy Play/Finish/Capture overlays
- [x] Residual brand-reference sweep, reported to the coordinator
- [x] Accessibility floor: WCAG AA contrast and keyboard focus, both automated

### Accessibility verification

`nimbalyst-local/tmp-interface/contrast.mjs` (throwaway, not committed) samples
every rendered text node's computed colour against its nearest opaque
background and checks the WCAG AA ratio for its size and weight:

```
/                                  54 nodes, 0 below AA
/create                            23 nodes, 0 below AA
/edit/sample-rodin-room-corner     67 nodes, 0 below AA
Look step (step 2)                 29 nodes, 0 below AA
/design-kit/                      235 nodes, 0 below AA
```

It caught one real failure: `--oq-muted` was 4.4:1 on `--oq-inset` (fine on
`--oq-paper`, but secondary text lands on the inset inside drop zones and empty
states). `--oq-muted` moved from `#5f6a5f` to `#5a6459`.

Text that floats over live 3D or a photograph is excluded from that sweep by
design — it has no solid background to measure. Those were checked by eye on
`/play/sample-rodin-room-corner` and kept on their own dark ground.

Keyboard focus: tabbing the landing gives every control a 3px solid marigold
`#e8a33d` ring, on both the pine band and the plaster page.

### Item 7 notes

`src/ui/theme/tokens.css` now declares the palette on `:root` rather than on
`.oq-theme`, so the older screens get the same values without being wrapped in
a theme scope. `.oq-theme` still decides how a region paints itself.

`src/styles.css` keeps every legacy class name and all the markup; only the
paint changed, from the old dark-violet identity onto the Mousehold tokens.
The old `--oq-bg` / `--oq-text` / `--oq-accent` names are kept as aliases.

Two real bugs found and fixed while verifying:

1. `index.html` paints `html` pine for the boot screen. `styles.css` set only
   `body`, and `body { height: 100% }` stops at the viewport, so every screen
   taller than one screenful showed a pine band below the fold. Reproduced on
   the editor at 820px. `styles.css` now hands the root back and uses
   `min-height`.
2. `StyleReference`'s `<img>` carries width/height attributes (so the layout
   does not jump while it loads), and those beat `aspect-ratio` unless
   `height: auto` is set — the reference photo rendered as a tall crop.

Editor also gained a sticky action bar: Save and Play used to sit at the bottom
of the scrolling panel column, below the fold of a column you had to find
before you could scroll it.

### Kept deliberately dark

The 3D stage, the placement hint and preview note that float on it, the photo
card badges, the lightbox, and the in-play HUD chips/subtitles. Those sit over
a rendered scene or a photograph, not over the page, so the light token
surfaces would be unreadable there. Verified `/play/sample-rodin-room-corner`:
the pointer-lock overlay and the "Start gameplay capture" pill both read
clearly over the scene.

### Design decisions worth keeping

- Palette is green-led (pine / ivy / fern) with a single marigold accent on
  plaster. Deliberately not the cream + terracotta + high-contrast-serif look
  that generated pages default to.
- Display face is self-hosted Fraunces with WONK/SOFT engaged; body stays
  system-ui. One webfont, 121 KB, preloaded from `index.html`.
- The landing is two bands: a pine arrival band (`.oq-shade` swaps the token
  set, nothing is re-declared) and the plaster page below it. All the boldness
  is in that band and the headline; everything after is quiet.
- Removed the generated-page tells the old landing had: the ALL-CAPS eyebrow
  over the example, `01 /` numbering on a two-item comparison (not a sequence),
  the hard `<br>` in the h1, and the tracked-out uppercase `.oq-kit-eyebrow`.
  The 1/2/3 steps kept their numbers — that one really is a sequence.

### Tests

- `src/ui/components/styleExample.test.ts` (new, 8 tests): the four images all
  exist, are pairwise distinct, are described distinctly for screen readers,
  the committed originals still hash to what provenance claims, the reference
  IS the repo's `photo-4.jpg`, and the served model / no-fallback / no-retry
  facts are what was actually returned.
- `npx vitest run src/ui src/editor` → 19 files, 114 tests, all passing.
- `npx tsc -p tsconfig.json --noEmit` → clean.
- Responsive captures at 1440 / 820 / 390 (landing) and 1280 / 390 (step 2).

Commit 1: see below. Dirty owned paths after it: none.
Other workers are concurrently dirty in `src/game/*` — never staged here.

## Media budget

Allocation: up to **$2.00** of the shared $10 overnight round.

Contract confirmed before dispatch via `describe_capability("kontext-edit")`:
model `fal-ai/flux-pro/kontext`, `display_price_usd` **0.042 per image** from the static
registry (`price_drift: false`), unit = 1 image, required inputs `prompt` + `source_url`,
SLA p50 9.9 s / p95 18.3 s, success rate 1.00 over 254 samples / 7 days. Per-call bound:
`timeout: 49` (≈2.7× p95), finite, one image out. **Zero automatic retries** — a failure is
recorded and the variant is dropped, not re-billed.

| # | Reservation | Capability | Bound | Est. USD | Status |
|---|---|---|---|---|---|
| 1 | cartoon variant | kontext-edit | 1 image, timeout 49 | 0.0420 | reserved |
| 2 | hand-painted variant | kontext-edit | 1 image, timeout 49 | 0.0420 | reserved |
| 3 | watercolor variant | kontext-edit | 1 image, timeout 49 | 0.0420 | reserved |

**Reserved: $0.1260** of $2.00. This is an estimate at the registry rate, not a claim about
what was actually billed. Actual served model / any provider fallback is recorded verbatim
in `public/style-previews/provenance.json` after each call.

Source: `public/samples/photo-4.jpg` (already in the repo, the same room the landing page
and the bundled "desk & sofa" sample use). Uploaded once via a signed PUT so the bytes
never pass through the conversation. Outputs are downloaded to `public/style-previews/`.
`storage/` is not written — no app job, ledger, or asset record is touched.

## Next step

Author `src/brand.ts` and `Logo.tsx`, then message the coordinator with the name and the
component export path before continuing with the theme rebuild.
