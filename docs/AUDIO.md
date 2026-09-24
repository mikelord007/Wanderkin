# Quest and audio pipeline

ObjectQuest generates story and sound as optional, independently durable assets. The playable mesh/course never waits for audio and an audio failure never submits or mutates an `image-to-3d` job.

## Quest contract

`server/quest/templates.ts` builds a style- and mode-specific prompt from the shared `STYLE_DEFINITIONS`, the recognizable object description, and optional atmosphere. The model may add flavour only around these authored mechanics:

- Explore: visit authored destinations, without a timer.
- Collect: find authored color fragments, then enter the authored portal.
- Race: traverse authored ordered checkpoints and finish.

The provider must return one JSON object with exactly four strings:

```json
{
  "title": "2–80 characters",
  "intro": "20–320 characters",
  "objective": "10–160 characters",
  "narrationScript": "20–500 characters, at most three short sentences"
}
```

Validation rejects extra fields, markup, URLs, executable/instructional content, provider/model names, explicit profanity, and unsafe sexual/self-harm language. Whitespace is normalized. Invalid output is resubmitted once through the common multi-kind gateway with a corrective prompt and a distinct stable retry idempotency key. A second invalid response—or provider failure—uses the deterministic mode template, so quest copy cannot block a world. A ready quest is saved into `manifest.experience.quest` through the existing `LevelStore.save` path; its title also becomes the manifest name.

## Generated audio

`server/audio` submits all jobs concurrently through Worker 2's `JobManager`:

- one 60-second loopable instrumental `music` job;
- one 20-second loopable ambience `sfx` job;
- seven short `sfx` jobs: fragment pickup, portal activate, checkpoint, fall/respawn, race start, race finish, completion;
- one `tts` job using the validated narration script.

Prompts begin with the matching shared style audio fields. Each cue has an input-derived idempotency key. Submitting unchanged inputs therefore reconciles the stored job instead of starting new generation. Refresh reads existing job IDs; retry addresses only the failed job. `Promise.allSettled` isolates submission errors, and `playable: true` is invariant for every audio result. Only ready assets are attached to `manifest.media.audio`, retaining gateway provenance.

The current shared media schema has no explicit SFX cue field. Until an additive `cue?: AudioCue` field is approved, generated SFX are persisted in the canonical order documented by `EFFECT_CUES`: fragment pickup, portal activate, checkpoint, fall/respawn, race start, race finish, completion.

## Browser playback

`src/audio/GameAudioEngine` creates Web Audio master, music, effects, and voice gain buses. The context and loops start only from the player's explicit **Play** gesture. Settings—including mute—persist in local storage; muting retains slider values. Decoded audio is trimmed around meaningful samples, normalized to 0.9 peak with conservative gain, and looped with small seam guards.

Development builds expose the engine's read-only state at `window.__objectquest.audio()`: whether the Play gesture unlocked audio, the `AudioContext` state, whether a loop is playing, and the active loop cues. Browser QA uses this surface without controlling playback through it.

The engine listens to the typed gameplay event bus. It plays the canonical cue for fragment, portal, checkpoint, respawn, race, and completion events. Narration is keyed by world ID and can play only once for that mounted world, so falling, respawning, and restarting never repeat it. `SubtitleBar` uses the validated narration text and remains useful when narration audio is absent or muted. Missing or undecodable optional media falls back to the bundled procedural asset without interrupting play.

## Bundled sample and license

The Lost Colors sample includes ten mono 8 kHz PCM WAV files under `public/audio/`; every file is under 100 KB. They are generated deterministically by `node scripts/generate-bundled-audio.mjs`, authored for this repository, and released under CC0-1.0. The manifest stores each file's SHA-256, size, duration, and bundled provenance. They contain synthesized tones/noise only—no samples, voices, copyrighted melody, or third-party recording.

## Bounded live validation requests (not executed)

No paid call was made. If separately authorized, validate one minimal request per kind through `POST /api/jobs/generate` with a unique `Idempotency-Key` equal to the request field:

```json
{"request":{"schemaVersion":1,"kind":"text","capability":"gemini-text","idempotencyKey":"live-quest-validation-1","purpose":"quest-live-validation","prompt":"Return JSON only with title, intro, objective, narrationScript for a family-friendly Collect adventure on a blue mug. Keep each field under 120 characters.","output":"quest-json","maxCharacters":600},"worldId":"live-validation","maxCostUsd":0.02}
```

```json
{"request":{"schemaVersion":1,"kind":"music","capability":"music","idempotencyKey":"live-music-validation-1","purpose":"music-live-validation","prompt":"Playful instrumental miniature adventure, marimba and pizzicato, no vocals, seamless loop.","durationSeconds":10,"instrumental":true,"loop":true},"worldId":"live-validation","maxCostUsd":0.04}
```

```json
{"request":{"schemaVersion":1,"kind":"sfx","capability":"mirelo-sfx","idempotencyKey":"live-sfx-validation-1","purpose":"sfx-live-validation","prompt":"Short sparkling color pickup chime, clean game-ready sound, no speech.","durationSeconds":1,"loop":false},"worldId":"live-validation","maxCostUsd":0.015}
```

```json
{"request":{"schemaVersion":1,"kind":"tts","capability":"chatterbox-tts","idempotencyKey":"live-tts-validation-1","purpose":"tts-live-validation","text":"Welcome, explorer. Find the lost colors and enter the glowing portal.","language":"en"},"worldId":"live-validation","maxCostUsd":0.03}
```

These are validation ceilings, not price claims. Refresh capability pricing and health immediately before authorization; unknown cost must remain unknown rather than being represented as zero.
