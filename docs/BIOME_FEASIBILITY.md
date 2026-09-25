# Biomes and adventures: model feasibility

Scope: Original / Tropical Island / Desert themes and the Restore the Portal /
Reach the Beacon adventures, 2026-09-25. This note records what the configured
models can actually be relied on for. **The core feature must work entirely
offline and deterministically. No model is required.**

Evidence is graded in four levels:

- **Smoke (this round):** a call made for this feature.
- **Prior evidence:** a real ObjectQuest run recorded before this feature.
- **Docs only:** described by provider metadata or docs, never run by us.
- **Unsupported:** not available, or not usable by this app.

## Configured model access

- The repository has **no LangChain** and no LLM SDK dependency. Nothing was
  added to claim AI use.
- The only model route is the existing server-side Livepeer Agent MCP gateway
  (`server/livepeer/adapter.ts` → `server/jobs/manager.ts`). It enforces
  budgets, idempotency and job persistence.
- The repository `.env` is absent, so a default local run has no
  `LIVEPEER_API_KEY`. The planner must therefore take its fallback path by
  default, and it does.

## Capability findings

| Question | Grade | Finding |
| --- | --- | --- |
| Can the model return structured data reliably? | **Prior evidence** (one run) | `gemini-text` (Livepeer → `fal-ai/any-llm`) returned quest JSON on 2026-09-24. It passed the strict quest validator (`job_8df572b8…`, `docs/LIVE_VALIDATION_RESULT_2026-09-24.md`). Livepeer reports 267 samples, 100% ok, p50 3.1 s, p95 6.8 s, $0.0000788/1k tokens. Neither fal's docs nor Livepeer's descriptor offer a JSON-schema or `response_format` mode. JSON is requested in the prompt and must be validated by us. **Risk:** fal's `fal-ai/any-llm` page marks the endpoint *deprecated / no longer supported*, even though Livepeer still reports healthy traffic. Treat availability as revocable. |
| Useful scene labels and theme suggestions? | **Docs only** for this feature | Possible through the same text route, from the user's description text. No theme-plan smoke has been run yet (proposal below). |
| Can the model inspect an image? | **Docs only**; not wired | Livepeer exposes `nemotron-omni-vision` (`nvidia/nemotron-3-nano-omni/vision`): prompt plus public https `inputs.image_url`, text output, $0.0063/1k tokens. Livepeer reports 127 samples, 100% ok, p50 2.3 s. fal's docs list `max_tokens` (default 1024), `temperature` and `reasoning_mode`, with no structured-output mode. ObjectQuest's `text` request kind sends a prompt only (`adapter.ts` `case "text"`). Using vision would need a new request kind in protected `shared/` plus adapter/route changes, and it would send the user's photo to a further provider. |
| Image generation? | **Prior evidence** for 2D photo edits; not integrated for this feature | `kontext-edit` and `gpt-image-edit` produced 2D photo edits in live validation. Image models can draw textures or sky-like pictures. What is missing is an integrated pipeline that turns such an image into a UV-mapped texture for the existing scan, a placeable prop, or a runtime skybox. Building that is out of scope and unnecessary for this feature. |
| 3D asset generation? | **Prior evidence** for image-to-3D only; unsuitable here | `rodin-i3d` produced one GLB (~$0.42, p50 ~130–175 s). `tripo-t3d` and `rodin-t3d` are **docs only**. Minutes of latency and per-call cost rule out in-session theme switching. |
| Skybox, panorama, or texture restyle of an existing mesh | **No dedicated capability found** | No catalogue entry offers this as a contract (unchanged from `docs/LIVEPEER_CAPABILITIES.md`). |
| Reliable spatial coordinates from a model | **Unsupported by design** | Placement comes from geometry raycasts and the actual movement limits. The planner schema forbids positions entirely. |

## What is procedural, and the fallback

- Sky, fog, lighting, surface patches, props, wind, particles, traversal
  structures and objective placement are all deterministic and seeded. They
  are driven by geometry and preset configuration.
- Adventure naming comes from each theme's preset `mission` naming.
  `resolveAdventureNames` in `src/biome/planning.ts` fills any gap from the
  presets.
- When no requester is injected, `planAdventure` returns
  `fallbackAdventurePlan` without attempting a call. The same fallback is
  returned when the single attempt:
  - times out (default 12 s, capped at 60 s, and aborted),
  - throws, or
  - returns malformed or unsafe output.
- The fallback is deterministic per seed. The player's explicit theme and
  adventure choices always win. Obvious scene words only hint a theme.

## Model-output safety contract (`src/biome/planning.ts`)

- It accepts only `biomeId` ∈ {original, tropical, desert}, `template` ∈
  {restore-portal, reach-beacon}, and bounded optional text: at most 4 labels
  of 2–24 characters, plus flavour title, intro, fragment name and destination
  name.
- It is strict: any other key rejects the whole plan. That includes
  positions, props, seeds, asset URLs and scripts. Oversize or non-JSON
  output is rejected, and at most one surrounding code fence is tolerated.
- Text fields are normalised: control, format and bidi characters are
  stripped. Each field is dropped on its own if it contains any of:
  - URLs, file or asset names,
  - markup or code characters,
  - instruction text,
  - coordinate-like numbers,
  - provider or model names,
  - unsafe words.
- Scene text enters the prompt only as a quoted JSON `SCENE` data block, and
  recognised objects are never required by an objective.
- Every rejection path above is covered by `src/biome/planning.test.ts`.

## Sources (all accessed 2026-09-25)

- Livepeer Agent MCP (keyless demo key, read-only tools only):
  - `describe_capability("gemini-text")`: model_id `fal-ai/any-llm`; `invoke_via` run_capability; `usage: null`; SLA live n=267, success 1.0, p50 3114 ms, p95 6820 ms; $0.0000788 per 1,000 tokens (static registry).
  - `describe_capability("nemotron-omni-vision")`: model_id `nvidia/nemotron-3-nano-omni/vision`; required `prompt` and `inputs.image_url`; `max_tokens_default` 1024; SLA live n=127, success 1.0, p50 2332 ms, p95 6450 ms; $0.0063 per 1,000 tokens.
  - `list_capabilities(kind: "ai")`: 175 entries.
  - `get_pricing("nemotron-omni-vision")`: price_source `static_fallback`.
  - `me`: key_class `demo`.
  - `spend_cap(read)`: allowance $200, binding cap `keyless_window`, no per-request override applied.
- fal model pages:
  - https://fal.ai/models/fal-ai/any-llm/api: lists `prompt`, `system_prompt`, `reasoning`, `priority`, `temperature`, `max_tokens` and `model` (default `google/gemini-2.5-flash-lite`). It documents no image input and no `response_format`/JSON-schema mode, and states "This endpoint is deprecated" and "This model is no longer supported."
  - https://fal.ai/models/nvidia/nemotron-3-nano-omni/vision/api: lists `prompt`, `image_url`, `system_prompt`, `reasoning_mode`, `max_tokens` (default 1024), `temperature`, `top_p` and `enable_safety_checker`. It returns text plus usage and documents no structured-output mode.
- Prior ObjectQuest evidence: `docs/LIVE_VALIDATION_RESULT_2026-09-24.md` (quest job `job_8df572b8-0ded-4e8b-b524-c3361698a1ca`, provider job `mjob_13e739e8d5af`).

## Smoke status this round

**Not dispatched; $0 spent.** A $0.01 text probe and a $0.05 vision probe were approved, on the condition that the provider enforces those caps. It does not:

- The MCP `run_capability` tool has no per-request cost field.
- The only enforced limit on this key is the $200 rolling keyless window.

Both probes were halted before submission. The coordinator then chose to keep both halted and released the full $0.06 reservation:

- New smoke submissions this round: 0. New smoke spend: $0.
- The round estimate stays $0.126; actual settlement of earlier calls is unknown.
- The `me`/`spend_cap` readings above show only what this demo key can access. They are not proof that earlier project spend is zero, and they are not attributable to this project alone.
- Every cost quoted here is an estimate. A `max_tokens` limit does not bound input or image tokens, so it is not a guaranteed dollar bound.

"Reliable structured data" therefore rests only on the single 2026-09-24 run above, current docs and read-only descriptors. Even a successful smoke would have shown one sample's behaviour, not general reliability.

The release path is the deterministic core plus the planner's schema, malformed-output and no-requester tests.

## Proposed smoke (NOT dispatched; needs explicit allocation)

1. **Recommended, cheapest: text theme plan.**
   - One `run_capability` call to `gemini-text` with
     `buildAdventurePlanPrompt({ seed: "smoke", description: "wooden desk with a monitor, mug and lamp" })`.
   - Expect about 600 input and 200 output tokens, roughly $0.0001.
   - Bounds: intended $0.01, but that is only a token bound (`inputs.max_tokens`)
     on this MCP surface, not a provider-enforced cap. Timeout 37 s, one
     attempt, zero retries, fixture text only, no user data.
   - Pass means `parseAdventurePlan` returns ok with no dropped fields.
   - It would show that the model supplies valid labels and theme
     suggestions. It would not show vision.
2. **Optional: vision capability probe only.**
   - One `nemotron-omni-vision` call on a bundled, non-user sample image,
     uploaded through the free Livepeer upload.
   - Estimated ≤ $0.02; bound $0.05, one attempt.
   - It would show that the model can see. It would not integrate vision into
     the app, which needs protected contract changes and is deferred.

Record the job ID, served model, reported cost, raw output hash and the
validator verdict here when either smoke runs.

## Known limitations

- The planner has no network transport yet. A server route that injects a
  `PlanRequester` over the existing job gateway is an integration task. It
  should stay off unless explicitly enabled.
- One prior structured-output success is thin evidence. The fallback is the
  shipping default.
