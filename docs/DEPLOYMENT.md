# ObjectQuest v2 deployment

ObjectQuest must use a dedicated origin. Do not replace or reconfigure the
preserved comparison site at
`livepeer-room-mesh-comparison.lordmike007.chatgpt.site`.

The supported production shape is one static Vite client and one Node API
behind the same public origin. Route `/api/*` to the API. Serve real static
files when they exist and fall back every other client route, including
`/share/:shareId`, to `index.html`. Mount one durable writable volume at
`STORAGE_DIR` for all server state.

## Requirements and local setup

- Node.js 22 LTS and npm (the container image pins Node 22).
- A current Chromium-class desktop browser for the verified gameplay path.
- Docker is optional for local development.

Install exactly the lockfile and start both development processes:

```sh
npm ci
npm run dev
```

Vite listens at `http://localhost:5173` and proxies `/api` to the Node API at
`http://localhost:8787`. The API reads `.env` through `dotenv`. Copy
`.env.example` to `.env` only to override defaults; `.env` is ignored by Git.
Operational checks should report only whether `.env` and required variables
are present, never their values.

Build and run the production API:

```sh
npm run build
npm start
```

`npm run build` writes the static client to `dist/` and compiled API to
`dist-server/`. Both `npm start` and the explicit `npm run start:api` execute
the compiled Node API with the narrow `deploy/alias-loader.mjs` resolver needed
for compiled `@shared/*` imports; neither serves `dist/`. In production the
edge/static tier must serve `dist/` and proxy `/api/*` to this API process.

## Environment reference

All variables are read only by the server. Do not create `VITE_*` copies of
credentials or budget settings.

| Variable | Code default | Required? | Purpose |
| --- | --- | --- | --- |
| `PORT` | `8787` | No | Internal API listen port. Set it to the port assigned by the platform. |
| `STORAGE_DIR` | absolute resolution of `./storage` | Production: yes | Root of the durable writable volume. The default is suitable only for local use or when the container path is backed by a volume. |
| `LIVEPEER_MCP_ENDPOINT` | `https://agent.livepeer.org/api/mcp/full` | No | Trusted server-side Livepeer Agent MCP endpoint. |
| `LIVEPEER_API_KEY` | empty | Only for API-key mode | Optional server secret. An empty value selects keyless access. Never expose it to the browser, logs, image, or repository. |
| `LIVEPEER_MAX_REQUEST_USD` | `2` | No | Positive per-request estimated-cost ceiling. Invalid, zero, or negative values fall back to `2`. |
| `LIVEPEER_MAX_WORLD_USD` | `8` | No | Positive cumulative estimated-cost ceiling for one world budget key. Invalid, zero, or negative values fall back to `8`. |
| `LIVEPEER_MAX_AUTOMATIC_RETRIES` | `3` | No | Automatic retry ceiling; accepted range is integer `0`–`5`, otherwise it falls back to `3`. |

### Keyless and API-key modes

- **Bundled/offline demo:** no provider access is needed. The Lost Colors,
  Explore, Rodin, and Tripo samples load from `public/samples/`.
- **Keyless generation:** leave `LIVEPEER_API_KEY` empty. Requests use the
  endpoint's shared keyless allowance and still pass ObjectQuest's per-request,
  per-world, and retry guards. Availability and allowance are external state;
  check them before a paid demo.
- **API-key generation:** inject `LIVEPEER_API_KEY` through the platform's
  secret manager. The same local budget guards apply. Never bake the key into
  the image or static client.

The configured limits are safety ceilings, not an authorization to spend.
ObjectQuest records estimated reservations and final dispositions locally;
provider-reported metered cost may remain unknown.

## Durable volume layout

Mount the entire `STORAGE_DIR`, not individual files. Current stores are
single-process JSON indexes with atomic rename and in-process write queues, so
run exactly one API replica against a volume.

```text
STORAGE_DIR/
├── jobs.json                 durable jobs, requests, status, and provenance
├── spend-ledger.json         reservations and per-world/request spend records
├── preview-cache.json        reusable/approved style-preview entries
├── photos.json               uploaded-photo metadata
├── photos/                   uploaded JPEG, PNG, and WebP bytes
├── assets.json               GLB metadata and source provenance
├── assets/                   generated/imported GLB bytes
├── generated-assets.json     generated image/audio/video metadata
├── generated-assets/         style previews, music, SFX, TTS, and postcards
├── levels.json               private saved/draft world manifests
└── published-levels.json     immutable public share snapshots
```

There is no automatic expiration or garbage collection. Back up and restore
the volume as one unit because manifests and publications reference the stored
files by same-origin `/api/...` URLs. Keep the volume private; publication
controls are enforced at the manifest layer, not by filesystem separation.

## Request and stored-media limits

| Input/output | Limit | Validation |
| --- | ---: | --- |
| Photo upload | 10 files/request, 20 MiB/file; 512-byte minimum | JPEG, PNG, or WebP magic bytes; MIME declarations are not trusted. |
| JSON request body | 10 MiB | Express body parser returns `413` when exceeded. |
| Imported/downloaded GLB | 150 MiB | Binary glTF v2 magic, declared length, and size are checked. |
| Generated image | 25 MiB | PNG, JPEG, or WebP signature is checked. |
| Generated audio | 75 MiB | WAV, MP3, or Ogg signature is checked. |
| Generated video | 200 MiB | MP4 or WebM signature is checked. |
| Portable world bundle | 220 MiB encoded request body | Manifest and embedded assets are validated during import. |

These are byte/file-count limits, not decoded-pixel or decompression-bomb
limits. The reverse proxy should cap request bodies consistently and must not
set a lower limit than the route being used. The sample Caddy configuration in
`deploy/Caddyfile` leaves enforcement to the application.

## Production topology

```text
browser ── HTTPS dedicated origin ──┬── /api/* ── Node API :8787
                                    └── files/client routes ── dist/
                                                         └── index.html fallback
Node API ── /data/objectquest (durable volume)
         └── Livepeer MCP over outbound HTTPS
```

`deploy/Caddyfile` is a concrete same-host example. Point its site address at
the dedicated ObjectQuest hostname, place the built `dist/` at the configured
static root, and keep the API on loopback or a private network. The Dockerfile
builds both client and server and runs the Node API; use the built `dist/`
artifact in the platform's static tier or mount/copy it to the proxy host.

The API deliberately sends no CORS headers because the supported browser path
is same-origin. A separate public API hostname is unsupported without product
changes for an explicit API base URL and narrowly scoped CORS. Keep generated
media same-origin so GLB textures, audio, video, canvas capture, and downloads
do not fail browser CORS checks. Preserve `Range` requests at the proxy for
media seeking and do not rewrite `/api/*` responses to `index.html`.

Health probe: `GET /api/health` must return HTTP 200 and `{"status":"ok"}`.
The probe confirms that the process responds; it does not test the durable
volume or provider health.

## Platform checklist

- [ ] Reserve a new dedicated hostname; do not reuse the comparison-site origin.
- [ ] Provision a single Node 22 API service from the release revision.
- [ ] Run `npm ci && npm run build`, publish `dist/`, and start the API with
  `npm start`.
- [ ] Route `/api/*` to the API before applying the SPA fallback.
- [ ] Serve existing `dist/` files and fall back `/share/*` plus all other
  non-file client routes to `dist/index.html`.
- [ ] Attach a durable writable volume and set `STORAGE_DIR` to its mount path.
- [ ] Configure `PORT`, budget/retry ceilings, and optionally the API key in the
  platform secret manager.
- [ ] Allow outbound HTTPS from the API to the configured MCP endpoint.
- [ ] Enable HTTPS, response compression, and media byte-range forwarding at
  the edge; keep client and API on one origin.
- [ ] Verify `/api/health`, a direct `/share/<known-id>` page load, refresh of a
  pending job, a stored GLB, and audio/video loading from the public origin.
- [ ] Back up the complete storage volume and document restore/retention policy.
- [ ] Run the release checks and the real-browser checklist from `docs/QA.md`.

## Deployment status and remaining requirement

No authorized deployment account, platform project, dedicated hostname, DNS
zone, TLS configuration, or durable-volume target is identified in this
repository. Preparation is complete, but deployment requires an owner to
provide all of the following as one authorized target: **the platform/project
and credentials, the dedicated ObjectQuest hostname with DNS/TLS control, the
durable volume mount path, and the chosen keyless or secret-backed API-key
mode with approved budget limits**. No deployment should occur until those
details are supplied.
