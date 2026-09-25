# Wanderkin brand assets

Everything here is either authored in this repo or redistributed under a licence
that permits it. Nothing is borrowed brand art.

## Name

*Wanderkin*: *wander* (exploring with no fixed route) plus *-kin*, the old English
diminutive (munchkin, bumpkin). A very small explorer, which is what the product
makes you.

## Mark

A four-hole sewing button the size of a planet, with the tiny explorer standing
on top of it. The explorer wears the in-game teal beanie and marigold suit, and
has an arm up. An everyday object becomes a world, and you are small on it.

All three files are generated from `src/ui/components/Logo.tsx`, and
`src/ui/components/Logo.test.ts` fails if they drift from it:

- `wanderkin-mark.svg`: the full drawing on the pine tile. Use from 24 px up.
- `wanderkin-favicon.svg`: the small optical cut, for 16–23 px. Bigger holes, no
  stitching or waving arm, and an upright, larger figure. `index.html` uses it as
  the favicon. `<LogoMark>` switches to it automatically below 24 px.
- `wanderkin-mark-mono.svg`: one colour (`currentColor`), no tile. For photos,
  dark overlays, or anywhere the tile would fight the backdrop. A gap between
  beanie and face keeps the figure from reading as a bear.

Colours: pine `#1d3a2e`, plaster `#f2efe5`, button dish `#e2dac6`, marigold
`#e8a33d`, beanie `#3f9f92` / `#2b7a70`. Clear space: a quarter of the mark's
width on every side. Minimum size: 16 px.

## Wordmark

Live text in Fraunces (weight 650, SOFT 100, WONK 1), not outlines. The one
liberty: the dot on the *i* is a marigold button, the same one the explorer
stands on. `<Logo>` draws it with a dotless *ı* (U+0131, inside the font's latin
subset) and gives screen readers the plain name.

## Type

`fonts/fraunces-latin-var.woff2` — Fraunces, latin subset, variable across
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

The app is set on a violet night with a "planetrise" glow: the mark's button
seen as a planet, rising with violet and white light round its rim. Night
`#120726`, dusk `#1c0f38`, veil `#271950`, lavender ink `#f4eeff`, mist
`#b6a7d8`, violet `#8b6cff`, halo `#e9e0ff`. The mark's marigold (`#f2b24d` in
the interface) is kept for focus rings and "you are here / next" signals only.
On these dark grounds the header and friend landing use the mono mark, as this
file already recommends where the pine tile would fight the backdrop.
