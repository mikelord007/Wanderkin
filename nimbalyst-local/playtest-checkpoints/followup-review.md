# Independent follow-up review (post-batch, three commits)

- Reviewer: fresh Claude Sonnet worker for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
- Runtime model, from this session's own environment block (not inferred): **Sonnet 5**,
  exact model ID `claude-sonnet-5`.
- Mode: read-only. No product/test files modified. All scratch computation (see
  "Evidence" below) ran in a temp/scratch dir under `nimbalyst-local/` and was deleted
  before this checkpoint was written; `git status` shows no residue from this review.
- Did not touch: the two live worktree/scale/material workers' dirty or untracked files
  (`nimbalyst-local/character-preview.ts`, `src/game/core/characterScale.ts`,
  `src/scene/materialRegions.ts`), any stash (`git stash list` only — 4 stashes present,
  none inspected/applied/dropped), or protected ports 5173/8787/15173/18799. No full test
  suite was run; only the narrow files each commit itself changed.

## Approved scope

- `a8ebc7a` — hum fix (+ `hum-followup.md`)
- `ca187e5` + `3174932` — landing-redirect fix (+ `landing-followup.md`)
- `d5ea77c` + `cc26a76` + `20e7818` — Wanderkin brand rename (+ `brand-refinement.md`)

## Findings, most severe first

### 1. [Moderate] Landing fix (`ca187e5`) trades one bug for a slower-building one: abandoned Create sessions now each leave a permanent empty "Untitled world" draft in My Worlds

**Claim in `landing-followup.md`:** clearing `objectquest:v2:active-creation` on first-step
Back "clears only the pointer, never the record… shows up as an 'In progress' card with a
Resume button in My Worlds." True as far as it goes, but the checkpoint's own test only
exercises **one** back-out cycle, so it never observes what happens on repeat.

**Root cause of the side effect (traced in code, not assumed):**
- `CreationJourneyScreen.initialRecord()` (`src/ui/screens/CreationJourneyScreen.tsx:14`)
  calls `loadActiveCreation()`; if that returns `null`, it **mints and immediately
  persists** (`saveCreationRecord` + `setActiveCreationId`) a brand-new empty record,
  every time the screen mounts.
- `loadCreationWorldItems()` (`src/ui/creationStorage.ts:90`) surfaces **every** stored
  record whose `step !== "ready"` as a My Worlds card via `toPendingWorldItem`
  (`src/ui/creationFlow.ts:151`) — there is no filter for "nothing was ever entered."
  A record at step `"photo"` with no photo and no jobs still becomes a `"draft"` /
  `"Untitled world"` / `"Resume"` card.
- **Before this fix:** the pointer was never cleared, so `loadActiveCreation()` kept
  returning the *same* stale record on every subsequent Create open — at most one stray
  draft ever accumulated (at the cost of the reported landing-hijack bug).
- **After this fix:** `handleCreationBack` clears the pointer, so the *next* time the
  user opens Create, `loadActiveCreation()` returns `null` again and a **new** record
  is minted. Repeating "open Create → back out before choosing a photo" N times now
  leaves N separate empty "Untitled world" drafts permanently in My Worlds (nothing ever
  prunes a step-`"photo"` record with no photo).

**Verified independently**, not just read: exercised the actual, unmodified
`createCreationRecord` / `saveCreationRecord` / `setActiveCreationId` / `clearActiveCreationId`
/ `loadActiveCreation` / `loadCreationWorldItems` functions from the committed tree against
an in-memory `Storage` stand-in, simulating 3 "open + immediate back" cycles:
- Pre-fix behavior (pointer never cleared): **1** stray draft after 3 cycles.
- Post-fix behavior (pointer cleared each time, i.e. what `ca187e5` actually ships):
  **3** stray "Untitled world" / "Resume" drafts after 3 cycles — one per cycle.

This is a real, reproducible behavior change, not a hypothetical. It's a UX/data-hygiene
regression (clutter, not data loss or security), and it's the kind of side effect the new
`landing-resume.test.ts` cannot catch because it only ever backs out once. Flagging per the
standing instruction not to rubberstamp a fix as fully done — the reported landing bug is
genuinely fixed, but a user who tries "Create," changes their mind, and does this a few
times over the life of the app will now see a small pile of empty drafts in My Worlds that
never goes away and (per `toPendingWorldItem`) can never resolve to "ready." Recommend a
follow-up: either prune step-`"photo"`/no-photo records when the pointer is cleared, or skip
`saveCreationRecord` for a completely empty record until it has at least a photo.

Everything else in this fix checks out: the top-level `onBack` (the one now wired to
`handleCreationBack`) only fires from `CreationJourneyScreen`'s `record.step === "photo"`
branch (`CreationJourneyScreen.tsx:112`/`116`) — every other step's Back
(`review`/`customize`/`preview`) calls a local `persist(withCreationUpdate(...))` that stays
inside the journey, confirmed by reading all four `if (record.step === ...)` branches. So
the fix cannot fire mid-journey or after a job/photo exists, and deep-link resume
(`/create/generating/:id`, `/create/prepare[/:id]`) and B10's in-flight-job resume are
untouched — no code path leading there passes through `handleCreationBack`.

### 2. [Info, no issue found] Hum fix (`a8ebc7a`) — reproduced the acoustic claim independently, not just read it

- Extracted the exact git blobs at `a8ebc7a` for the 3 regenerated WAVs and hashed them:
  `gentle-breeze.wav`/`fall-respawn.wav`/`lost-colors-loop.wav` sha256+size match
  `bundledMedia.ts`'s recorded values exactly (byte-for-byte, not just "should match").
- Recomputed the autocorrelation check myself (independent script, same method as the
  shipped regression test) on the actual committed blobs at `a8ebc7a^` (old) vs `a8ebc7a`
  (new): old = **0.989** max |r|, new = **0.022** max |r| — corroborates the checkpoint's
  reported 0.94–0.99 → ~0.06 swing; the defect and the fix are both real.
- Confirmed `seedNoise` has exactly 3 call sites in `scripts/generate-bundled-audio.mjs`
  (ambience bed, fall-respawn thud, music's percussion tap) — the melody notes themselves
  never call it, so "cheerful music preserved" is structurally true, not just asserted.
- `npx vitest run src/audio` → 6/6 pass against the current committed tree.
- `git show --stat a8ebc7a` matches the checkpoint's claimed file list exactly (7 files,
  no `engine.ts` change). No issues found.

### 3. [Info, no issue found] Brand rename (`d5ea77c`) — spot-checked the specific risk areas named in scope

- `src/brand.ts`: `BRAND_NAME`/`BRAND_SLUG` changed; storage/protocol keys
  (`objectquest:v2:*`) and `window.__objectquest` are untouched — grepped the whole
  `src/ui/creationStorage.ts`/`jobStorage.ts` key constants, all still `objectquest:`-prefixed.
- `git grep -in mousehold` across the tree at HEAD: only 3 hits, all comment-only headers
  in `tokens.css`/`styles.css`/`editor.css` — exactly the ones the checkpoint disclosed as
  "left alone on purpose." No user-visible stray old name anywhere else. No dangling
  references to the deleted `public/brand/mousehold-mark.svg` in any file.
- Bundle import compatibility: `importLevelBundle` (`src/ui/api.ts:266`) reads the file as
  text and never inspects its name/extension; the file-picker `accept` list is generic
  `.json`. Old `.mousehold.json`/`.objectquest.json` bundles are unaffected — confirmed by
  reading the actual import path, not assuming it from the checkpoint's prose.
- `npx vitest run src/ui/components/Logo.test.ts` → 7/7 pass against the committed tree,
  including the drift guard that fails if `public/brand/wanderkin-*.svg` or the
  `index.html` boot-screen SVG diverge from `Logo.tsx`'s own rendering, and the
  accessible-name/dotless-ı wiring (`mh-logo__name` visually hidden, plain "Wanderkin";
  drawn glyphs `aria-hidden`).
- Independently re-measured the capture watermark: rendered `ctx.font = "800 17px
  system-ui, sans-serif"; ctx.measureText("WANDERKIN").width` in a real disposable
  Chromium page (not the dev server) → **109.79px**, matching the checkpoint's claimed
  109.8px inside the fixed 162px pill (≈26px clear on each side). Watermark fits.
- No issues found in this commit.

### 4. [Info, unverifiable by me] Runtime-model self-reports

`hum-followup.md`/`landing-followup.md` self-report `claude-sonnet-5`, matching this
review session's own observed model. `brand-refinement.md` self-reports `claude-opus-5-5`,
cross-checked in that checkpoint against its own session transcript file — I did not have
reason or access to independently re-open that specific transcript; the claim is
methodologically sound (cites a concrete file and a count of matching records) and nothing
else in the diff contradicts an Opus-quality pass. Not flagged as a problem, just noted as
self-reported rather than re-verified by me.

## Bottom line

Hum and brand commits: clean, independently re-verified, nothing further needed. Landing
commit: fixes the reported bug correctly and narrowly, but ships a real (if low-severity)
side effect — repeated abandoned Create sessions now permanently litter My Worlds with
empty draft cards — that its own test suite does not cover. Recommend the coordinator
decide whether that's worth a fast follow-up before calling the landing item fully closed.
