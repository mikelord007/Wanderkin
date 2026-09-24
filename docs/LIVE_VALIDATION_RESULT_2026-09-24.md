# ObjectQuest v2 live-validation result — 2026-09-24

Status: authorized live validation in progress.

## Dry-run checkpoint

- Isolated API: `http://127.0.0.1:18799`
- Storage: `./storage/live-validation-2026-09-24`
- Server limits: `$0.50` per request, `$3.00` per world, zero automatic retries
- Runner command: `npx tsx scripts/live-validation/run.ts --dry-run --api http://127.0.0.1:18799 --max-usd 3`
- Planned rows: 16, including the `gpt-image-edit` alternate and five-second `pixverse-i2v` postcard
- Planned maximum: **$1.4259**
- Runner exit: 0
- Submission check: `/api/jobs/spend/live-validation-photo4-20260924` returned `knownUsd: 0`, `unknownEntries: 0`, `entries: 0`; neither `spend-ledger.json` nor `jobs.json` existed after the dry run.

No billable request was submitted during this checkpoint.
