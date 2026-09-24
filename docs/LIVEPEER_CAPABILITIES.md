# Livepeer capability discovery — 2026-09-24

This is a read-only snapshot of the keyless Livepeer Agent MCP surface at
`POST https://agent.livepeer.org/api/mcp/full`. Discovery used `tools/list`,
both pages of `list_capabilities` (209 total), and `describe_capability`,
`cap_price`, `cap_route`, and `cap_test_report` for the candidates below. No
`run_capability`, `create_media`, or other paid generation call was made.

Health below is provider-reported seven-day history, not an ObjectQuest live
generation result. `READY` is the provider's combined metadata/performance
verdict; `NEEDS_METADATA` can still have healthy historical runs. `unknown`
means the provider did not expose enough samples to claim health.

## Account and environment

- Repository `.env` present: **no**.
- `LIVEPEER_API_KEY` set in repository `.env`: **no**.
- Keyless demo allowance: **$200.00** rolling window.
- Keyless spend at discovery: **$0.0001**; remaining: **$199.9999**.
- This worker changed neither the spend cap nor account configuration.

## Candidate status, SLA, and price

| Capability | Intended ObjectQuest kind | Availability / health | 7-day performance | Display price / request estimate |
| --- | --- | --- | --- | --- |
| `bg-remove` | `background-removal` | available/active; `NEEDS_METADATA`; safe route | 5/5 succeeded; p50 1.288s, p95 2.046s | $0.00105/image; quote rounds to $0.0011. Price basis is legacy/unverified. |
| `kontext-edit` | `image-edit` | available/active; `READY`; route requires review | 255/255 succeeded; p50 9.942s, p95 18.240s | $0.042/image |
| `gpt-image-edit` | `image-edit` fallback | available/active; `NEEDS_METADATA`; safe route | 108/111 succeeded (97.3%); p50 88.943s, p95 114.966s | $0.22995/image; quote $0.23 |
| `rodin-i3d` | `image-to-3d` | available/active; `NEEDS_METADATA`; safe route | 2/3 succeeded (one parameter rejection); p50 175.367s, p95 180.007s | $0.42/call |
| `gemini-text` | `text` | available/active; `NEEDS_METADATA`; safe route | 278/281 succeeded (98.9%); p50 2.922s, p95 6.744s | $0.0000788/1,000 tokens; cost basis missing, so request estimate is conservative/unknown until token count is known |
| `music` | `music` | available/active; `NEEDS_METADATA`; safe route | 171/173 succeeded (98.8%); p50 60.803s, p95 109.066s | $0.0315/track |
| `mirelo-sfx` | `sfx` / ambience | available/active; `NEEDS_METADATA`; safe route | 22/22 succeeded; p50 3.948s, p95 11.348s | $0.0105/generated second; 10s quote $0.105 |
| `chatterbox-tts` | `tts` | available/active; `READY`; safe route | 60/60 succeeded; p50 27.050s, p95 138.917s | $0.02625/1,000 characters; 300-character quote $0.0079 |
| `pixverse-i2v` | `image-to-video` | available/active; `READY`; safe route | 111/119 succeeded (93.3%); p50 47.436s, p95 88.078s | $0.06825/second; 5s quote $0.3413, explicitly a lower bound because resolution is not pinned |
| `meshy-v7-i3d` | optional `image-to-3d` companion | available/active; `NOT_TESTED`; safe route | no performance ledger | $1.26 textured mesh; -$0.42 untextured, +$0.21 ultra, +$0.21 rigging, +$0.126 animation |

## Live-confirmed request and output contracts

The agent endpoint exposes some older capabilities with incomplete `usage`
metadata. The table distinguishes a complete declared schema from fields only
shown by the invocation example. ObjectQuest rejects fields outside these
confirmed constraints and does not silently reinterpret one media type as
another.

| Capability | Invocation and inputs | Output |
| --- | --- | --- |
| `bg-remove` | `create_media`; image `source_url` required by `input_requirement=image`. The descriptor's usage block is missing; its example also shows optional `prompt`. | image; container not declared |
| `kontext-edit` | `create_media` action `edit` or `restyle`; required string `prompt` and required image `source_url`. | PNG image |
| `gpt-image-edit` | `create_media`; image `source_url` plus `prompt` shown by the example. Usage block is missing. | image; container not declared |
| `rodin-i3d` | `create_media` action `generate`; image `source_url` and prompt shown by the example. The descriptor does not publish its full provider payload; the existing, previously verified Rodin adapter continues to send `image_urls`, GLB format, shaded material, 50K mesh, preview render, and a 0–65,535 deterministic seed. | 3D asset; ObjectQuest accepts only validated GLB |
| `gemini-text` | `run_capability`; required capability plus prompt shown by the example. | text; ObjectQuest additionally parses and validates its constrained quest JSON |
| `music` | `create_media`; `input_requirement=prompt_only`; prompt shown by example. The catalog does not confirm an instrumental-only flag. | audio; container not declared |
| `mirelo-sfx` | `create_media`; prompt-only plus numeric `duration`; provider says 0.1–60 seconds, default 10 (and also labels duration as integer, so ObjectQuest restricts it to integer 1–60). | audio; container not declared |
| `chatterbox-tts` | `create_media` action `tts`; required string key is exactly `text` (not `prompt`). Optional voice clone uses `audio_url`. | WAV audio |
| `pixverse-i2v` | `create_media` action `animate`; required string `prompt`, required image `source_url`, optional integer `duration` 1–15 seconds (default 5). | MP4 video, no audio |
| `meshy-v7-i3d` | `run_capability`; required `inputs.image_url`; optional `enable_rigging`, `enable_animation` (requires rigging), `animation_action_id` 0–696, `ultra_mode`, `should_texture`, `model_type` (`standard`/`lowpoly`), `topology` (`quad`/`triangle`), `target_polycount` 100–300,000, `pose_mode`, `symmetry_mode`, and `enable_pbr`. There is no general prompt; `texture_prompt` only steers texturing. | GLB primary plus other model URLs; rigged/animation GLBs when requested |

## Better or useful siblings found

| Capability | Finding |
| --- | --- |
| `ideogram-bg-remove` | Verified-price fallback at $0.0105/image, p50/p95 static 5s/11s. It has no performance samples and incomplete usage metadata, so `bg-remove` remains primary. |
| `tripo-i3d` | Static-object alternative at $0.315/mesh, p50/p95 static 100s/200s. No performance ledger and incomplete usage metadata. It remains a Rodin fallback, not the default. |
| `gemini-tts` | Faster observed p50/p95 (4.703s/15.949s) but only 91.7% success and $0.1575/1,000 characters, versus Chatterbox's 100% observed success and lower price. Keep as fallback. |
| `ltx-25-i2v-fast` | Supports an end frame, native audio, 6/8/10/12/14/16/18/20s clips, and pinned 720p–2160p tiers. At 720p it is $0.0945/second and 94.7% successful (p50 37.455s/p95 58.838s). Pixverse remains the cheaper postcard default. |

No dedicated skybox/panorama generator or contract for texture-only restyling
of an existing GLB was found in the 209-entry catalog. That remains an
unconfirmed product capability.

## Fallback chains and cautions

- Background removal: `bg-remove -> ideogram-bg-remove`. Route check: safe.
- Style edit: `kontext-edit -> flux-fill -> gemini-image`. Route check:
  `REVIEW` with `chain_input_mismatch`; ObjectQuest must not automatically
  follow this chain. `gpt-image-edit` is the explicit compatible fallback.
- Rodin: `rodin-i3d -> tripo-i3d -> triposplat`. Route check: safe, but Rodin
  readiness metadata is incomplete and its sample is only three attempts.
- SFX: `mirelo-sfx -> music`. Although the route tool calls this safe, a music
  track is not semantically interchangeable with a short game effect;
  ObjectQuest treats this as no automatic fallback.
- TTS: `chatterbox-tts -> gemini-tts -> inworld-tts -> grok-tts`. Route check:
  safe; Chatterbox's exact input key is `text`.
- Image-to-video: `pixverse-i2v -> ltx-i2v -> seedance-mini-i2v`. Route check:
  safe. Generated postcard video has no audio on the Pixverse primary.
- `meshy-v7-i3d` has no automatic fallback; rigging/animation are optional,
  costed extras and remain outside the core world path.

The generic `sfx` capability is still video-to-audio (`fal-ai/mmaudio-v2`) and
requires video input. It is not a substitute for prompt-to-audio
`mirelo-sfx`. `gpt-image` and `gpt-image-edit` remain distinct capabilities;
the edit capability was healthy at discovery, while no inference was made
from the sibling's telemetry. Capability model IDs include fal adapters, so
using the Agent endpoint alone is not evidence that a given render ran on a
decentralized Livepeer GPU.
