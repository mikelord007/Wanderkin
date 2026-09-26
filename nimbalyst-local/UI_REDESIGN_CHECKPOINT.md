# Wanderkin UI redesign: checkpoint

> **RESUMED under Direction v3** (brief: `nimbalyst-local/design/UI_DIRECTION_V3.md`, the acceptance contract). The HOLD below is lifted. The dirty C work: the Finish postcard prop (`App.tsx`, `FinishScreen.tsx`) and the decorative scenery markup (Capture, Review, Loading) stay and are reused. The v2 dark-only CSS in `creation.css`, `finish-screen.css`, `friendLanding.css`, `hud.css`, `editor.css` and `styles.css` is rewritten on the light system in step 6.

> **User override (2026-09-25, mid step 4):** "Make sure you redo the hero section to light mode too in landing page!" The hero is now light: the planetrise is redrawn as a pale lavender world rising with purple rim light, with a plum headline and a solid purple CTA. This supersedes the brief's "keep the hero dark". The dark `.oq-shade` scope stays in the tokens for the rare cinematic moment (the final CTA's night-room picture, the 3D stages).
>
> **v3 commits so far:**
> - `2cb28aa`: tokens
> - `1f861c6`: component kit and base styles
> - `1edf4b0`: light landing plus the Your worlds library. These share `StartScreen.tsx` and `welcome.css`, so they are one commit.

## Direction v3: final state (2026-09-25)

**Commits, in order:**
| Hash | What |
|---|---|
| `2cb28aa` | tokens |
| `1f861c6` | kit and base styles |
| `1edf4b0` | light landing (including the light hero) and the Your worlds library |
| `e5c65c7` | creation flow, Finish, friend landing, editor |
| `e081f6c` | light in-game HUD, pause and click-to-play cards |
| `40aec58` | landing polish pass |
| `de1187f` | brand: new Wanderkin logo for the redesigned UI |

**Checks:**
- **tsc:** clean after every commit.
- **Focused vitest:** `src/ui/components` 28/28; Logo 7/7.
- **Full `npx vitest run` (once, at the end):** 764 of 768 tests passed. The 4 failures are all in `src/biome/**`, the environment lead's area, which had uncommitted work during the run: adventure time-budget assertions (2000 ms / 1.5 s bounds exceeded under load), "never lets the theme change the layout", and a tropical bush-radius art guardrail. The failing count changed between two runs (7, then 4), which marks them as load-sensitive. None touches UI code.
- **Overflow:** none at 375 px on the landing, library, capture, review, customize, preview, Finish, friend landing or World ready.
- **Blocked writes / page errors:** 0 / 0 on disposable port 5291.
- **Frame time (headed, sample 0):**

  | Run | p50 |
  |---|---|
  | earlier today | 16.7 ms |
  | final, HUD shown | 33.3 ms, steady (a 30 fps lock) |
  | final, HUD hidden | 33.3 ms |

  The HUD is not the cause. Since the earlier run the environment lead has committed biome lighting and prop changes (`f506409`, `46091be`, `6b166bc`, `23de3bf`); those, or machine state, are the likely cause. Reported to the orchestrator for the environment lead.

**Polish decisions:**
- Headings: explanatory sections centre them, product sections align them left.
- The interlude sits on the page colour so it doesn't merge with the tinted section above it.
- Library tiles keep Play on one baseline.
- The capture-stage arch is faded to a watermark so it doesn't compete with the text.

**HUD on light:** every element moved to white or pale-lavender panels. All stay legible over bright sky and dark furniture at 1280×720 (real game) and 1440×900. None needed a dark surface, except the objective arrow, which stays marigold with a plum drop shadow.

## Logo
- **Concept:** planetrise over a sewing button. The logo's button-planet rises in pale lavender (`#e4d9fd`) on the product's purple tile (`#6a4af6`), with a white lit rim and a violet halo (`#a58cff`). The four holes are purple (`#7b5cfa`), the stitching amber (`#e39a2b`), and the tiny explorer (teal beanie, marigold suit) stands on the rim.
- **Wordmark:** Outfit 500 with the marigold-button tittle.
- **Construction:**
  - The glow is solid stacked circles, with no gradients, filters or ids, so inline, `<img>`, favicon and static copies are identical. The static files are generated from `Logo.tsx`, and `Logo.test.ts` enforces that.
  - The small cut (below 24 px, used as the favicon) has a thicker rim, bigger holes, and no stitching or arm.
  - The mono cut uses `currentColor` with the rim as a separate arc. It is unchanged.
- **Sizes tested:** 64/48/36/24 (full), 20 (small), favicon rasterised at 16 and 32 px on light and dark browser tabs, mono at 48/24/16, and the lockup on white and on night.
- **Files:** `src/ui/components/Logo.tsx`, `public/brand/wanderkin-mark.svg`, `wanderkin-favicon.svg` (`wanderkin-mark-mono.svg` is byte-identical, so unchanged), `public/brand/README.md`, `index.html` (boot mark, light boot screen, theme-color), chip avatars in `global.css` and `hud.css`, and the design-kit Brand section.
- **Commit:** `de1187f`.
- **Shots:** `nimbalyst-local/design/shots/brand/`: start-page, start-nav, start-nav-lockup-3x, start-nav-375, boot, design-kit-brand, design-kit-top, favicon-16-32-raster, hud-intro-chip-2x, hud-pause-card, friend-landing-lockup.

## Direction v3 audit (2026-09-25, before any v3 edit)

v3 in one line: **a clean, modern product site with cinematic purple moments.** The hero stays dark and everything else goes light. Purple is used strategically (actions, the arch, one glow per section) instead of as the ground colour.

Categories: **C** cinematic · **E** explanatory · **P** product/functional · **I** interlude. Surfaces: **L** page `#FAF7FF` · **T** tinted `#F2EBFF` · **W** white cards on the page · **D** dark `#120221`-family.

### Landing (top to bottom)
| Section | Cat | Surface | v3 intent |
|---|---|---|---|
| Nav | P | D (inside hero) | Unchanged. |
| Hero planetrise | C | D | Kept. Its band ends in a rounded bottom edge set on the light page, so the drama hands over to the product instead of fading into more dark. |
| Photo → world | E | L | Heading "From photo to explorable world" plus supporting text. Two equal, intentionally framed media (white surface, lavender border, soft shadow, same radius and aspect): the photo, then the live world on a pale-lavender stage with a soft purple arch. A small quiet connector between them; captions aligned under both. |
| How it works | E | T | One journey: three identical white cards (same 4:3 image, same padding, aligned titles and baselines), a small purple number pill, one thin dotted purple path linking the cards. Step 2 carries the same weight as 1 and 3. |
| Scale interlude | I | T (gradient to L) | 50–65vh. Big plum statement on the left; a huge pale sewing button entering from the right edge, with the explorer and a soft shadow on its rim. |
| Worlds to borrow | P/visual | L | Heading plus a subheading that absorbs "Built in already. Keyboard controls.". One large featured world and smaller worlds; white cards, image first (strong recaptured crops), then title, mode, Play; Edit course is a quiet text action. Lift, zoom and glow on hover. |
| Your worlds | P | T | A polished library: white cards on the tint, 16:9 image with a status badge overlaid, title, concise metadata, one primary action (Play/Resume) and quiet text actions. |
| Final CTA | C (restrained) | L | Plum headline and copy on the left; on the right a white frame holding the night-room photo with the portal glow inside it; one primary CTA and a quieter secondary. |
| Import + footer | P | L | Quiet, hairline dividers. |

### Other surfaces (step 6)
| Surface | Cat | Surface | v3 intent |
|---|---|---|---|
| Creation frame + steps (capture, review, customize, preview, progress, ready) | P | L with W cards | Tighter product headings; one framed visual per step (capture stage on pale lavender with a soft arch; object on a lavender stage with the explorer for scale; image-led look tiles; print-plus-world preview; arch-framed waiting image; world-ready canvas framed). |
| Finish | C + P | L, with the postcard frame | Postcard (real completion capture) framed on a pale stage with a soft arch; result panel white; a clear Play again. |
| Friend landing | P | L | The shared world's preview framed large; the invitation beside it on white. |
| Loading, toasts, modals, fields | P | L/W | The kit on white surfaces, purple primary, plum text. |
| Editor | P | L | Panels as white sections; the stage keeps its dark 3D canvas (it's a render). |
| HUD over 3D | P | W panels if legible at 1280×720 and 1440×900, else restrained D | Pause/click-to-play cards and small pills in white/pale lavender with plum text; any element that reads worse on light stays dark (to be recorded here). |

### Token plan (step 3, one scoped commit)
Light `:root`: page `#FAF7FF`, tint `#F2EBFF`, surface `#FFFFFF`, border `#E7DDFC`, text `#24143D` / `#5A4C74` / muted (see contrast note), purple `#7B5CFA` / `#6846F5`, glow `rgba(123,92,250,.18)`, warm `#F2C46D`, cinematic `#120221`. A `.oq-shade` / `.wk-dark` scope re-declares the dark set for the hero and any dark moment. Spacing: max 1240, page-x ≥ 32 desktop / 20 mobile, section 96–128, group gap 48–64, content 24–32, small 12–16, card padding 24, grid gap 24. Radii: 12 inset/media-inner, 20 card, 28 stage, pill. Shadows: sm/md/lg in plum at low alpha, plus the purple glow.
**Contrast note, decided before building:**
- `#7B5CFA` on white is 4.43:1, below AA for normal text. Purple **text and button fills** use a slightly deeper purple, `#6A4AF6` (≈5.2:1 with white); `#7B5CFA` stays the brand purple for large and graphic uses.
- `#7C6E95` muted text is ≈4.3:1 on `#F2EBFF`, so muted text is nudged to `#6E6088` (≥4.5 on all three light surfaces).
- The warm `#F2C46D` fails as a focus ring on white, so focus rings on light are purple and marigold stays decorative.

> ## HOLD (2026-09-25, orchestrator f8543364)
> The user reviewed the v2 landing (6e54e58) and Your worlds (b42783c) and chose "No, redirect". Pass C (remaining screens) is **stopped**. Nothing reverted, nothing new committed. Waiting for the user's specific rework feedback on the landing and library; I will not guess at it.
>
> **Tree state:** `npx tsc --noEmit -p tsconfig.json` exits 0. No file is half-edited: every C edit landed whole, and the last action (a screenshot run) was rejected before it wrote anything.
>
> **My uncommitted C work (dirty; left in place, complete but unreviewed and not screenshotted):**
> - `src/App.tsx`: one line passing `worldPostcard={screen.media.screenshot?.blob ?? null}` to FinishScreen.
> - `src/ui/screens/FinishScreen.tsx`: optional `worldPostcard` prop. It shows the completion postcard as a tilted print in front of a portal arch; the illustrated island remains the fallback.
> - `src/ui/screens/finish-screen.css`: postcard print and arch styles; the result card is a quieter panel.
> - `src/ui/screens/CaptureScreen.tsx`: a decorative `PortalArch` behind the drop-zone content.
> - `src/ui/screens/ReviewObjectScreen.tsx`: a decorative `TinyExplorer` scale cue on the review stage.
> - `src/ui/components/LoadingScreen.tsx`: a decorative `PortalArch` above the spinner.
> - `src/ui/screens/creation.css`: v2 block appended. Covers the capture stage and print placeholder, review floor light, image-led Look tiles, style preview as print-over-stage, the arch-framed waiting preview, and World ready without a card.
> - `src/ui/screens/friendLanding.css`: the shared world's preview fills the card, with the invitation on a scrim.
> - `src/game/hud/hud.css`: arch-topped HUD cards (border-radius plus inset rim only) and a lighter pause tint.
> - `src/editor/editor.css`: the editor panels become rule-separated sections instead of boxes.
> - `src/styles.css`: `.oq-loading__arch` size.
>
> **Not mine (environment worker; untouched):** `src/biome/**` and `src/game/render/SceneEntities.tsx`.
> **Harness only (nimbalyst-local):** `tmp-ui-redesign/gallery/gallery.tsx` gained `library`, `library-empty` and `finish-postcard` views; `shoot.mjs` gained extra C views.
> **Last action:** appended the HUD arch-card CSS, added the `finish-postcard` harness view, then began a screenshot run of the C surfaces. That run was rejected (the user's redirect).
> **Disposable server:** port 5291 is stopped (no listener). Protected ports were never touched.
> **Queued after the redirect is resolved:** the logo refinement commit (first pass is `ded7676`).

Worker: Claude Opus 5.5 (`claude-opus-5-5`), UI redesign worker. Parent orchestrator: f8543364-0062-46b3-b257-253a08306202.
Reference: `nimbalyst-local/design/reference-hero.png`. Skill followed: `frontend-design:frontend-design`.

## Design brief (written before any edit)

### Idea: planetrise
The reference's glow is not a generic blob. Two bright lobes curl up from the bottom corners around a dark dome in the middle, like the lit rim of a planet rising. That is already Wanderkin's own image: the logo is **a sewing button the size of a planet with a tiny explorer standing on it**. So the one bold element in the system is a **planetrise**: a dark world curving up from the bottom of the screen, with violet-to-white atmosphere light around its rim. Content that belongs to "your world" (the live 3D sample, the finish island, the shared preview) sits on or above that curve. Everything else stays quiet, dark and typographic.

### Palette (named)
| Name | Hex | Job |
|---|---|---|
| Night | `#120726` | page ground (html/body, HUD overlays tinted from it) |
| Dusk | `#1c0f38` | raised surface: cards, dialogs, HUD cards |
| Veil | `#271950` | inset/control fill: fields, drop zones, tracks |
| Lavender ink | `#f4eeff` | primary text and display type |
| Mist | `#b6a7d8` | muted/body text (8:1 on Night) |
| Violet | `#8b6cff` | glow body and the base action tint |
| Halo | `#e9e0ff` | glow core and the brightest accents |
| Marigold | `#f2b24d` | **only** focus rings, the "you are here/next" signal (active pip, objective arrow), and the logo's tittle. Taken from the logo's button so the warm spark belongs to the brand, not decoration. |

Lines: hairline `#2f2159` (separates only), control line `#7a68ad` (3:1 on Dusk, interactive edges).
Status on dark: success `#8fe3b8` on `#15302d`; error `#ffaaa4` on `#3a1629`; warning `#f5c77a` on `#33241c`.
World looks still retint the action colour only: Cartoon lavender `#c6b4ff`, Hand-painted peach `#ffc2a6`, Watercolor aqua `#a9e2ec`.

### Type
- **Outfit** (OFL, variable 100–900, latin subset, one 32 KB woff2, self-hosted at `public/brand/fonts/outfit-latin-var.woff2`): display and UI. Geometric like the reference, with rounder, friendlier terminals than Poppins, which suits a toy-scale world. One family carries display and body; hierarchy comes from size and weight, not a second face.
- **Fraunces** stays for the **wordmark only** (`--oq-font-brand`), because the brand README defines the wordmark as Fraunces 650 SOFT 100 WONK 1. Its preload moves to Outfit.
- Scale (major third, 1.25, base 16): 12.8 / 14 / 16 / 20 / 25 / 31 / 39 / 49 / 61 / 76 / 95 / 119.
  - Hero display: `clamp(3rem, 1.1rem + 7.2vw, 7.4rem)`, weight 300, line-height .94, tracking -0.04em, centred.
  - Screen h1: `clamp(2.3rem, 1.5rem + 3.2vw, 3.8rem)`, weight 300, lh 1.0, tracking -0.03em.
  - h2: `clamp(1.6rem, 1.3rem + 1.2vw, 2.4rem)`, weight 350. h3: 1.25rem, weight 500.
  - Body 16/1.6 weight 400, Mist for secondary. UI labels 15px weight 500. Sentence case everywhere; the HUD's uppercase tracked labels are removed.

### Shape and depth
- Radii by hierarchy: pill (999) for every button, chip, tab and HUD capsule; 28px stage/hero panel; 22px card/dialog; 14px inset (fields, thumbnails, tiles).
- Surfaces are flat Dusk with a 1px lavender border at 14% and a 1px inner top highlight (`inset 0 1px 0 #ffffff0f`). No grey drop shadows; the only "shadow" is a violet ambient `0 24px 60px #05010f99` on floating things (dialog, HUD card).
- No `backdrop-filter` anywhere over the game canvas; HUD surfaces are near-opaque fills instead.

### Glow spec (CSS gradients only)
- `--wk-planetrise` (hero, finish, friend landing, pause overlay): stacked radial gradients. Top layer is the dark planet (Night ellipse ~46% x 60% centred at 50% 112%, soft edge 55%→75%); under it the atmosphere (ellipse 90% x 58% at 50% 104%: Halo → `#b79cff` → Violet → `#4a2bb8` → transparent). Text never sits on the bright lobes; stat/note text sits on the dark dome like the reference.
- `--wk-ambient` (creation, editor, landing lower sections): same geometry at ~35% intensity so any text that passes over it keeps AA.
- HUD cards: a 1px violet-to-halo gradient line along the bottom edge of the card (the planet rim in miniature), no blur.
- Motion: one orchestrated moment only, the landing planetrise lifting 24px and fading in over 1.1s on load. Everything else animates only in answer to an action (press, open, toast in). `prefers-reduced-motion`: no rise, no pulses, no transitions.

### Components (inventory)
- **Button**: primary = "lit" pill, opaque mix of the action tint into Night (`color-mix(action 38%, #1a0d33)`) with a lavender border and inner highlight, so its label keeps AA over any backdrop; secondary = outlined glass pill (transparent, lavender border 34%); ghost = text pill that fills on hover. 46px min height (44 in HUD).
- **Chip**: small pill with a 22px circular "avatar" (the mono logo mark in a Veil disc) + label. Replaces the old eyebrow on landing, creation, finish and friend landing. Existing eyebrow copy is kept; no new labels are added.
- **Card / Panel / Dialog / Toast / TextField / ChoiceTiles / Stepper / Progress / EmptyState / Lightbox**: re-tokened to the dark system; dialog backdrop Night 80%.
- **Nav**: logo left, a single outlined pill "My worlds" right (the reference's "Hire Me" pill).
- **HUD**: objective capsule top-left (Outfit 300 counter, sentence-case label), Sound + Pause glass pills with line icons top-right, capture pill bottom-left, keycap reference bottom-right, intro as a chip at top centre (fixes the overlap with the bottom subtitle), subtitle as a Night capsule at bottom centre, pause/click-to-play/complete/error/loading cards on a planetrise overlay.
- **Known HUD fixes**: `.oq-hud button` (0,1,1) outranked `.oq-hud__primary` (0,1,0), so the Play button painted grey. Base HUD button rule becomes `.oq-hud :where(...) :where(button)` (0,1,0) and the primary rule follows it. Intro moves off the subtitle's bottom band.

### Layout (landing hero)
```
[mark Wanderkin]                                  ( My worlds -> )

                 ( (o) One photo becomes a world )
                     Your sofa is a
                    mountain range.
            lede, centred, 46ch, Mist
          [ Make my world -> ]  ( > Play a sample )
            note on the dark dome, small

   ~~~~~~~ violet/white rim light ~~~~~~~ planet curve ~~~~~~
        [ photo | live 3D sample ]  (sits on the planet)
```
Checked against the brief: the only borrowed trait is the reference's own direction, which the user asked for. The planet reading, the marigold taken from the logo, and the chip whose avatar is the logo's button are specific to Wanderkin. The hero chip reuses the existing `BRAND_TAGLINE`, so no new copy was added.

## Direction v2 audit (2026-09-25, before any v2 edit)

User verdict on v1: the hero works; everything after it reads as a dull dashboard of flat purple cards in the hero's colours. Brief: `nimbalyst-local/design/UI_DIRECTION_V2.md`. What carries through from the hero is its principles, not its gradients: scale, depth, overlap, oversized household forms, cinematic light, asymmetry. The glowing arch (planet rim / portal) becomes the recurring motif, used about once per section. Density alternates: loud, quiet, loud.

Roles: **A** = atmospheric (mood, one strong motif, little text) · **V** = visual (imagery carries the content) · **F** = functional (task first, quiet chrome, imagery only where it is the content).

### Landing page, top to bottom
| # | Section | Role | Design intent |
|---|---|---|---|
| 1 | Nav (logo, My worlds) | F | Unchanged: thin, over the hero. |
| 2 | Hero planetrise | A | Keep as is; it's the reference the rest must live up to. |
| 3 | Photo → 3D comparison | V | A transformation showcase. The photo is a small, tilted print "held" at the left edge; the live 3D sample fills a wide stage and grows out of it; a portal arch frames the moment they meet. No container card. |
| 4 | Three steps | V | A connected journey across the page: real photo → real 3D reconstruction render → real in-game shot of the tiny explorer. Staggered heights (asymmetry) joined by one faint glowing dotted path with checkpoint pips. Numbers stay (it is a sequence). |
| 5 | Scale interlude | A | Quiet break with one oversized motif: a giant sewing button / chair leg silhouette bleeding off the edge, a tiny explorer and a long shadow. One line of copy. |
| 6 | Worlds to borrow | V | Immersive world selection: one large featured world (Lost Colors) plus a staggered column of the others, each a full-bleed real render with title and mode over a bottom scrim, a portal-arch glow on hover/focus, Play as the dominant action and Edit course as secondary. Not a uniform three-column grid. |
| 7 | Your worlds | F | See B below. |
| 8 | Final CTA | A | Returns to the idea: a household object (the photo) with a lit portal arch opening in it, the explorer walking in; "Make my world" + "Play a sample". |
| 9 | Import disclosure | F | Quiet text disclosure, no chrome. |
| 10 | Footer | F | Tagline and a link, hairline only. |

### "Your worlds" (the library, part of the start screen)
| Item | Role | Design intent |
|---|---|---|
| Saved world card | V/F | A 16:9 image first (postcard poster, then the world's own source photo, then an illustrated night-room fallback with the portal arch), title and mode/style/checkpoints under it; **Play** dominant; Edit / Export / postcard in a quiet secondary row or overflow; status as a small badge plus a restrained rim colour. |
| Draft / draft-changes card | F | Same card; a dashed rim and a "Draft" badge; Resume is the primary action. |
| Pending (generating) card | A/F | The image area becomes a slow "building" state (portal arch filling), with status text; Resume/View progress as primary. |
| Failed card | F | Error badge and a warm rim; retry is the primary action where allowed. |
| Empty state | A | Not a dashed box: a small explorer beside a giant photo corner with the portal arch; one CTA. |

### Screens and components
| Surface | Role | Design intent |
|---|---|---|
| Creation frame (step rail, header) | F | Keep the pill rail; headline smaller, left-aligned; the page leads with its one visual. |
| Capture (step 1) | F + 1 V | The drop zone becomes a "photo print" slot on a big soft light pool with the arch behind it, not a dashed card. The tips are a quiet list. |
| Review object | V | The object on a stage with a floor shadow and a scale cue (tiny explorer silhouette beside it). Controls quiet at the side. |
| Customize (look / adventure) | F | Look tiles lead with their real example images (already present), larger and less boxed; adventure tiles quiet. |
| Style preview | V | Before/after as the same transformation language as landing section 3. |
| World progress / generation | A | Waiting is the atmospheric moment: the arch slowly filling with light over the preview image; stepper quiet. |
| World ready | V | The live world leads (existing canvas), the mission is text over and under it, not a card. |
| Preparation / editor | F | Tool surface: stays functional; the flat cards become thin grouped sections; the stage stays the hero. |
| HUD (in play) | F | Minimal pills; no new decoration (cheap by rule). |
| Click-to-play / pause card | F over world | The world stays visible; the card is a compact floating panel with the arch as its top edge, not a centred purple box. |
| Loading / error | A (light) | The arch and a line of text; no box. |
| Finish | A + F | The finished world screenshot (captured at completion) behind as the environment; the portal arch as the celebration; actions quiet and grouped. |
| Friend landing | V | The shared world's live preview full-bleed, with the invitation text overlaid on a scrim; one Play action. |
| Modal / toast / fields / buttons | F | Keep the v1 kit. |
| Design kit | F | Documentation; picks up new components automatically. |

## Decisions made during the build
- **Logo:** the full pine-tile mark clashed with violet. `Logo.tsx` documents `tone="mono"` for dark backdrops where the tile would fight the background, so the landing nav, friend landing and design kit use the mono mark. The drawing, `Logo.tsx`, the static SVGs and the favicon are unchanged. The wordmark stays in Fraunces with the marigold tittle.
- **Cascade fix:** `main.tsx` imports `App` before `styles.css`, so `styles.css` wins ties. Its global heading rule is now `:where()` (zero specificity), so each screen's own heading scale applies.
- **Derived colours** (`--oq-action-fill`, `--oq-wash`) are declared again on `[data-world-style]`. Otherwise they would resolve to the root's lavender and never pick up the Hand-painted or Watercolor tint.
- **Secondary buttons** get a 72% night base, so their labels stay AA even over the white glow lobes (6.55:1 measured).
- **HUD button specificity:** the base rule is `.oq-hud :where(.oq-hud__card, .oq-hud__top-actions) :where(button)` (0,1,0), and `.oq-hud__primary` follows it. Kit buttons in the Sound panel and `.oq-adventure__button` keep their own rules.
- **Intro vs subtitle:** the intro became a chip at top centre (`top: 1.1rem`, or `7.4rem` below 1100px wide). The subtitle keeps the bottom band.
- **No `backdrop-filter`** anywhere in the HUD, the capture pill or the Finish card. Every glow is a gradient.

## Files changed (20 app files + 2 new font files)
index.html; public/brand/README.md; public/brand/fonts/outfit-latin-var.woff2 (new); public/brand/fonts/Outfit-OFL.txt (new); src/styles.css; src/ui/theme/{tokens,global,welcome}.css; src/ui/theme/DesignKit.tsx; src/ui/components/{kit,adventure-controls}.css; src/ui/components/Icon.tsx; src/ui/screens/{StartScreen,FinishScreen,FriendLandingScreen}.tsx; src/ui/screens/{creation,finish-screen,friendLanding}.css; src/game/hud/{Hud.tsx,hud.css}; src/capture/media.css; src/editor/editor.css.
TSX changes only add classes, icons or wrappers. Copy, accessible names, roles and data-testids are unchanged: the Sound/Pause icons are `aria-hidden`; the hero was regrouped, with the before/after comparison moved into its own `section aria-label="From a photograph to a world"`; and the chip classes were added. No tests needed changes.

## Commits
| Hash | Milestone |
|---|---|
| 9b01de4 | foundation: tokens, Outfit font, global/legacy styles, boot screen, brand README |
| 1612294 | shared components: kit.css, adventure panel, Icon (pause/record), design kit |
| c77896e | landing hero + creation steps |
| 25845a0 | HUD/in-game + capture pill; grey Play fix; intro/subtitle overlap fix |
| 2fa14c5 | Finish, friend landing, editor |

## Checks run
- `npx tsc --noEmit -p tsconfig.json`: exit 0, run after every milestone and again after the commits.
- Focused vitest for `src/ui/components` and the biome copy/contract tests: 5 files, 53 tests passed.
- Full `npx vitest run`, run once: **87 files, 717 tests passed**.
- Contrast was computed with the WCAG formula, not judged by eye. Ink on night 17.1; mist on night/dusk/veil 8.8/8.1/7.1; primary labels 6.1–7.0 across all three looks; HUD text over a white scene 7.6–12.7; control line on dusk 3.75 (UI ≥ 3); marigold focus on night 10.4; placeholder 5.3; landing lede on the limb glow 4.95; muted text on the ambient lobe 5.23. The first pass had two misses (lede 4.18, ambient core 3.22), both fixed before commit.
- Frame-time sanity check (`nimbalyst-local/tmp-ui-redesign/perf.mjs`) uses the same pattern as `tmp-biome-integration/perf.mjs`: headed Chrome at 1280×780, sample 0, Original look, W then S. In play with the new HUD: p50 16.7, p95 17.0, p99 17.6, max 25.1 ms, 0 frames over 50 ms. Pause overlay up: p50 16.7, p95 17.0 ms. The recorded baseline was p50 17.7 ms, so there is no regression. Log: `nimbalyst-local/design/shots/perf/log.txt`.
- All screenshots were taken on a disposable Vite on 127.0.0.1:5291 with a private cacheDir under the OS temp folder. /api was mocked (GET /api/levels → []; everything else 404; non-GET aborted; foreign hosts blocked). Every run logged 0 blocked writes and 0 page errors. Protected ports were never touched. The server was stopped at the end.

## Screenshot index
`nimbalyst-local/design/shots/before/` (42 PNG) and `.../after/` (46 PNG). Same names in both, except the editor, which has after shots only. Harness: `nimbalyst-local/tmp-ui-redesign/{shoot.mjs, gallery/, vite.config.mjs}`. The gallery renders the real screen components and the real `<Hud>` with fake props over a sample image.
- Marketing: landing-1440, landing-1440-full, landing-375, landing-375-full, design-kit
- Creation: capture-app-1440/375, capture-photo, review, customize, customize-error, customize-375, preview, preview-loading, preview-failed, preview-375, ready
- Loading / error / toast: loading, toast (three toasts + modal), hud-loading, hud-error
- HUD (gallery, 1280×720): hud-invite, hud-invite-settings-open, hud-paused, hud-paused-settings-open, hud-play (intro chip + subtitle), hud-play-1440 (1440×900), hud-sound-open, hud-focus-ring, hud-feedback (checkpoint/colour toast + climb prompt), hud-portal, hud-complete, hud-recording
- Real game (Lost Colors sample, 1280×720): game-01-loading, game-02-prestart (lit Play), game-03-in-play (fragment count 0/3), game-04-paused*
- Finish / share: finish, finish-sample, finish-375, friend, friend-375
- Editor (after only): editor-1440(-full), editor-375(-full)
- Perf: shots/perf/perf-in-play.png, perf-paused.png

## Known limitations
- *In headless Chrome the real game never acquires pointer lock, so `game-04-paused` shows play continuing rather than the pause card. The paused card, including Look & adventure open, is covered by `hud-paused*`: the real `Hud` plus the real `AdventureControls` in the gallery. The headed perf run did pause for real (`perf-paused.png`).
- The editor has no before shot. It was added to the harness after the edits, and stash/reset were off-limits.
- Full-page screenshots show the fixed ambient horizon ending at the first viewport. That is a capture artifact: in a browser it stays fixed to the viewport.
- The creation steps that need live job polling (WorldProgress, legacy Generation) were not captured on their own. They are built from the same kit classes and tokens.
- The objective pointer's distance label rotates with the arrow. That is existing GameView behaviour (visible in the before shots) and was left alone because it is gameplay code.
- `tests/e2e/browser/qa/layout-accessibility.qa.test.ts` expects an older landing headline ("Your everyday objects. Extraordinary little worlds."). It was already stale before this work (the headline was "Your sofa is a mountain range." at f3b9477). Playwright e2e was not run, per scope.
- The native range-slider track in the Sound panel uses Chrome's dark default track with a lavender `accent-color`. It was not custom-drawn.

## Arch removal audit (2026-09-26, user feedback: "this weird horseshoe thing")
The standalone glowing arch (`PortalArch` in `src/ui/components/Scenery.tsx`, styled by `.wk-arch*` in kit.css) was meant as a doorway, but it does not read as one. Every UI instance is removed or replaced below. The in-game portal (a ring, `src/game/render`) is out of scope and unchanged.

| # | Where | Instance | Replacement |
|---|---|---|---|
| 1 | Landing, "From photo to explorable world", right frame ("The same corner") | `PortalArch.wk-transform__arch` behind the live 3D model | No arch. The model stands on a soft contact shadow (an elliptical floor shadow under it) on the pale stage. |
| 2 | Landing, "Your worlds" invite card (signed in: "Your worlds are waiting"; signed out: "Keep every world you make") | Arch + tiny explorer on an empty lavender field | Two real in-game renders, newly captured in the Snowy Alpine and Autumn Forest looks, as a small stack of saved prints: a picture of what "your worlds" are. |
| 3 | Landing, final CTA just above the footer (night room) | Neon arch over the explorer in the dark room photo | Kept the real night-room photo and the explorer; a soft floor-glow disc under the explorer, no arch. |
| 4 | Landing footer | No arch in the footer itself; the user's "near the footer" is #3 | n/a |
| 5 | Dashboard "My worlds", tile with no picture ("Untitled world" etc.) | Arch + explorer as placeholder | A neutral blank print with a photo glyph and the line "No picture yet". Never the arch. |
| 6 | Dashboard "Jump back in" picture when the latest world has no picture | Same arch placeholder | Same blank-print placeholder as #5. |
| 7 | Dashboard empty library ("Your first world starts with a photo") | Arch + explorer | The blank print waiting for a photo, matching the copy and the capture step. |
| 8 | Create, step 1 drop zone | Faint arch (30% opacity) behind the drop target | Removed; the tilted blank print with the photo glyph already carries the step. |
| 9 | Loading screen (`LoadingScreen`) | 56 px arch above the spinner | Removed; the three-dot spinner and the stage text remain. |
| 10 | Finish, postcard | Large arch behind the tilted postcard print | Removed; the print sits on the lavender horizon alone. |
| 11 | Finish, fallback island (no postcard) | CSS arch `.oq-finish__portal` (rounded-top horseshoe) on the island | Redrawn as a ring, the shape of the real in-game portal, so it depicts the actual objective. |
| 12 | Create, step 4 "world is being built" | Preview image clipped to an arch (`999px` top radius) | Ordinary card radius. A photo cut into a doorway is the same motif. |
| 13 | HUD pause / click-to-play / complete cards | Arched card top (`999px … / 150px`) with a purple inset line along it | Judgement: left unchanged. On the real 28rem card the top is a wide, shallow dome (see `shots/arch-removal/before/hud-paused.png`), not a U; it reads as a card shape, not the standalone horseshoe. `src/game/hud/hud.css` was not touched. |
| 14 | `kit.css` card top edge line ("portal rim in miniature") | A straight purple line on a rounded rectangle | Kept: not an arch. Comment reworded. |
| 15 | Dead code | `PortalArch` export, `.wk-arch*` rules, `.oq-loading__arch`, `.wk-*__arch` layout rules | Deleted. `TinyExplorer` and `GiantButton` stay (still used). |

**Result:** committed as the arch-removal commit (hash in the report). Before/after: `nimbalyst-local/design/shots/arch-removal/{before,after}/` (landing 1440/375 full + showcase/invite/final-CTA crops, dashboard with and without pictures + empty + 375, capture, finish (island + postcard + 375), friend, loading, HUD paused/settings-open/invite/complete). Harness: `tmp-ui-redesign/arch-removal.mjs`, gallery views `dashboard*`. New renders: `public/landing/library-{alpine,autumn}.webp`.
