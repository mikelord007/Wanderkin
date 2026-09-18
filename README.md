# ObjectQuest

ObjectQuest is a browser game that turns photographs of a real room or
furniture corner into a playground for a toy-sized character. The private
source repository is <https://github.com/mikelord007/ObjectQuest>.

The bundled Rodin and Tripo sample levels require no Livepeer credentials or
new generation job. Photo-to-3D generation is an optional server-side flow.

## Run locally

Requirements: a current Node.js installation with npm.

```text
npm install
npm run dev
```

This starts the Vite client at `http://localhost:5173` and the Node API at
`http://localhost:8787`; Vite proxies `/api` requests to the server. Copy
`.env.example` to `.env` only when you need to override the default endpoint,
port, storage directory, or provide a server-side Livepeer key. Never expose
the key through a `VITE_` variable.

Open the client and choose a bundled sample for the credential-free path, or
choose the photo flow to upload compatible views, generate/import a GLB,
prepare its course, edit the manifest, save it, and play.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` or arrow keys | Move relative to the camera |
| Mouse | Look after the game captures the pointer |
| `Space` | Jump |
| `E` | Mantle when the contextual prompt appears |
| `R` | Respawn at the latest activated checkpoint |
| `Esc` | Pause and release the pointer |

## Verification commands

- `npm run typecheck` — strict client and server TypeScript checks
- `npm test` — Vitest suites
- `npm run test:e2e:http` — isolated full-server HTTP integration tests
- `npm run test:e2e:browser` — five repository-contained Chrome acceptance
  cases; the optional generated-artifact case is skipped unless its path is set
- `npm run build` — typecheck, production client bundle, and server compile
- `npx tsx src/scene/tools/verify-samples.ts` — conservative real-GLB route
  validation for both bundled courses

Both bundled courses have now been completed and replayed through the real game
UI in Chromium. The acceptance run used normal keyboard/mouse controls and
read-only diagnostics rather than teleporting or mutating checkpoints. See
[`docs/QA.md`](docs/QA.md) for the exact automated counts, browser protocol,
and remaining manual caveats.

To include the already-generated Rodin artifact in browser acceptance without
submitting another generation job, set `OBJECTQUEST_GENERATED_GLB_PATH` to its
local `.glb` path before running `npm run test:e2e:browser`. The final accepted
run used the 5,029,388-byte artifact identified below and passed all six cases.

A single bounded real Rodin generation also succeeded. The first submission
failed because its seed was invalid; that input was corrected before the
second submission. The successful application job was `411dc7d9`, backed by
provider job `mjob_cfb2286bf2b5`, and produced a locally stored 5,029,388-byte
GLB with SHA-256
`71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42`.
The local bytes were re-hashed to verify the stored asset. Registered-model
provenance was resolved from live capability metadata; the provider result did
not return a direct `served_model_id`.

## Current limits

- The authored Rodin and Tripo samples are browser-completed, but that does not
  prove an arbitrary generated course is reachable. Generic preparation uses a
  conservative validator, reports uncertainty, and may require creator edits.
- Portable level export/import completed a real Chrome
  save/download/import/reload round trip against an isolated API. The existing
  real Rodin result also completed preparation, candidate switching, editor
  save, and reload without another provider call.
- Local storage under `STORAGE_DIR` is durable for one server installation;
  localhost asset URLs are not public sharing links.
- Desktop keyboard, mouse, and pointer lock are supported; mobile/touch and
  audio are not currently supported.

Architecture and current milestone state are in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Integration
contracts are in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

Deployment uses separate frontend and API processes behind one public origin:
serve the built client statically, route `/api/*` to one Node process, and mount
durable storage for that API. The complete topology and release checks live in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Separate reference deployment

The original mesh-comparison project remains a separate, read-only reference:
<https://livepeer-room-mesh-comparison.lordmike007.chatgpt.site/>. ObjectQuest
must use its own repository and deployment configuration; do not overwrite or
redeploy the comparison site when shipping the game.
