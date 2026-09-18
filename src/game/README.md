# src/game — Player and camera runtime (owner: Player/camera worker, Opus)

Capsule character controller, jump, contextual mantle, collision-aware
third-person camera, checkpoint triggers, respawn, pause. Reads
`SceneManifest` + `MovementConfig` (`shared/manifest.ts`,
`shared/movement.ts`) only — never a provider or job shape.
