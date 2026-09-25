# Checkpoint — brand refinement (Sept 25)

- Session: Nimbalyst Claude Code worker, coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`.
- Observed runtime model (from the environment block, not inferred): **Opus 5.5**,
  exact model ID `claude-opus-5-5`. Matches the required selector. No subagents.
- Re-verified from runtime response metadata, not the UI alias: the session transcript
  `~/.claude/projects/C--Users-manuj-code-barely-runs-Objectquest/d6363776-afa6-478d-8af3-97fde940169d.jsonl`
  has 214 assistant responses, and every one records `"model":"claude-opus-5-5"`,
  including the one that produced every edit and commit. The "claude-code:opus" shown
  after spawn is the UI's display alias; no other model appears in the metadata.
- Baseline: MAIN at `a8ebc7a`. Dirty and NOT mine at start: `src/App.tsx`,
  `tests/e2e/browser/landing-resume.test.ts` (finish/landing owners), untracked
  `nimbalyst-local/*` scratch.

## Owned paths

```
src/brand.ts
src/ui/components/Logo.tsx
src/ui/components/Logo.test.ts         (new)
src/ui/theme/global.css                (only the .mh-logo lockup block)
public/brand/README.md, wanderkin-mark.svg, wanderkin-favicon.svg,
  wanderkin-mark-mono.svg (new), mousehold-mark.svg (deleted)
  (fonts and licence untouched)
index.html
design-kit/index.html                  (stale "Pocket Wonder" title + missing favicon)
src/ui/theme/DesignKit.tsx             (one stale "Pocket Wonder" eyebrow -> BRAND_NAME)
nimbalyst-local/playtest-checkpoints/brand-refinement.md
```

The last two were unowned brand literals. Neither was dirty and no peer had claimed
them. Each is a one-line change.

Not touched: App, routing, Finish, media.css, audio, core, scene, game render,
StartScreen / welcome.css (landing owner), capture (reads `BRAND_NAME` / `BRAND_SLUG`
through the constants, so no edit is needed there).

## Decision

Internal shortlist: Wanderkin, Snapscape, Speck, Littlelands, Nooks & Crannies.

- Snapscape describes the pipeline, not the feeling, and leans on "Snap".
- Speck is too thin to carry a wordmark and says nothing about exploring.
- Littlelands sits too close to LittleBigPlanet.
- Nooks & Crannies is domestic-only (the same trap as Mousehold) and long.

**Chosen: Wanderkin.** *Wander* (exploring with no fixed route) + *-kin*, the old
English diminutive (munchkin, bumpkin). It names the tiny character, so the name is
about *you* being small, not about a mouse. Nine letters, fits the uppercase capture
watermark pill at the existing size. Not trademark-cleared: no web lookups were made.

Mark: a giant four-hole sewing **button** treated as a planet, with the tiny
character (teal beanie and orange suit, from the in-game model) standing just past
its top and leaning square to its curve, arm raised. That's the whole product in one picture: an everyday object becomes a world, and
a very small person is exploring it. There's a separate simplified drawing for 16–20 px
and a single-colour mono drawing.

Tagline kept: "Everything is enormous when you're this small." It was never
mouse-specific and still says exactly the right thing.

## Incident: shared Vite dep cache (caused by me, repaired)

At 06:41 my first disposable Vite (port 15911) started without its own `cacheDir`.
Its config hash differed from the cache on disk, so it re-optimized
`node_modules/.vite/deps` in place. The long-running 5173 server (started
2026-09-24 17:42) was still serving cached transforms that pointed at chunks now
gone from disk. `chunk-QNUG63Z5`, `chunk-TWTRXEC2` and `chunk-VHJE3KOL` returned
504, so a fresh load of 5173 would have failed.

Repair, all without restarting any preserved process:
1. Stopped my Vite. Every later disposable Vite uses a private `cacheDir` under %TEMP%.
2. Backed up the current deps dir (the one 15173 was using) to %TEMP%.
3. Got 5173 to re-optimize itself: it transformed a throwaway module
   (`nimbalyst-local/tmp-brand/reopt-trigger.ts`, `import "@react-three/rapier"`,
   deleted afterwards). 5173 rewrote the deps; they now use the same chunk names as 15173.
4. Copied back the two backed-up files that were missing
   (`chunk-KZOOOZDT.js` + map), so nothing either server might reference is missing.
5. Verified: every dep entry and chunk referenced by `/src/main.tsx` on 5173 and on
   15173 returns 200. Real Chrome loads of `http://localhost:5173/` and
   `http://127.0.0.1:15173/` render the landing h1 with zero console errors, zero
   page errors, and zero 5xx.

No storage, API process (8787/18799), saved world or audio was touched.
Note for the coordinator: 5173, 15173, and any e2e Vite without its own `cacheDir`
share this cache dir and can knock each other over the same way.

## Status

- [x] Model verified, instructions + plan + interface checkpoint read
- [x] Mark, small and mono variants, favicon (`public/brand/wanderkin-*.svg`,
      generated from `Logo.tsx`; `mousehold-mark.svg` deleted)
- [x] brand.ts, Logo.tsx, index.html boot screen, lockup CSS block in global.css
- [x] Wordmark: dotless ı + marigold button tittle, aligned to Fraunces' own dot
      at 120px against a reference render
- [x] `Logo.test.ts` (7) + `api.test.ts` (9) pass; `tsc -p tsconfig.json` clean
- [x] Real placements verified in Chrome (Playwright `channel: "chrome"`) against a
      disposable API (18911, empty %TEMP% storage, provider key blank, endpoint
      pointed at a dead port) and a disposable Vite (15911, private cacheDir).
      Zero provider, publish, or upload calls.
      - Landing 1440 / 820 / 390 @2x: lockup 151x34 at 1440 and 820. At 390 only
        the 34px mark shows: the existing welcome.css rule hides the word below
        440px, and the accessible name stays "Wanderkin". Fraunces is the computed
        face. The tittle is a 4.4px marigold dot above the ı.
      - Nav aria snapshot: `navigation "Main navigation"` > text `Wanderkin` (the
        drawn ı letters are aria-hidden) > button "My worlds".
      - Document title "Wanderkin — tiny worlds from everyday things". Favicon
        `/brand/wanderkin-favicon.svg` rendered at 16 and 32px, 1x and 2x, on light
        and dark tab strips.
      - Boot screen (main.tsx blocked) at 1280 and 390: 64px full mark + word.
      - Design kit: title "Wanderkin design kit", 30px lockup on plaster, eyebrow
        "Wanderkin design system". Zero console errors. The friend page uses the
        same `<Logo size={30} />` on the same plaster ground. It was NOT opened live,
        because that needs a publication and publishing is out of bounds.
      - Capture watermark via the real `captureWorldScreenshot`: 1280x720 PNG, pill
        reads WANDERKIN. Text measures 109.8px at `800 17px system-ui` inside the
        162px pill, about 26px of air each side.
      - Download names via the real `safeBundleFilename`: `Desk-sofa.wanderkin.json`,
        empty name `wanderkin-level.wanderkin.json`. The gameplay clip is
        `${stem || "wanderkin"}-gameplay-highlight.<ext>`, read from recorder.ts
        source, not executed. Import never parsed the extension, so older
        `.mousehold.json` / `.objectquest.json` bundles still import.
- [x] Unchanged identifiers: no storage key, cache key, protocol name,
      `window.__objectquest`, header, or `--mh-*` / `.mh-*` class or token name was
      edited.
- [x] `npx vitest run src`: 47 files / 294 tests pass. `tsc -p tsconfig.json` clean.
- [x] Commit `d5ea77c` (Nimbalyst atomic commit, 13 exact paths). Not included:
      `src/game/core/characterScale.ts` (scale worker, dirty) and the scratch
      tooling in `nimbalyst-local/tmp-brand/`.

## Left alone on purpose (report, not edit)

- Comment-only "Mousehold" mentions in `src/ui/theme/tokens.css`, `src/styles.css`,
  `src/editor/editor.css`: no user impact, and a docs sweep is out of scope.
- `public/style-previews/provenance.json`: a historical record of what was generated
  and by whom, including idempotency keys. Rewriting it would falsify provenance.
- `.mh-` class and `--mh-*` token prefixes: identifiers used by peer-owned CSS
  (welcome.css and others). Renaming them is a theme-wide change.
