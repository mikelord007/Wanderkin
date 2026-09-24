# ObjectQuest v2 delivery checklist

Snapshot: **2026-09-24**, integrated `main` revision
`e269fa95a3ee9cd4a7620cdbf7b19e4f4c692197`. This checklist separates
implementation, automated/local evidence, live-provider evidence, user
hands-on acceptance, and deployment. A checked implementation box is not a
claim that the corresponding live output or gameplay feel has been accepted.

## Handoff package

- [x] Run/configuration guide: [`README.md`](../README.md),
  [`DEPLOYMENT.md`](DEPLOYMENT.md), and [`.env.example`](../.env.example).
- [x] Architecture and product delta: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md),
  [`ACCEPTANCE_MATRIX.md`](ACCEPTANCE_MATRIX.md), and
  [`ACCEPTANCE_CHECKLIST.md`](ACCEPTANCE_CHECKLIST.md).
- [x] Security and production assessment: [`SECURITY.md`](SECURITY.md) and
  [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).
- [x] Real-job ledger and evidence boundaries: [`EVIDENCE.md`](EVIDENCE.md),
  with the live worker's canonical current result in
  [`LIVE_VALIDATION_RESULT_2026-09-24.md`](LIVE_VALIDATION_RESULT_2026-09-24.md).
- [x] Demo and hands-on paths: [`DEMO.md`](DEMO.md) and
  [`MANUAL_TEST_HANDOFF.md`](MANUAL_TEST_HANDOFF.md).
- [x] Production start scripts, Dockerfile, same-origin Caddy example, health
  route, and durable-volume layout are present.
- [ ] Deployment URL: no authorized target exists.

## Current implementation

- [x] Capture/upload, object review and optional cutout, Cartoon/Hand-painted/
  Watercolor selection, preview approval, resumable generation, world-ready,
  guided repair, and My Worlds recovery.
- [x] Explore, Collect/Lost Colors, and Race, including progression, finish
  rules, restart/respawn, timers, and immutable race challenges.
- [x] Saved worlds, drafts, immutable publications, `/share/:shareId`, portable
  bundles, and photo-free sharing by default.
- [x] Constrained quest generation and independent music, ambience, SFX, and
  narration orchestration through the common durable job gateway.
- [x] Bundled Lost Colors audio, gesture-gated playback, channel controls,
  subtitles, one-shot narration, and generated-media fallback behavior.
- [x] Actual gameplay highlight capture plus cached, asynchronous animated
  postcard creation, retry, preview, and download. These are distinctly
  labelled gameplay capture versus generated animation.
- [x] Owner-token boundaries for private jobs/assets/photos/levels, explicit
  publication of share assets, billable/upload rate limits, provider
  concurrency limit, per-request/world/global/daily spend limits, server-side
  image dimension/pixel/decode-budget checks, and opt-in storage GC.

## Verification ledger

- [x] `npm run typecheck`: pass after the integrated row-5 adapter repair.
- [x] Focused adapter/job-manager/quest suite: 69/69 pass; live-runner suite:
  7/7 pass.
- [x] Provider-neutral saved-world copy case: 1/1 Chrome pass at `764d1dd`.
- [x] Full browser suite: **37 passed, 6 skipped, 0 failed (43 total)** on the
  isolated port 55210 at `764d1dd`. The temporary 55209/55210 services were
  stopped afterward.
- [x] B14 audio browser evidence: three WAV requests and zero runtime errors.
- [x] Integrated broad suite: **377 unit tests and 44 HTTP tests passed** after
  the parser-only row-5 repair. The browser suite was appropriately not rerun
  for that server change, so 37/6/0 at `764d1dd` remains the latest browser
  evidence.
- [x] Earlier production build passed after quest/audio integration. It was not
  rerun for the latest runner/docs/evidence/test-only delta.
- [ ] Docker image build: Docker was not installed on the delivery worker's
  machine; configuration exists but has no executed image-build proof.

## Live-provider and hands-on gates

- [x] Current batch rows 1–5 are ready: background removal, Kontext preview,
  GPT image-edit alternate, Rodin mesh, and validated four-field quest. See
  [`EVIDENCE.md`](EVIDENCE.md).
- [x] Row 5 reused provider job `mjob_13e739e8d5af`: one force-poll recovered
  the same app job, served model `fal-ai/any-llm`, no fallback, validated four
  fields, null actual cost, and no ledger/estimate increase.
- [ ] Rows 6–16: music, ambience, seven SFX cues, narration, and postcard are
  authorized/in flight under the existing budget but have no success evidence
  at this timestamp. Fresh estimate: $0.7327.
- [ ] One current generated world is saved, repaired if necessary, completed,
  published, and opened in a fresh context. No level/share exists yet because
  rows 6–16 and the save/play step have not completed.
- [ ] User hands-on acceptance covers preview/mesh identity, course feel and
  repair, real quest text, generated audio/subtitles, postcard labeling and
  playback, persistence, and the photo-free share.
- [ ] A second representative object is authorized and evaluated, if still
  needed. One successful object must never be generalized to arbitrary
  geometry.
- [ ] Optional companion experiment remains gated until core acceptance.

## Deployment gates

- [x] Supported topology is a static client plus one Node API under one public
  origin, `/api/*` proxied to the API, SPA fallback for `/share/*` and other
  client routes, and one durable `STORAGE_DIR` volume.
- [ ] Authorized platform/project and deployment credentials supplied.
- [ ] Dedicated ObjectQuest hostname with DNS and TLS control supplied.
- [ ] Durable volume mount plus backup, retention, and tested restore policy
  supplied.
- [ ] Keyless or API-key production mode and approved production budget limits
  supplied.
- [ ] Public-origin health, direct-share refresh, stored media seek/download,
  and pending-job resume verified. Never use the preserved comparison site.

## Remaining limitations

- Filesystem JSON stores, ownership, rate limiting, concurrency, and GC are
  designed for one API instance; horizontal replicas are unsupported.
- Owner tokens protect resources but are not accounts, cross-device identity,
  recovery, or a broad public/private object-storage design.
- Storage GC is opt-in; there is no automatic expiry, per-user storage quota,
  or tested backup/restore procedure.
- Touch gameplay is unavailable. Responsive layouts and the honest controls
  notice are browser-tested, but the user owns final device/game-feel review.
- Provider-metered costs are unknown because completed jobs returned null cost
  fields. Estimates are not actual billing.
- No production deployment or dedicated-origin smoke evidence exists.
