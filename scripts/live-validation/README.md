# Live-validation runner

This runner executes the authorised ObjectQuest validation batch only through
the local ObjectQuest HTTP API. It never calls Livepeer directly. Run from the
repository root after setting the bounded server environment described in
`docs/LIVE_VALIDATION_PLAN.md`.

## Current paused audio-only resume

The next paid validation batch is **not authorised yet**. Its exact fresh
maximum is `$0.4124`: 15-second music (`$0.0315`), 15-second ambience
(`$0.1575`), seven 3-second event cues (`$0.2205`), and the unchanged
107-character narration (`$0.0029` ceiling). The retained batch ledger is
`$0.7247`, so the conservative batch total would be `$1.1371`; including the
earlier `$0.4620` spike gives `$1.5991` against the `$10` project ceiling.

The postcard must be passed as `--skip-postcard`. The current wrapper cannot
pin its resolution or audio, and the `$0.3413` quote is a lower bound rather
than an enforceable maximum. A skipped postcard is written as
`SKIPPED/BLOCKED`; it is never counted as success or reserved spend, and no
video request is submitted. This keeps the optional postcard deliverable open
for a separately bounded contract.

Rows 1–5 are fetched read-only by their known application job IDs and each
stored request must exactly match the stable planned request before any fresh
row is reserved. The old failed music key `oq-live-20260924-music` is never
retried; the corrected request uses `oq-live-20260924-music-v2`. Rows 7–15
retain their unused keys.

Safe zero-paid-call preflight against the existing isolated API:

```powershell
npx tsx scripts/live-validation/run.ts --dry-run --api http://127.0.0.1:18799 --max-usd 3 --reuse-photo-id 632f0492-579a-46ff-8436-b7649035fd98 --reuse-cutout-asset-id e4bd9b09-4912-44e8-9b71-6f2a6ff6f2c0 --reuse-ready-job cutout=job_737935e2-c54b-4c18-a6a6-782a7a4c69c8 --reuse-ready-job style-preview=job_ef2fde65-65e2-4d16-b8df-e75d53c93d85 --reuse-ready-job alternate-edit=job_f9bcf342-6254-4b38-9fa0-d32c797cb89f --reuse-ready-job mesh=job_662f0c8a-52f1-4e33-adad-fcff355e014d --reuse-ready-job quest=job_8df572b8-0ded-4e8b-b524-c3361698a1ca --skip-postcard
```

Only after separate approval, use the identical command without `--dry-run`.
That run still stops on any unready/mismatched reused job or failed fresh row.
When rows 6–15 are ready, it continues through the existing draft-save and
publish-or-repair handoff while recording the postcard as blocked.

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

The historical full-batch mode includes the 5-second animated postcard and the
one `gpt-image-edit` alternate call. It is not the approved recovery path.
`--skip-postcard` (with legacy alias `--no-postcard`) is mandatory for the
current audio-only resume, and no postcard capability success may be claimed.

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
