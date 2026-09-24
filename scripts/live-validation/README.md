# Live-validation runner

This runner executes the authorised ObjectQuest validation batch only through
the local ObjectQuest HTTP API. It never calls Livepeer directly. Run from the
repository root after setting the bounded server environment described in
`docs/LIVE_VALIDATION_PLAN.md`.

## Before authorisation (zero paid calls)

Start the API on a free port and isolated storage, then inspect the exact plan:

```powershell
$env:PORT='8799'
$env:STORAGE_DIR='./storage/live-validation-2026-09-24'
$env:LIVEPEER_MAX_REQUEST_USD='0.50'
$env:LIVEPEER_MAX_WORLD_USD='1.50'
$env:LIVEPEER_MAX_AUTOMATIC_RETRIES='0'
npx tsx server/index.ts
```

In a second terminal:

```powershell
npx tsx scripts/live-validation/run.ts --dry-run --api http://127.0.0.1:8799 --max-usd 1.50
```

Dry-run performs `GET /api/health` and prints the upload-independent request
templates. It does not upload and does not submit a generation job.

## After explicit spend authorisation

Use the same server process and storage directory:

```powershell
npx tsx scripts/live-validation/run.ts --api http://127.0.0.1:8799 --max-usd 1.50
```

The default includes the 5-second animated postcard and the one
`gpt-image-edit` alternate call required to execute every claimed capability.
`--no-postcard` and `--no-alternate-edit` exist only to narrow a separately
authorised batch; do not use them while claiming those capabilities were live
validated.

The runner uploads `public/samples/photo-4.jpg`, submits and polls every job,
approves the Kontext preview, builds the Rodin request from the reviewed cutout
while keeping that preview provider-inert as the style reference, saves a
draft, and attempts publication. A 422 publication response is recorded as
`repair-required`, because a new mesh must not inherit the bundled course's
usability claim without browser traversal. Repair and validate it in the
editor, then publish without any generation spend:

```powershell
npx tsx scripts/live-validation/run.ts --api http://127.0.0.1:8799 --max-usd 0 --publish-level-id live-validation-photo4-20260924
```

Do not retry by launching a fresh batch after an interruption. The app's
idempotency keys reconcile the same requests, but first inspect the persisted
jobs and ledger. The provider retains idempotency for 24 hours and the app's
safe automatic window is shorter.

## Evidence and ledger

Successful/failed application job identifiers, served capability/model,
fallback, timings, reported-or-unknown cost, and artifact hashes are appended
to `docs/evidence/live-validation-<date>.json`. Paid-run evidence is local
until reviewed; do not commit it accidentally.

Inspect the app ledger:

```powershell
Get-Content ./storage/live-validation-2026-09-24/spend-ledger.json | ConvertFrom-Json | ConvertTo-Json -Depth 20
Invoke-RestMethod http://127.0.0.1:8799/api/jobs/spend/live-validation-photo4-20260924 | ConvertTo-Json -Depth 10
```

Run the tooling tests with:

```powershell
npx vitest run --config scripts/live-validation/vitest.config.ts
```
