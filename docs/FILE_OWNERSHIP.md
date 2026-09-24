# ObjectQuest v2 file ownership

This map converts the twelve product workstreams into repository boundaries.
It is intended to prevent concurrent edits, not to grant broader product scope.
Owners may add tests beside their code. Cross-owner edits require an explicit
orchestrator handoff before the edit begins.

## Worker ownership

| Worker | Workstream | Primary owned paths | Boundaries and coordination |
| --- | --- | --- | --- |
| 1 | Architecture and shared contracts | `shared/**`; `docs/PRODUCT_BRIEF.md`; `docs/ARCHITECTURE_AUDIT.md`; `docs/ACCEPTANCE_MATRIX.md`; `docs/FILE_OWNERSHIP.md`; v2 sections of `docs/CONTRACTS.md`; shared fixtures | Establishes contracts and migrations. After the initial contract delivery, `shared/**` is protected: follow-up changes land only through orchestrator coordination. |
| 2 | Livepeer gateway and generation jobs | `server/livepeer/**`; `server/jobs/**`; provider/job route modules under `server/routes/**`; relevant server persistence helpers and tests; `docs/LIVEPEER.md` | Owns discovery, adapters, async lifecycle, idempotency, budget, provenance normalization. Does not own product UI, gameplay, level publishing, `server/index.ts`, or shared contracts. |
| 3 | Visual styles and 3D feasibility | New style/render modules under `src/scene/style/**` or `src/scene/styles/**`; narrowly related scene tests/tools; experiment evidence in a new `docs/STYLE_PIPELINE.md` | May consume `shared/style.ts`. Coordinate changes to existing scene preparation/normalization files with the orchestrator because they are v1-critical and may overlap Worker 5/7 integration. No paid run without budget-owner approval. |
| 4 | Creation and progress interface | `src/ui/screens/**` and `src/ui/components/**` for screens 1–7; UI state/helpers/tests under `src/ui/**`; creation/progress CSS in an owner-specific stylesheet | Does not edit `src/App.tsx`; requests route/bootstrap wiring from the orchestrator. Consumes Worker 1/2 contracts and coordinates My worlds boundaries with Worker 7. |
| 5 | Gameplay and course behavior | `src/game/**`, especially new mode/progression/HUD/render modules and their tests; gameplay-specific additions to `docs/GAMEPLAY.md` | Preserve the existing movement controller. Consumes experience contracts; coordinate editor/persistence behavior with Worker 7 and style rendering hooks with Worker 3. |
| 6 | Quest generation and audio | New `src/audio/**`; quest/audio orchestration modules outside Worker 2's gateway; prompt/validation modules in a clearly isolated server subfolder; focused tests and audio docs | Uses Worker 2's common job API; must not create a second provider client or edit shared contracts directly. UI placement coordinates with Worker 4/5. |
| 7 | Persistence, editor, and challenge sharing | `src/editor/**`; `server/levels.ts`; `server/levels.test.ts`; new level/publication/share route and store modules; new My worlds persistence/client modules; editor docs | Owns integration of the shared compatible manifest reader into persistence. Does not wire `server/index.ts` or `src/App.tsx` directly; requests orchestrator integration. Coordinates creation-facing My worlds UI with Worker 4. |
| 8 | Postcards and gameplay capture | New `src/media/**` or `src/capture/**`; capture/export UI components in an agreed isolated subfolder; new server media orchestration modules that call Worker 2's gateway; focused tests | Does not implement provider access or change core gameplay state. Generated postcards and gameplay capture must remain distinctly labeled. |
| 9 | Companion experiment | New `src/companion/**`; isolated companion tests and experiment report | Optional after core gates. No changes to the movement controller, normal onboarding, or shared schema without orchestrator approval. |
| 10 | Integration tests and reliability | New `tests/integration/**`; existing unit/HTTP test files only when coordinated with their production owner; independent acceptance checklist document if created | Test ownership does not grant production-code ownership. Reports regressions with reproduction; production fixes remain with the owning worker/orchestrator. |
| 11 | Browser QA, accessibility, performance | `tests/e2e/browser/**`; browser fixtures/config local to that folder; `docs/QA.md` v2 evidence sections; new accessibility/performance evidence files | May propose defects but does not edit product code as part of QA. Browser evidence must use actual interaction and distinguish mocks from live provider behavior. |
| 12 | Delivery, deployment, and demo evidence | `docs/DEPLOYMENT.md`; new operational/demo/checklist docs; deployment files only when the orchestrator assigns an unowned path | Root scripts/config, dependency manifests, app/server bootstrap, and lockfiles remain protected even when needed for deployment. Must preserve the comparison site and use a dedicated origin. |

## Protected shared files

The following are integration chokepoints. Workers may read them and submit a
small requested diff or handoff, but only the orchestrator edits/commits them
after coordinating active owners:

- `shared/**` after Worker 1's initial contract commits;
- `server/index.ts`;
- `src/App.tsx` and `src/main.tsx` (application bootstrap/routing);
- `package.json` and dependency lockfiles, currently `package-lock.json`;
- `vite.config.ts`;
- root/server TypeScript and test runner configuration (`tsconfig*.json`,
  `server/tsconfig.json`, `vitest.config.ts`) unless explicitly delegated; and
- cross-cutting global CSS (`src/styles.css`) when multiple UI/design workers
  are active.

Protected does not mean frozen. It means one coordinated integration edit,
with affected workers notified, rather than parallel commits to the same file.

## Existing overlap rules

- Worker 2 owns the provider/job route implementation, while Worker 7 owns
  level/publication/share routes. Route registration in `server/index.ts` is an
  orchestrator integration task.
- Worker 4 owns onboarding and generation-progress presentation; Worker 7 owns
  saved/draft/published data and My worlds actions. They should expose a typed
  view model rather than both editing the same screen.
- Worker 3 owns style rendering; Worker 5 owns gameplay rules and HUD. Style
  hooks must not fork progression state.
- Worker 6 and Worker 8 submit jobs only through Worker 2's gateway. They own
  prompts, consumption, and player-facing behavior, not transport adapters.
- Worker 10/11 own independent evidence. They do not rewrite implementation to
  make a test pass without handing the defect to the production owner.

## Git and handoff discipline

Each worker uses its assigned worktree/branch, stages named files rather than
the whole repository, and commits each coherent milestone after relevant
checks. Handoffs report assumptions, changed files, tests/results, commit
hashes, unresolved questions, and any uncommitted work. No worker rewrites or
discards another worker's branch/history, touches other worktrees, commits
secrets/logs/generated temporary artifacts, or changes protected files without
the orchestrator's explicit integration decision.
