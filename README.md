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
- `npm run build` — typecheck, production client bundle, and server compile
- `npx tsx src/scene/tools/verify-samples.ts` — conservative real-GLB route
  validation for both bundled courses

The current integrated parent was confirmed with a full build and 225 passing
tests. Those are headless/build results, not browser acceptance. A real Chrome
run exposed a viewport/root flex boot-layout bug now assigned to the game
workstream, and no complete browser play-through has yet been recorded. An
oversized HTTP request returning 500 instead of the intended client error is
also assigned to the editor/server integration workstream.

## Current limits

- The Rodin helper climb is completed by the real headless Rapier simulation;
  both sample courses pass conservative geometry validation. Neither result
  substitutes for a full browser completion, especially for Tripo.
- Generic generated courses report uncertainty and may need creator adjustment.
- Livepeer adapter tests use fixtures. No new paid generation was run for the
  current acceptance cycle.
- Local storage under `STORAGE_DIR` is durable for one server installation;
  localhost asset URLs are not public sharing links.
- Desktop keyboard, mouse, and pointer lock are supported; mobile/touch and
  audio are not currently supported.

Architecture and current milestone state are in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Integration
contracts are in [`docs/CONTRACTS.md`](docs/CONTRACTS.md).

## Separate reference deployment

The original mesh-comparison project remains a separate, read-only reference:
<https://livepeer-room-mesh-comparison.lordmike007.chatgpt.site/>. ObjectQuest
must use its own repository and deployment configuration; do not overwrite or
redeploy the comparison site when shipping the game.
