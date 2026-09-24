You are the lead engineering orchestrator for ObjectQuest. Coordinate multiple coding agents to extend the existing application into a polished, genuinely fun photo-to-play adventure game.

Implement and verify the work. Do not stop at a plan, scaffolding, mock screens, or disconnected features.

Treat the frontend walkthrough below as the intended user experience, and the engineering requirements as the implementation and acceptance contract.

Use gpt astra whenever you're designing a frontend. Pick a theme for this whole app and design it with astra. Use gpt sol for the rest and most of the coding.

## 1. Product vision

ObjectQuest turns photographs of everyday objects into playable miniature 3D adventures.

The desired experience:

1. Photograph or upload an object.
2. Choose Cartoon, Hand-painted, or Watercolor.
3. Choose Explore, Collect, or Race.
4. Optionally describe the desired atmosphere.
5. Preview and approve the visual transformation.
6. Generate a playable world with matching music, ambience, sound effects, a title, and a short narrated quest.
7. Explore the object, complete the challenge, and save the level.
8. Share the level so someone else can play the same course.
9. Optionally create an animated world postcard or an actual gameplay highlight.

The flagship adventure is “Lost Colors”: the player collects three color fragments and reaches a finish portal. Collecting fragments progressively restores color to the world.

Example: a photographed coffee mug becomes “The Lost Colors of Teacup Island.” A tiny explorer climbs around the mug, collects three fragments, and reaches the portal. The world’s appearance, audio, and mission reflect the selected style and atmosphere.

The object must remain recognizable and central to the experience.

The key emotional moment is: “That’s my object—and now I’m climbing it.”

## 2. Existing project context

The following is the user’s reported baseline as of 2026-09-18. Verify it against the repository before relying on it:

- The app is a browser game.
- Photos go to a Livepeer generation job, which returns a GLB.
- The app inspects and normalizes the mesh, builds collision, and prepares spawn/checkpoint markers.
- Users can edit and save the course.
- The playable character is a capsule that runs, jumps, and mantles.
- Two bundled sample levels were completed end to end in real Chrome.
- The photo-to-saved-level pipeline succeeded with one real Rodin generation job.
- Reported verification: typecheck, production build, 253 unit tests, 24 HTTP integration tests, and six browser cases.
- All four original milestones were marked complete.
- The latest commits were acceptance documentation.
- A development server was previously started; verify whether it is still running.
- No production deployment existed.
- Any deployment must use a dedicated origin, separate from the preserved comparison site.
- There may be 17 stale worktrees and an untracked `nimbalyst-local/` directory. Leave these alone unless they directly obstruct the work.
- Livepeer credentials were previously absent from local `.env`; inspect presence without exposing values.
- Generated courses are uncertain and can require manual editing.
- One successful Rodin job is not evidence that arbitrary objects will produce good levels.

Locate the actual application repository. Do not assume the directory containing this prompt is the application checkout.

If working in a mirrored ChatGPT project, files under `sources/` are read-only reference material. Do not edit, move, rename, or delete them.

Read applicable AGENTS.md instructions and repository conventions.

Preserve the working baseline and existing user changes.

## 3. Livepeer integration context

Current endpoint:

POST https://agent.livepeer.org/api/mcp/full

This is a JSON-RPC MCP endpoint. Multiple capabilities are selected through requests to this endpoint; additional endpoint URLs are not required for each feature.

Read-only discovery performed on 2026-09-24 found 209 capabilities. This is a dated observation, not a guarantee of current availability.

At the start of implementation, refresh:

- `tools/list`
- `tools/call` with `list_capabilities`
- `describe_capability` for every candidate
- Relevant `cap_price`, `cap_route`, and `cap_test_report` information where useful

Example discovery body:

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "describe_capability",
    "arguments": {
      "name": "kontext-edit"
    }
  }
}

Previously inspected capabilities:

| Capability | Intended use | Important details |
|---|---|---|
| `bg-remove` | Object isolation | Image input; previously mapped to BiRefNet; some usage metadata was incomplete |
| `kontext-edit` | Style previews and image edits | Image plus instruction; `create_media` edit/restyle; previously healthy |
| `gpt-image-edit` | Alternative style editor | Separate capability from `gpt-image`; previously healthy but slower than Kontext |
| `rodin-i3d` | Object geometry | Existing path; image-to-3D; previously mapped to Rodin v2.5 |
| `gemini-text` | World title and quest wording | Text output via `run_capability`; validate generated structure |
| `music` | Themed instrumental soundtrack | Previously Minimax music v2; check instrumental support and actual output |
| `mirelo-sfx` | Text-generated ambience and effects | Text-to-audio; appropriate candidate for game sounds |
| `chatterbox-tts` | Quest narration | Detailed contract used `text`, not `prompt`; WAV output |
| `pixverse-i2v` | Animated world postcard | Image plus prompt to video; previously documented without audio |
| `meshy-v7-i3d` | Optional generated companion | GLB with optional rigging/stock animation; additional engine integration required |

Important findings to recheck:

- Generic `sfx` required a video input. Do not confuse it with text-to-audio `mirelo-sfx`.
- `gpt-image` generation previously reported degraded health. Its `gpt-image-edit` sibling had different telemetry.
- `kontext-edit` resolved correctly, but its advertised fallback chain contained an input compatibility warning.
- Rodin readiness metadata was incomplete and its observed sample count was tiny.
- Some generic invocation examples omitted required inputs or conflicted with detailed constraints.
- No dedicated skybox/panorama generator or reliable texture-only restyling of an existing GLB was confirmed.
- Some provider model IDs pointed to fal adapters. Do not claim every job runs on decentralized Livepeer GPUs merely because it used the agent endpoint.

Previously displayed prices, for planning only:

- Kontext edit: $0.042/image.
- Rodin: $0.42/default call.
- Music: $0.0315/default call.
- Mirelo SFX: $0.0105/generated second.
- Pixverse: $0.06825/generated second.

Refresh prices before spending. These figures exclude retries, storage, and option-dependent changes.

Use the existing integration where possible. Keep credentials and provider requests on the server.

## 4. Frontend walkthrough — required user experience

Build this as one coherent journey. Follow existing product conventions where appropriate, but implement the behavior and hierarchy described here.

Suggested wording can be refined for clarity. Do not expose model names, provider details, or implementation terminology in ordinary player flows.

### Screen 1: Welcome

Suggested headline:

“Your everyday objects. Extraordinary little worlds.”

Show a real example of an everyday object beside its playable transformation. Use verified sample assets, not a misleading illustration of capabilities the app does not have.

Primary actions:

- Create my world.
- Play a sample.

Returning users should also have access to My worlds, including saved adventures and pending generation jobs.

A sample should be playable without requiring the user to upload anything or wait for generation.

Do not introduce mandatory account creation before trying a sample unless the existing architecture genuinely requires it.

### Screen 2: Capture or upload

Suggested heading:

“What will your world be made of?”

On supported phones, provide:

- Take a photo.
- Choose from photos.

On desktop, provide:

- Upload a photo.
- Drag-and-drop upload.
- Camera capture where supported and useful.

Provide brief guidance:

- Keep the whole object visible.
- Use good lighting.
- Prefer a simple background.

After capture or upload, show:

- A useful image preview.
- Use this photo.
- Retake or replace.

Handle orientation correctly.

If camera permission is denied or capture is unavailable, keep upload available and explain the alternative clearly.

Validate invalid files and oversized images before starting expensive work.

Additional angles may be offered when supported by the chosen generation path. A single photo should be enough to begin.

### Screen 3: Review the object

Suggested heading:

“Here’s your object.”

Show the isolated object after background removal, when that step is used.

Let the user verify that:

- The intended object was selected.
- Important parts were not removed.
- The crop contains the complete object.

Primary action:

- Looks good.

Secondary actions:

- Adjust crop.
- Replace photo.
- Use the original image when isolation is unsuitable and the downstream path supports it.

Do not silently continue with a visibly broken cutout.

This screen should catch input problems before style and 3D generation.

### Screen 4: Customize the adventure

Suggested heading:

“What kind of adventure is this?”

Keep the choices compact.

Look:

- Cartoon.
- Hand-painted.
- Watercolor.

Use visual examples to explain these options.

Adventure:

- Explore — Wander at your own pace.
- Collect — Find the lost colors and unlock the portal.
- Race — Reach the finish as fast as you can.

Select Collect by default.

Atmosphere:

An optional short text field with examples such as:

- A floating island above the clouds.
- An enchanted forest.
- A sleepy seaside village.

Do not require the user to write a prompt.

The user should be able to choose a style and proceed with sensible defaults.

Changing a local selection alone should not silently start a paid generation job.

### Screen 5: Approve the style preview

Suggested heading:

“Like this direction?”

Generate a preview of the user’s actual object in the selected style.

Allow:

- Comparison with the original.
- Approval of the selected preview.
- A style change.
- A deliberate retry when the result is unsuitable.

Primary action:

- Build my world.

Clearly describe the preview as the visual direction. The playable result may differ.

Do not generate three complete 3D worlds just to let the user choose a style.

Cache successful previews. Re-selecting an unchanged approved preview should not generate it again.

Before starting 3D generation, require the explicit Build my world action.

Preserve the chosen reference and settings so refresh or retry cannot accidentally build from a different selection.

### Screen 6: Generation progress

Suggested heading:

“Your world is taking shape.”

Keep the chosen preview visible.

Show understandable stages backed by actual job states:

- Preparing your object.
- Building its 3D shape.
- Creating your course.
- Adding its story and sound.

Prepare independent assets in parallel.

As outputs become available, the screen can reveal:

- The world’s title.
- A short quest introduction.
- A rotating view of the actual generated object.
- Music or narration previews with deliberate playback controls.

Do not autoplay sound unexpectedly.

Show elapsed time and estimates only when supported by meaningful information. Never fabricate a percentage or hold users indefinitely at 99%.

Users must be able to leave this screen and return through My worlds. Refreshing should resume observation of the existing job, not resubmit it.

If the core course is ready while optional audio is pending, allow entry to the game.

If a job fails:

- Identify the failed stage.
- Preserve successful outputs.
- Offer an appropriate retry or edit action.
- Do not regenerate the mesh merely because narration failed.
- Do not imply that leaving the screen cancels a paid provider job unless cancellation is actually supported.

### Screen 7: World ready or course repair

Suggested heading:

“Welcome to Teacup Island.”

Show the actual rendered world and a short mission, for example:

“Three colors have disappeared from Teacup Island. Find them and reach the portal to bring the island back to life.”

Primary action:

- Enter world.

Secondary actions:

- Adjust course.
- World settings.

A successfully prepared course should lead directly into play.

If course preparation identifies a problem, show the specific issue and open an appropriate guided editor.

Example:

“Move this checkpoint closer to the previous platform.”

Do not send every user through a technical editor.

Do not call an uncertain course “verified” without supporting checks. Distinguish prepared, checked, and needing adjustment where appropriate.

### Screen 8: Play

The game should become the dominant full-screen experience.

Provide a short contextual introduction to movement and jumping. Use appropriate controls for supported devices.

For Collect mode, keep the display minimal:

- Colors found: 0/3.
- A short current objective.
- Pause.
- Sound controls.

Collecting a fragment should:

- Update progress.
- Restore part of the world’s color.
- Play an appropriate effect.
- Give clear visual feedback.

After all required fragments are collected, activate the finish portal.

Explore mode removes mandatory time pressure.

Race mode adds:

- Countdown.
- Timer.
- Checkpoint progress.
- Clear restart behavior.

Falling should return the player quickly to an appropriate checkpoint.

Do not repeat the introduction on every death or duplicate collectible rewards.

Support narration subtitles, mute, and reduced motion.

If touch gameplay is not implemented or verified, clearly communicate supported controls rather than presenting a broken mobile play experience.

### Screen 9: Completion

Suggested heading:

“You brought the colors back.”

Show the restored world and relevant completion details.

Actions:

- Play again.
- Try Race mode.
- Share this world.
- Create another world.

Save progress and the world.

Replaying the same world must reuse existing assets and avoid new generation charges.

If switching modes requires a course change, make that transition explicit and preserve the original version.

Sharing should prioritize a playable link.

Optional media actions:

- Create animated postcard.
- Download gameplay highlight.

Clearly distinguish generated animation from actual gameplay footage.

Postcard generation remains asynchronous and must not block replay or sharing the playable link.

### Screen 10: Friend opens a shared world

Provide a simple landing page containing:

- World title.
- Preview.
- Adventure mode.
- Creator’s challenge or target time when applicable.
- Play.

The recipient must not have to upload a photo or regenerate the world.

Race challenges must refer to the same immutable published course version.

Editing the creator’s private copy later must not silently alter an existing challenge.

Do not expose the creator’s source photographs through sharing unless the creator explicitly includes them.

### My worlds and recovery

Provide a persistent way to find:

- Saved worlds.
- Draft worlds.
- Pending generations.
- Jobs requiring attention.

Each item should offer the appropriate next action, such as Resume, Play, Edit, or Retry.

Distinguish saving a private world from publishing a shareable version.

Handle missing or expired assets gracefully. Do not leave users with an unexplained blank canvas.

## 5. Required implementation scope

Deliver all core features below. Keep optional companion generation separate so it cannot delay the main experience.

### A. Coherent visual styles

Each style must affect the actual playable world, not only its preview card.

Cartoon:
- Clear silhouettes.
- Bold colors.
- Readable outlines where feasible.
- Playful lighting and scenery.

Hand-painted:
- Brush-like surface treatment.
- Warm lighting.
- Storybook atmosphere.

Watercolor:
- Pastel palette.
- Paper/wash treatment.
- Soft atmospheric scenery.
- Readable platform edges and gameplay markers.

Create a shared style definition driving:

- Image prompts.
- Scene colors.
- Lighting.
- Rendering parameters.
- Environment dressing.
- Audio prompts.
- Appropriate interface accents.

Respect reduced-motion settings. Avoid expensive effects that make jumping difficult or harm performance.

### B. Resolve the image-to-3D style question early

Run a bounded technical spike on a suitable object:

1. Create a styled reference.
2. Generate a mesh from that reference.
3. Compare recognizability, style retention, topology, collision behavior, and course usability.

Compare this with retaining original-photo geometry and applying coordinated in-engine materials, lighting, post-processing, and generated scenery.

Choose the production approach based on evidence.

Do not assume:

- A styled photograph becomes a faithfully styled mesh.
- Multiple independently edited views remain geometrically consistent.
- A generated image can be directly applied as a valid UV texture.
- A generated video is a navigable environment.

If styled-reference geometry works, rebuild collision and validate the course against the resulting mesh.

If it does not, retain original-photo geometry and establish the style through rendering and surrounding art. Ensure the frontend preview accurately communicates that approach.

Document the decision and its limitations.

### C. Gameplay and course behavior

Implement three modes using shared level data.

Explore:
- Relaxed traversal.
- Clear destinations.
- Optional collectibles.
- No mandatory timer.

Collect:
- Lost Colors adventure.
- Three required fragments by default.
- Progressive color restoration.
- Clear progress feedback.
- A finish portal with understandable completion rules.

Race:
- Countdown.
- Ordered checkpoints where appropriate.
- Timer and results.
- Restart.
- Best-time tracking.
- Challenge sharing against the same immutable course version.

Extend the existing movement controller rather than replacing it without evidence.

Keep respawns quick and fair. Prevent repeated narration, duplicated rewards, and inconsistent progress after restart.

Course placement must respect actual geometry and movement limits. AI-written quest text cannot establish that a jump is reachable.

Use conservative placement, existing validation, and editor repair paths. Do not silently publish an unusable course.

### D. Personalized story and audio

Use Livepeer to generate:

- World title.
- Short quest introduction.
- Brief objective wording.
- Instrumental soundtrack.
- Ambient sound.
- A small reusable set of game effects.
- Short spoken introduction.

Use a constrained quest template and validate generated text.

The model writes flavor around supported mechanics; it does not invent executable game logic.

Provide:

- User-gesture-compatible playback.
- Master, music, effects, and voice controls.
- Mute.
- Narration subtitles.
- No repetitive speech on every death.
- Sensible trimming, normalization, and loop handling.
- Graceful fallback when optional audio fails.

Prepare independent assets alongside mesh generation. Play should not wait indefinitely for optional media.

### E. Persistence, editing, and sharing

Extend existing storage instead of introducing a new stack unnecessarily.

Persist:

- Source and selected-reference metadata.
- Style and mode.
- Mesh and collision-related information.
- Course layout and collectible placement.
- Quest text.
- Audio and optional video asset references.
- Generation job states.
- Asset provenance.
- Schema version.

Preserve existing levels through compatible reads or explicit migrations.

Allow users to adjust checkpoints, collectibles, spawn, and finish markers through existing editor patterns.

Shared links must identify a stable published level version.

If server-verified competition is outside the architecture, ship honest personal or unverified challenge times. Do not describe client-submitted scores as cheat-proof.

### F. Sharing media

Animated world postcard:
- Capture an attractive screenshot.
- Send it to a suitable image-to-video capability.
- Produce a short atmospheric clip.
- Present it as an animated postcard.

Gameplay highlight:
- Capture actual gameplay through a supported browser path.
- Add title/time information and supported finishing where useful.
- Provide preview and download or sharing.

Never label generated animation as actual gameplay.

Video is optional and asynchronous. A failed video job must not damage the level or block playing or sharing its link.

### G. Optional companion extension

After core acceptance gates pass, investigate an opt-in generated companion:

- Use an appropriate reference image and `meshy-v7-i3d` if current contracts support the needed output.
- Validate rigged/animated output in the actual renderer.
- Keep collision and movement under existing controller control.
- Start with simple companion behavior before attempting a full avatar replacement.
- Cache results.
- Isolate its cost and failure states.

This is an experimental extension. Do not make it a required onboarding step or a dependency of core completion.

If it cannot be verified, leave it out of the normal user flow and report the concrete blocker.

## 6. Parallel agent organization

Create 12 bounded worker assignments. These are workstreams, not a requirement to run 12 agents simultaneously.

Use the maximum safe concurrency the environment permits while keeping the orchestrator available for integration.

If only four total agent slots exist:

- One orchestrator.
- Three active workers.
- Rotate assignments as workers finish.
- Never attempt unsupported extra concurrency.

Do not let workers create uncontrolled nested teams.

Include the frequent-commit requirements in every worker’s initial assignment.

### Worker 1 — Architecture and shared contracts

Own:

- Repository audit.
- Versioned level/style/job schemas.
- Shared interfaces and adapters.
- Migration design.
- Acceptance matrix.
- File ownership map.

Deliver contracts early so other workers can build against fixtures.

### Worker 2 — Livepeer gateway and generation jobs

Own:

- Capability discovery and request validation.
- Existing client extension.
- Async submission and polling.
- Idempotency and resume behavior.
- Retry/error classification.
- Budget controls.
- Provenance and actual served-model recording.
- Common job API.

Do not own product UI or gameplay.

### Worker 3 — Visual styles and 3D feasibility

Own:

- The bounded style-to-mesh experiment.
- Evidence-based production recommendation.
- Scene styling.
- Materials, lighting, effects, and environment dressing.
- Performance and readability checks.

Coordinate paid experiments with the orchestrator to avoid duplicate jobs.

### Worker 4 — Creation and progress interface

Own frontend screens 1–7 and the pending-generation aspects of My worlds:

- Upload and capture.
- Object review.
- Style and mode selection.
- Atmosphere input.
- Preview approval.
- Generation progress.
- Resume, error, and retry states.
- World-ready and guided-repair entry points.
- Responsive onboarding.

Build initially against agreed job interfaces and fixtures.

### Worker 5 — Gameplay and course behavior

Own:

- Explore, Collect, and Race.
- Lost Colors progression.
- Finish rules.
- Checkpoints, timers, restart, and respawn state.
- Reachability/placement integration.
- Gameplay HUD.
- Completion behavior and results.

Preserve the working movement controller.

### Worker 6 — Quest generation and audio

Own:

- Constrained quest generation.
- Style-specific prompts.
- Music, SFX, ambience, and narration jobs through Worker 2’s gateway.
- Audio playback and controls.
- Subtitles and event triggers.
- Audio caching and fallback behavior.

Do not introduce an independent provider client.

### Worker 7 — Persistence, editor, and challenge sharing

Own:

- Saved-level extensions and migrations.
- My worlds persistence and saved-world interface.
- Editor support for new course entities.
- Immutable published versions.
- Share links.
- Friend landing page.
- Personal records and challenge comparison.
- Compatible sample-level loading.

Coordinate screen boundaries with Workers 4 and 5.

### Worker 8 — Postcards and gameplay capture

Own:

- World screenshot capture.
- Animated postcard generation.
- Actual gameplay recording.
- Results overlays and exports.
- Preview/download interface.
- Honest labeling and independent failure handling.

Use Worker 2’s gateway and Worker 7’s persistence interfaces.

### Worker 9 — Companion experiment

Own:

- Optional generated companion feasibility.
- Rigged GLB loading and animation checks.
- Minimal companion behavior.
- Feature isolation and performance assessment.

Schedule this after the primary geometry decision and core integration are stable.

### Worker 10 — Integration tests and reliability

Own:

- Cross-feature integration tests.
- Migration and job-lifecycle tests.
- Error/retry/resume scenarios.
- Budget and idempotency checks.
- Regression investigation.
- An independently maintained acceptance checklist.

Start test design early.

### Worker 11 — Browser QA, accessibility, and performance

Own:

- Real-browser end-to-end validation.
- Desktop and mobile-layout checks.
- Keyboard, touch where supported, focus, and audio behavior.
- Visual style comparison.
- Performance measurements against baseline.
- Findings with reproduction steps.

Use actual browser interaction. Mocks are not evidence that the user experience works.

### Worker 12 — Delivery, deployment, and demo evidence

Own:

- Environment/setup documentation.
- Dedicated-origin deployment preparation.
- Operational configuration.
- Real-job evidence organization.
- Demo script and fallback sample worlds.
- Final delivery checklist.

Do not deploy over the preserved comparison site.

## 7. Frequent commits — mandatory for every agent

The orchestrator must explicitly instruct every subagent to make frequent, focused commits.

Do not let a worker accumulate its entire assignment as one large uncommitted change.

Required practice:

1. Commit after each small, coherent implementation milestone.
2. During sustained implementation, aim for a checkpoint approximately every 20–30 minutes when a meaningful, reviewable change exists.
3. Commit sooner when a contract, migration, UI step, behavior, test group, or bug fix reaches a stable state.
4. Do not create empty or meaningless commits merely to satisfy a clock.
5. Run checks appropriate to the change before committing. Record which checks ran.
6. Keep ordinary integration commits buildable and focused.
7. Before switching assignments, handing off work, or ending a worker session, commit completed owned changes and report any remaining uncommitted work.
8. Report commit hashes to the orchestrator as milestones land.

Every commit should:

- Have a descriptive message explaining the concrete change.
- Contain one logical unit of work where practical.
- Include relevant tests alongside the behavior they validate.
- Exclude secrets, `.env` files, unrelated user changes, temporary logs, and unnecessary generated artifacts.
- Include only files the worker owns or has coordinated permission to change.

Use isolated worktrees or branches so one worker cannot accidentally commit another worker’s files.

Do not blindly stage the entire repository. Inspect staged changes.

If isolation is unavailable, serialize Git index and commit operations through the orchestrator.

If unfinished work needs preservation, use a clearly identified checkpoint on the worker’s isolated branch. Do not integrate an unverified checkpoint into the main integration branch as if it were complete.

Do not rewrite another agent’s history, discard another agent’s changes, or amend someone else’s commit without coordination.

The orchestrator should also commit integration fixes and shared-contract changes frequently.

Maintain a compact integration ledger containing:

- Worker/workstream.
- Branch or worktree.
- Relevant commit hashes.
- Verification performed.
- Integration status.
- Known unresolved issues.

The final handoff must leave all intended deliverable changes committed, or explicitly identify why specific changes remain uncommitted.

## 8. Dependency plan and integration discipline

Begin with a short discovery wave:

- Worker 1 audits architecture and establishes contracts.
- Worker 2 verifies provider contracts and the existing integration.
- Worker 3 examines rendering and the style-to-mesh decision.

During that wave, the orchestrator:

- Verifies the baseline.
- Locates the real repository and running services.
- Checks Git status and protects existing changes.
- Creates the integration plan.
- Confirms available agent capacity.
- Identifies credential, budget, and deployment blockers.
- Defines acceptance evidence.

Release UI, gameplay, audio, persistence, and sharing work as soon as their required contracts stabilize. Do not wait for all infrastructure to finish.

Use an agreed reference fixture so workers can progress independently.

Protect shared schemas, routing, app bootstrap, dependency manifests, and lockfiles from simultaneous edits.

Workers must:

- Read relevant instructions.
- Stay within assigned ownership.
- Commit frequently as specified above.
- Report assumptions, changed files, tests, commit hashes, and unresolved issues.
- Coordinate shared-file changes through the orchestrator.
- Avoid unrelated refactors.

The orchestrator must:

- Integrate continuously.
- Review changes before combining them.
- Resolve contract conflicts promptly.
- Run targeted checks after integration.
- Keep a dependency board and commit ledger current.
- Prevent duplicate implementations and duplicate paid jobs.
- Reassign available workers to useful independent tasks.
- Keep updates focused on completed behavior, evidence, and blockers.

Freeze feature additions before final acceptance. Finish defects before expanding optional scope.

## 9. Reliability and spending requirements

Use existing credential and spending authorization.

Never print secrets, commit `.env`, or send credentials to the browser.

Before paid validation:

- Read current capability contracts and pricing.
- Define a small test matrix.
- Enforce configured per-request and per-world limits.
- Limit automatic retries.
- Coordinate all workers through one budget owner.

If credentials or an authorized spending limit are missing, continue every independent implementation and mock/integration check.

Then present one concrete request explaining the exact live-validation batch and expected maximum cost.

Do not invent successful outputs or claim live validation passed without it.

Distinguish:

- Catalog availability.
- Server-reported historical health.
- Your own successful execution.
- Visual quality.
- Actual gameplay usability.

Store provenance sufficient to show:

- Requested capability.
- Actual served capability/model when returned.
- Job identifier.
- Status and timings.
- Reported cost when available.
- Which game asset consumed the output.

Unknown cost is not zero cost.

Preserve successful artifacts when another job fails. Retrying narration should not regenerate the mesh.

Do not retry indefinitely or fall back to incompatible input/output types.

Implement protections appropriate to the existing public app:

- Bounded uploads and decoded image sizes.
- Supported file types.
- Safe handling of remote asset URLs.
- Server-only credentials.
- Rate and spend limits for billable endpoints.
- Output validation.
- No execution of generated text as code.
- Appropriate private/public asset boundaries.

Avoid introducing a large new platform merely to satisfy these requirements.

## 10. Verification and acceptance

Record the starting baseline. Run the repository’s required checks and investigate regressions.

Use meaningful tests for behavior, not tests that simply repeat implementation details.

Required automated coverage should include:

- Existing levels still load.
- New schema round trips.
- Migration compatibility.
- Job deduplication.
- Polling, errors, and resume.
- Partial asset failure.
- Budget rejection.
- Preview approval and correct input selection.
- Collectible progression.
- Finish rules.
- Restart and respawn state.
- Race timing behavior.
- Stable published course versions.

Required real-browser scenarios:

1. Play both original bundled sample levels.
2. Complete a new Lost Colors sample adventure.
3. Verify all three styles affect gameplay rendering.
4. Exercise Explore, Collect, and Race.
5. Upload or capture an image and review the object.
6. Approve a style preview before 3D generation begins.
7. Restart and respawn without duplicate rewards or stale timers.
8. Adjust and save course entities in the editor.
9. Reload a saved level with its style, mission, and audio intact.
10. Resume a pending generation after refresh.
11. Experience a failed optional audio/video job without losing the level.
12. Open a shared course in a separate browser session.
13. Verify race comparisons refer to the same published course.
14. Exercise mute, subtitles, keyboard focus, and reduced-motion behavior.
15. Verify camera-denied/upload alternatives and useful invalid-input errors.
16. Preview/download an actual gameplay recording where supported.
17. Preview/download a generated postcard after a real successful job.
18. Verify replaying a saved world does not submit new generation jobs.
19. Verify My worlds exposes the correct actions for drafts, pending jobs, failures, and playable worlds.

For real generation:

- Use a bounded set of representative objects.
- Validate appearance and usability, not just HTTP success.
- Include at least one complete real photo-to-play run using the chosen production path.
- Obtain real evidence for every AI capability claimed as working.
- Keep unverified optional features out of normal flows.
- Do not generalize from one successful object to arbitrary geometry.

Prepare polished bundled examples so the demo remains usable during provider outages. Clearly distinguish bundled examples from live-generated worlds.

Assess rendering and loading performance against the baseline on the available device. Report actual observations; do not invent universal FPS guarantees.

## 11. Deployment and demo

Prepare a production build and deployment configuration for a dedicated ObjectQuest origin.

Do not modify or replace the preserved comparison site.

Use an existing authorized deployment target if available and clearly appropriate. Otherwise finish deployment preparation and report the exact remaining account, origin, or configuration requirement.

Check production concerns:

- Asset persistence and expiration.
- Shared-link routing.
- Server credentials.
- Upload constraints.
- CORS and media loading.
- Job polling across refreshes.
- Rate/spend controls.
- Public/private asset boundaries.
- Mobile browser behavior.

The demo should show:

1. The original photograph.
2. Object review.
3. Style choice and reference approval.
4. Generation progress.
5. The actual playable object world.
6. Lost Colors progression.
7. Matching generated music, effects, and narration.
8. A saved/shared challenge.
9. Optional postcard or genuine gameplay highlight.
10. Actual Livepeer job evidence behind the assets.

Describe the integration accurately. Verify hackathon-specific eligibility rules if supplied; do not infer that endpoint usage alone satisfies every sponsor criterion.

## 12. Definition of done and final handoff

Core completion means the required experience works as one integrated application, with passing applicable checks and real-browser evidence.

Do not mark the project complete solely because individual workers finished or tests passed against mocks.

Maintain a checklist with:

- Implemented.
- Automated verification.
- Browser verification.
- Live-provider verification.
- Remaining limitations.

Final handoff must include:

- What changed from the baseline.
- How to run and configure it.
- The actual repository, branch, or PR.
- A commit summary and integration status.
- Deployment URL if deployed.
- Exact verification results.
- Real-generation evidence and observed costs.
- The visual pipeline decision and its tradeoffs.
- Any remaining blockers or optional experiments.
- A concise hackathon demonstration sequence.

Be autonomous with routine reversible implementation decisions.

Ask only for information or authorization that is genuinely missing and necessary, while continuing independent work.

Start by inspecting the repository, establishing the baseline, and dispatching the first bounded parallel assignments. Include the frontend acceptance requirements and frequent-commit instructions in every relevant worker brief.