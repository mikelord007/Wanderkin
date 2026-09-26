# Wanderkin API on Google Cloud (runbook)

Deployed 2026-09-26 by the orchestrator session at the user's request. Client stays on
Vercel (https://wanderkin-tau.vercel.app); the Node API runs on one Compute Engine VM and
Vercel rewrites `/api/*` to it, so the browser sees a single origin and cookies work.

## Topology

```
browser ── https://wanderkin-tau.vercel.app ──┬── static client (Vercel)
                                              └── /api/* ── rewrite ──► https://wanderkin.duckdns.org
                                                                           Caddy (TLS, :443) ──► wanderkin-api container :8787
                                                                           /mnt/data (persistent disk) = STORAGE_DIR
```

| Item | Value |
| --- | --- |
| Google Cloud project | `task-orchestrator-507812` (Task Orchestrator), billing account "agentic hack" |
| Region / zone | `asia-south1` / `asia-south1-a` (Mumbai) |
| VM | `wanderkin-api`, e2-small, Debian 12, network tag `wanderkin-api` |
| Static IP | `wanderkin-api-ip` = 34.100.163.119 |
| Data disk | `wanderkin-data`, 20 GB pd-balanced, mounted at `/mnt/data` |
| Firewall | `wanderkin-web`: tcp 80/443 from anywhere to tag `wanderkin-api` |
| Image repo | `asia-south1-docker.pkg.dev/task-orchestrator-507812/wanderkin/api:<git sha>` |
| DNS | `wanderkin.duckdns.org` → 34.100.163.119 (user's DuckDNS account) |
| Startup script | `nimbalyst-local/gcp/startup.sh` (attached as instance metadata `startup-script`) |

The startup script is idempotent and runs on every boot: installs Docker if missing,
formats/mounts the data disk once, pulls the image named in metadata, and (re)starts the
`wanderkin-api` and `wanderkin-caddy` containers. Settings come from instance metadata:
`image`, `api-host`, `supabase-url`, `legacy-owner-email`.

Server environment set by the script: `NODE_ENV=production`, `STORAGE_DIR=/data/objectquest`,
`WANDERKIN_AUTH_MODE=supabase`, `SUPABASE_URL`, `WANDERKIN_LEGACY_OWNER_EMAIL`,
`OBJECTQUEST_SECURE_COOKIE=true`, `OBJECTQUEST_LEGACY_OPEN=false`, `TRUST_PROXY_HOPS=2`
(Vercel edge + Caddy). No Livepeer API key: keyless mode with the default budget caps.

## Redeploy after a code change

Run from the repo root with the gcloud CLI (installed per-user at
`%LOCALAPPDATA%\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd`):

```powershell
$sha = git rev-parse --short HEAD
gcloud builds submit --region asia-south1 --tag asia-south1-docker.pkg.dev/task-orchestrator-507812/wanderkin/api:$sha .
gcloud compute instances add-metadata wanderkin-api --zone asia-south1-a --metadata image=asia-south1-docker.pkg.dev/task-orchestrator-507812/wanderkin/api:$sha
gcloud compute ssh wanderkin-api --zone asia-south1-a --command "sudo google_metadata_script_runner startup"
```

The last command re-runs the startup script, which pulls the new image and restarts the
containers. Downtime is a few seconds. Data on `/mnt/data` is untouched.

## Logs and health

```powershell
gcloud compute ssh wanderkin-api --zone asia-south1-a --command "sudo docker logs --tail 200 wanderkin-api"
gcloud compute ssh wanderkin-api --zone asia-south1-a --command "sudo docker logs --tail 100 wanderkin-caddy"
gcloud compute ssh wanderkin-api --zone asia-south1-a --command "sudo journalctl -u google-startup-scripts --no-pager | tail -50"
```

Health: `https://wanderkin.duckdns.org/api/health` and, through Vercel,
`https://wanderkin-tau.vercel.app/api/health` must return `{"status":"ok"}`.

## Backups

All server state is on the `wanderkin-data` disk. Snapshot it before risky changes:

```powershell
gcloud compute disks snapshot wanderkin-data --zone asia-south1-a --snapshot-names wanderkin-data-$(Get-Date -Format yyyyMMdd)
```

A daily snapshot schedule can be attached with `gcloud compute resource-policies create snapshot-schedule`.

## Copying local worlds to the server (optional)

The local `storage/` folder holds every world made on this machine. To move it up:

```powershell
gcloud compute ssh wanderkin-api --zone asia-south1-a --command "sudo docker stop wanderkin-api"
gcloud compute scp --recurse storage wanderkin-api:/tmp/storage --zone asia-south1-a
gcloud compute ssh wanderkin-api --zone asia-south1-a --command "sudo rsync -a /tmp/storage/ /mnt/data/objectquest/ && sudo chown -R 1000:1000 /mnt/data/objectquest && sudo docker start wanderkin-api"
```

Worlds made before sign-in existed are claimed by the account whose email matches
`WANDERKIN_LEGACY_OWNER_EMAIL` on its first sign-in against this server.

## Cost (approximate, asia-south1)

e2-small ~$14/month, 20 GB pd-balanced ~$2.4/month, static IP ~$3/month, egress small.
Stop the VM with `gcloud compute instances stop wanderkin-api --zone asia-south1-a` to pause
compute charges; the disk and IP keep billing while reserved.

## Log

- 2026-09-26 19:30 IST: APIs enabled, IP/disk/firewall created, Artifact Registry repo `wanderkin`.
- 2026-09-26 19:33 IST: first Cloud Build failed: the Dockerfile did not copy `tsconfig.base.json`, so
  `npm run typecheck` ran with default compiler options. Fixed in the Dockerfile (also copies `vitest.config.ts`).
- 2026-09-26 19:38 IST: second build failed: `scripts/` was not copied and a server test imports `scripts/storage-gc.ts`. Added `COPY scripts ./scripts`.
- 2026-09-26 19:45 IST: build b1f95460 SUCCESS, image tag `9cda2ab`. VM `wanderkin-api` created; startup script installed Docker, mounted the disk, started both containers. Caddy obtained a certificate for wanderkin.duckdns.org on first request.
- 2026-09-26 19:50 IST: `https://wanderkin.duckdns.org/api/health` → `{"status":"ok"}`; `/api/auth/config` → mode supabase, legacy owner configured. Vercel rewrite for `/api/*` committed next.
