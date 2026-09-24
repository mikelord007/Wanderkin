# ObjectQuest v2 browser QA findings — 2026-09-24

Independent Worker 11 verification on Chrome/Chromium, Windows, with isolated
high ports and a real local API for persisted-world QA. Paid submissions used
the repository fake MCP service.

## Finding summary

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 0 |

## High

### QA-11-01 — bundled Lost Colors audio is never requested after Play

- **Owner:** W6 audio
- **Reproduction:** Open Lost Colors, keyboard-activate the invitation's
  **Play** button, leave sound channels audible, and inspect browser network.
- **Expected:** Music, ambience, narration, and event WAV assets are requested
  after the required user gesture; sliders and mute affect playback.
- **Actual:** Headed and headless Chrome make zero `/audio/*.wav` requests. The
  subtitle, mute state, and four channel sliders render and persist without a
  page/console error, so the UI appears functional while no audio is delivered.
  The independent regression test fails (`expected >= 3`, received `0`).
- **Evidence:** [audio UI](qa/evidence/artifacts/audio-accessibility/audio-controls-subtitles-reduced-motion.png)
  and [phase-2 report](qa/evidence/worker11-a11y-audio-2026-09-24.md).

## Medium

### QA-11-02 — full browser suite is deterministically red from stale creation copy

- **Owner:** W4 creation / QA test maintenance
- **Reproduction:** Run the complete browser suite. `ui.test.ts:37` clicks
  **Create my world** and waits for **Add your photos**.
- **Expected:** The test follows the integrated creation screen or is retired.
- **Actual:** The product correctly shows **What will your world be made of?**,
  but the test waits 120 seconds for obsolete copy. Both runs ended 19 passed,
  1 failed, 9 skipped; no test changed status between runs.
- **Evidence:** [failure screenshot](qa/evidence/artifacts/suite-failure/obsolete-add-your-photos-heading.png)
  and [suite report](qa/evidence/worker11-suite-results-2026-09-24.md).

### QA-11-03 — saved bundled samples expose provider/model names to players

- **Owner:** design / W3 styles / W7 persistence
- **Reproduction:** Edit **The desk & sofa adventure**, save it, reload My
  worlds, and inspect the saved card.
- **Expected:** Titles stay provider-neutral like the welcome-page names.
- **Actual:** The card is titled **Room corner — Rodin**; the analogous Tripo
  manifest behaves the same way. The built bundle contains `rodin` 32 times,
  `tripo` 13, `kontext` 1, `livepeer` 3, `gemini` 1, and `chatterbox` 2;
  `pixverse` and `minimax` have no hits. Most are internal provenance or
  capability data, but these two manifest names are rendered after save.
- **Evidence:** [saved-world card](qa/evidence/artifacts/provider-copy/provider-name-in-saved-world.png)
  and `src/scene/samples.ts:227,365`. The real-API reproduction passed 1/1 and
  made no generation call.

## B1–B19 disposition

| ID | Result | Evidence or limitation |
| --- | --- | --- |
| B1 | Pass | Both original samples completed and replayed in both full runs. |
| B2 | Pass | Saturation rose 0.131896 → 0.300141 → 0.343783 → 0.354766 at 0/1/2/3 fragments; portal and finish passed. |
| B3 | Pass | Same-scene/style histogram distances were 0.642–0.843. |
| B4 | Pass | Collect and Race completed; Explore completed without a timer. |
| B5 | Pass, mocked jobs | Upload/review/crop/accept passed; camera denial was exercised in B15. |
| B6 | Pass, mocked jobs | No early 3D request; exact approved cutout/preview IDs reached Build. |
| B7 | Partial | Respawn preserved one reward and Collect restart cleared state. Race restart/stale-time and persisted best-time still need a dedicated check. |
| B8 | Pass | Editor mutations survived save/reload through the real local API. |
| B9 | Fail/partial | Style, mission, and media references survive reload, but QA-11-01 prevents an “audio intact” playback claim. |
| B10 | Pass, mocked job | Refresh/My worlds resumed the same seeded job identity. |
| B11 | Partial | Induced music failure exposed Retry and left Prepare enabled; play/save/share and asset-ID preservation were not exercised end to end. |
| B12 | Pass | Publication opened and played in an isolated context without regeneration. |
| B13 | Pass | Friend comparison retained publication version/target after private edits. |
| B14 | Fail | Focus, sliders, mute, subtitle one-shot, contrast, and reduced motion pass; audio delivery fails. |
| B15 | Partial | Camera denial, corrupt image, and valid recovery pass; oversized/excessive-dimension paths were not exercised. |
| B16 | Pending | Worker 8 gameplay capture was not on main. |
| B17 | Pending | Worker 8 postcard flow was not on main; live image-to-video evidence is absent. |
| B18 | Pass | Two saved-world replays submitted no generation POST. |
| B19 | Pass, seeded | Draft, pending, retryable/terminal failure, and playable actions passed. |

## Layout and accessibility

At 1280×800 and 375×812, welcome, capture, My worlds, and friend landing had
no horizontal overflow, unnamed visible control, hidden primary action, or
observed overlap. Desktop gameplay/completion were captured; mobile completion
was not. Coarse-pointer mobile showed the explicit keyboard/mouse-only notice.

Keyboard input covered sample entry, gameplay, pause/restart, audio controls,
and completion. The focused Music slider consumed `ArrowLeft` (`50 → 49`)
without moving the player, and focus rings were visible. Contrast spot checks
were 14.67:1 (subtitle), 4.96:1 (HUD text), and 7.52:1 (primary HUD control).
A single uninterrupted keyboard-only traversal of every creation screen was
not completed; component keyboard tests and the visible-control naming audit
do not prove that complete journey. See [layout evidence](qa/evidence/worker11-layout-2026-09-24.md)
and [a11y/audio evidence](qa/evidence/worker11-a11y-audio-2026-09-24.md).

## Performance on this machine

| Sample | Cartoon FPS / load ms | Hand-painted FPS / load ms | Watercolor FPS / load ms |
| --- | ---: | ---: | ---: |
| Rodin | 60.001 / 2,497.7 | 60.000 / 2,130.8 | 60.001 / 2,104.6 |
| Tripo | 59.951 / 1,564.7 | 60.001 / 2,245.7 | 59.501 / 2,031.6 |

Each FPS figure is a real 20-second rAF sample while holding `W`; p95 was
16.8 ms in all six cases. The historical `docs/SCENE.md` software-rendered
baseline is 111.940–141.244 ms/frame, but process differences prevent a
product-only attribution. `npm run build` passed: 764 modules, 7.47 seconds,
10,924,886-byte `dist`; the 4,979,900-byte Rodin GLB and 2,058,233-byte Rapier
chunk are largest. See [performance evidence](qa/evidence/worker11-performance-2026-09-24.md).

## Pending and out of scope

- B16/B17 await Worker 8; the later server-hardening branch was not included.
- No live paid-provider job was authorized, so provider quality, cost, timing,
  outage, and generated postcard/audio claims remain pending.
- B7 Race restart/best persistence, B11 full optional-failure recovery, B15
  oversize/dimension rejection, and mobile completion need direct evidence.
- The optional generated-GLB UI test skipped because
  `OBJECTQUEST_GENERATED_GLB_PATH` was not supplied.

## Hand-off to manual testing

Use the already-running local build at `http://127.0.0.1:5173/` with its API at
`http://127.0.0.1:8787`. If those processes are unavailable, start equivalent
local services on free high ports and substitute the app origin below.

1. At `http://127.0.0.1:5173/`, play **The desk & sofa adventure** and
   **A different perspective** to completion, then replay. Judge movement,
   camera, collision, mantle/jump feel, and whether the authored route is
   understandable without test diagnostics.
2. From the same page, open **The Lost Colors of Teacup Island**. Click Play,
   confirm music/ambience/narration are actually audible, collect all three
   fragments, watch each colour-restoration step, enter the activated portal,
   and replay. Specifically check whether QA-11-01 still produces silence.
3. Play **Teacup Island Wander** and confirm exploration feels complete without
   a timer. From Lost Colors completion choose Race: judge the countdown/timer,
   restart during a run, finish twice, and confirm the best time persists and
   does not use stale time from the restarted attempt.
4. Edit one saved world into Cartoon, Hand-painted, and Watercolor variants and
   play each from the same starting view. Judge whether geometry remains
   readable and the differences are attractive rather than merely detectable.
5. Choose **Create my world**. Try camera denial, a valid upload, a corrupt
   image, an oversized image, and an excessive-dimension image. Continue the
   valid image through review/crop, customize, preview approval, progress, and
   world-ready; check error usefulness and whether prior safe state survives.
6. Save and fully reload the created world. Verify style, mission, and audible
   media; edit an entity and reload again. Finish/replay while watching Network
   for unexpected generation POSTs. Publish and open the resulting
   `http://127.0.0.1:5173/share/<share-id>` in an Incognito window; confirm it
   opens the same immutable version without upload/generation.
7. Repeat welcome, creation, gameplay HUD/pause, completion, My worlds, and the
   share URL at 1280×800 and 375×812. Look for clipping, overlaps, unreadable
   HUD text, or hidden primary actions. On touch hardware, confirm the explicit
   keyboard/mouse support notice appears rather than implying touch gameplay.
8. Keyboard-only: traverse creation, enter/pause/complete play, toggle
   subtitles/mute, and adjust every audio slider with arrow keys. Confirm focus
   rings remain visible, slider arrows never move the player, narration does
   not repeat after death, and OS reduced-motion mode removes avoidable motion.
9. Only after Worker 8 lands, manually inspect B16 gameplay capture and B17
   postcard preview/download. Confirm overlays, downloads, resume behavior,
   and that generated postcards are not mislabeled gameplay recordings.
