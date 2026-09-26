# Dynamic biomes and adventures

**PAUSED BY USER FOR ORCHESTRATOR HANDOVER. Read BIOME_RESUME_READ_FIRST.md. No further implementation, testing, review or commits until new orchestrator explicitly resumes after reconciliation.**

New user scope supersedes previous visual-only scope. Base: 2193c5c.

## Ownership

- Coordinator: coordination, ownership, status and handoff documents ONLY. Never writes product code, builds, tests or debugs. User reaffirmed this on Sep25; it overrides interpreting "parent owns integration" as direct implementation permission.
- Geometry (64ffaf53): new `src/biome/placement.ts`, `adventures.ts`, geometry helpers/tests. Existing course changes require narrow ownership handoff.
- Visuals (359d554d): new `src/biome/presets.ts`, render components/helpers/tests; may adapt SceneLighting, SceneEntities, SceneEnvironment exclusively if needed. No GameStage edits.
- UI/models + technical integration (ad9320dd): new adventure control component/CSS/tests, safe model planning schema/fallback, capability feasibility note; now also owns shared contracts/schema and App/PlayScreen/GameView/GameStage/Hud/diagnostics integration. Parent's uncommitted drafts transferred for review, correction and validation; takeover instruction queued, not yet acknowledged at handoff.

## Contract

`src/biome/types.ts` is the shared contract. Geometry exports `prepareBiomeLayout(input: BiomePreparationInput): BiomeLayout` and `prepareAdventure(input: AdventurePreparationInput): AdventurePreparationResult` (sync, bounded). Visuals exports `getBiomeDefinition(id)` and `BiomeLayer({definition,layout,quality,reducedMotion})`. Additional lighting/helper tint interfaces must be reported before integration. UI exports controlled `AdventureControls` with theme and explicit reset action; API agreed directly with coordinator.

Theme state stays outside gameplaySignature and GameplaySession. Theme switch prepares the next layout first, then atomically swaps visuals. Original unmounts biome content and restores original styling. Adventure generation uses a clone/new draft and commits it only after validation; no live storage writes. Save/publish remains explicit existing user workflow.

## Bounds

Protected ports 5173/8787/15173/18799; existing private world/audio/storage untouched. No new paid services. Capability audit read-only until bounded smoke allocated. Round budget $10, prior round estimate $0.126 (actual paid unknown). Zero automatic retries. Unique private Vite caches on disposable ports. Worker code commits only via Nimbalyst.

## Current status

LATEST user preference: hands-on whole-game playthroughs and subjective gameplay are USER-owned. Active agents instructed to stop full traversal/completion/replay testing and prepare BIOME_HANDS_ON_HANDOFF.md. Retain only focused automated implementation contracts/crash/switch checks; do not repeat recorded controller suites without a change that needs them.

Architecture audits and initial worker implementation in progress. No completed implementation claims yet. Parent prematurely made 10 tracked source edits plus two new source files; all are uncommitted/unverified and assigned to the Claude integration worker. See BIOME_ORCHESTRATOR_HANDOFF.md for exact state and source list. Parent has stopped coding.

## Geometry audit decisions — 14:52 IST

Geometry worker reports exact runtime `claude-opus-5-5`. Actual authored-grid analysis found no reachable elevated tier on either bundled scan; existing generic helpers alone are insufficient. Authorized bounded stronger stair/bridge/flat-scene repair, with actual-controller verification and honest failure preserving the old world if no safe result exists.

- Plan using authored movement and TriangleSoup asset map; runtime dimensions only for decorative scale. Integration worker updates provisional interfaces, not coordinator.
- Adventure geometry independent of biome. Theme flavor/colors applied downstream; same source/template/seed means same traversal.
- New missions start with color restoration 1. Beacon uses existing explore + one destination.
- Explicit new adventure replaces objective/checkpoint layout; visual switching never does. Do not accumulate previously generated adventure helpers.
- Geometry ownership expanded to new `src/scene/raycast.ts`, `src/scene/placement.ts`, `src/adventure/*`, tests and additive `src/scene/course.ts` options/exports/generators. Existing default planner behavior preserved. Optional biome adapter wrappers coordinated directly with integration owner.
- Floor margin is not assumed empty. Fallback must prove support and clearance, preserve source visibility, and return validated success or explicit failure. No falsely validated fallback.

## Integration takeover and capability allocation

ad9320dd acknowledged all parent draft paths, reports runtime claude-opus-5-5 and 31/31 UI/model tests; implementation not integrated/committed yet. Corrects failed-result handling, theme-independent geometry, shared-world Finish identity, legacy Lost Colors copy, HUD accessibility and lighting wiring. Theme-only switches stay session-local; explicit generated drafts retain theme metadata.

Allocated one text fixture smoke ($0.01 cap) and one bundled-sample vision probe ($0.05 cap), zero retries/fallback/new service. Total $0.06 RESERVED, not claimed spent; prior round $.126 => $.186 estimate+reservation. Existing access only and enforceable caps required. Integration worker owns evidence and final ledger reconciliation. No other biome paid generation.

Smoke disposition (supersedes reservation above): BOTH halted before dispatch. Worker reports demo access, spend_cap applied:false and no per-request dollar field in run_capability. Coordinator chose C, no account configuration change and no probes. Full $0.06 released; round estimate remains $0.126, new smoke spend/submissions zero. Provider demo allowance readings are not project-specific settlement evidence. Document no new smoke this round; deterministic implementation proceeds.
