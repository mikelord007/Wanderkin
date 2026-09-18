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
| B. Playable existing assets | Browser-accepted | Both GLBs normalize to authored five-checkpoint manifests, use real triangle collision, added floors/helpers, and the same game runtime. Both courses were completed to the visible finish screen and replayed in real Chromium. The earlier viewport/root layout defect is fixed. |
| C. Photos to saved playable level | Implemented; artifact workflow browser-accepted | Uploads, live capability discovery, durable idempotent jobs, stored provenance/assets, scene preparation, stable course candidates, editor/drafts, saved levels, and portable bundles are integrated. A bounded real Rodin job succeeded and its verified local GLB completed isolated preparation, candidate switching, save, and reload. Portable export/import completed a real Chrome download/import/reload round trip. Generic course output remains explicitly uncertain and editable. |
| D. Verification and handoff | Complete | Typecheck, production build, 253 unit/headless tests, 24 full-server HTTP tests, and six real-Chrome cases passed on the integrated revision. Oversized-request and relative-storage serving regressions are covered. Deployment topology and remaining product limits are documented in `docs/DEPLOYMENT.md` and `docs/QA.md`. |

## Active workstreams

| Workstream | Current owner/model | State |
| --- | --- | --- |
| Scene loading/preparation and bundled levels | Scene Sol | Complete and integrated |
| Player/runtime/browser layout | Game Sol | Complete; both sample courses browser-completed and replayed |
| Editor, level persistence, portable bundles | Editor Sol | Complete; candidate switching, save, and portable round trip accepted |
| Stored-file path resolution | Scene/Editor Sol | Integrated as `c445875`; full-server relative-storage regression passes |
| Independent QA and root dependencies | QA Sol | Complete; exact evidence is recorded in `docs/QA.md` |
| Coordination and main ownership | Astra lead | Handoff ready; Sol remains the default worker model |

## Bounded real generation evidence

The first authorized Rodin submission failed because it used an invalid seed.
The seed was corrected before a second, separate submission. That run completed
as application job `411dc7d9` / provider job `mjob_cfb2286bf2b5` and stored a
5,029,388-byte GLB whose local SHA-256 was independently verified as
`71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42`.
The registered model came from the live capability descriptor used for the
request; no direct `served_model_id` was present in the result. This is one
bounded success, not a general availability or quality guarantee.

## Verification boundary

Passing typecheck, route tests, a production bundle, a rendered screenshot, or
the conservative course validator alone does not prove playability. The sample
claim is now supported by real Chromium completion and replay using the actual
controller. That evidence is limited to the authored samples: automatically
prepared courses still carry validation evidence and uncertainty notes and may
need manual editing. Results must continue to distinguish fixture-backed MCP
tests from the one bounded real provider call above. Exact verification counts
and all final browser evidence belong in `docs/QA.md`.

## Deployment boundary

ObjectQuest needs its own deployment and public asset base. Do not deploy it
over the preserved comparison site at
<https://livepeer-room-mesh-comparison.lordmike007.chatgpt.site/>. Detailed
deployment instructions are intentionally owned by QA in `docs/DEPLOYMENT.md`.
The supported topology is a static client plus one Node API behind the same
public origin, with `/api/*` routed to the API and a durable storage volume.
