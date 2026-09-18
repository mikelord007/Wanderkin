# ObjectQuest implementation plan

Lead: Astra. Coding is delegated to Claude Code workers (Sonnet by default,
Opus for challenging implementation/3D/physics/debugging), coordinated
against the shared foundation commit in this repository.

## Architecture

```
provider generation -> stored asset -> scene preparation -> level/course data -> game runtime
```

- `shared/` — versioned contracts (`SceneManifest`, `MovementConfig`,
  `GenerationJob`, `ProviderAdapter`). Owned exclusively by the foundation
  worker; every other worker requests changes rather than editing directly.
- `src/ui` — product UI (start/upload/progress/preparation/play/finish).
- `src/scene` — GLB import, calibration, collider generation, course
  preparation/validation.
- `src/game` — capsule controller, camera, mantle, checkpoints, respawn.
- `src/editor` — spawn/checkpoint/helper-platform editing, import/export.
- `server` — durable job records, provider adapters, asset storage, manifest
  persistence.
- `public/samples` — bundled Rodin/Tripo GLBs, source photos, provenance,
  copied from the reference workspace (read-only reference, never edited).

Coordinate convention: Y-up, right-handed, meters (`shared/geometry.ts`).
Every scene entity carries an explicit position/rotation/scale transform;
colliders reuse that same transform rather than a separate one.

## Milestones

- **A. Shared foundation and immediate parallel work** — this commit.
  Scaffold, root config, dependencies, shared contracts, sample assets
  copied, git initialized. *(in progress → complete once this commit lands)*
- **B. Playable existing asset** — normalize one GLB, real triangle-mesh
  collision, added game floor, movement/mantle/camera, authored checkpoint
  course, playable in browser; repeat for the second GLB with the same game
  code.
- **C. New photos to a saved playable level** — durable generation jobs,
  asset storage, scene preparation, course candidates/validation, manual
  adjustment, save/reload, recovery from failure.
- **D. Product verification and handoff** — polish, typecheck/build/tests,
  browser end-to-end verification, documentation of setup/limitations.

## Task board

| Task | Owner | Model | Depends on | Status |
| --- | --- | --- | --- | --- |
| Scaffold, root config, shared contracts, sample assets, base commit | Foundation/integration | Claude Code Sonnet | — | Complete: `5f6c216` |
| GLB import, calibration, collider generation, course validation | Scene preparation / `worktree/dim-otter` | Claude Code Opus | Shared contracts | Active |
| Character controller, camera, mantle, checkpoints/respawn | Player and camera / `worktree/sudden-moose` | Claude Code Opus | Shared contracts | Active |
| Start/upload/progress/preparation/play/finish screens | Product UI / `worktree/molten-bear` | Claude Code Sonnet | Shared contracts | Integrated through `504b201`; awaiting full-app verification |
| Provider adapters, durable jobs, uploads, provenance | Livepeer integration / `worktree/clever-path` | Claude Code Sonnet | Shared contracts | Active; lifecycle review fixes assigned |
| Manifest persistence, spawn/checkpoint editor, import/export | Level tools and persistence / `worktree/molten-bear` | Claude Code Sonnet | Shared contracts, scene + editor UI | Active after UI completion |
| Independent smoke tests, gameplay verification | QA and integration support | Sonnet | Playable milestone B | Later |

Astra approves any change to `shared/*` or root config/dependencies and
assigns it to the foundation worker; other workers request changes instead
of editing those files concurrently.

The installed runtime permits four active spawned workers. The UI worker
continues as the editor worker; independent QA waits for capacity. All four implementation worktrees began at
`5f6c216`. Astra reviews code and runs checks; Claude Code workers own all
code changes and integration edits. Livepeer's worker has temporary,
exclusive ownership of the package manifest and lockfile for the approved
Multer 2.x upload dependency.

The first commit required the user's Source Control action because the
Nimbalyst commit tool rejected the repository before it had a HEAD commit.
Normal tool-based commits succeeded after that initial commit.
