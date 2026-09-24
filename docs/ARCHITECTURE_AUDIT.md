# ObjectQuest v2 architecture audit

Audited 2026-09-24 from branch baseline `e857d24`. This report compares the
repository itself with the reported 2026-09-18 baseline in the product brief.
It records implementation evidence, not an assumption that documentation is
current.

## Executive finding

The reported v1 baseline is substantially accurate: ObjectQuest is a working
desktop browser game with two bundled GLB courses, a durable image-to-3D job
path, conservative scene preparation, a manifest editor, local server
persistence, portable bundles, and meaningful automated and Chrome evidence.
It is not a v2 implementation. Style previews, coherent world styles, the
Explore/Collect/Race modes, Lost Colors entities and progression, generated
story/audio/video, immutable publishing, friend landing pages, and a complete
My worlds recovery model do not exist in the audited revision.

## Baseline verification

| Reported baseline | Repository evidence | Finding |
| --- | --- | --- |
| Browser game | React/Vite entry point, React Three Fiber renderer, Rapier fixed-step controller, and Playwright Chrome suite | Verified. Desktop keyboard/mouse/pointer-lock only. |
| Photos go to a Livepeer generation job returning a GLB | Server-side MCP adapter, durable `JobStore`, upload/job routes, GLB download and `AssetStore` | Verified for the implemented image-to-3D path. The repository adapter supports Rodin and Tripo only, not the v2 capability set. |
| Mesh inspection, normalization, collision, spawn/checkpoint preparation | `src/scene/**` performs GLB parsing, normalization, triangle collision extraction, surface analysis, conservative route preparation, and deterministic candidates | Verified. Generic courses remain explicitly uncertain and editable. |
| Course editing and saving | `src/editor/**`, `server/levels.ts`, local draft recovery, bundle import/export | Verified. The editor handles transforms, spawn, checkpoints, and helper geometry; it does not yet handle v2 collectibles or a finish portal. |
| Capsule movement, jumping, and mantling | `src/game/core/**` shared headless/browser simulation | Verified. The controller is kinematic, fixed-step, and covered by geometry and browser tests. |
| Two bundled sample levels completed in Chrome | Rodin and Tripo GLBs, authored manifests, Playwright traversal/completion/replay tests | Verified as recorded evidence and automated scenarios. This audit did not rerun Chrome; it reran the non-browser suites below. |
| One real Rodin photo-to-saved-level result | Documentation and optional browser case identify application job `411dc7d9`, provider job `mjob_cfb2286bf2b5`, and a 5,029,388-byte stored GLB | Evidence exists, but the artifact is not bundled in this worktree and this audit made no live provider call. It is one bounded success, not general quality evidence. |
| 253 unit/headless tests | `npm test` on 2026-09-24: 29 files, 253 tests passed | Verified. |
| 24 HTTP integration tests | `npm run test:e2e:http` on 2026-09-24: 5 files, 24 tests passed against a local fake MCP server | Verified. These are not live-provider tests. |
| Six browser cases | Playwright contains five repository-contained cases plus one optional existing-generated-artifact case | Accurate only when `OBJECTQUEST_GENERATED_GLB_PATH` points at the previously generated artifact. The default suite skips that sixth case. |
| Four original milestones complete | `docs/IMPLEMENTATION_PLAN.md` marks them complete and the v1 implementation supports the claim at its documented boundary | Verified for v1. It does not imply any v2 feature is complete. |
| Latest commits were acceptance documentation | Baseline log ends at `e857d24 docs: record final ObjectQuest acceptance`, preceded by acceptance/test commits | Verified. |
| Development server may still run | No listener existed on ports 5173, 5174, or 8787 during the audit | Not running. |
| No production deployment | Repository contains deployment guidance but no deployment URL or production configuration proving a deployed ObjectQuest origin | Verified as an unresolved delivery item. The comparison site is documented as protected and separate. |
| 17 stale worktrees and untracked `nimbalyst-local/` | `git worktree list` reported 23 worktrees including this one; this worktree was otherwise clean | Count is stale/understated. Per instruction, no other worktree or `nimbalyst-local/` location was touched. |
| Livepeer credentials absent | Neither `.env` nor `.env.local` exists in this worktree; `.env.example` exists | Verified without reading or printing any credential value. |
| Generated courses can require manual editing | Validation status, uncertainty notes, candidate selection, and editor repair paths are implemented | Verified and correctly documented. |
| One Rodin success does not prove arbitrary quality | Docs consistently preserve this limitation | Verified. |

## What is implemented

- Versioned v1 `SceneManifest`, movement, generation-job, and provider
  TypeScript contracts in `shared/`.
- Two local sample GLBs (`rodin.glb`, 4,979,900 bytes; `tripo.glb`, 1,993,644
  bytes), source photos, and provenance records.
- Server-only provider access, input validation, durable idempotency data,
  polling/retry reconciliation, safe remote fetching, atomic JSON indexes, and
  content-addressed local assets.
- A single-page route state machine for start, photos, generation,
  preparation/editor, play, and finish.
- Deterministic course seeds, shared scene/render/collision transforms,
  checkpoint order, respawn, pause, completion, draft persistence, saved
  levels, and portable import/export.

## What documentation overstates or leaves stale

- The ordinary generation screen renders provider capability/model and
  fallback names. The v2 brief explicitly forbids exposing provider/model
  terminology in the player flow.
- `docs/LIVEPEER.md` retains a stale known-gap statement that level routes are
  not registered; `server/index.ts` does register `createLevelsRouter`.
- Documentation calls the original milestones complete, but that completion
  is scoped to the earlier room/furniture checkpoint game. It must not be used
  as evidence for v2 styles, modes, personalized media, publishing, or sharing.
- The browser evidence count of six depends on an external local artifact;
  only five cases are self-contained in the repository.
- Capability availability and price observations are dated. The current code
  discovers/describes only the two image-to-3D capabilities and does not prove
  current contracts or health for background removal, image editing, text,
  music, SFX, TTS, or video.

## Missing v2 architecture

| Area | Audited state |
| --- | --- |
| Visual style system | No shared cartoon/hand-painted/watercolor definition and no style-driven scene/audio/UI data. |
| Adventure modes | One checkpoint collection loop only; no explicit Explore, Collect, or Race contract/state machine. |
| Lost Colors | No color-fragment entity, progressive restoration, portal entity, or fragment-gated finish rule. |
| Story and audio | No quest text contract, generation, audio assets, mixer, subtitles, or narration triggers. Docs explicitly say no audio. |
| Style approval | No background-removal review, actual-object style preview, explicit preview approval, or cached preview identity. |
| Multi-asset jobs | `GenerationJob` models one image-to-3D asset. It lacks typed job kinds, per-asset optional failure, timings, cost, and normalized served-model provenance. |
| Publishing and sharing | Saved private levels and portable downloads exist; stable immutable published versions, share IDs, friend landing pages, and version-bound race challenges do not. |
| My worlds | Saved levels render on the start screen and one active generation is locally resumable. There is no unified draft/pending/attention/playable catalog. |
| Mobile/accessibility | No touch controller. Reduced-motion, narration subtitles, and audio controls are absent. |
| Optional media | No postcard or gameplay-recording pipeline. |

## Existing boundaries to preserve

- `SceneManifest` is the stable handoff among scene preparation, editor,
  persistence, and game runtime. V2 additions must be additive for legacy
  reads or go through an explicit migration before those consumers see them.
- Coordinates are right-handed, Y-up game metres; spawn/checkpoint positions
  are capsule centres.
- Provider responses are normalized server-side. Client/game code must not
  depend on raw MCP or provider response fields.
- Generated asset URLs in ready manifests are durable application URLs, not
  expiring provider URLs.
- Course validation is evidence, not a promise. Generated prose cannot mark a
  route reachable.
- Private saved levels and immutable published snapshots are different
  concepts; publication should copy/freeze a manifest rather than mutate the
  saved draft in place.

## Audit checks

- `npm ci`: completed from the committed lockfile. npm reported five dependency
  audit findings (three moderate, one high, one critical); no dependency was
  changed because package ownership is protected.
- `npm run typecheck`: passed.
- `npm test`: 253/253 passed.
- `npm run test:e2e:http`: 24/24 passed.
- No live provider calls, paid jobs, production deployment, or writes outside
  this worktree were performed.
