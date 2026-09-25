# Checkpoint: final independent Opus review of the visual fixes (F1/F2/F6, F3, F4)

## Identity and scope

- **Runtime:** Claude Code, **`claude-opus-5-5`** (Opus 5.5), as reported by this session's own system context. There was no fallback model, no subagents, and no paid, provider, generation, upload, publish or save calls.
- **Role:** a fresh, independent reviewer for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`. I made **no product edits**. I own only this file, `nimbalyst-local/screenshots/visual-final-opus-review/` and the untracked harness `nimbalyst-local/tmp-final-opus-review/`.
- **Reviewed:** exactly `b9a00e5` (materials F1/F2/F6), `70f9863` (markers F3) and `13ed712` (stride F4), against parent `2625ef7`.
- **MAIN tip at review:** `ce8f3be`. Its `src/`, `shared/`, `server/`, package and config files are byte-identical to `13ed712` (`git diff --quiet 13ed712 HEAD -- …`). The commits after it are docs only.
- **Not re-reviewed:** the broad original, brand, music or landing review.

## Verdict: APPROVED, no blocking defects

No actionable code defect was found in the three commits. The residuals below are visual or subjective, and none of them blocks.

## Findings per fix

### F1: material regions (`materialRegions.ts`, `styleMaterial.ts`)

- **Mapping.** The mapping is fixed and no longer inverted:
  - wood is the desk box: x −4.1…−1.02, capped at y 1.835 just above the 1.80–1.82 top
  - fabric is the sofa box: x −1.0…4.1, from y 0.22
  - two neutral boxes cover the laptop and the mouse
- **Seam.** A 2 cm gap at the measured x ≈ −1.0 seam, with 0.01 m softness, means wood and fabric weights never both reach 1. At most they sum to 1 in the gap.
- **Keying.** The profile is keyed only to the real `rodin.glb` sha256. The test hashes the actual bytes, and the Tripo sample and unknown hashes return `null`.
- **Tests.** The real-bytes vertex tests (seat and backrest fabric, top and pedestal wood, arm not wood, deck under 2% wood, coverage over 75%) test the measured geometry, not names.
- **Tint overlay.** It matches the mapping visually (`opus-visual-review/fix/02`, `06`): orange desk, blue sofa, neutral laptop.
- **CPU/shader correspondence, checked line by line:**
  - Box weight: `1 − smoothstep(−s, s, max_axis(max(min−p, p−max)))` is identical in both.
  - Kind codes: fabric 0, wood 1, neutral 2 map to the shader's `< 0.5` and `< 1.5` thresholds.
  - Neutral suppresses both wood and fabric by `(1 − neutral)`.
  - `cartoonAssetBandColor` mirrors `CARTOON_ASSET_LUMA_BANDS` exactly: the band, the half-step floor, the hue-kept clamp, and `smoothstep(0, 0.04, luma)`.
- **Shader resources and cache:**
  - Box values are per-material uniforms: `vec3[]`, `vec3[]`, `float[]` and a float. `regionUniforms` rejects 0 or more than 8 boxes.
  - Everything the key leaves out is uniform data. Only the box count (`#define OQ_REGION_BOXES`), the style-derived `OQ_DETAIL_STRENGTH` and the relit/asset branches change the program text.
  - The program key `objectquest-style-v2:{style}:{outline}:region-boxes-N:{relit|unlit}:{asset|helper}` covers all of those. The v1→v2 bump prevents stale programs.
  - `oqRegion` is declared in the roughness injection, which three.js places before `normal_fragment_maps`. That is the same ordering the previous code relied on.
- **Normal blending.** Each field is bumped and blended separately, so no false ridge can appear at a box edge.

### F2: Cartoon asset-only luminance bands

- **Asset-only.** Luminance bands apply only to the `cloneStyledMaterial` path (`importedAsset = true`). `createStyledHelperMaterial` passes `false` and keeps per-channel rounding, and the cache key separates the two.
- **PBR maps untouched.** The shader is a post-dither colour pass only: the maps, `isBakedEmissiveOnlyMaterial` and the relight are unchanged. The Tripo PBR material is rejected by the relight check exactly as before.
- **My real-Chrome A/B:**
  - `05/06`: Rodin desk underside. The red and olive per-channel hue drift is gone.
  - `07/08`: Tripo spawn. The black-and-maroon crush becomes a continuous olive-brown.

### F6: fade units and detail

- **Units.** `oqDetailFade` now multiplies rad/m by 1/2π, which gives cycles/m. The fade runs from 0.2 to 0.45 cycles/px, fully faded below Nyquist.
- **Per-field fade.** Each field fades by its own frequency. The roughness noise was lowered to 9 rad/m and no longer needs a fade.
- **Cartoon strength.** The 0.25 strength is compiled as a define, and the style is in the cache key.

### F3: markers (`markerLayout.ts`, `Checkpoints.tsx`, `ModeEntities.tsx`, `GameStage.tsx`)

- **Gameplay unchanged.** Trigger state and coordinates are unchanged:
  - `updateCheckpoints` and `proximity.ts` still use the stored `position` and `triggerRadius`
  - `samples.ts` changed only in comments (every changed line is `//` or `*`)
  - `markerLayout` never mutates its inputs
- **Seating.** Markers are re-seated with the same `reseatCapsuleCentre` that spawns use, from `simulation.authoredConfig` and the runtime `simulation.config`.
- **Ring radius.** The radius is `sqrt(r² − drop²)`, where drop is the stored centre minus the grounded miniature centre. That comes to 0.302 m at 0.175 m.
  - The test drives the real `updateCheckpoints` ±2 mm either side of the ring at four body sizes, so the ring matches the 3D trigger footprint.
  - Sensitivity to the skin assumption is about 0.9 mm per mm, which is negligible.
- **Visuals only.** The changes are appearance only:
  - gem 0.46 body heights across at feet + 1.42 heights, clear of the head at the bottom of its bob
  - collected gem at 0.75×
  - collected ring hidden
  - beam and point light re-anchored on the gem
- **My real-Chrome A/B:**
  - `01/02`, same respawn pose looking down: before, the gem hides the hero; after, the hero is fully visible.
  - `03/04`: the collected gem no longer blocks the view of the next objective.

### F4: stride (`characterAnimator.ts`, `PlayerAvatar.tsx`)

- **Wiring.** `PlayerAvatar` passes `characterHeight(config)`, which is the same `2 × (halfHeight + radius)` as `capsuleHeight`, and memoises the animator on it. With no height given, the reference 8.4 rad/m is reproduced exactly.
- **Stride rate.** The per-metre stride rate is a constant fixed at construction, so it never compounds.
- **Tempo.** Tempo is `(0.7/H)^0.5`, clamped to [0.5, 3]. At 0.175 m that is 2.
- **Springs.**
  - Only LEG, ARM and CORE channels plus bob and squash scale with tempo.
  - `springTempo` is weighted by grounded walk/run weight. `airborne` includes `mantling`, so air, mantle and idle get tempo 1.
  - The speed-up drops instantly and eases back in at about 7/s.
  - The worst case is ω = 27 × 3 = 81 at the h = 1/120 sub-step (ωh = 0.68), well inside semi-implicit-Euler stability. The shipped tempo 2 gives 0.45.
- **Tests.** The assertions match the claims (tempo √2 and 2, footfall 0.9–1.2 body heights, 8–13 steps/s, non-compounding, leg swing 0.85–1.25× the reference, air and mantle ≤ 1.05×, touchdown ≤ 1.35×, finite at tempo 3).
- **Foot slip (residual).** Feet still slip at about 79% of body velocity. This is correctly stated as a residual, and the change is not claimed to be foot-locked.

## Checks (run by me)

- **Unit suite.** One combined full run, `npx vitest run`: **72 files, 544/544 passed**. It ran from 09:21:35 on a verified-clean source tree. I did not repeat the HTTP, provider or full browser suites; the Rodin full course and replay had already passed.
- **Typecheck.** `tsc -p tsconfig.json --noEmit` and `tsc -p server/tsconfig.json --noEmit` both exit 0.
- **Build, first run.** `vite build` plus the server `tsc`, each to a temp outDir so the `dist/` folders the services might use were never touched: both exit 0. `vite build` printed only the existing chunk-size warning.
- **Build, repeated on an exact export.** Because of the concurrent dirt described below, I repeated typecheck and build on an exact `git archive 13ed712` export (with a node_modules junction). Client tsc, server tsc, vite build and the server build all exit 0. The export was deleted afterwards.
- **Real Chrome A/B:**
  - **Setup:** harness `tmp-final-opus-review/`. `playwright chromium channel "chrome"` ran against two disposable Vite servers:
    - 5241 "before" serves the 8 existing product files from `2625ef7` via `git show`
    - 5242 "after" serves the tree, which was byte-identical to `13ed712` at start
    - each server had a private `cacheDir` under `%TEMP%`, no `/api` proxy, no watcher and no HMR
  - **Flow:** production landing → "Play now" (the samples default to Cartoon) for Rodin and Tripo, run sequentially.
  - **Cameras:** identical scripted cameras, and the logged pose, yaw and pitch match exactly across variants.
  - **Results:** 0 console or page errors, 0 blocked requests, only 2 mocked GETs per run, and 1146–1263 frames rendered. Checkpoint 1 was collected in every run.
  - **Cleanup:** both servers were stopped and their caches deleted.
- **Protected services afterwards:** 5173 → 200, 15173 → 200, 8787 `/api/capabilities` → 200, 18799 `/api/capabilities` → 200.
- **Left untouched:** storage, the saved world, `private-world-10`, audio, the 4 stashes, and Finish/App/share.

## Disclosure: concurrent, authorized Finish edits during this review (not mine, not in `13ed712`)

Between 09:22:50 and 09:26:33, `src/App.tsx`, `src/capture/media.css`, `src/ui/screens/FinishScreen.tsx` and `src/ui/screens/finish-screen.css` became modified in the working tree. That is 171+/42−, the Finish/App/share area. I did not create, stage or touch them.

- The unit suite and typecheck ran before them.
- The build is re-proven on the exact `13ed712` export.
- My in-game captures only exercise gameplay rendering.

**Resolution: confirmed authorized and owned.**

- These edits are the resumed, preserved Finish fix. The user actually answered "Resume the fix" at 1790308309791.
- The work is owned by the fresh Opus session `000bc7bc-659f-4f51-b170-a21bbcde8b9c`: `FinishScreen`, `finish-screen.css`, `capture/media.css`, the narrow App share state, and focused tests.
- The coordinator queued the handoff as a report before those edits began. It reached this session only after my checks.
- This is a separate, active, authorized task, not stray or unowned modifications.
- None of that uncommitted work is part of `13ed712`, and nothing in this review attributes it there.
- The `13ed712` product approval stands on the snapshots below.

### Snapshot each check actually ran on

| Check | HEAD | Source snapshot actually tested |
|---|---|---|
| Unit suite, 544/544 (09:21:35–09:21:42) | `ce8f3be` (source = `13ed712`) | Working tree. `src/`, `shared/` and `server/` were verified clean immediately before the run (no modified or untracked files), and the earliest Finish edit is at 09:22:50. So this is exactly `13ed712`. |
| Client and server typecheck (started about 09:21:45) | `ce8f3be` | Working tree. The first `.ts`/`.tsx` Finish edit (`App.tsx`) is at 09:24:49, after the build and after the servers started at 09:23:52. So the TS inputs were exactly `13ed712`. |
| First build (temp outDir) | `ce8f3be` | Working tree. It may have included the uncommitted `media.css` (09:22:50). **Superseded by the next row.** |
| Typecheck and build on an export | n/a | An exact `git archive 13ed712` copy, independent of the working tree. Client tsc, server tsc, vite build and the server build all exit 0. **This is the build gate.** |
| Chrome A/B (09:23:52–about 09:26) | `ce8f3be` | "Before" pins the 8 product files to `2625ef7`; "after" serves those files at `13ed712`. Every other file came from the working tree, served identically to both variants. |

**Chrome caveat.** `src/capture/media.css` is imported by `PlayScreen`, and it was already modified before the servers started. So the HUD capture button in all the screenshots may show uncommitted Finish styling. That is identical in both variants and is not part of any reviewed pair difference.

`App.tsx`, `FinishScreen.tsx` and `finish-screen.css` changed mid-run. The Finish screen is never shown in these captures. With no watcher, Vite keeps the transform from its first request, which was before the `App.tsx` change for both servers. The 3D scene, markers, avatar and materials, which are what the pairs compare, come only from committed files.

## Non-blocking visual residuals (for the user's play-test; not requests)

1. **Wood-grain fade uses the nominal 120 rad/m.** The `wander` term (±4 rad, noise at 9/m along z) raises the local grain frequency by up to about 2× in places. This is mitigated by the fwidth-sum overestimate and the 0.003 amplitude, and by the author's pan metrics (no sparkle increase). It could show faint shimmer on the desk at grazing distance in painted styles.
2. **The active marker's ground cue is fainter at range.** At about 5 m (`07/08`) the small gem and 0.3 m ring are faint, and the beam is the main cue. That is the intended trade for F3.
3. **The explore destination pad (0.22 m radius) is not a reach indicator.** The unchanged 0.7 m sphere fires about 0.65 m away horizontally at miniature scale. This is not claimed otherwise. Fragments and the portal are still authored-size, as already recorded.
4. **Cartoon on Tripo is still dark overall.** The hue is kept and the crush is gone, but it is not bright.
5. **Hand-painted sofa fabric reads as a fairly regular corduroy-like rib at mid range** (`opus-visual-review/fix/11-hand-painted`). This is a matter of taste.
6. **Known limits restated, not re-litigated:**
   - regions exist only for the known Rodin asset
   - no grain on the desk top under the laptop footprint
   - papers may get wood
   - sofa feet are neutral
   - no semantic or metal regions
   - Tripo PBR is untouched except for the Cartoon bands
   - feet slip at about 79%

## Evidence (`nimbalyst-local/screenshots/visual-final-opus-review/`)

Same pose and camera in each pair; before = `2625ef7` product files, after = `13ed712`.

| Pair | Shows |
|---|---|
| `01` / `02` | Rodin, respawned on checkpoint 1, looking down: gem hides hero → hero visible, small gem above cap |
| `03` / `04` | Same pose facing the next objective: giant collected gem and halo → small gem, clear view |
| `05` / `06` | Same pose, desk underside in Cartoon: per-channel red/olive drift → consistent brown bands |
| `07` / `08` | Tripo spawn facing the first marker in Cartoon: black/maroon crush → olive-brown, pink halo → beam and ring |

---

# Extension: narrow review of the Finish share fix `e83f8b1` (4 product files)

## Scope and snapshot

- **Requested by:** the coordinator, after the user approved resuming the fix. The fix was implemented by session `000bc7bc`.
- **Reviewed:** exactly `src/App.tsx`, `src/ui/screens/FinishScreen.tsx`, `src/ui/screens/finish-screen.css` and `src/capture/media.css` at `e83f8b1`, against its parent `3f7e74a`. I also read `finish-recovery.md`.
- **Snapshot:** HEAD was `f0913ce` (docs only after `e83f8b1`). The tracked `src/`, `shared/` and `server/` were clean, and their source equals `e83f8b1`.
- **Read-only:** I made no product edits.
- **Not re-run:** the unit suite, build and full gameplay, since no defect required it. The owner reports that the 12 fixture tests and the typecheck pass.

## Verdict: approved, with one non-blocking defect (see "Finding F-1")

These all hold:

- no accidental saving or publication of a bundled sample
- no duplicate saved copy
- publishing locked while a save-and-share is in flight
- a failed publish retried by publishing only
- old URLs safe

## Static trace (actual App entry points)

### Every way into Play

| Entry | `publishable` | `unsaved` |
|---|---|---|
| `onPlaySample` | false | sample |
| `/play/:id` for a bundled id (`resolvePlayRoute` / `resolveFinishRoute`) | false | sample |
| `/play/:id` for a stored level (`getLevel`) | true | — |
| `onPlaySavedLevel`, or Preparation with `isNew: false` | true | — |
| Preparation with `isNew` from `onEditSample` (`fromSample`) | false | sample, so no save is offered |
| Preparation with `isNew`, anything else: asset, job, import, unpersisted resume | false | draft (the exact `onPlay` manifest) |
| Share-play, from the friend screen or `/share/...` | false | — (`publication` is kept; Finish shows `existingShareUrl` as a copy action) |

- Replay and Race carry `unsaved` through unchanged.
- `createRaceVariant` keeps `levelId` and never saves.
- Race is hidden for publications.

### URL restores never recreate `unsaved.draft`

- A draft's `/play/<id>` or `/finish/<id>` resolves via `getLevel`. That is a real stored level (publishable) or Start, never a saveable draft.
- `/create/prepare` restores only the user's own asset/job resume state, never an edited sample.
- So a stale history entry can't offer Save & share again, and a bundled sample can't reach `createLevel` from Finish.
- Preparation's explicit Save of an edited sample is unchanged and outside this scope.

### Save & share matches Preparation Save exactly

- It makes the same `createLevel` call and the same `clearActiveSource()`.
- `PreparationScreen.handleSave` adds only local UI state, so nothing durable is skipped.
- Server create and publish guards are unchanged:
  - `POST /api/levels`: schema check, private-asset access, owner claim
  - publish: `assertLevelPublishable`, challenge validation

### Duplicate-copy risk and where it is closed

`store.create` keeps a free `levelId` but **mints a new UUID if the id already exists**, so a second `createLevel` of the same draft would be a duplicate copy. Every path that could make one is closed:

- **Double-click:** the Save & share `Button` is disabled while `loading`.
- **After the save lands:** App replaces Finish with a publishable finish that has no `onSaveAndShare`.
- **Publish failure:** retry goes through plain Share, which publishes only.
- **Replay after saving:** publishable, no `unsaved`.
- **Residual:** if the create succeeds on the server but its response is lost, an explicit re-click would create a second copy. The same is true of Preparation Save; it is not new.

### Other checks

- **Postcard hook:** switching to a publishable Finish only polls `GET /api/postcards/:id`. There is no automatic postcard write.
- **CSS:** the card is bounded to `100dvh − 2×pad` and scrolls internally. The narrow layout is capped at 70dvh, and touch targets stay at a 44 px minimum. This is consistent with the owner's fit table, and my 1440×900 real-App frame (`10`) fits with no scroll.

## Bounded real-App check (not a mirror): `tmp-final-opus-review/finish-app.mjs`

### Setup

- Real Chrome (`channel: "chrome"`) on a disposable Vite server at 127.0.0.1:5243. It had a private temp `cacheDir`, no watcher, no HMR and no `/api` proxy; the server is stopped and the cache deleted.
- The harness drives the **real App's own `screen` state**: its `useState` dispatch, reached through the React fiber. It builds real draft, sample, race and published Finish screens from the real sample and race modules. So the real `onSaveAndShare`, `go()`, the history `replace` and FinishScreen run, with no course playthrough.
- **Every write was mocked and counted:**
  - `POST /api/levels` echoes the body with a delay
  - `POST /api/levels/:id/publish` is scripted to fail or succeed
  - any other write would be aborted and flagged: there were none
  - foreign hosts blocked: none requested
- **Console:** one error, the deliberately scripted 500.

### Results

| Case | Result |
|---|---|
| **S1: draft**, double-click plus a third click on Save & share, create 500 ms, first publish fails | **1 create, `review-draft-1`**. During the publish, *after the real App swap*, Share reads "Publishing…" and is disabled, Save & share is gone, and the URL is `replace`d to `/finish/review-draft-1`. The failure shows "Mock publish failure" and plain Share is enabled. The retry publishes the **same id**, with no second create, and ends at "Copy share link again" with the link shown. Writes: create 1, publish 2. |
| **S2: Race run of a draft** | The create body is the **draft** (mode not `race`), not the race variant. The publish uses the saved id with a race challenge, which is existing semantics. |
| **S3: bundled sample** | Share is disabled with `aria-describedby` → "bundled example world…". No Save & share. **0 writes**, even after a forced click. |
| **S4: replay of a shared world** | "Copy share link again" is enabled. The clipboard gets the existing `/share/existing-share-7`. **0 writes.** |
| **S5: leave Finish while the save is pending** (create 1500 ms, click "Play again" at 200 ms) | The replay starts (`/play/review-draft-5`, canvas). When the save lands, **App yanks the player back to Finish** and `replace`s the `/play` history entry. The publish completes (1 create, 1 publish), but the new Finish shows "Share this world" enabled with **no link**. → F-1 |

**Harness note.** The harness goes through Start between scenarios, just as real runs reach Finish from Play. Without that, a direct Finish→Finish dispatch keeps FinishScreen's state. In the real App, only the intended save swap does that, and it is exactly the case S1 verifies.

## Finding F-1 (non-blocking, real): the post-save navigation is not guarded against the player leaving Finish

- **Location:** `src/App.tsx`, `onSaveAndShare`, the `await createLevel(draft)` followed by `go({ name: "finish", … }, { replace: true })`.
- **Cause:** the `go` runs unconditionally after the await. Play again, Try Race mode and Create another world stay enabled while "Saving & publishing…" is shown.
- **Effect,** if the player leaves Finish before the save response arrives:
  1. They are pulled out of the new screen, for example mid-replay, back to Finish.
  2. The history entry they were on is replaced.
  3. The publication succeeds but its link is never shown.
  4. Clicking the re-enabled Share would publish a **second publication version**. That is not a second saved copy and not a sample.
- **Guarantees that still hold:** no data loss, no sample publication, no duplicate saved level.
- **Likelihood:** it needs a click within the save latency, which is sub-second against the local server.
- **Minimal fix, owner's choice; not implemented here:**
  - either skip the `go` when App has navigated since the click (for example, compare a navigation token or the current screen before `go`, and still return the publish)
  - or disable Finish's other actions while `savingAndSharing`
- **Decision for the coordinator/user:** a small follow-up before the freeze, or an accepted residual.

## Limits

- The check is bounded and state-driven: there was no gameplay run to completion and no real save or publish. Server behaviour comes from reading the code (`store.create` id rule, publish guards).
- An edited sample (`fromSample`) is always treated as "bundled example" at Finish, even after edits. This is conservative. The player can still save it explicitly in Preparation, then play and share it.
- A lost create response followed by a re-click can duplicate, the same as Preparation Save.

## Evidence (`nimbalyst-local/screenshots/visual-final-opus-review/`)

| File | Shows |
|---|---|
| `10` | Real-App draft Finish at 1440×900 (fits), with the Save & share offer |
| `11` | Publish in flight after the real swap: Share locked as "Publishing…" |
| `12` | Publish failed: the error and an enabled plain Share (retry = publish only) |
| `13` | Bundled sample: the reason text, no save offer |
| `14` | F-1: back on Finish after leaving for a replay mid-save, with no link shown |

## F-1 closed: fix `9b761eb` verified (APPROVED)

**Snapshot.** HEAD was `9b761eb`, and its tracked `src/`, `shared/` and `server/` were clean. `9b761eb` changes only `src/App.tsx` among product files, plus the owner's harness and checkpoint. I read the exact diff and the `finish-recovery.md` tail. My verification harness is `tmp-final-opus-review/finish-app-f1.mjs`. It is my S1 and S5 unchanged, plus Back and newer-source cases, run on the same isolated setup:

- port 5243, private temp cacheDir, no watcher, no HMR, no proxy
- every write mocked; the server was confirmed to serve the fixed App (`currentScreenRef` is present in the served file)
- server stopped and cache deleted afterwards

### Static review

- **Screen guard.**
  - Every navigation installs a new `Screen` object: `go`, popstate and initial route resolution. All three already call `setScreen`, which is now a stable wrapper that sets `currentScreenRef` synchronously. A layout effect also re-syncs it from the committed screen.
  - After the save, the swap runs only when `currentScreenRef.current === screen`, where `screen` is the Finish that was clicked. So a player who has left for any reason is never pulled back, and their history entry is never replaced.
  - The explicitly requested publish still runs.
- **Save once.** `saveDraftOnce` memoises the pending create on the draft object that `unsaved` carries through Replay and Race. On failure it deletes the key, so a retry is possible. A later Finish of an already-saved draft offers plain Share of the stored copy. URL restores never recreate that draft object.
- **Recovery record.** `clearActiveSource` runs only if the active source is byte-identical to when the save started. So a newer creation's record survives, and the normal case still clears it, as Preparation Save does.
- **Unchanged:** server guards and `handleSavePreparedLevel`.

### Independent real-App results against `9b761eb`

| Case | Result |
|---|---|
| **S1**, unchanged (double-click plus a third click, first publish fails) | 1 create. "Publishing…" locked mid-flight after the real swap. The retry publishes only, and the link is shown. Writes: create 1, publish 2 (same id). |
| **S5**, my original F-1 repro (Play again at 200 ms into a 1500 ms save), plus a newer creation's active source written mid-save | **Stays on `/play/review-draft-5` in the replay, not yanked back** (`15`). History length is unchanged. The newer `activeSource` is kept. Writes: create 1, publish 1. |
| **S6**, browser Back at 200 ms into the save | Stays on `/`, not yanked back. The old draft's unchanged recovery record is cleared, as on a normal save. Writes: create 1, publish 1. |

- **Console:** only the deliberately scripted 500, plus one GET answered by the harness's default mocked 404. There were no other writes and no blocked hosts.
- **Protected services afterwards:** 5173, 15173, 8787 and 18799 all return 200.
- I didn't re-run the owner's 11 cases. The diff above and my three cases cover the guard, the save-once rule, the recovery-record check and the normal handoff and retry. I also did no full suite or build, as instructed.

### Residual, accepted and disclosed by the owner

Leaving Finish, reaching a later Finish of the same draft and clicking Share or Save & share again can publish a second *publication version*. Both are explicit clicks, and there is still only one saved copy.

| File | Shows |
|---|---|
| `15` | F-1 fixed: the player stays in the replay after the late save lands |
