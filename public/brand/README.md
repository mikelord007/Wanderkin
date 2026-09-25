# Wanderkin brand assets

Everything here is either authored in this repo or redistributed under a licence
that permits it. Nothing is borrowed brand art.

## Name

*Wanderkin*: *wander* (exploring with no fixed route) plus *-kin*, the old English
diminutive (munchkin, bumpkin). A very small explorer, which is what the product
makes you.

## Mark

Planetrise over a sewing button. The four-hole button is a pale lavender planet
rising on the product's purple, with a bright white rim and a violet halo round
its upper edge. Its holes glow, its stitching is marigold thread, and the tiny
explorer (the in-game teal beanie and marigold suit, arm up) stands on the lit
rim. An everyday object becomes a world, and you are small on it.

The glow is solid circles stacked from haze to rim, with no gradients and no ids,
so the drawing is identical inline, in an `<img>`, as a favicon and in these
files. All three files are generated from `src/ui/components/Logo.tsx`, and
`src/ui/components/Logo.test.ts` fails if they drift from it:

- `wanderkin-mark.svg`: the full drawing on the purple tile. Use from 24 px up.
- `wanderkin-favicon.svg`: the small optical cut, for 16–23 px. A thicker rim,
  bigger holes, no stitching or waving arm, and a larger, simpler figure.
  `index.html` uses it as the favicon. `<LogoMark>` switches to it
  automatically below 24 px.
- `wanderkin-mark-mono.svg`: one colour (`currentColor`), no tile. The rim becomes
  a single arc held clear of the planet. For light grounds, photos, or anywhere a
  single ink is needed. A gap between beanie and face keeps the figure from
  reading as a bear.

Colours: tile purple `#6a4af6`, planet `#e4d9fd`, halo `#a58cff`, rim `#ffffff`,
holes `#7b5cfa`, thread `#e39a2b`, marigold suit `#f2b24d`, beanie `#3f9f92` /
`#2b7a70`. The purple tile is the product's accent, so the mark reads on the
light page and on the dark cinematic moments alike; mono takes the ground's ink
(plum on light, lavender white on dark). Clear space: a quarter of the mark's
width on every side. Minimum size: 16 px.

## Wordmark

Live text in Outfit (weight 500, tracking -0.025em), the interface face, not
outlines. The one liberty: the dot on the *i* is a marigold button, cut from the
explorer's suit. `<Logo>` draws it with a dotless *ı* (U+0131, inside the font's
latin subset) and gives screen readers the plain name.

## Type

`fonts/fraunces-latin-var.woff2`: no longer referenced by the app (it set the
previous wordmark). Fraunces, latin subset, variable across
weight / optical size / SOFT / WONK. Downloaded from Google Fonts
(`fonts.gstatic.com/s/fraunces/v38/…`) on 2026-09-24 and self-hosted so the app
has no runtime CDN dependency and renders identically offline.

Licence: SIL Open Font License 1.1 — full text in `fonts/Fraunces-OFL.txt`.
Copyright 2018 The Fraunces Project Authors, <https://github.com/undercasetype/Fraunces>.

`fonts/outfit-latin-var.woff2`: Outfit, latin subset, variable across weight
100–900. The interface face: display headlines, UI and body text. Fraunces is
now used for the wordmark only. Downloaded from the Fontsource mirror of Google
Fonts (`cdn.jsdelivr.net/fontsource/fonts/outfit:vf@latest/latin-wght-normal.woff2`)
on 2026-09-25 and self-hosted, so there is still no runtime CDN dependency.

Licence: SIL Open Font License 1.1, full text in `fonts/Outfit-OFL.txt`.
Copyright 2021 The Outfit Project Authors, <https://github.com/Outfitio/Outfit-Fonts>.

## Interface palette

The app is a light product with cinematic purple moments (direction v3): page
`#faf7ff`, tint `#f2ebff`, white surfaces, border `#e7ddfc`, plum text `#24143d` /
`#5a4c74` / `#6e6088`, brand purple `#7b5cfa` (labels and fills `#6a4af6`), warm
`#f2c46d`. The hero's planetrise is a pale world rising with purple rim light. A
dark set (night `#120726`) remains for rare cinematic moments. The marigold (`#f2b24d`) is kept for the explorer, the
tittle and "you are here / next" signals; focus rings are purple on light and
marigold only inside dark moments.
The header, boot screen and friend landing use the full mark on its purple tile.
