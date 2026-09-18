# ObjectQuest QA

This document separates automated evidence, mocked-provider integration,
and real-browser acceptance. A passing headless test is not a claim that a
course has been completed in a browser.

## Current verification status (2026-09-18)

- `npm test`: **221 passed** across 22 unit/headless test files.
- `npm run test:e2e:http`: **23 completed** across 4 HTTP integration files.
  One of the 23 is an explicit expected-failure regression for the upload
  limit bug below; therefore this is not 23 clean acceptance checks.
- `npm run typecheck`: **blocked** only by the not-yet-integrated scene
  preparation exports: `src/scene/index.js` and `src/scene/samples.js`.
- Production build: **not complete**, because `npm run build` starts with
  the failing typecheck above.
- Real browser play-through: **not run yet**. Neither sample course has
  been claimed complete through real keyboard/mouse input.
- Real Livepeer generation: **not run by QA**. The HTTP suite points only
  at a local fake MCP endpoint and cannot spend provider allowance.

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

Run static and production checks after scene integration:

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

### Known HTTP defect

An upload larger than 20 MiB reaches Multer's configured limit but returns
HTTP 500 instead of a safe 400/413 JSON body. Multer rejects before the
route callback, and `server/index.ts` currently has no terminal middleware
that maps `MulterError` to the public error shape. The executable
regression is marked `it.fails`; this keeps the desired behavior visible
without treating the current 500 as correct. Remove that marker when the
server-owned fix lands.

## Real-browser acceptance protocol

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

Browser acceptance remains blocked until scene integration lands. Portable
export/import browser acceptance also requires a UI trigger; the current
editor documentation records server routes but no client control. Record
these as blockers, not passes, if they are still absent at execution time.

