# ObjectQuest

ObjectQuest turns photographs of everyday objects into miniature 3D adventures.
The v2 experience supports Explore, Lost Colors/Collect, and Race; durable
generation jobs; editable and saved worlds; and immutable playable share links.
Bundled Rodin and Tripo worlds work without provider credentials or new spend.

## Run locally

Requires Node.js 22 LTS and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the Node server at
`http://localhost:8787`. Copy `.env.example` to `.env` only when overriding
defaults or supplying the optional server-side Livepeer key. Never expose the
key through a `VITE_*` variable.

Choose **Play a sample** for the credential-free Lost Colors path. Gameplay
currently requires keyboard and mouse: `W/A/S/D` or arrows to move, mouse to
look, `Space` to jump, `E` to mantle, `R` to respawn, and `Esc` to pause. Touch
gameplay is not available.

## Build and verify

```sh
npm run typecheck
npm test
npm run build
```

The build writes the static client to `dist/` and compiled API to
`dist-server/`. `npm start` (or `npm run start:api`) starts only the production
API; serve `dist/` from a static tier behind the same public origin.

## Documentation

- [Deployment and environment](docs/DEPLOYMENT.md)
- [Production readiness](docs/PRODUCTION_READINESS.md)
- [Real provider evidence](docs/EVIDENCE.md)
- [Hackathon demo](docs/DEMO.md)
- [Delivery checklist](docs/DELIVERY_CHECKLIST.md)
- [QA evidence](docs/QA.md)

Production requires a dedicated ObjectQuest origin, `/api/*` routed to one Node
API, SPA fallback for `/share/*` and other client routes, and a durable volume
for the complete storage directory. Do not deploy over the preserved comparison
site.
