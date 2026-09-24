# Batch 2 handoff — final branding/URL/private-identity verification

Session role: Fresh Claude Sonnet worker for coordinator `30e37344-f303-4b8a-80c8-ee9f8fd5f3d6`
(matches the plan's `fc1cff3a-33b8-4115-9a2b-8f0c6700b887` assignment: "final screenshot-branding
rendering/fit and narrow checks, read-only morning URL/service/private-level integrity checks").
No subagents used. Source tree was read-only except for one narrowly scoped temp fixture under
`nimbalyst-local/screenshots/` (deleted after use) and this checkpoint file.

**Runtime model actually used this session: Sonnet 5 (`claude-sonnet-5`), per this runtime's own
system context — not inferred from a requested alias. No GPT/Haiku/other-family fallback occurred.**

## Final revision

`837a7200a2ec9d2d5541d90881920e6c5361c763` — "fix: use BRAND_NAME on exported world screenshot
badge". Confirmed via `git status --short` (tracked paths only): clean, no source dirt. Only
pre-existing untracked `nimbalyst-local/*` planning artifacts present, as expected.

## 1. Watermark badge fix — independently re-verified, not just re-read

Read the exact `837a720` diff (`git show`): `src/capture/screenshot.ts` now imports `BRAND_NAME`
from `../brand.js` and draws `BRAND_NAME.toUpperCase()` at the same pill/font/position (162px pill
at x=1030..1192, text centered at x=1111, font `800 17px system-ui, sans-serif`). `BRAND_NAME` in
`src/brand.ts:16` is `"Mousehold"` — uppercases to `"MOUSEHOLD"`.

Did not just trust the prior worker's measureText claim — reproduced the exact draw calls (same
font string, same pill geometry, same fillText call) in a throwaway local HTML fixture opened via
the browser tool (no dev-server dependency, no paid calls, no world save) and ran
`context.measureText` live:

- Measured width of `"MOUSEHOLD"`: **110.209px** (commit message claimed 110.2px — matches).
- Pill interior: 162px, so margin each side: **25.9px** — comfortably positive, no clipping.
- Text left/right edges (1055.9 / 1166.1) sit strictly inside the pill bounds (1030 / 1192).
- `fitsWithoutClipping: true` computed programmatically, not eyeballed.

Also viewed the committed evidence PNG (`nimbalyst-local/screenshots/brand-badge-check.png`,
220×90, valid PNG per header/file size) — this session's image viewer rejected rendering it inline,
but the file itself is intact (not corrupt) and the independent numeric re-derivation above is the
stronger evidence anyway, since it doesn't depend on eyeballing a screenshot.

Ran only the relevant existing checks (no full 474-suite repeat):
- `npx vitest run src/capture` → **7/7 passed** (recorder.test.ts, usePostcard.test.ts, MediaCards.test.ts).
- `npx tsc --noEmit` → **clean, exit 0**.

**Verdict: badge fix is correct, fits without clipping, independently confirmed.**

## 2. Morning URLs — route HTTP 200 vs actual gameplay, kept distinct

All checked read-only via `curl`, live services untouched, no restarts:

| URL | HTTP | Note |
|---|---|---|
| `http://localhost:5173/` | 200 | SPA shell serves |
| `http://localhost:5173/worlds` | 200 | SPA shell serves |
| `http://localhost:5173/play/sample-rodin-room-corner` | 200 | SPA shell serves |
| `http://127.0.0.1:15173/` | 200 | SPA shell serves |
| `http://127.0.0.1:15173/worlds` | 200 | SPA shell serves |
| `http://127.0.0.1:15173/#my-worlds` (legacy hash) | 200 | Same doc, still resolves |
| `http://localhost:8787/api/health` | 200, `{"status":"ok"}` | Main API |
| `http://localhost:18799/api/health` | 200, `{"status":"ok"}` | Isolated API |

**These HTTP 200s confirm the route resolves and the SPA shell/API respond — they are NOT a claim
of successful interactive 3D gameplay/pointer-lock.** That distinction is deliberate per the
assignment. The separate Opus worker (`8926d07f-8c42-4867-b5d1-c809c4ed137e`) owns actual
production pointer-lock/readiness investigation; this session did not touch GameView, browser
game state, or repeat that investigation.

Protected ports confirmed listening, untouched, no restarts issued: 5173 (PID 32220), 8787 (PID
37556), 15173 (PID 36188), 18799 (PID 37008 — matches the plan's last-reported PID, confirming the
isolated API process was not restarted).

## 3. Private level identity / 10 audio assets — read-only GET, confirmed intact

`GET http://localhost:18799/api/levels/live-validation-photo4-20260924-hands-on` (read-only, no
write/retry/generate/publish call made):

- `levelId`: `live-validation-photo4-20260924-hands-on` — unchanged.
- `name`: `"The Cozy Corner Color Caper!"` — unchanged.
- `updatedAt`: `2026-09-24T15:01:34.988Z` — matches the last-known write time, i.e. nothing wrote
  to this level during this verification pass.
- `media.audio`: **exactly 10 entries**, canonical order preserved — music (15s), ambience (15s),
  7× sfx (3s each), narration (**8.52s**, matching the plan's "repaired to 8.52" note) — each with
  its own sha256, no duplicates, no drift.
- `media.video`: 0 entries — matches "zero publication/video" from the plan.
- `assets`/`photos`: 1 each, unchanged provenance (Rodin i3d model, one reviewed source photo).

**Verdict: private-world identity and all 10 audio assets are byte-identical/unchanged. No write
path was exercised.**

## 4. Committed asset/logo/style-preview paths — all serve correctly

- `/brand/mousehold-mark.svg` → 200 (favicon + boot-screen mark, referenced from `index.html:12`).
- `/style-previews/room-photo.jpg` (reference photo) → 200.
- `/style-previews/room-cartoon.jpg`, `room-hand-painted.jpg`, `room-watercolor.jpg` → 200 each.
- `/style-previews/provenance.json` → 200.

## 5. Persisted protocol keys — compatibility unaffected by this branch's only diff

`837a720` touched only `src/capture/screenshot.ts` (plus its own checkpoint/screenshot docs) —
no changes anywhere near `shared/manifest.ts`, `shared/manifest-migration.ts`, `creationStorage.ts`,
`draftStorage.ts`, `jobStorage.ts`, or any `objectquest:*` key definitions. The fetched live level
JSON still reports `schemaVersion: 1` and `coordinateConvention: "y-up-right-handed-meters"`, i.e.
the persistence contract observed in production storage is unchanged. No new compatibility risk
introduced since the prior full QA pass (`39fd875`, 474 unit / 46 HTTP / typecheck / build).

## Genuine blockers

**None found in this session's bounded scope.** No defect, no regression, no clipping, no broken
route, no stale/lost audio, no broken asset path.

The only pre-existing, already-disclosed gap (not this session's to close, not duplicated here):
click-to-play → pointer-lock-engage → HUD-interaction remains interactively unverified in a
headless environment — owned by the separate Opus worker `8926d07f-8c42-4867-b5d1-c809c4ed137e`.
This session did not touch GameView, input handling, or browser game state, and did not attempt to
re-run or second-guess that investigation.

## Budget

No paid/provider calls made this session (no LivePeer, no upload, no generation). Overnight
round spend unchanged at the coordinator's last-recorded figure: **$0.1260** of the additional $10
authorization; conservative project total **$1.7881**; actual settled billing still unknown. No
new allocation requested or needed.

## Artifacts

Temp verification fixture `nimbalyst-local/screenshots/batch2-badge-fixture.html` was created,
used for the live `measureText` re-derivation above, and then deleted (throwaway, not part of the
product, not committed). This checkpoint file is the only artifact from this session intended to
persist, and will be committed through the Nimbalyst mandatory commit tool only — no CLI commit,
no unrelated staging.

## Stop

Bounded assignment complete. No further self-directed work; any new instruction needs to come
from the coordinator.
