You are coordinating a UI redesign for Wanderkin.

The current implementation has improved from the original, but it still feels too dark, too empty, too screenshot-heavy, and too much like a collection of isolated landing-page compositions.

I want you to redirect the UI worker toward a LIGHT-THEME redesign that preserves Wanderkin’s purple identity and miniature-world fantasy.

This is NOT a simple color inversion. The worker should rethink section surfaces, spacing, hierarchy, card composition, screenshot framing, and visual rhythm.

==================================================
HIGH-LEVEL DESIGN DIRECTION
==================================================

Wanderkin should feel:

- light
- playful
- premium
- slightly magical
- spatial / dimensional
- product-focused
- distinctly purple

The current site uses deep purple as the background almost everywhere. This makes the page feel muddy and causes screenshots, cards, and decorative elements to blend together.

Move to:

- light off-white / lavender backgrounds for most of the product
- white or pale-lavender cards
- dark plum text
- purple as the primary accent
- soft purple glows where useful
- occasional dark cinematic sections only when they deserve emphasis

The hero can remain dark.

The rest of the site should mostly be light.

The intended feeling is:

“a clean, modern product site with cinematic purple moments”

NOT:

“a dark-mode site where every section is trying to be a hero.”

==================================================
COLOR SYSTEM
==================================================

Use approximately:

Page background:
#FAF7FF

Alternate section background:
#F2EBFF

Card / elevated surface:
#FFFFFF

Subtle border:
#E7DDFC

Primary text:
#24143D

Secondary text:
#5A4C74

Muted text:
#7C6E95

Primary purple:
#7B5CFA

Stronger / hover purple:
#6846F5

Soft glow:
rgba(123, 92, 250, 0.18)

Warm accent:
#F2C46D

Deep cinematic purple, used sparingly:
#120221
or similar

Do NOT flood every surface with purple.

Purple should become more powerful because the surrounding UI is light.

==================================================
GLOBAL LAYOUT / SPACING SYSTEM
==================================================

One major issue is inconsistent rhythm and excessive empty space.

Create and enforce a consistent spacing system.

Suggested desktop system:

- max content width: 1200–1280px
- horizontal page padding: 32px minimum
- section vertical padding: roughly 96–128px
- major internal section gap: 48–64px
- normal content gap: 24–32px
- small UI gap: 12–16px
- card padding: 20–28px
- grid gap: 24px

Avoid giant blank voids unless they serve a very intentional composition.

Related content should feel visually grouped.

Do not give every element equal spacing.

Use:
- tight spacing inside a content group
- generous spacing between groups
- larger spacing between major sections

==================================================
VISUAL SYSTEM
==================================================

Preserve the Wanderkin visual identity:

- portal / arch motif
- miniature scale
- giant household objects
- soft purple glow
- rounded geometry
- subtle fantasy / whimsy
- household objects becoming landscapes

But apply these motifs with restraint.

Use one strong visual idea per section rather than filling every section with decoration.

Avoid generic:
- random blobs
- excessive glassmorphism
- glow on everything
- flat purple boxes
- generic SaaS card grids

The visual concept should always support:

“ordinary objects become enormous when you are tiny.”

==================================================
HERO
==================================================

Keep the hero primarily dark.

It is already the strongest part of the website.

Preserve:
- large typography
- cinematic lighting
- strong purple atmosphere
- portal / arch language
- clear CTA hierarchy

Do not force the hero into light mode simply for consistency.

Instead use the hero as the dramatic entrance, then transition into the lighter product experience.

==================================================
PHOTO → GENERATED WORLD SECTION
==================================================

Current issue:
It still feels like two assets floating in a large dark area.

Redesign this section on a light background.

Present it as a clear transformation:

PHOTOGRAPH
→
GENERATED WORLD

The original photograph and reconstructed world should each feel intentionally framed.

Use:
- white / light surfaces
- subtle borders
- slight depth / shadow
- rounded corners
- better alignment

The generated world can retain a purple portal or glow behind it.

The connection between the two can use:
- directional line
- subtle animated path
- small portal transition
- transformation arrow

Do not make the connector visually overpowering.

Add clear editorial framing such as:

Heading:
“From photo to explorable world”

Supporting text:
Wanderkin rebuilds an ordinary object in 3D and turns it into somewhere you can walk through.

The section should read immediately without needing the user to infer what the two images mean.

==================================================
HOW IT WORKS / 3-STEP SECTION
==================================================

Current steps:

1. Photograph it
2. Watch it get big
3. Shrink and explore

The concept is good.

The implementation still feels like three somewhat unrelated visual blocks.

Redesign this as one coherent journey.

Requirements:

- light background
- consistent card / image framing
- consistent visual dimensions
- aligned text baselines
- aligned titles
- consistent image aspect ratios where possible
- connected directional path between stages

Do not let step 2 have a completely different visual weight from steps 1 and 3.

The three steps should visibly belong to the same system.

A subtle purple dotted / glowing line can connect them.

Keep the numbering, but treat it as a small accent rather than the dominant visual element.

==================================================
SEWING BUTTON / SCALE STATEMENT SECTION
==================================================

Current statement:

“At this size, a sewing button is a planet.”

The copy is good.

The section is too tall and too empty.

Do NOT use another near-full-screen dark section containing mostly whitespace.

Instead turn it into a visual interlude.

Possible layout:

LEFT:
large statement

RIGHT:
large cropped sewing button / household object

or:

centered text with a huge object partially entering from the edge

Use a pale lavender or slightly tinted background.

This section should break the rhythm, not stop the page.

Aim for roughly 50–65vh rather than another giant hero-sized block.

==================================================
WORLDS TO BORROW
==================================================

The new image-led direction is good.

Keep that.

However, make it fit the lighter product system.

Use:
- light section background
- strong large world thumbnails
- subtle surface treatment
- clean card hierarchy
- restrained purple overlays

The cards should feel like selecting worlds / games, not like SaaS feature cards.

Preserve one large featured world and smaller secondary worlds if that composition works.

The cards should prioritize:

1. environment image
2. title
3. mode / metadata
4. primary action

Do not overload cards with controls.

Primary:
Play

Secondary:
Edit course / other actions

Keep the secondary actions visually quiet.

Remove or better integrate floating text such as:
“Built in already. Keyboard controls.”

That metadata currently feels detached.

Either:
- move it into the section heading / subheading system
or
- remove it

==================================================
YOUR WORLDS
==================================================

This is currently one of the weakest sections.

It still feels like:

image
title
metadata
buttons

placed into a loose grid.

Redesign it as a polished visual library.

Each world card should contain:

- large thumbnail
- status badge overlaid on thumbnail
- world title
- concise metadata
- one clear primary action
- demoted secondary actions

Recommended hierarchy:

Primary:
Play / Resume

Secondary:
Edit
Export
Play saved
etc.

Secondary actions should not compete visually with the primary action.

Consider:
- text actions
- icon buttons
- overflow menu

Use white cards or extremely light surfaces on the light background.

Cards should have:
- subtle border
- restrained shadow
- consistent image aspect ratio
- coherent internal spacing

Do NOT make them giant purple rectangles.

The WORLD IMAGE should be the visually dominant element.

==================================================
FINAL CTA
==================================================

Current composition with large left-aligned copy and visual on the right is structurally good.

Adapt it to the light theme.

Use:

- light background
- dark plum headline
- white / pale-lavender visual frame
- portal / glow retained inside the visual
- clear primary CTA
- quieter secondary CTA

The final section should feel conclusive and polished rather than simply another content block.

==================================================
SCREENSHOT / IMAGE TREATMENT
==================================================

Screenshots should not simply float directly on the page.

Give them consistent framing.

Use a system such as:

- rounded corners
- subtle lavender border
- soft shadow
- small background surface
- proper aspect ratios
- consistent radii

Do NOT over-frame every image with thick cards.

The goal is refinement, not heavy chrome.

When possible, crop screenshots to the most interesting gameplay view.

Do not use weak or visually empty screenshots if a stronger crop exists.

==================================================
SECTION RHYTHM
==================================================

The page should alternate between:

1. dramatic / visual
2. clean / explanatory
3. visual
4. clean / product-focused

Do not make every section equally dramatic.

Suggested rhythm:

DARK HERO

LIGHT transformation section

LIGHT / slightly tinted how-it-works section

VISUAL INTERLUDE with giant object

LIGHT Worlds to Borrow

LIGHT Your Worlds / product library

OPTIONAL subtle purple divider / environmental moment

LIGHT final CTA
or a restrained DARK final CTA if the transition feels stronger

The design should breathe, but not feel empty.

==================================================
TYPOGRAPHY
==================================================

Keep the existing typography direction unless there is a strong implementation reason to change it.

Improve hierarchy through:
- size
- weight
- line height
- width
- spacing

Do not solve hierarchy with excessive color variation.

Large marketing headings can remain expressive.

Product UI headings should become tighter and more functional.

Avoid extremely wide paragraph lines.

==================================================
INTERACTION / MOTION
==================================================

Use subtle motion only where it supports the experience.

Examples:
- thumbnail zoom on hover
- slight card lift
- glow intensity change
- portal pulse
- directional path animation
- image parallax only if subtle

Avoid unnecessary continuous animation.

The site should feel polished, not noisy.

==================================================
RESPONSIVENESS
==================================================

Do not treat desktop layout as fixed.

On smaller screens:

- stack transformation sections vertically
- ensure the 3-step journey becomes a vertical sequence
- keep clear spacing
- make world cards full-width or 2-column depending on width
- preserve image hierarchy
- avoid decorative objects covering content
- reduce giant decorative illustrations aggressively

The visual concept should survive responsively without breaking usability.

==================================================
IMPORTANT IMPLEMENTATION RULES
==================================================

1. Do not merely change CSS variables from dark purple to white.
2. Revisit the structure and composition of every major section.
3. Remove visual elements that only worked because of the dark theme.
4. Add surfaces where light-mode hierarchy requires them.
5. Reduce excessive vertical emptiness.
6. Preserve strong existing ideas rather than replacing everything.
7. Keep the hero dark unless the redesign clearly proves a better option.
8. Make screenshots and world imagery visually dominant wherever the content is about generated worlds.
9. Reduce the prominence of secondary buttons and utility actions.
10. Use the purple identity strategically rather than everywhere.
11. Do not create another generic SaaS landing page.
12. Keep the miniature-world / giant-household-object fantasy visible throughout the product.

==================================================
WORKFLOW
==================================================

Before implementing:

1. Audit the current page section by section.
2. Categorize each section as:
   - cinematic
   - explanatory
   - product / functional
   - interlude
3. Decide which sections should be light, tinted, or dark.
4. Establish global color, spacing, border radius, surface, and typography tokens.
5. Then implement the redesign using those shared tokens.

Do NOT redesign each section independently.

The final result must look like one coherent visual system.

Once implementation is complete, do another pass specifically for:

- vertical rhythm
- inconsistent card dimensions
- oversized empty areas
- weak screenshot crops
- button hierarchy
- background transitions
- excessive glow
- excessive purple
- misaligned headings
- inconsistent margins

The goal is to make Wanderkin feel visually intentional from the first viewport through the final CTA.