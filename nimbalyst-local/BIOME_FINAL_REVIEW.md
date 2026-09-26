# Biome feature: final independent review (Step 3)

- **Reviewer:** fresh independent session. Observed runtime model **claude-opus-5-5** (Opus 5.5). No subagents, no fallback model.
- **Reports to:** orchestrator f8543364.
- **Date:** 2026-09-25, gate run 16:02:38–16:03:11 local.
- **Boundaries kept:**
  - Read-only on product source, tests and other sessions' harnesses.
  - Writes: this file and `nimbalyst-local/tmp-biome-final-review/` only.
  - No browser, no server, no ports, no provider calls, no storage writes.
  - No git commit, stage, reset, stash or revert.

## VERDICT: **APPROVE** commit of exactly the 53-path snapshot

The snapshot has no blocking or Medium findings. The committer must:

- re-verify the hashes immediately before committing (see the committer notes);
- commit only the 53 explicit paths;
- carry the residuals below into the delivery notes and the hands-on handoff.

## 1. Snapshot verification (BLOCKING checks, all passed)

| Check | Result |
|---|---|
| HEAD | `2193c5c0cfb94f0645b6f627edfc02cac92d1bef` before and after my gate |
| List file hash | `combined-snapshot.sha256` = `7a61be50d7ca06788d8aa3c860cdb8e0a6a9d673c1441cd23ebaed4ccf713766` (matches the retirement block) |
| Per-file SHA-256 | **53/53 OK**. Checked 3 times: at the start, before the gate and after the gate (`tmp-biome-final-review/verify-1.txt`, `pre-gate-verify.txt`, `post-gate-verify.txt`) |
| Hash list vs `combined-paths.txt` | Identical 53-path set |
| Path set vs `git status` | `git status --porcelain --untracked-files=all` over src, shared, server, docs, tests, `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `server/tsconfig.json` and `vitest.config.ts` gives **exactly the 53 paths, byte-for-byte equal as a sorted list** (15 modified + 38 new) |
| Required new files present | `src/biome/workBudget.ts`, `src/biome/workBudget.test.ts` and `src/game/core/simulation.lifecycle.test.ts` are all in the list and hash-verified |
| Stray or excluded content | Outside `nimbalyst-local/`, the only other untracked paths are 8 `.nimbalyst/transcript-images/*.png`, which are excluded. There are no package, config or lockfile changes. There are no ignored files under src/shared/server/docs/tests. No snapshot file references `nimbalyst-local` or `tmp-biome`. `shared/geometry.ts` has a net diff of 0 |
| Peer hashes | The 9 geometry, 5 lifecycle and 17 visuals files in the snapshot equal the retired reviewer's RETIREMENT hashes (implied by the 53/53 match against the list that integration built from those verified files). No delta review is needed for them |

**Committer note:** `combined-snapshot.sha256` and `combined-paths.txt` have **CRLF** line endings. A plain `sha256sum -c` reports "53 FAILED open or read" because of the trailing `\r`, not because of any mismatch.

- Strip the CRs first: `tr -d '\r' < combined-snapshot.sha256 > x && sha256sum -c x`. LF copies are in `tmp-biome-final-review/`.
- Git warns that `src/game/diagnostics.ts` and `src/game/hud/hud.css` will be LF→CRLF normalised. That is expected autocrlf behaviour; the verified hashes are of the working-tree bytes.

## 2. What I re-ran (attributable to this reviewer)

I ran each of these once, on the verified bytes, with the same HEAD before and after:

| Command | Result | Log |
|---|---|---|
| `npx tsc -p tsconfig.json --noEmit` (client) | **exit 0**, no output | `tmp-biome-final-review/tsc-client.log` |
| `npx tsc -p server/tsconfig.json --noEmit` (server) | **exit 0**, no output | `tsc-server.log` |
| `npx vitest run` (full unit suite, Node) | **exit 0: 87 files, 717/717 tests passed**, 0 failed, 20.4 s | `vitest-full.log` |

- The unit suite uses only ephemeral ports (`listen(0)`). No protected port was touched.
- **Not re-run:** `vite build` and the server emit compile. No build log file exists (integration recorded the gate as console output only), and my mandate capped re-runs at tsc + unit. So "`npm run build` exit 0, pre-existing chunk-size warning only" remains **integration ad9320dd's claim, not attributed to me**.
- The type-level half of the build (both tsc projects) is attributed. The server compile uses the same `server/tsconfig.json` with emit, so the residual risk is limited to vite bundling. The committer may optionally run `npx vite build --outDir <temp dir>` before committing. That is not a gate condition.
- No browser suites were re-run, as instructed. The earlier real-Chrome evidence (below) stands as recorded by integration.

## 3. Static review of the integration/UI code at this snapshot

### shared/manifest.ts and manifest-migration.ts

- `biome?: { id, seed }` and `adventure?: { template, seed, generator }` are optional, so legacy worlds stay valid.
- The zod reader schema:
  - uses `z.enum(SCENE_BIOME_IDS)` and `z.enum(ADVENTURE_TEMPLATE_IDS)`;
  - requires `z.literal(1)` for the generator version;
  - accepts seeds of 1–256 characters;
  - is `.strict()` on both markers, so extra fields like `assetUrl` or `spawn` are rejected.
- The server's `sceneManifestSchema` (`server/levels.ts:211`) derives from the same reader schema, so client and server agree.
- Round-trip, unknown-template, extra-field, empty-seed and wrong-generator cases are tested in `shared/manifest.test.ts:39-60`. **PASS.**

### src/biome/useBiomeAdventure.ts

- **Prepare-then-swap:**
  - A look is prepared in a 30 ms-deferred task, and only success calls `setPresented`.
  - On failure the hook logs a warning and sets `THEME_FAILED_MESSAGE`. Selection reverts to what is on screen only if the player has not picked again (`current === selected`). **The old world and look are kept.**
- **New adventure:**
  - Runs `prepareAdventure`, then `acceptGeneratedAdventure`.
  - Either refusal, or a thrown error, sets `ADVENTURE_FAILED_MESSAGE` and never calls `onAdventure`. **The old world is kept.**
- **Stale requests:**
  - The `themeEpoch` and `adventureEpoch` tokens are bumped on effect cleanup and on unmount. A superseded or unmounted request returns before doing any work.
  - `newAdventure` refuses while `busy`, and the UI fieldsets are disabled while busy.
  - App adds a second guard, `currentScreenRef.current !== screen`.
- **Theme state is outside gameplay:**
  - Look, quality and layout live in hook state inside `GameView`.
  - `gameplaySignature` (`GameView.tsx:64-73`) covers levelId, assets, entities, spawn, checkpoints, movementConfigId and experience. It does not include the look.
  - The loader effect's deps are `[signature, loadToken, config, gameplaySession]`.
  - A look change therefore never rebuilds physics or the session.
- **No stale layout across worlds:** the hook lives in `GameView`, which `PlayScreen` keys by `manifest.levelId`, and a generated draft always gets a new `adventure-<uuid>` levelId. So a new adventure remounts fresh and cannot inherit the previous world's decoration layout.

**PASS.**

### src/biome/adventureDraft.ts

- **Identity checks:** the draft is rejected unless all of these are JSON-identical to the source:
  - `assets` (which include url, sha256, sizeBytes and provenance);
  - `photos`;
  - `calibration`;
  - `movementConfigId`;
  - all `generated-mesh` entities.
- **Mission checks:** the draft also needs a `validated` course, at least 1 checkpoint and a consistent template/mode:
  - Portal: collect mode, with required IDs ⊆ collectibles and a matching finish portal.
  - Beacon: explore mode with exactly 1 destination.
- **Draft construction:**
  - `workflow`, `biome` and `adventure` from the generator are dropped.
  - The draft gets a new levelId and timestamps.
  - It stores `biome` only when the look is not Original.
  - It then re-parses the result through the reader schema.

**PASS.** See F-1 for `media`.

### src/biome/planning.ts

- `RawPlanSchema` is `.strict()`: enum `biomeId`/`template`, up to 8 labels, and a `flavor` object whose 4 fields are nullable.
- Every text value passes `sanitizeFlavorText`, which:
  - applies NFKC normalisation and strips control and format characters;
  - bounds the length;
  - blocks URLs, file and asset extensions, code and markup characters, instruction phrases, coordinate pairs, provider names and unsafe words;
  - applies a letters/digits/light-punctuation allowlist.
- It supplies no positions, sizes, seeds, asset IDs or URLs.
- Raw output is capped at 4000 characters, with one JSON fence tolerated.
- `fallbackAdventurePlan` is deterministic (FNV-1a of the seed, keyword hints) and offline, and the player's explicit choices always win.
- `planAdventure` has an injected requester only, one bounded attempt (≤ 60 s clamp), aborts on timeout and never throws.
- **No network transport exists:** there is no `fetch`, XHR, WebSocket, `/api/` or dynamic import in non-test `src/biome`.
- The only production importer is `missionCopy.ts`, and only for a type. The live game runs purely on deterministic presets.

**PASS.**

### AdventureControls.tsx, Hud and PlayScreen wiring

- **Look and reset are separate:**
  - The "Look" radios and "Reduce effects" (hint: "Your progress is kept.") sit in one area.
  - A visually separate `oq-adventure__reset` block holds the "Next adventure" template radios and the **"Start new adventure"** button, noted "resets your current progress".
  - Once play has started (`confirmReset={started}`), it asks for a two-step confirmation: "Start over? … Reset and start / Keep playing".
- **Pointer-lock gating:**
  - The panel renders only inside `SettingsDisclosure` in the **pause** and **click-to-play** cards (`Hud.tsx:356, 392`), where the pointer is already released.
  - `<details>` stops click and keydown propagation, so opening it does not start play.
  - `summary` was added to `isInteractiveTarget` (`inputController.ts:231`).
- **Loading and failure states:** while busy, the fieldsets are disabled, `aria-busy` is set and a `role=status` shows "Preparing your world…". Errors show in `role=alert` with "Your current world is still here."
- **Player-facing copy:** "World settings / Look / Next adventure / Reduce effects / Start new adventure". It contains no implementation terms (biome, seed, template, manifest, layout or draft).
- **Hidden where it cannot apply:** the new-adventure block is hidden when `onAdventurePrepared` is absent (shared challenges).
- **HUD copy:** generated-adventure copy applies only to worlds carrying the `adventure` marker. Authored worlds keep "Lost Colors" / "Colors found" and their own colours (`GameStage` recolours collectibles only when `manifest.adventure` is present).

**PASS.**

### App.tsx and GameView.tsx identity semantics

- **A look switch never calls App.** `onComplete` finishes against `screen.manifest` with the same `publishable`, `unsaved` and `publication`. So saved, shared and publication identity cannot fork. The look is session memory only (`sessionLooks`) and is never written to a world.
- **An explicit new adventure** calls `go({ name: "play", manifest, publishable: false, unsaved: { kind: "draft", manifest } }, { replace: true })`. That makes a private, unsaved draft with a fresh levelId and `adventure`/`biome` metadata.
  - The source world is untouched.
  - Saving happens only through the existing explicit Finish "Save and share" (`createLevel`, which creates a new level).
- **Shared challenges** (`screen.publication`) get no `onAdventurePrepared`, so their course is fixed.
- **Lifecycle:**
  - `handleRestart` has a disposed guard (`GameView.tsx:512`).
  - The `GameStage` frame guard comes first in the Rapier-touching frame loop (`GameStage.tsx:151`).
  - Both were reviewed in Step 1 at the same hashes.

**PASS.**

### Spec items (BIOME_USER_REQUEST.md §9, §4, §1)

| Spec item | Status | Basis |
|---|---|---|
| Repeated switching cleans up | Holds | Static: a single-owner dispose in `decorLayer`/`BiomeLayer` (Phase 1b). Browser: 4 cycles with identical renderer counts (integration, older bytes; see §5) |
| Original restores | Holds | Static: a null surface treatment is uniform-only, and `SceneEnvironment` returns. Browser: identical counts and a 0.07% pixel diff |
| Progress preserved on theme switch | Holds | Static: theme state is outside the signature and the session. Browser: position, checkpoints and fragments were kept exactly while paused |
| Regeneration is a separate explicit action | Holds | Separate UI block, two-step confirmation after start, separate App route |
| Deterministic presets without AI | Holds | No transport; deterministic fallback; schema tests for malformed output |
| Loading state; failure keeps the playable scene | Holds | See the hook and controls sections above |
| No implementation terms in player UI | Holds | `ADVENTURE_COPY`, `THEME_OPTIONS`, `ADVENTURE_OPTIONS` |
| Reduced-effects budgets consistent | Holds | `placement.ts:121-122` (0.5 / 0.6) equals `presets.ts:123-124` |

## 4. Findings (severity-ranked)

There are no Critical, High or Medium findings, and nothing blocking.

- **F-1 (Low, audio/copy mismatch; non-blocking).**
  - **Where:** `src/biome/adventureDraft.ts:66-74`. The generated draft keeps the source's `media` through `...rest`.
  - **Mechanism:**
    - `useGameAudio` still calls `engine.playNarrationOnce(worldId)`.
    - That plays `media.audio` narration if the source has one, and otherwise the bundled `/audio/narration-intro.wav` (`src/audio/assets.ts:17, 29`).
    - `GameView.tsx:100-111` swaps only the **subtitle** text to the generated objective.
  - **Effect:** on a source world that has generated narration audio, the spoken intro describes the source quest while the subtitle and HUD show the new adventure.
  - **Scope:** the bundled-clip case is pre-existing behaviour for every world, and I did not listen to its words.
  - **Smallest repair:** in `acceptGeneratedAdventure`, omit narration from the draft's media. For example, destructure `media` out and re-add it as `media: { ...media, audio: media.audio.filter(a => a.kind !== "narration") }` when present. Alternatively, disclose it as a user observation.
- **F-2 (Info).** The intro subtitle names the destination using the look **saved with the world** (`manifest.biome`, `GameView.tsx:102-104`), while the HUD uses the **current** look. After a look change, the one-time intro may say "island gate" while the HUD says "oasis gate". This is intentional per the code comment and cosmetic.
- **F-3 (Info, policy note).**
  - A new adventure started on a bundled **sample** becomes `unsaved: { kind: "draft" }` (`App.tsx:574-578`), so Finish offers an explicit "Save and share" of a sample-derived world.
  - A course-edited sample played from Preparation instead reports "sample-world" (`App.tsx:552`).
  - Saving still needs an explicit click, and Preparation's own Save already allows saving edited samples. This is not an accidental save, so it is not a defect. Flag it to the user if bundled-sample worlds must never be saved.
- **F-4 (Info, evidence gap).** `vite build` and the server emit compile were not re-run by me, and no log file exists; see §2.

## 5. Browser evidence (reused, not re-run; provenance noted)

These integration results ran on **earlier bytes**, before the Step 1 guard and before the Step 2 geometry repair:

- real-Chrome pause-switch progress preservation;
- 4 Original/Tropical/Desert cycles with flat counts;
- Original restore at 0.07% pixel diff;
- reduced effects;
- both templates on both scans;
- pickup frame timing.

The Phase A 30-swap regression (20 headless + 10 headed Rodin replacements, 0 pageerrors, bounded counts) ran on the Step 1 lifecycle hashes (`a6a1cc73` / `4ebce344` / `6042d31b`) with `adventures.ts` `b3dc4530`, all of which are in the final snapshot.

The theme/UI code in those browser runs is integration-owned. Its bytes were not frozen by hash at that time, so the switching evidence is supporting evidence for the current bytes, not exact-snapshot proof. The static review above independently establishes the same invariants (theme state outside the signature and session, a single-owner dispose).

## 6. Legacy Lost Colors browser acceptance

**Assessment: pre-existing and out of scope. NOT green.**

- The failure is `tests/e2e/browser/worker5-gameplay.acceptance.test.ts:95`: `expect(page.getByText(/Colors found 1/)).toBeVisible()` after the scripted `drive(page, [-4.02, 2.154])`.
- **Attribution evidence:**
  - Integration reported an identical failure on a detached 2193c5c baseline worktree. **That worktree was removed and no log was retained.** `tmp-biome-integration/` holds only the Playwright config, so this rests on integration's recorded statement.
  - **Static corroboration by me:** the drive-to-collect path depends on movement, physics, proximity, session and the sample manifest. In the snapshot:
    - `simulation.ts` differs from 2193c5c by a read-only getter only;
    - `src/game/modes/*`, the movement config and the samples are unchanged;
    - the only frame-loop change is the disposed early-return, which does not fire on a live world;
    - the HUD keeps "Colors found" for worlds without the `adventure` marker (the preceding line-94 assertion "Colors found 0" passes in integration's run).
  - Nothing in the snapshot plausibly changes whether the scripted drive reaches the fragment.
- The test was last changed in `da2ff8e`. The other test in the file passes per integration.
- **Disclosure wording:** "Legacy scripted Lost Colors fragment-1 drive fails at line 95; reproduced on the pre-feature base 2193c5c per integration (log not retained); not caused by this feature; not fixed; not green."

## 7. Residuals to disclose (carried forward plus new)

1. **castShape trigger is inferred, not reproduced** (0 of 11 without the guard). Closure rests on the by-construction frame guard, verified by 30 swaps with 0 pageerrors.
2. **Resource release is shown only indirectly:** a fresh canvas per world and bounded counts. There is no heap or WebGL-context count.
3. **Planner-ramp ownership is tested by injection only.** No fixture naturally produces a planner ramp.
4. **Generation refusal is not a hard timeout.** It takes about 2 s plus one stage (measured 1.47 s on raw Rodin); on devices roughly 1.5× or more slower, a scan that normally works may be refused (the world is kept). Collision above 200k triangles is refused.
5. **Theme-layout preparation is unbudgeted:** `prepareBiomeLayout` takes 15–230 ms, bounded by the 400k analysis cap.
6. **L3:** the Desert windsock is placed even when the route is unproven (intentional).
7. **L4 (user observation):** the Tripo generated stairs sit under the sofa overhang, flush with the scan (desk 1 box, Tripo 2 boxes overlap the scan below their top).
8. **V1 (user observation):** the Desert spawn marker is faint.
9. **Structural:**
   - generation is synchronous on the main thread (typically 0.1–0.35 s);
   - generated structures are axis-aligned boxes;
   - Rodin uses the open-floor fallback;
   - the controller evidence is a scripted follower, not human play;
   - there is no network AI planner (deterministic presets; $0 spent).
10. **New from this review:**
    - F-1: narration audio may describe the source quest on a generated adventure.
    - F-2: the intro subtitle uses the saved look.
    - F-3: a sample-derived generated draft is saveable by explicit click.
    - F-4: `vite build` is not attributed to the reviewer.
11. **Pre-existing, not introduced here:**
    - the legacy Lost Colors scripted-drive failure (§6);
    - the HUD intro/subtitle overlap;
    - the grey Play button.
12. **User-owned acceptance:** gameplay feel, whole-game playthroughs, L4 and V1 remain the user's hands-on gate (`BIOME_HANDS_ON_HANDOFF.md`).

## 8. Committer conditions (Phase C)

1. Immediately before committing, re-verify all 53 hashes against the LF-normalised list and confirm HEAD `2193c5c`. On any mismatch, stop and re-route. This approval covers only these exact bytes.
2. Stage **explicit paths from `combined-paths.txt` only**, through the Nimbalyst `developer_git_commit_proposal`. Exclude `nimbalyst-local/`, `.nimbalyst/`, screenshots and harnesses. No package, config or lockfile.
3. After the commit, verify the commit's file list equals the 53 paths and that `git status` over src/shared/server/docs/tests is clean.
4. F-1 is optional. If the orchestrator chooses to repair it before committing, that changes `adventureDraft.ts` (and its test), and those bytes need a re-hash, a focused test and a delta review. Otherwise disclose it.

## Evidence files (`nimbalyst-local/tmp-biome-final-review/`)

- `combined-snapshot.lf.sha256` and `combined-paths.lf.txt`: LF copies of integration's lists.
- `verify-1.txt`, `pre-gate-verify.txt`, `post-gate-verify.txt`: 53 OK each.
- `git-status-full.txt` and `status-product.txt`.
- `gate-meta.txt`: timestamps, HEAD, exit codes.
- `tsc-client.log`, `tsc-server.log`, `vitest-full.log`.
