# ObjectQuest implementation plan

Repository: <https://github.com/mikelord007/ObjectQuest> (private).

Model policy: Astra is the primary coordinator. Sol is the default
implementation and QA model. This policy supersedes the earlier Claude worker
plan; no Claude worker session is active. Workers use isolated worktrees,
commit through the Nimbalyst commit tool, and integrate only while explicitly
holding main ownership.

## Architecture

```text
photos -> durable generation job -> stored GLB -> scene preparation
       -> saved SceneManifest -> shared game runtime
```

- `shared/` defines versioned `SceneManifest`, movement, provider, and job
  contracts.
- `src/ui` composes start, photo selection, generation, preparation, editor,
  play, and finish flows.
- `src/scene` owns cached GLB loading, geometry inspection, normalization,
  triangle collision, authored samples, and conservative course preparation.
- `src/game` owns the fixed-step Rapier capsule, jump/mantle, camera,
  checkpoints, respawn, loading, and diagnostics.
- `src/editor` owns manifest transforms, spawn/checkpoint/helper editing,
  preview, draft recovery, and save/play handoff.
- `server` owns Livepeer capability/job orchestration, atomic job/photo/asset
  storage, saved levels, and portable bundle routes.
- `public/samples` contains the bundled Rodin/Tripo assets, source photos, and
  recorded provenance. These are copied inputs; the separate comparison
  project and deployment remain untouched.

Coordinates are right-handed, Y-up, and measured in game metres. Manifest
spawn/checkpoint positions are capsule centres. Rendered generated meshes and
triangle colliders use the same geometry and entity transform.

## Milestone state (2026-09-18)

| Milestone | State | Evidence and remaining work |
| --- | --- | --- |
| A. Shared foundation | Complete | Scaffold, contracts, dependencies, sample assets, API shell, and private GitHub repository are established. |
| B. Playable existing assets | Implemented; browser acceptance open | Both GLBs normalize to authored five-checkpoint manifests, use real triangle collision, added floors/helpers, and the same game runtime. The real headless controller completes the Rodin climb; both courses pass conservative real-GLB validation. Chrome exposed a viewport/root flex boot bug assigned to game Sol, and neither complete browser course has been accepted yet. |
| C. Photos to saved playable level | Integrated foundation; hardening active | Uploads, capability discovery, durable idempotent jobs, stored provenance/assets, scene preparation, editor, drafts, saved levels, and bundle routes exist. Editor Sol is hardening strict import/export and shared-store wiring. The oversized-request 500 response is assigned there. No new paid provider job is part of this verification cycle. |
| D. Verification and handoff | In progress | The integrated parent passed strict typecheck, a production build, and 225 tests. This is not release acceptance: browser end-to-end course completion, the Chrome layout fix, HTTP error hardening, final integrated QA, and separate game deployment remain open. QA owns deployment documentation/reporting. |

## Active workstreams

| Workstream | Current owner/model | State |
| --- | --- | --- |
| Scene loading/preparation and bundled levels | Scene Sol | Integrated and pushed; API/docs follow-up only |
| Player/runtime/browser layout | Game Sol | Shared scene-loader adoption and Chrome viewport/root fix active |
| Editor, level persistence, portable bundles | Editor Sol | Validation, shared `AssetStore`/`PhotoStore` wiring, and oversize HTTP behavior active |
| Independent QA and root dependencies | QA Sol | HTTP/browser/integration review active; owns root dependency changes and QA deployment/report docs |
| Coordination and main ownership | Astra lead | Assigns integration order; editor owns the current integration window |

## Verification boundary

Passing typecheck, unit/integration tests, a production bundle, a rendered
screenshot, or the conservative course validator does not prove a player can
complete a course in Chrome. Browser acceptance requires driving the actual
controls and controller through every ordered checkpoint on each sample without
diagnostic shortcuts. Results must continue to distinguish fixture-backed
Livepeer tests from a bounded real provider call.

## Deployment boundary

ObjectQuest needs its own deployment and public asset base. Do not deploy it
over the preserved comparison site at
<https://livepeer-room-mesh-comparison.lordmike007.chatgpt.site/>. Detailed
deployment instructions and the final QA report are intentionally owned by QA,
not duplicated here.
