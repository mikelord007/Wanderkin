# Quest and audio pipeline

ObjectQuest generates story and sound as optional, independently durable assets. The playable mesh/course never waits for audio and an audio failure never submits or mutates an `image-to-3d` job.

## Quest contract

`server/quest/templates.ts` builds a style- and mode-specific prompt from the shared `STYLE_DEFINITIONS`, the recognizable object description, and optional atmosphere. The model may add flavour only around these authored mechanics:

- Explore: visit authored destinations, without a timer.
- Collect: find authored color fragments, then enter the authored portal.
- Race: traverse authored ordered checkpoints and finish.

The provider must return one JSON object with exactly three strings:

```json
{
  "title": "2–80 characters",
  "intro": "20–320 characters",
  "objective": "10–160 characters"
}
```

A leftover `narrationScript` field (from the retired narration feature) is dropped unread rather than triggering a retry. Validation otherwise rejects extra fields, markup, URLs, executable/instructional content, provider/model names, explicit profanity, and unsafe sexual/self-harm language. Whitespace is normalized. Invalid output is resubmitted once through the common multi-kind gateway with a corrective prompt and a distinct stable retry idempotency key. A second invalid response—or provider failure—uses the deterministic mode template, so quest copy cannot block a world. A ready quest is saved into `manifest.experience.quest` through the existing `LevelStore.save` path; its title also becomes the manifest name.

## Generated audio

`server/audio` submits all jobs concurrently through the shared `JobManager`:

- one 15-second instrumental `music` job, marked to loop during game playback;
- one 15-second ambience `sfx` job, marked to loop during game playback;
- seven 3-second `sfx` jobs: fragment pickup, portal activate, checkpoint, fall/respawn, race start, race finish, completion.

There is no narration: no `tts` job is requested for a new world, either here or by the creation flow (`src/ui/creationFlow.ts` asks only for the story and a music preview). The idempotency key still hashes an always-empty `narrationScript` field so every remaining cue keeps the key it had before narration was removed.

Prompts begin with the matching shared style audio fields. Each cue has an input-derived idempotency key. Submitting unchanged inputs therefore reconciles the stored job instead of starting new generation. Refresh reads existing job IDs; retry addresses only the failed job. `Promise.allSettled` isolates submission errors, and `playable: true` is invariant for every audio result. Only ready assets are attached to `manifest.media.audio`, retaining gateway provenance.

Livepeer's shared `create_media` wrapper currently accepts only integer
durations from 3 through 15 seconds. ObjectQuest rejects music, SFX, and video
requests outside that range before ledger reservation or provider submission;
it never clamps them. The wrapper has no loop or ambience flag. The request's
`loop` field is retained as ObjectQuest playback intent and is not forwarded
to the provider. A prompt may ask for a clean loop, but that is unverified
creative guidance, not evidence that the generated file is seamless. The
generic job gateway still supports `tts` requests (the game no longer makes
any); for those the provider receives the required `text`, and application
metadata `language: "en"` is not forwarded as an unsupported provider field.

The current shared media schema has no explicit SFX cue field. Until an additive `cue?: AudioCue` field is approved, generated SFX are persisted in the canonical order documented by `EFFECT_CUES`: fragment pickup, portal activate, checkpoint, fall/respawn, race start, race finish, completion.

## Browser playback

`src/audio/GameAudioEngine` creates Web Audio master, music, and effects gain buses; the Sound panel has Master, Music and Effects sliders plus mute. The context and loops start only from the player's explicit **Play** gesture. Settings—including mute—persist in local storage; muting retains slider values. Decoded audio is trimmed around meaningful samples, normalized to 0.9 peak with conservative gain, and looped with small seam guards.

Development builds expose the engine's read-only state at `window.__objectquest.audio()`: whether the Play gesture unlocked audio, the `AudioContext` state, whether a loop is playing, and the active loop cues. Browser QA uses this surface without controlling playback through it.

The engine listens to the typed gameplay event bus. It plays the canonical cue for fragment, portal, checkpoint, respawn, race, and completion events. The intro event plays nothing and the HUD shows no subtitle; the only intro copy is the "Ready, tiny explorer?" hint chip. Missing or undecodable optional media falls back to the bundled procedural asset without interrupting play.

### Older worlds that carry narration

Worlds saved and shares published before narration was removed may still hold `experience.quest.narrationScript` and a `media.audio` entry of kind `"narration"`. Both remain optional, deprecated parts of the manifest schema, so those worlds load and play unchanged; the text is never shown and the narration asset is never fetched. No schema version changed and nothing is migrated away.

## Bundled sample and license

The Lost Colors sample includes nine mono 8 kHz PCM WAV files under `public/audio/`; every file is under 100 KB. They are generated deterministically by `node scripts/generate-bundled-audio.mjs`, authored for this repository, and released under CC0-1.0. The manifest stores each file's SHA-256, size, duration, and bundled provenance. They contain synthesized tones/noise only—no samples, voices, copyrighted melody, or third-party recording.

The same script also writes `monsoon-rain.wav` (11 kHz, 4 s, low-passed rain hiss with droplet ticks, CC0-1.0). It is not part of the Lost Colors media: while the Monsoon look is shown, `LOOK_AMBIENCE_URLS` in `src/audio/assets.ts` swaps it in as the ambience loop, and switching away restores the world's own ambience.

## Bounded live validation requests (not executed)

No paid call was made. If separately authorized, validate one minimal request per kind through `POST /api/jobs/generate` with a unique `Idempotency-Key` equal to the request field:

```json
{"request":{"schemaVersion":1,"kind":"text","capability":"gemini-text","idempotencyKey":"live-quest-validation-1","purpose":"quest-live-validation","prompt":"Return JSON only with title, intro, objective for a family-friendly Collect adventure on a blue mug. Keep each field under 120 characters.","output":"quest-json","maxCharacters":600},"worldId":"live-validation","maxCostUsd":0.02}
```

```json
{"request":{"schemaVersion":1,"kind":"music","capability":"music","idempotencyKey":"live-music-validation-1","purpose":"music-live-validation","prompt":"Playful instrumental miniature adventure, marimba and pizzicato, no vocals, seamless loop.","durationSeconds":10,"instrumental":true,"loop":true},"worldId":"live-validation","maxCostUsd":0.04}
```

```json
{"request":{"schemaVersion":1,"kind":"sfx","capability":"mirelo-sfx","idempotencyKey":"live-sfx-validation-1","purpose":"sfx-live-validation","prompt":"Short sparkling color pickup chime, clean game-ready sound, no speech.","durationSeconds":3,"loop":false},"worldId":"live-validation","maxCostUsd":0.04}
```

The game makes no `tts` requests; this one checks only the generic gateway kind.

```json
{"request":{"schemaVersion":1,"kind":"tts","capability":"chatterbox-tts","idempotencyKey":"live-tts-validation-1","purpose":"tts-live-validation","text":"Welcome, explorer. Find the lost colors and enter the glowing portal.","language":"en"},"worldId":"live-validation","maxCostUsd":0.03}
```

These are validation ceilings, not price claims. Refresh capability pricing and health immediately before authorization; unknown cost must remain unknown rather than being represented as zero.
