# Mousehold brand assets

Everything here is either authored in this repo or redistributed under a licence
that permits it. Nothing is borrowed brand art.

## Mark

`mousehold-mark.svg` — the mousehole arch cut into a skirting board, with a
landscape inside it. Authored by hand as vectors for this project. It is also
the app favicon (`index.html` points straight at this file), and the same
geometry is drawn by `src/ui/components/Logo.tsx` so the React mark and the
static file can never drift apart.

Colours: pine `#1d3a2e`, plaster `#f2efe5`, marigold `#e8a33d`, fern `#56997a`,
ivy `#2e6b4f`. Clear space: keep at least one quarter of the mark's width free
on every side. Minimum size: 16 px. Below ~24 px prefer the mono tone.

## Type

`fonts/fraunces-latin-var.woff2` — Fraunces, latin subset, variable across
weight / optical size / SOFT / WONK. Downloaded from Google Fonts
(`fonts.gstatic.com/s/fraunces/v38/…`) on 2026-09-24 and self-hosted so the app
has no runtime CDN dependency and renders identically offline.

Licence: SIL Open Font License 1.1 — full text in `fonts/Fraunces-OFL.txt`.
Copyright 2018 The Fraunces Project Authors, <https://github.com/undercasetype/Fraunces>.

Body text intentionally stays on the system UI stack: it is already installed,
costs nothing to load, and its neutrality lets Fraunces carry the personality.
