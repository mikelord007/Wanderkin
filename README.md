# Wanderkin

Photograph an everyday object and Wanderkin rebuilds it in 3D, then shrinks
you down to explore it. A desk becomes a cliff, a shoe a mountain, a sofa a
plateau. You run, jump, climb and swing a grappling hook across the thing you
photographed, set in a biome you choose and scored by its own chiptune.

Live site: <https://wanderkin-tau.vercel.app>

## Creating a world

The creation flow has five steps:

1. **Photo.** Upload or take one photo of the object. The background is
   removed and you confirm the cutout.
2. **Look.** Pick an art style (Cartoon, Hand-painted or Watercolor) and an
   adventure mode (Explore, Collect or Race), with optional atmosphere words.
3. **Biome.** Pick the world the object grows into. It is locked once you
   continue. Seven looks:
   - Monsoon Marsh (the default)
   - Tropical Island
   - Desert
   - Snowy Alpine
   - Autumn Forest
   - Volcanic Ember
   - Original (the place in the photo itself)
4. **Preview.** A styled image of your object shows the visual direction.
   Approve it or try another.
5. **World.** The object is rebuilt in 3D, a course is laid out through it,
   and its music is generated. Enter as soon as the course is ready.

Worlds are saved to your account. Finished worlds can be shared as immutable,
playable links.

## Gameplay

Three modes:

- **Collect:** find the lost color fragments, then enter the portal.
- **Explore:** visit the marked destinations at your own pace, with no timer.
- **Race:** a countdown, ordered checkpoints and a clock; your personal best
  is kept per published world.

Controls (keyboard and mouse; touch is not supported):

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move |
| Mouse | Look (pointer lock) |
| `Space` | Jump |
| `E` | Mantle onto a ledge when the prompt shows |
| Hold right mouse / hold `F` | Aim the grappling hook; release to fire |
| Tap right mouse / tap `F` | Fire the hook at the centre dot |
| `R` | Return to the last checkpoint |
| `Esc` | Pause |

- **Checkpoints** are collected in order. Falling out of the world or pressing
  `R` returns you to the last one, keeping your progress.
- **Mantling** pulls you up onto ledges up to about 0.9 m (in game scale) when
  the whole path is clear.
- **Grappling hook:** holding aim eases the camera to an over-the-shoulder
  view; the hook pulls you onto tops, over lips or up to walls.
- **Solid scenery:** in themed biomes, trees, cacti, rocks, stumps and bushes
  are solid. Grass and flowers stay walk-through. Props never block the route.
- **Music:** each world gets its own upbeat chiptune loop. The bundled loop
  plays until it is ready.

Details: [docs/GAMEPLAY.md](docs/GAMEPLAY.md), [docs/AUDIO.md](docs/AUDIO.md).

## Generation on Livepeer

All generative work runs server-side through Livepeer's Agent network (MCP).
A world uses four capabilities:

| Step | Capability | Model |
| --- | --- | --- |
| Background removal | `bg-remove` | `fal-ai/birefnet` |
| Styled preview | `kontext-edit` | `fal-ai/flux-pro/kontext` |
| Image to 3D | `rodin-i3d` | `fal-ai/hyper3d/rodin` v2.5 |
| Soundtrack | `music` | `fal-ai/minimax-music` v2 |

A world costs roughly $0.50, almost all of it the 3D step. The server enforces
per-request, per-world, daily and global spend ceilings and a retry limit
(`LIVEPEER_MAX_*` in `.env.example`). Jobs are durable: a refresh or a return
visit picks up the same work instead of paying again.

## Sign-in

Sign-in is Google through Supabase Auth. Worlds are private to the account that
made them. In local development without Supabase keys, a stand-in signs you in
as a local user. Production never uses the stand-in. Setup steps are in
`nimbalyst-local/AUTH_DASHBOARD_SETUP.md`.

## Run locally

Requires Node.js 22 and npm.

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the Node API at
`http://localhost:8787`.

Copy `.env.example` to `.env` to configure anything beyond the defaults. The
variables most people set:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: public Supabase values for
  Google sign-in. Leave empty for the local stand-in.
- `VITE_GOOGLE_CLIENT_ID`: optional public Google web client id, so Google's
  consent screen names this site rather than Supabase.
- `WANDERKIN_LEGACY_OWNER_EMAIL`: the Google account that claims worlds made
  before sign-in existed.
- `SUPABASE_JWT_SECRET`: only for projects that still sign with a legacy
  HS256 secret. Server only.
- `LIVEPEER_API_KEY`: optional. Empty uses Livepeer's keyless allowance.
  Server only; never put it in a `VITE_*` variable.

The bundled worlds play without any keys or provider access.

## Tests

```sh
npm run typecheck
npm test
```

`npm test` runs the Vitest suite, including headless gameplay simulation on the
real Rapier controller. Browser and HTTP end-to-end suites are
`npm run test:e2e:browser` and `npm run test:e2e:http`.

## Deployment

- The static client is built with Vite and hosted on Vercel, which rewrites
  `/api/*` to the API so the browser sees one origin.
- The Node API runs as a container on a Google Compute Engine VM behind Caddy,
  with a persistent disk for all server state (`STORAGE_DIR`).

`npm run build` writes the client to `dist/` and the API to `dist-server/`;
`npm start` runs the API only. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for
the supported shape and environment, and `nimbalyst-local/GCP_DEPLOYMENT.md`
for the runbook (redeploy, logs, backups).

## Landing worlds

The landing page offers four bundled worlds, ready to play with no photo:

- The Desk on the Beach
- Plane in the Snow
- Boot in the Rain
- Car in the Dunes

Their assets are in `public/samples/<slug>/` and their manifests in
`src/game/landingWorlds/`.

## Legal

The Privacy Policy is at `/privacy` and the Terms of Service at `/terms`, linked
from the landing footer and the sign-in prompt.

## Docs index

- [DEPLOYMENT.md](docs/DEPLOYMENT.md): production shape, environment, storage
- [GAMEPLAY.md](docs/GAMEPLAY.md): movement, mantling, hook, checkpoints, camera
- [AUDIO.md](docs/AUDIO.md): music, effects and playback
- [DESIGN.md](docs/DESIGN.md): original design system and screen specs
- [SCENE.md](docs/SCENE.md): scene preparation and collision
- [EDITOR.md](docs/EDITOR.md): world editor
- [MEDIA.md](docs/MEDIA.md): generated media
- [CONTRACTS.md](docs/CONTRACTS.md): shared data contracts
- [LIVEPEER.md](docs/LIVEPEER.md) and
  [LIVEPEER_CAPABILITIES.md](docs/LIVEPEER_CAPABILITIES.md): provider
  integration
- [SECURITY.md](docs/SECURITY.md): security model
- [PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md): readiness review
- [QA.md](docs/QA.md), [MANUAL_TEST_HANDOFF.md](docs/MANUAL_TEST_HANDOFF.md):
  testing
- [EVIDENCE.md](docs/EVIDENCE.md),
  [LIVE_VALIDATION_RESULT_2026-09-24.md](docs/LIVE_VALIDATION_RESULT_2026-09-24.md):
  live provider evidence
- Planning history: [PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md),
  [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md),
  [ARCHITECTURE_AUDIT.md](docs/ARCHITECTURE_AUDIT.md),
  [STYLE_PIPELINE_DECISION.md](docs/STYLE_PIPELINE_DECISION.md),
  [BIOME_FEASIBILITY.md](docs/BIOME_FEASIBILITY.md),
  [DEMO.md](docs/DEMO.md), [DELIVERY_CHECKLIST.md](docs/DELIVERY_CHECKLIST.md),
  [ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md),
  [ACCEPTANCE_MATRIX.md](docs/ACCEPTANCE_MATRIX.md),
  [FILE_OWNERSHIP.md](docs/FILE_OWNERSHIP.md),
  [LIVE_VALIDATION_PLAN.md](docs/LIVE_VALIDATION_PLAN.md),
  [QA_BASELINE_2026-09-24.md](docs/QA_BASELINE_2026-09-24.md),
  [QA_FINDINGS_2026-09-24.md](docs/QA_FINDINGS_2026-09-24.md)
