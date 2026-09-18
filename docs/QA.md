# ObjectQuest QA

This document separates automated evidence, mocked-provider integration,
and real-browser acceptance. A passing headless test is not a claim that a
course has been completed in a browser.

## Current verification status (2026-09-18)

- `npm test`: **253 passed** across 29 unit/headless test files on the
  integrated scene/editor/game/server revision.
- `npm run test:e2e:http`: **24 passed** across 5 HTTP integration files.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**; Vite emitted the client and TypeScript
  emitted the server. Vite reports a non-fatal large-chunk warning.
- `npm run test:e2e:browser` with `OBJECTQUEST_GENERATED_GLB_PATH` set to the
  accepted local artifact: **6 passed** in real headless Chrome. Both sample
  courses reached the visible finish screen and replayed using held keyboard
  controls, mouse camera movement, and read-only diagnostics.
- Real Livepeer generation: **not run by QA**. The HTTP suite points only
  at a local fake MCP endpoint and cannot spend provider allowance.
- A full server with relative `STORAGE_DIR` served uploaded photo/GLB bytes,
  and the existing real Rodin result from provider job `mjob_cfb2286bf2b5`
  completed isolated preparation/editor/save acceptance.

## Automated commands

Install the locked dependencies once:

```sh
npm install
```

Run the fast unit/headless suite:

```sh
npm test
```

Run the HTTP route integration suite:

```sh
npm run test:e2e:http
```

Run real-browser gameplay and UI acceptance:

```sh
npm run test:e2e:browser
```

That default command runs the five repository-contained cases and reports the
generated-artifact case as skipped, not passed. To run all six without a new
generation request, point the optional environment variable at an existing
local GLB first. The accepted Windows run used:

```powershell
$env:OBJECTQUEST_GENERATED_GLB_PATH = "C:/Users/manuj/code_barely_runs/Objectquest/storage/assets/71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42.glb"
npm run test:e2e:browser
```

Run static and production checks:

```sh
npm run typecheck
npm run build
```

## HTTP integration harness

`tests/e2e/http` starts the actual `server/index.ts` entry point through the
repository's pinned `tsx` binary. Each test file uses an operating-system
assigned port and a new temporary `STORAGE_DIR`, so it does not touch the
development API on port 8787 or its data. Restart coverage deliberately
reuses one temporary storage directory across two API processes, then
removes it.

The Livepeer boundary is a local fake JSON-RPC/MCP server. Tests assert on
the calls received by that fake. No test in this directory uses
`https://agent.livepeer.org` or submits real generation.

Current route coverage includes:

- Photo order, byte-identical download, magic-byte validation, minimum
  size, empty uploads, and mixed valid/invalid batches.
- Imported Rodin and Tripo GLBs, SHA-256 content addressing, deduplication,
  byte-identical durable URLs, GLB header validation, and path rejection.
- Relative `STORAGE_DIR` startup through the actual server process, followed
  by byte-identical photo and GLB downloads from the returned durable URLs.
- Live capability filtering and a safe 503 when no capability can be
  confirmed by the fake provider.
- Concurrent same-key job submissions: both callers receive the same job
  and exactly one `run_capability` call is made.
- Idempotency-key payload mismatch: HTTP 409 and no second provider call.
- API process restart with the same durable storage: the same job is
  reconciled and not resubmitted.
- Retry with an existing provider job ID: status is polled and generation
  is not submitted again.
- Retry after a retryable pre-provider failure: the identical idempotency
  key, source URL, and provider inputs are reused; the photo is not
  uploaded twice.
- Provider URL/token redaction and stable `{ "message": "..." }` route
  errors for invalid/unknown job requests.

## Real-browser acceptance evidence

The Playwright suite launches the real Vite application on port 5174 using
the installed Chrome channel. API-dependent UI tests start the actual
`server/index.ts` on an assigned port with isolated temporary storage and
forward browser `/api` traffic there. That API points only to the local fake
MCP endpoint.

Verified in-browser:

- Rodin: pointer lock, mouse yaw, ordered checkpoints, `Escape` pause and
  pointer-lock release, resume, `R` respawn, measured jump, out-of-bounds
  fall/automatic respawn, observed mantle state onto elevated furniture,
  finish screen, and replay to zero checkpoints.
- Tripo: the same gameplay code and controls, including jump, pause/resume,
  contextual mantle onto the elevated course, finish, and replay.
- Photo lightbox: two real sample JPEGs uploaded to the isolated local API;
  `ArrowRight`, `ArrowLeft`, and `Escape` changed/closed the dialog.
- Editor: scale, spawn X, checkpoint trigger radius, and helper width were
  changed, saved through the real isolated API, then verified after a page
  reload and reopening the saved level.
- Portable level: an edited Tripo sample used the visible **Save & export**
  action, produced an actual `.objectquest.json` browser download, and was
  uploaded through **Import level bundle**. The imported editor restored the
  changed value, and a full reload rediscovered both distinct durable copies.
- Previously generated Rodin artifact: the 5,029,388-byte GLB with SHA-256
  `71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42`
  was imported into the isolated API, prepared into three course candidates,
  switched between candidates with independent drafts, saved through the
  editor, and reopened after reload. This reused the already-downloaded result;
  QA did not submit or retry generation.

No teleport, checkpoint mutation, completion callback, or game-state write
is present in the suite. `window.__objectquest.get()` is read only and is
used for steering and assertions. The final checkpoint naturally unmounts
GameView and displays the finish screen.

## Manual browser protocol

Run this only from a fully integrated branch where typecheck/build pass and
the sample manifests are available. Use a separate browser profile/session
from the lead's `objectquest-acceptance` session. Start with a fresh QA
storage directory so saved levels do not contaminate another run:

```powershell
$env:STORAGE_DIR = Join-Path $env:TEMP "objectquest-browser-qa"
npm run dev
```

The client is `http://localhost:5173`; its `/api` requests proxy to the API
at `http://localhost:8787`.

For both the Rodin and Tripo sample cards:

1. Choose **Play now** and wait for the real first-frame-ready state.
2. Click the game to acquire pointer lock. Move with `W/A/S/D` or arrows
   and rotate the camera with real mouse movement.
3. Press `Space` to jump during traversal. Reach the authored elevated
   furniture route; when the visible mantle prompt appears, press `E`.
4. Collect checkpoints in order using only movement controls. Confirm a
   premature later checkpoint does not advance progress.
5. Press `R` after at least one checkpoint and confirm return to its safe
   respawn. Also walk/fall out of bounds once and confirm automatic
   respawn without losing collected progress.
6. Press `Escape`; confirm pause and pointer-lock release. Resume through
   the visible UI and continue with real input.
7. Collect the final checkpoint and require the visible finish screen.
   Select **Play again** and confirm checkpoint progress resets.

During those steps, `window.__objectquest.get()` may be read to record
position, grounded/mantling state, next checkpoint, completion, collision
triangle count, and warnings. It is diagnostics only. Do not mutate game
state, teleport the player, rewrite checkpoint counts, or invoke completion
from automation.

Additional browser checks:

- Upload multiple fixture photos, enlarge one, and use real `ArrowLeft` /
  `ArrowRight` keys to change the caption and image; `Escape` must close the
  lightbox.
- Edit spawn, scale, a checkpoint, and helper geometry; save, reload the
  page, reopen the saved level, and verify each value persisted.
- Export the saved level, import it as a new level, and verify the remapped
  asset/photo URLs load before playing it.

The automated evidence above covers the gameplay path, including Escape
pointer-lock release. A final manual pass should still confirm visual feel.
The portable export/import workflow is covered by the isolated real-browser
test above; no direct-route shortcut is used for that acceptance claim.

