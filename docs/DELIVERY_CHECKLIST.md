# ObjectQuest v2 delivery checklist

Owner-facing handoff map for product-brief section 12. A checked box means the
artifact is present in this repository; it does not upgrade the evidence level
of an underlying feature. Items that require the final integrated revision,
fresh browser work, live provider execution, or an authorized deployment stay
unchecked until that work actually occurs.

## Handoff package

- [x] **What changed from the baseline** — product/workstream state is in
  [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md); v2 contracts and feature
  acceptance are mapped in [`ACCEPTANCE_MATRIX.md`](ACCEPTANCE_MATRIX.md) and
  [`ACCEPTANCE_CHECKLIST.md`](ACCEPTANCE_CHECKLIST.md).
- [x] **How to run and configure it** — quick start is in
  [`README.md`](../README.md); complete variables, modes, limits, storage, and
  topology are in [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`.env.example`](../.env.example).
- [x] **Actual repository/worktree** — repository is the private ObjectQuest
  Git repository; this delivery work is committed on `worktree/steady-lotus`.
- [x] **Commit summary and integration status** — Worker 12 commit hashes are
  reported in the orchestrator handoff; the branch is based on Integration #3
  merges `8450c5d`, `ddbeb49`, and `a27bd1c`.
- [x] **Final integration revision recorded** — final pre-verification merge of
  `main` reported already up to date at `a27bd1c`; Worker 12 runtime revision
  `218e6c5` was then verified.
- [ ] **Deployment URL** — no authorized account/origin exists. The exact
  missing platform, hostname/DNS/TLS, volume, and provider-mode decision is
  stated in [`DEPLOYMENT.md`](DEPLOYMENT.md#deployment-status-and-remaining-requirement).
- [x] **Exact final automated results** — recorded below after the required
  final merge from main.
- [ ] **Final real-browser results** — run the complete desktop and mobile-layout
  matrix on the final release revision; existing dated evidence remains in
  [`QA.md`](QA.md) and [`QA_BASELINE_2026-09-24.md`](QA_BASELINE_2026-09-24.md).
- [x] **Real-generation evidence and observed costs** — indexed with explicit
  unknowns and claim boundaries in [`EVIDENCE.md`](EVIDENCE.md).
- [x] **Visual pipeline decision and tradeoffs** — original-photo geometry plus
  engine-side coherent styling is documented in
  [`STYLE_PIPELINE_DECISION.md`](STYLE_PIPELINE_DECISION.md).
- [x] **Remaining blockers and optional experiments** — production gaps are in
  [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md); real provider gaps are
  in [`EVIDENCE.md`](EVIDENCE.md#evidence-still-missing).
- [x] **Concise hackathon demonstration sequence** — the exact ten-step path and
  provider-down fallback are in [`DEMO.md`](DEMO.md).

## Evidence dimensions

### Implemented

- [x] Multi-kind server gateway, durable jobs, idempotency, preview cache,
  retry ceilings, spend ledger, and persisted generated assets —
  [`server/livepeer`](../server/livepeer), [`server/jobs`](../server/jobs), and
  [`server/routes/jobs.ts`](../server/routes/jobs.ts).
- [x] Explore, Collect/Lost Colors, and Race runtime behavior —
  [`GAMEPLAY.md`](GAMEPLAY.md) and [`src/game`](../src/game).
- [x] Saved worlds, immutable publication versions, `/share/:shareId` client
  routing, and friend landing — [`server/levels.ts`](../server/levels.ts),
  [`server/publications.ts`](../server/publications.ts), and
  [`src/ui/shareRouting.ts`](../src/ui/shareRouting.ts).
- [x] Production API start scripts, Docker image, same-origin proxy sample, and
  durable-volume deployment contract — [`package.json`](../package.json),
  [`Dockerfile`](../Dockerfile), [`deploy/Caddyfile`](../deploy/Caddyfile), and
  [`DEPLOYMENT.md`](DEPLOYMENT.md).
- [ ] Complete screens 1–7 creation journey verified as one integrated flow;
  object review and style approval depend on later integration work.
- [ ] Generated quest/music/SFX/TTS integrated and used in a playable world;
  gateway support is not evidence of end-user integration.
- [ ] Optional generated postcard or gameplay-highlight flow integrated and
  independently failure-tolerant.

### Automated verification

- [x] `npm run typecheck` passes on the final integrated revision.
- [x] `npm test` passes: 46 files, 321 tests.
- [x] `npm run build` emits both `dist/` and `dist-server/server/index.js`.
- [x] Docker executable availability was checked with `docker version`; it is
  not installed on this machine, so the image build could not be run.
- [x] `npm run test:e2e:http` passes: 6 files, 31 tests against full server
  processes and the fake provider.

### Browser verification

- [ ] Welcome → upload/review → style approval → generation → preparation →
  play → completion works in real Chrome on the final integrated revision.
- [ ] Lost Colors fragment progression and portal gating complete in-browser.
- [ ] Explore and Race complete with pause/restart/respawn behavior.
- [ ] Save, publish, direct `/share/:shareId` refresh, and friend play work
  through the production-style same-origin route.
- [ ] Audio controls, user-initiated playback, subtitles, and reduced motion are
  verified with the actual integrated media path.
- [ ] Mobile layout, capture/upload fallback, orientation, and the honest
  keyboard/mouse-only gameplay notice are verified on target browsers.
- [x] Historical baseline browser evidence for the authored Rodin/Tripo courses
  and generated-artifact persistence is retained in [`QA.md`](QA.md); it is not
  substituted for the final v2 matrix.

### Live-provider verification

- [x] Real `kontext-edit` and `rodin-i3d` spike jobs, artifacts, estimates, and
  unknown provider-metered cost are recorded in [`EVIDENCE.md`](EVIDENCE.md).
- [x] One 2026-09-18 real Rodin GLB completed the isolated preparation/save
  workflow; its limits are documented.
- [ ] One complete current photo-to-play run uses the chosen production path on
  the final integrated app.
- [ ] Real background-removal output is reviewed in the object-review screen.
- [ ] Real constrained quest text, music, ambience/SFX, and TTS are generated,
  stored, and exercised together in play.
- [ ] Optional image-to-video postcard is executed and labelled honestly, if it
  remains part of the submitted demo.
- [ ] Final live batch records refreshed capability/health/price, requested and
  served capability/model, IDs, timings, fallbacks, cost disposition, and the
  consuming world asset.

### Deployment

- [x] Dedicated-origin topology and platform steps are defined.
- [x] `/api/*` proxy, SPA fallback including `/share/*`, API health check,
  same-origin media/CORS notes, and durable volume layout are supplied.
- [ ] Authorized deployment platform/project and credentials supplied.
- [ ] Dedicated ObjectQuest hostname, DNS, and TLS supplied.
- [ ] Durable volume mount path and backup/retention policy supplied.
- [ ] Keyless or API-key production mode and approved budget ceilings supplied.
- [ ] Release deployed without touching the preserved comparison site.
- [ ] Public health, direct share refresh, stored media, and pending-job resume
  smoke tests pass at the deployment URL.

## Known limitations that must remain in the handoff

- Automatic course preparation is conservative and may require guided editing;
  one successful mesh is not arbitrary-object quality evidence.
- The style preview is a direction, not a promise of pixel-identical mesh
  texture. The styled-mesh spike was heavier and did not improve course
  usability.
- No current real execution evidence exists for text, music, SFX, TTS,
  image-to-video, or background removal.
- API authentication, request throttling/global budgets, true private-file
  authorization, decoded-image limits, and storage lifecycle are not yet
  production-grade.
- Touch gameplay is unavailable; the verified control path is keyboard, mouse,
  and pointer lock.
- The filesystem stores support one API replica; multi-replica shared-volume
  operation is unsupported.

## Final-results fill-in

Complete this block only after merging current `main` immediately before the
final verification:

```text
Verified runtime revision: 218e6c5bdee27a52c89999db2c9f15f32460b6e0
Integrated main revision: a27bd1c0b5d98f3d89080277eb24893d31ee4dde
npm run typecheck: PASS
npm test: PASS — 46 files, 321 tests
npm run build: PASS — dist/ and dist-server/ emitted; Vite large-chunk warning
npm run test:e2e:http: PASS — 6 files, 31 tests
npm start smoke: PASS — GET /api/health on port 18787 returned {"status":"ok"}
Docker build: NOT RUN — docker executable is not installed on this machine
Real-browser QA: PENDING
Live-provider validation: PENDING
Deployment URL: PENDING — no authorized target
```
