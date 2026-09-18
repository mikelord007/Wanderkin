# src/game — Player and camera runtime (owner: Player/camera worker, Opus)

Capsule character controller, jump, contextual mantle, collision-aware
third-person camera, checkpoint triggers, respawn, pause. Reads
`SceneManifest` + `MovementConfig` (`shared/manifest.ts`,
`shared/movement.ts`) only — never a provider or job shape.

Behaviour, tuning rationale, level-authoring rules and tested/untested
status are documented in [`docs/GAMEPLAY.md`](../../docs/GAMEPLAY.md).

## Layout

| Path | Role |
| --- | --- |
| `GameView.tsx` | Public entry point. Level life cycle, loading stages, pause/replay, `GameSnapshot` reporting. |
| `types.ts` | `GameViewProps`, `GameSnapshot`, `GameLoadStage` (the `docs/CONTRACTS.md` shape). |
| `core/` | Headless simulation. No React, no Three.js — imports and runs under Node, which is how the physics tests exercise the exact code the browser runs. |
| `core/simulation.ts` | `GameSimulation`: fixed-step loop, locomotion, jump, mantle execution, respawn, checkpoint updates. |
| `core/mantle.ts` | Mantle probing: ledge, destination, clearance and swept-path checks. |
| `core/sceneCollision.ts` | Manifest → collision shapes, guaranteeing collision matches rendered geometry. |
| `core/physicsWorld.ts` | Rapier world construction, play-area limits, WASM init. |
| `core/checkpoints.ts` | Ordered checkpoint state machine and respawn pose selection. |
| `core/fixtures.ts` | Synthetic level builders. Test-only; nothing shipped imports it. |
| `render/` | R3F components and the single `useFrame` that drives everything. |
| `hud/` | Built-in HUD. Needed because `GameSnapshot` is read-only and cannot carry actions. |
| `input/` | Keyboard, mouse-look and pointer-lock handling, kept out of React state. |
| `assets/` | **Temporary** GLB loader/cache; belongs to `src/scene`. See `docs/GAMEPLAY.md`. |
| `diagnostics.ts` | Read-only `window.__objectquest` snapshot for browser QA. |

## Public exports

`src/game/index.ts` exports `GameView` and its types for the product UI,
and the headless simulation, mantle probe and collision builder for the
scene-preparation worker's course validation — running the real controller
is the only honest way to prove a route is traversable.
