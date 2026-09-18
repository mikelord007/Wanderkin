# ObjectQuest deployment

ObjectQuest is a separate application from the existing room-mesh
comparison deployment. Do not replace or reconfigure that comparison site;
its published assets remain reference evidence.

## Local development

After installing dependencies, one command starts both processes:

```sh
npm install
npm run dev
```

The Vite client listens on `http://localhost:5173` and proxies `/api` to
the Node API on `http://localhost:8787`. Copy `.env.example` to `.env` only
when overriding defaults or supplying a server-side Livepeer key.

The bundled sample and hand-imported GLBs do not require provider
credentials. `LIVEPEER_API_KEY` is optional and must never be exposed as a
`VITE_*` variable or placed in client code.

## Current production readiness

The production build now succeeds, but there is not yet a complete
single-process production deployment:

1. `npm run typecheck` and `npm run build` pass. The build emits the Vite
   client to `dist/` and the Node API entry point to
   `dist-server/server/index.js`.
2. The Node API currently registers only API routes. It does not call
   `express.static`, serve `dist/index.html`, or provide an SPA fallback.
3. There is no production `start` script. `npm run preview` is only the
   Vite frontend preview and is not a complete frontend-plus-API runtime.

Do not describe `node dist-server/server/index.js` by itself as a deployed
game: it serves the API and stored files, not the built React application.

## Supported deployment topology after a green build

Until static serving is deliberately added to the Node server, deploy two
processes behind one public origin:

- A static server/CDN serves `dist/`, including an SPA fallback to
  `dist/index.html` for non-file client routes.
- One Node process runs `node dist-server/server/index.js` with its
  server-only environment and persistent storage.
- The edge/reverse proxy sends `/api/*` to the Node process and everything
  else to the static frontend.

Same-origin routing matters: the browser client uses relative `/api` URLs,
and the API does not currently configure cross-origin access. A separate
public API origin therefore needs an intentional client base-URL and CORS
change; neither exists today.

Example build and API start commands, valid only after typecheck/build are
green:

```sh
npm ci
npm run build
node dist-server/server/index.js
```

## Server environment

| Variable | Default | Deployment requirement |
| --- | --- | --- |
| `PORT` | `8787` | Bind the platform-assigned/internal API port as needed. |
| `STORAGE_DIR` | `./storage` | Mount a durable, writable volume here. Do not use ephemeral container storage. |
| `LIVEPEER_MCP_ENDPOINT` | Livepeer full MCP endpoint | Server-side only. Override only with a trusted endpoint. |
| `LIVEPEER_API_KEY` | empty | Optional server secret; never include it in the client bundle or repository. |

`STORAGE_DIR` contains jobs, levels, photo files, and GLB assets. Back it up
as one logical unit. Stored manifests refer to `/api/photos/files/*` and
`/api/assets/files/*`; keeping the API under the same public origin makes
those durable URLs work after reload and export/import.

The JSON stores use atomic rename and in-process queues, not a distributed
database lock. Run one API replica against a storage directory. Multiple
replicas sharing the same filesystem can race and are not a supported
topology.

## Pre-deployment verification

Require all of the following from the exact release revision:

```sh
npm ci
npm test
npm run test:e2e:http
npm run typecheck
npm run build
```

Also complete the real-browser checklist in `docs/QA.md` for both sample
courses. The fake MCP integration suite is not a real-provider smoke test,
and a rendered screenshot is not proof that movement, mantle, respawn, and
course completion work together.

No real generation call is required for ordinary deployment validation.
If a bounded live provider smoke test is separately authorized, record its
actual capability/model, job ID, fallback, allowance impact, and resulting
durable asset; never infer success from the fake MCP suite.

