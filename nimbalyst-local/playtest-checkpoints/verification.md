# Independent QA verification — items 6, 10, 13, 11/12, 1-5/7-9

## Update: navigation's async-route race (from the items-6 section below) is now fixed

`fb2500d` (`fix: stop a stale async route resolution from un-navigating the user`) adds
`createNavigationGuard()` — a generation-token counter — and wires it through all three
navigation entry points (initial load, `popstate`, `go()`). Read the diff and ran
`src/ui/routing.test.ts`: **12/12 pass** (8 original + 4 new deferred-fetch regression tests
covering the exact race). This closes the bug reported earlier in this file. No further action
needed on item 6.

## Update: items 1-5/7-9 (interface/brand freeze)

Reviewed the committed interface-owner slices `0e5c615` (brand/landing/Look step),
`3951715` (editor/API copy consistency), `184dadc` (AA contrast fix) — confirmed all three
hashes match exactly what was reported, no invention. Tree is fully clean at review time (no
interface files dirty); `npx tsc -p tsconfig.json --noEmit` is clean tree-wide (the previously-
disclosed `Logo.tsx` error other workers flagged earlier tonight is gone). Source remained
read-only throughout; no edits made.

### Item 9 — same-source style variants: verified genuine, not a filter trick

- `public/style-previews/provenance.json`'s recorded sha256 for the reference and all three
  generated originals were independently recomputed from the actual files on disk — **all four
  match exactly**. The "reference" original is also byte-identical to `public/samples/photo-4.jpg`
  (same hash), confirming it really is the repo's existing photo, not a new upload standing in.
- Viewed all four images directly (`room-photo.jpg`, `room-cartoon.jpg`, `room-hand-painted.jpg`,
  `room-watercolor.jpg`). **This is a real, visual confirmation, not just trusting metadata**: all
  three "styled" images are unmistakably the same room, camera angle and composition as the
  reference (same door, same three framed pictures in the same positions, same desk/laptop, same
  sofa, same dream-catcher on the right) — genuinely re-rendered in three distinct techniques (flat
  cel-shaded outlines / visible oil brushwork / translucent watercolour washes with paper grain),
  not a CSS filter or a swapped-in unrelated stock image. This directly satisfies item 9's
  requirement.
- `styleExample.test.ts` re-run independently: **8/8 pass**.
- Cost accounting cross-checked against `provenance.json`: 3 `kontext-edit` calls,
  `fal-ai/flux-pro/kontext`, `$0.042` each = `$0.126` total, `fallbackUsed: false`,
  `automaticRetries: 0`. Matches the coordinator's figures exactly, and the file itself is explicit
  that this is a submission-time estimate, not a settled-charge claim — appropriately hedged, no
  correction needed. `originals/` total is genuinely ~1.3 MB across the four full-resolution files
  (`264878 + 540364 + 37279 + 481794` bytes), shipped alongside 1120px web copies for the app to
  actually use — accepted as reasonable, unrequested to slim down per the coordinator's framing.

### Brand visible surfaces

Swept `src/`/`index.html` for stray old-name text outside storage keys/protocol ids (which are
correctly, deliberately preserved — `objectquest:*` localStorage keys, `.objectquest.json` bundle
back-compat, `window.__objectquest` diagnostics global, `objectquest-bundled-cc0` provenance id —
none of these are user-visible and none should be renamed).

**Found one real, concrete, user-visible miss, outside interface's own owned paths:**
`src/capture/screenshot.ts:101` — `context.fillText("OBJECTQUEST", 1111, 611)` — draws a solid
badge reading **"OBJECTQUEST"** into the bottom-right corner of every composed world screenshot
(`captureWorldScreenshot`, called from `PlayScreen.tsx:92` on course completion). This image is
what the Finish screen shows and what a player downloads/uses for the animated postcard — a
real, highly visible branded artifact still carrying the old name, missed by both the interface
sweep (this file is outside their owned paths — `src/capture/*` is explicitly excluded) and the
navigation owner's brand sweep (which only touched `capture/recorder.ts`'s filename stem, per
their own checkpoint, not `capture/screenshot.ts`). Exact scope for whoever takes the fix: one
line, `src/capture/screenshot.ts:101`, replace the literal string with `BRAND_NAME` (or a
suitably short uppercase form of it) from `src/brand.ts` — same pattern already used correctly in
`api.ts` and `recorder.ts`. No screenshot needed to see this one; it's a literal string in source.
**Severity: medium** — not a functional bug, but a plainly visible, easy-to-fix brand miss on an
artifact players actually take away from the app.

Everything else brand-visible checked clean: `index.html` title/meta/favicon/theme-color all say
Mousehold; landing, editor, and API error copy all confirmed on-brand (see below); the
`722f9fa`/`BRAND_SLUG` recorder fix from the navigation owner is confirmed still in place and
correct — no residual issue there, the coordinator's note that it's "stale" is right, no new
finding needed.

### Responsive landing / editor — spot-checked live, not just trusting the interface worker's own screenshots

- `/` at 1440×900 (real screenshot, viewed directly): pine arrival band, marigold "Make my world"
  button, Fraunces display headline, clean 2-column hero — matches every claim in `interface.md`,
  no layout defects observed.
- `/` at 390×844: `document.documentElement.scrollWidth` (374px) does not exceed the viewport
  (389px) — **no horizontal overflow**, confirming genuinely responsive layout at mobile width
  (checked via DOM measurement after the browser's own screenshot tool became unreliable
  mid-session; this is an equally valid, arguably more precise check for "does anything overflow").
- `/edit/level-0ed836ff` at 390×844: computed `body` background is `rgb(242, 239, 229)` — the new
  warm plaster tone, confirming the editor genuinely repainted off the old dark-violet identity
  (not just claimed) — and again no horizontal overflow.
- Did not independently re-verify the Create step 2 (Look/Adventure headings, item 8) live — doing
  so needs a real prepared asset, which requires either a generation job or reusing existing saved
  data; judged not worth the side-effect risk for a layout check already covered by the interface
  worker's own 1280/390 screenshots and passing tests. Flagging as not independently re-verified
  rather than silently accepting it.

### Capture/HUD "kept dark" surfaces — determined intentional, not a defect

Read `src/capture/media.css` and `src/game/hud/hud.css` in full. Both use near-black translucent
panels (`rgba(13,17,25,…)`, `rgba(8,11,16,…)`, `#151321d9`) with near-white text — **not** a
"dark violet" brand identity left behind; these are neutral dark scrims, a different design
language than the old `--oq-bg` violet that was actually swept from the editor/finish screens (see
below). This matches `interface.md`'s own "kept deliberately dark" rationale: the 3D stage, the
capture pill, and the in-play HUD sit over unpredictable live content (a rendered scene), where a
light panel from the page theme would be unreadable against dark parts of the scene.

Computed actual WCAG contrast ratios rather than eyeballing it, for the pairs most likely to be
marginal (small text, stacked/compounded opacity):
- `.oq-hud__primary` button text `#24160c` on `#ff8a4c`: **7.52:1** (AAA).
- `.oq-hud__card` paragraph text (74% opacity) on the card background: **~9.56:1** (AAA).
- `.oq-hud__controls dd` (compounded ~58% effective opacity, the most-reduced text in the file) on
  its panel background: **~6.32:1** (still comfortably AA, close to AAA).
- Re-checked the same pairs against a deliberately adversarial assumption — a **bright** part of
  the 3D scene showing through the translucent panel instead of a dark one (the actual worst case
  for light-text-on-dark-scrim, since transparency lets scene brightness raise the effective
  background luminance): most pairs still cleared AA comfortably (5.5-16:1), but
  **`.oq-hud__objective-label`** (the small uppercase "CHECKPOINTS"-style label, `font-size:
  0.68rem` ≈ 11px, opacity 0.62, nested inside the `rgba(13,17,25,.62)` objective panel) dropped to
  **~3.23:1** under this assumption — below the 4.5:1 AA threshold for small text.
- **This is a theoretical/unconfirmed risk, not a demonstrated defect**: I picked an arbitrary
  bright-scene RGB value for the "worst case," not one measured from an actual bright moment in
  real gameplay footage, and I could not get a stable interactive pointer-locked 3D session running
  in this headless environment to check it empirically (same limitation noted in the item 6/13
  section below). Flagging with that explicit caveat rather than calling it a confirmed bug.
  Exact scope if the coordinator wants it addressed: `.oq-hud__objective-label` in
  `src/game/hud/hud.css` — either raise its opacity or the panel's own background opacity slightly;
  narrow, low-risk, does not need a redesign.
- **Verdict: capture/media.css and hud.css do not need a "recolor to match the new brand" —** that
  would actively hurt legibility over 3D content and was correctly not done. The one item above is
  a minor, unconfirmed, low-severity contrast question about one small label under an edge-case
  lighting condition, not a brand-consistency defect.

### Item 7 (editor consistency) / finish-screen sweep

Read the `3951715` diff for `finish-screen.css` directly: the old gradient's lilac middle stop
(`#f7efff`) and violet-tinted shadow (`#49345f24`) were genuinely replaced with green/plaster tones
consistent with the rest of the rebrand (`#f6f2e4`, `#e4efe4`, shadow `#1d3a2e26`), and the
ALL-CAPS eyebrow was converted to sentence case matching the rest of the app. Confirms the
Play/Finish overlays were actually swept, not just the landing/editor — narrower and more
convincing than trusting the summary claim in `interface.md` alone.

### Summary for coordinator (interface freeze)

One concrete, medium-severity, easy-to-fix finding: `src/capture/screenshot.ts:101` still stamps
"OBJECTQUEST" onto every exported world screenshot/postcard — outside interface's own owned paths,
so not something the freeze should be blocked on, but real and worth a one-line fix by whoever owns
`src/capture/*` next (was navigation's `PlayFrame.tsx`/`AudioControls.tsx`-adjacent territory).
One minor, unconfirmed, low-severity contrast question flagged for awareness only (`.oq-hud
__objective-label` under a hypothetical bright-scene condition I could not empirically trigger).
Everything else checked — same-source style provenance (hashes + direct visual comparison),
responsive landing/editor at real widths, brand text sweep, finish-screen violet removal, api.ts/
recorder brand copy, media cost accounting — came back clean and is independently confirmed, not
just accepted from the checkpoint's own claims.

### Full combined check: deferred, not run

Per the coordinator's framing, the gameplay owner is still finishing its "bounded camera check" and
may have uncommitted render polish — item 11/12's moving delta is explicitly not final-approved
(see the section above; it stands as-is for the last committed snapshot only). Since not every
owner has declared freeze, I did **not** run the combined typecheck/build/full-unit/HTTP +
browser pass this round — only a bounded `tsc --noEmit` sanity check (clean) plus the targeted
test files/browser checks documented above and in the items-11/12 section. Recommend the
coordinator request the combined check once gameplay's camera-check commit lands and it
explicitly declares freeze.

---

## Update: items 11/12 (character + miniature scale)

Added after the items-6/10/13 section below, same worker/session, extending scope on
coordinator request. Reviewed the **committed snapshot** at `1c5fb0d` (authored character),
`10e4cbb` (face fix), `07d9d82` (miniature scale) — not the gameplay owner's in-flight
uncommitted polish (`src/game/render/PlayerAvatar.tsx`, `src/game/render/character/
buildCharacter.ts`, `src/game/render/character/characterDesign.ts`, `nimbalyst-local/
character-preview.ts`, `nimbalyst-local/shoot-sofa.mjs` were all dirty at review time — left
untouched, not staged, not re-tested against). Confirmed via `git log 3b159b1..HEAD -- <core/
scale files>` that `src/game/core/characterScale.ts`, `simulation.ts`, `placementValidation.ts`,
`GameStage.tsx` are **not** part of that dirty set, so both source reading and targeted test
runs against the live tree faithfully reflect the frozen `07d9d82` snapshot for those files.

Ran only the tests whose full import graph is clean (not touching the dirty character-render
files), per "no duplicate full suite until all owners frozen":
`characterScale.test.ts` (14), `authoredCourse.test.ts` (4), `simulation.test.ts` (17),
`mantle.test.ts` (14), `placementValidation.test.ts` (2) — **51/51 pass**. Did not re-run
`characterGeometry.test.ts` / `characterRig.test.ts` (both import `characterDesign.ts`, which is
currently dirty — a live run would validate in-progress polish, not the frozen commit) or the
full 463-suite. Relying on the gameplay owner's own prior report (163/163 at commit time) for
the render/animation slice; did not independently re-verify it.

### Findings, severity-ranked

**1. [Low severity, concrete, verified — not "cosmetic" hand-waving] `GameStageProps.config` is dead code, and the previously-disclosed diagnostics mismatch traces to it.**
`src/game/render/GameStage.tsx` declares `config: MovementConfig` in `GameStageProps` (line 40)
and `GameView.tsx:604` still passes it (`config={config}`, the *raw authored* `DEFAULT_MOVEMENT_CONFIG`
from `GameView.tsx:89`) — but `GameStage`'s destructure (lines 64-79) **does not include `config`
at all**; it is immediately re-derived at line 97 as `const config = simulation.config` (the
miniature-scaled one), with a clear comment explaining this is deliberate anti-fake-scale
behavior. So the prop is genuinely inert, not merely unused-but-harmless: nothing reads it.
I independently traced all three size-critical consumers back to this same `simulation.config`
object and confirmed they agree: `GameSimulation`'s physics scene (`simulation.ts:184`,
`createPhysicsScene(..., this.config)`), `GameStage`'s `CameraRig` (`GameStage.tsx:99`), and
`PlayerAvatar` (confirmed in the committed `10e4cbb` version: reads `config.characterHalfHeight`/
`characterRadius`/`walkSpeed` directly for body height and foot placement). Collider/render/camera
consistency is real, not asserted.
Concrete low-risk correction: delete the unused `config` prop from `GameStageProps` and its
`GameView.tsx:604` call site (or, if GameView wants to keep passing something, source it from
`simulation.config` instead of the module-level raw `config`). This doesn't fix a live bug — the
dead prop is provably never read — but it removes a footgun where a future edit could start
reading it again and silently reintroduce the exact fake-scale drift this design avoids, and it
is the direct explanation (confirmed, not just noted) of why `GameView.tsx:335`'s
`movementConfigId: config.id` diagnostic reflects the raw/authored config object rather than the
simulation's derived one.
Also checked the *other* place `GameView.tsx` reuses the raw `config`: `InputController`
(`GameView.tsx:278`). This is **not** a bug — `InputController` only reads
`config.camera.minPitchRadians`/`maxPitchRadians`, fields `toMiniatureScale` deliberately leaves
untouched (only `camera.distance`/`collisionPadding` are scaled) — so authored vs. miniature is
irrelevant there and no correction is needed.

**2. [Informational, immaterial] Minor test-count discrepancy.** `gameplay.md` states
"`characterScale.test.ts` (13 new)"; the committed file actually has 14 `it(...)` cases (all 14
pass). Not a defect, just noting a claim I could check precisely and found slightly off.

**3. [Confirmed correct, no action needed] Idempotency / no double-shrink.**
`toMiniatureScale` guards with `isMiniatureScale` (capsule height already ≤ target) and returns
the *same object reference* when already miniature — `characterScale.test.ts` pins this with
`expect(toMiniatureScale(MINIATURE)).toBe(MINIATURE)` (reference equality, not just deep-equal).
Verified this is a real strict-identity check, not a weaker approximation.

**4. [Confirmed correct, no action needed] Spawn/respawn/reset consistency.**
Traced `seat()` (wraps `reseatCapsuleCentre`) to all three places a capsule position is set:
constructor (`simulation.ts:198`), `respawn()` (`:619`), and `reset()` (`:626`) — all three
re-seat using the authored-vs-scaled half-height difference before placing the capsule, so a
saved spawn or checkpoint respawn authored against the old 0.70 m capsule lands the *feet*, not
the centre, in the same place for the new 0.35 m capsule. No path bypasses this.

**5. [Confirmed correct, no action needed] The `walkMaxSpan` nuance is real and the margin is
concretely pinned, not just asserted.** `characterScale.test.ts`'s
`"keeps every previously-walkable gap well inside the unchanged jump range"` test asserts
`authoredLimits.walkMaxSpan < miniatureLimits.flatJumpRange * 0.75` — i.e. even the **larger**
(authored, pre-shrink) walk span stays comfortably under 75% of the (scale-invariant) flat jump
range. Since jump range doesn't change between scales and is always available to the player
regardless of how the course validator classifies an edge, any gap the old walk-span math judged
crossable remains reachable (by jump if not by walk) at miniature scale. This is a real proof,
not a hand-wave — confirmed by reading the assertion, not just the prose comment above it.

**6. [Confirmed correct, no action needed] `placementValidation.ts` validating against the
*authored* (not miniature) config is genuinely the stricter/safer choice.** Reasoned through
both categories of limit `deriveMovementLimits` produces: (a) distance-based limits (jump height,
flat jump range, walk speed, step height, mantle ledge/reach) are proven *exactly equal* between
scales in the tests, so scale choice is irrelevant there; (b) clearance-based limits only get
*more permissive* at miniature scale (smaller body fits more gaps), so authored-validated courses
can only stay valid or improve at miniature scale; (c) `walkMaxSpan` is the one limit that shrinks
at miniature scale, but per finding 5 above, even the larger authored value is already
comfortably under the (unchanged) jump range, so this can't create a course that validates as
walkable under the authored config but becomes truly unreachable at miniature scale. All three
points independently verified, not accepted on the checkpoint's word.

**7. [Supportive, not authoritative] Visual spot-check.** Viewed `nimbalyst-local/screenshots/
character/idle-front.png` and `grid-all-states.png`: a single coherent sculpted mesh, legible
face (eyes, eyebrows, subtle smile, no "bandit mask" or inside-out shading), no visible
assembled-primitive seams. Consistent with the "authored character" and "readable face" claims.
Caveat: these screenshots were generated by `nimbalyst-local/character-preview.ts`, which is
itself currently dirty/uncommitted, so their exact provenance relative to the frozen `10e4cbb`
commit vs. later in-progress polish is not confirmed — treat as supportive context only. Final
visual/subjective acceptance is the user's call regardless, per the plan.

### Summary for coordinator (items 11/12)

No functional defects found in the committed miniature-scale/character-consistency logic —
scale transform, spawn/respawn re-seating, idempotency, and the walkMaxSpan/jump-range safety
margin all check out under direct source inspection and targeted, passing tests (51/51) run
against files confirmed unaffected by the current in-flight polish. One concrete, low-risk,
non-urgent cleanup identified (dead `config` prop on `GameStageProps`) — worth doing whenever
the gameplay/navigation owners next touch that file, not blocking. The render/animation slice
(items 11's mesh/rig/animator) was not independently re-tested this round (its tests import
currently-dirty files); relying on the prior 163/163 report plus today's visual spot-check for
that part only.

---

# Independent QA verification — items 6, 10, 13 (original)

Worker: fresh Claude-only QA/review worker, coordinator 30e37344-f303-4b8a-80c8-ee9f8fd5f3d6 (session 15c3b0c2-6158-40c2-a52d-926f2afa4f7e per the ledger).
Runtime model: **Sonnet 5** (`claude-sonnet-5`), per this runtime's own system context — recorded verbatim, not inferred.
Scope: read-only source review + targeted runtime validation of completed items 6 (real routes), 13 (pointer-lock/HUD controls), 10 (friendly sample music). No source/test edits made. No moving-interface/character diff reviewed (out of scope; still owned by Opus be45d8ac / Opus f4268081, both actively editing — did not touch their dirty files).
Own paths only: this file, and `nimbalyst-local/tmp-qa-verify/` (one small `.mjs` helper; large regenerated WAVs already deleted after use).

Reviewed at HEAD `07d9d82468e08a2263928c036dc0a8964d2fd917` (2026-09-24 ~17:13 UTC). Verified no commit after my four target commits touched any of the files I reviewed (`git log 3b159b1..HEAD -- <routing/pointer-lock/audio files>` shows only `dfd33db` itself) — so these findings are not stale relative to the moving shared tree. Interface/gameplay owners are still landing unrelated work (character scale, etc.) concurrently; not reviewed here.

Exact commits verified against the checkpoints' claims — all four hashes matched exactly, nothing invented:
- `398c7ebecf9f8d67cc20421119920ef2cc4d219f` — feat: give every screen a real, restorable URL
- `c15ddaa8a6f69f72f3c83c0fe98919ee38fe231f` — fix: make Sound and gameplay capture usable while pointer-locked
- `722f9fa17064f46a4c680b0eb4b6e21986ccf3e4` — chore: use BRAND_SLUG for the gameplay highlight filename stem
- `3b159b13abe720d35214c3017b9cf2a2dd87abfc` — docs: record peer coordination
- `dfd33dbc307874fc4ca2f58ea0812851989585fe` — fix: replace creepy bundled landing-page music with a cheerful pluck loop

## Item 6 — real URL routes

**Source review + live verification, dev server at http://localhost:5173/ (read-only GET traffic only).**

Confirmed working, via a real headed... actually headless Chromium session through the nimbalyst-browser MCP tool (this session's `browser_evaluate` worked correctly, including a real `AudioContext.decodeAudioData` call — unlike the prior worker's report of a non-functional tool; noting the discrepancy honestly, may be session/state-dependent):
- `/` loads the start screen.
- `/worlds` loads and scrolls to `#my-worlds` (`scrollY` moved from 0 to 729, target element found).
- `/#my-worlds` (legacy hash) also resolves to `/` + scrolls identically — legacy link preserved.
- `/this-route-does-not-exist` falls back to the start screen at `/` (matches `parseRoute`'s `unknown -> start` branch and `resolveSyncScreen`'s `unknown` case).
- `/play/sample-rodin-room-corner` (a real bundled-sample id, confirmed via `GET /api/levels`) resolves synchronously without a network fetch, as designed.
- `/edit/level-0ed836ff` (a real saved level, confirmed via `GET /api/levels`) resolves asynchronously via `getLevel` and lands in the editor ("Adjust your course" — an existing, pre-existing course-validation warning on that saved level, unrelated to this review).

### Confirmed bug: async-load race on rapid back-navigation (not caught by any existing test)

Reproduced live, not just reasoned from source. `App.tsx`'s `resolveScreen()` returns a `Promise<Screen>` for `edit`/`play`/`finish`/`share-play` routes (`App.tsx:174-188`). Both the initial-load effect (`App.tsx:254-269`) and the `popstate` handler (`App.tsx:271-287`) call `.then(resolved => { setScreen(resolved); navigateTo(pathForScreen(resolved), true); })` on whatever promise `resolveScreen` returns, with **no cancellation/generation guard** tied to a newer navigation superseding an older, still-in-flight one. (The initial-load effect's `cancelled` flag only guards true React-unmount, not a subsequent `popstate`.)

Live repro: patched `window.fetch` to add a 900ms delay only for `GET /api/levels/level-0ed836ff`, then via `history.pushState` + a dispatched `popstate` event: navigated to `/edit/level-0ed836ff` (slow async resolution starts), waited 100ms, then navigated to `/` (synchronous, resolves immediately — user is now legitimately at the start screen, confirmed via `location.pathname === "/"` at that point). After the delayed fetch finally resolved (~900ms later), the app **silently snapped the user back into the editor** for `level-0ed836ff` and rewrote the URL back to `/edit/level-0ed836ff` via `navigateTo(..., true)` (a `history.replaceState` call, confirmed by `location.pathname` after settling) — even though the user had already navigated away. This is a real, user-visible correctness bug: a slow `/edit/:id`, `/play/:id`, `/finish/:id`, or `/share/:id/play` load, combined with the user pressing Back (or any other navigation) before it finishes, can un-navigate them back into stale state.
- Not covered by `routing.test.ts` (which only tests the pure `parseRoute`/`pathFor*`/`navigateTo` functions, no React/App integration) — there is no `App.test.tsx` at all.
- Severity: real but narrow — requires a slow API response *and* the user navigating again within that window. Worth a fix (a generation counter or `AbortController` tied to each `resolveScreen` call, discarding a resolution if the URL has since changed) but not necessarily a release blocker; flagging for the coordinator/navigation owner to decide, not fixing myself (out of my read-only scope).

Not independently re-verified: `/share/:shareId` and `/share/:shareId/play` against a real publication — deliberately avoided triggering a publish as a side effect (read-only scope, no publication actions), same call the navigation worker made. `shareRouting.test.ts` and `routing.test.ts`'s path round-trip remain the only coverage for that path shape.

One environment note for whoever does the next headless check: the first `browser_evaluate` that triggered a full 3D editor mount (WebGL) on `/edit/level-0ed836ff` took long enough that the browser-tool round trip itself timed out at 30s, even though the page had not actually crashed (a follow-up `evaluate` call afterwards succeeded instantly and showed the editor had in fact finished loading). This is consistent with the earlier-reported "headless 3D stalls at first frame" pattern — here it eventually resolved, just very slowly, rather than hanging forever. Treat any single 30s tool timeout around a `/edit` or `/play` navigation as inconclusive on its own, not proof of a hang — a follow-up `evaluate` after the timeout can reveal the page actually finished.

## Item 13 — pointer-lock controls

**Source review** (this session did not get a stable pointer-locked 3D gameplay session running headless within a reasonable time budget — see the environment note above — so the click-to-play → lock → HUD-interaction flow was not interactively exercised end to end this session either; unit-level keyboard-path coverage is not proof the UI works, per the review brief, so treating this as source-verified, not interactively confirmed):

- `requestPointerLock()` call sites, independently grepped: exactly 3, all in `GameView.tsx` (`handleStart` line 465, `handleResume` line 474, `handleRestart` line 503) — all explicit Play/Resume/Restart user gestures. No HUD click handler (Sound, Pause, capture buttons) calls it. This directly confirms the "no accidental relock" claim by source inspection, not just trusting the checkpoint's own grep count.
- `Hud.tsx`'s Sound button (line ~211) calls `props.onRequestPointerRelease?.()` before toggling the panel, as claimed.
- `inputController.ts`'s `handleKeyDown`: `isInteractiveTarget(event.target)` guard applies before Escape/M/C (so HUD form controls keep normal keyboard behavior); `event.repeat` is checked (line 102) before the `KeyM`/`KeyC` branches (lines 104-111), so a held-down key doesn't spam-toggle mute/capture. Escape is handled before the repeat check (matches "Escape always fires even mid-repeat" being intentional).
- End-to-end wiring for `C` traced through all four files: `inputController.ts` (`onToggleCapture` callback fired on `KeyC`) → `GameView.tsx` (`onToggleCaptureRef` — a ref, so it can't go stale without an effect re-run) → `PlayScreen.tsx` (`onToggleCapture={handleToggleCapture}`, line 145) — single source of truth, no duplicate listener, matches the checkpoint's "no double-toggle risk" claim.
- Controls legend in `Hud.tsx` (`Controls()`) lists `M`/`C` for discoverability, as claimed.

No new issues found in this item beyond what the navigation worker already disclosed (headless 3D can't be interactively exercised end-to-end in this environment). The keyboard-path fix is sound by source inspection; genuine interactive confirmation (click-to-play → real pointer lock engage → HUD button unreachable by click → M/C actually mute/capture while locked) is still owed to the user's own manual playtest, consistent with the plan's explicit stance that automated evidence should not substitute for the user's subjective playtest.

## Item 10 — sample music

**Verified beyond what the sample-audio worker could check themselves** (their own checkpoint honestly flagged their browser-decode tool as non-functional in their session):

- `public/audio/lost-colors-loop.wav` is genuinely tracked and committed at `dfd33db` (`git show --stat` confirms `Bin 96044 -> 176444 bytes` in that commit, not gitignored — `git check-ignore` returns nothing). Working-tree file is byte-identical to the committed one (not in `git status`'s modified list). sha256 of the actual on-disk file (`90167b3cad74...b7051`) matches `src/audio/bundledMedia.ts`'s recorded hash exactly.
- **Reproducibility on a clean checkout, actually tested, not assumed**: copied `scripts/generate-bundled-audio.mjs` into `nimbalyst-local/tmp-qa-verify/` with only the output directory redirected (all synthesis logic untouched), ran it with plain `node`, and diffed the resulting `lost-colors-loop.wav` against the shipped file — **byte-identical sha256** (`90167b3c...`). Confirms the generator is a genuine pure/deterministic function of its code and the shipped asset is not stale or hand-edited relative to it. (Regenerated-WAV temp output deleted after the hash comparison; did not touch `public/audio/`.)
- **Real browser decode, actually obtained this session** (the prior worker's tool attempt returned empty for every expression): fetched `/audio/lost-colors-loop.wav` from the live dev server and ran `AudioContext.decodeAudioData` on the real bytes in a real (headless) browser. Result: `byteLength: 176444` (matches), `contentType: audio/wav`, decoded successfully, `duration: 4` seconds (matches recorded metadata), browser resampled to its native `48000` Hz (expected/normal — source is authored at 22050 Hz). No decode error, no truncation.
- Did not attempt a live-storage/private-world audio check (out of scope, explicitly a different asset per the sample-audio worker's own diagnosis, which this review did not need to re-litigate).
- Seam jump: the sample-audio worker disclosed a ~1.8%-of-peak amplitude jump at the loop-wrap point from their own waveform math. Did not independently re-derive this (would require reimplementing the trim/loop-point math against the decoded buffer); no audible or runtime evidence contradicts their "small soft transient, not a click" characterization, and per the review brief this alone should not block on a tiny documented splice without further evidence. Leaving as accurately disclosed, not escalating.

**Verdict: item 10's asset genuinely ships, is reproducible from source, and decodes/plays correctly in a real browser context.** No issues found.

## Summary for coordinator

- Item 6: implementation is real and mostly correct; **one genuine, reproduced-live bug** — an async-navigation race that can snap the user back into a stale screen (e.g. the editor) after they've already navigated away, if the route's data fetch is slow enough to outlast the next navigation. Not covered by any existing test (no `App.test.tsx` exists). Recommend the navigation owner (or whoever gets fix-scope) add a generation/abort guard to `resolveScreen`'s async branches. Not release-blocking on its own (narrow timing window) but should be fixed before calling item 6 fully done.
- Item 13: source-verified sound; no new issues. Still genuinely unconfirmed end-to-end interactively (headless 3D limitation, not this worker's fault) — real confirmation is owed to the user's own manual playtest as the plan already anticipated.
- Item 10: verified ships, reproducible, and decodes/plays correctly — stronger confidence than the original worker could self-report, no issues found.

No source or test files were modified. No paid/provider calls made. No live services restarted (ports 5173/8787/15173/18799 untouched). No worlds created, no saves/generation triggered — all API calls made were `GET` (`/api/levels`, `/api/levels/level-0ed836ff`, the audio file itself). Private world audio and saved positions untouched.

## Next step

Full combined verification across all three active owners is still pending their final milestones (interface, gameplay) per the plan — not started here, correctly deferred. If resumed after a quota gap: re-read this file, re-run `git log --oneline -5` to confirm the four target commits are still present and still not touched by anything newer, and re-check `git status` for what interface/gameplay have landed since before doing anything else.
