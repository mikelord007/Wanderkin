# Metallic hum follow-up (post item-10)

Worker: fresh Claude worker for coordinator 30e37344-f303-4b8a-80c8-ee9f8fd5f3d6.
Runtime model: claude-sonnet-5 (Sonnet 5), per system context — recorded verbatim, not assumed.
Owned paths touched: `src/audio/*`, `scripts/generate-bundled-audio.mjs`, `public/audio/*` (bundled WAVs). No App/routing/Finish/capture files touched (those are dirty from other in-progress sibling workers — left untouched, unstaged, unread beyond `git status`).

## User's report

After the prior fix (commit `dfd33db`, checkpoint `sample-audio.md`) replaced the 8 kHz sine-drone `lost-colors-loop.wav` with a cheerful 22050 Hz plucked melody, the user still hears a "weird creepy metallic hum" behind the game-like music. Task: prove the actual offending layer before changing anything else — don't assume it's the music track again, don't just turn the volume down.

## Diagnosis (proven, not assumed)

The hum is **not** the music track. It is `gentle-breeze.wav`, the bundled **ambience** loop, which auto-starts alongside music on every unlock (`src/audio/engine.ts` `unlockAndStart()` → `Promise.all([startLoop("music"), startLoop("ambience")])`) and loops continuously through the whole session on the same "music" bus.

Root cause, traced to `scripts/generate-bundled-audio.mjs`'s `seedNoise(i)` helper:

```js
const seedNoise = (i) => (((Math.imul(i + 17, 1103515245) + 12345) >>> 16) / 32768 - 1);
```

This was meant to be white noise (used for the ambience "breeze," the `fall-respawn.wav` impact thud, and a light percussion tap in the music). It's actually a **one-shot LCG formula applied directly to the sample index `i`** — not a proper stateful/recursive PRNG. Because the formula is linear in `i`, the output is a phase-accumulator (Weyl sequence): a disguised sawtooth ramp, not decorrelated noise.

Verified with an FFT of the raw generator output (Node, matching the exact algorithm that produced the shipped bytes): a single dominant frequency bin at **2055.7 Hz**, accounting for 12.1% of total spectral magnitude in the top 5 bins alone (real noise should be flat, <1%). Autocorrelation on the raw sequence peaked at 0.94–0.99 (real noise: <0.1). That's a pitched, buzzy, sawtooth-harmonic tone sitting continuously under the melody — exactly what reads as "metallic."

Two factors made it audible/prominent rather than a subtle texture:
1. `gentle-breeze.wav` **loops forever**, unlike the one-shot SFX that also use `seedNoise` (their brief duration and decay envelopes mostly mask the same underlying tonal defect).
2. `engine.ts`'s `trimAndNormalize()` renormalizes every decoded buffer toward peak 0.9 (capped at 4x gain). The ambience file's authored peak (~0.085, intentionally quiet) gets boosted up to 4x on decode, amplifying the buzzy tone well past what the generator script's own gain constants intended. (Noted but not changed — see "Not changed" below.)

Ruled out before landing on this: re-inspected `lost-colors-loop.wav` (the already-fixed music) — its shipped sha256 on disk exactly matches the hash and generator recorded in `bundledMedia.ts`/the prior checkpoint, so it isn't reverted or stale. Confirmed via `git show HEAD:public/audio/gentle-breeze.wav` + hash comparison that the ambience file was never touched by the prior fix (checkpoint said "9 other SFX/ambience/narration files untouched" — correct, but "untouched" meant "still carrying its own pre-existing defect," which nobody had diagnosed). Checked `engine.ts` for a double-instance/duplicate-loop bug (`startLoop` guards on `this.loops.has(cue)`, so no double loops) and confirmed `useGameAudio.ts` only constructs one `GameAudioEngine` per mount via `useRef`. This is a single-track synthesis defect, not an engine playback/resonance bug.

This diagnosis applies to the **bundled sample only**. Did not read or write anything under the private generated world's storage (10 generated assets tied to `live-validation-photo4-20260924-hands-on`) — not in scope, not touched.

## Fix (implemented)

Replaced `seedNoise` in `scripts/generate-bundled-audio.mjs` with a proper multi-round avalanche integer hash (xor/imul mixing, same style as widely-used "triple32" integer hashes) instead of a single linear LCG step:

```js
function seedNoise(i) {
  let x = (i + 17) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 2147483648 - 1;
}
```

This is a pure, deterministic function of the sample index (same reproducibility guarantee as before — re-running `node scripts/generate-bundled-audio.mjs` always produces byte-identical output), but the extra mixing rounds decorrelate consecutive samples instead of ramping linearly. Verified: FFT top-5-bin share drops from 12.1% to 0.35% (raw) / stays at ~2% after simulating the exact 8kHz→48kHz resample the browser's `AudioContext.decodeAudioData` performs; autocorrelation drops from 0.94–0.99 to ~0.06.

Regenerating (`node scripts/generate-bundled-audio.mjs`) changed exactly 3 files — every WAV that used `seedNoise`, nothing else:
- `public/audio/gentle-breeze.wav` (ambience — the audible hum)
- `public/audio/fall-respawn.wav` (one-shot SFX, minor noise component)
- `public/audio/lost-colors-loop.wav` (music — only its brief percussion-tap noise component changes; the melody notes are untouched, so the cheerful character from the prior fix is preserved)

Sizes and durations are unchanged (same rate/length, only sample content differs); updated the 3 corresponding sha256 entries in `src/audio/bundledMedia.ts` to match the regenerated bytes exactly.

**Not changed:** `trimAndNormalize`'s blanket peak-normalization in `engine.ts`, and ambience sharing the "music" bus/gain with no independent volume control. Both are real, narrower engine-level observations (documented above) but the qualitatively "metallic" character was fully explained by the broken noise generator alone — normalization only affects loudness, not timbre. Fixing the generator was the minimal change that addresses the reported defect without touching shared mixing behavior that could affect a live/generated world's authored ambience gain. Flagging both for the coordinator in case the user still perceives the (now-correctly-textured) breeze ambience as too present after this fix — that would be a mix-level follow-up, not a hum/tone defect.

## Verification performed (actual results)

- `npx vitest run src/audio src/game/bundledSamples.test.ts src/scene/samples.test.ts` → 10/10 pass (was 8/8; added 2 new regression tests to `src/audio/audio.test.ts`).
- New regression tests added (`src/audio/audio.test.ts`):
  1. Every bundled WAV's on-disk bytes match the sha256/size recorded in `bundledMedia.ts` (this class of check existed for 3D geometry assets in `samples.test.ts` but not for audio — gap closed).
  2. The ambience WAV's decoded PCM has near-zero autocorrelation (max |r| < 0.5 across lags 1–500) — a direct regression guard against this exact defect reappearing.
- Proved test #2 actually detects the bug: temporarily restored the pre-fix `gentle-breeze.wav` via `git show HEAD:...` and reran — it failed with `0.989 to be less than 0.5` (matches the FFT/autocorrelation numbers above exactly). Restored the fixed file and reran clean.
- `npm run typecheck` → exit 0 (both app and server tsconfigs).
- Real Chrome (Playwright `channel: "chrome"`, per the proven `tests/e2e/browser` harness, temporary `OBJECTQUEST_E2E_PORT=5199` — did not touch protected 5173/8787/15173/18799) — one throwaway test, deleted after the run, not committed:
  - Played the bundled "Play a sample" flow to a running game state.
  - `window.__objectquest.audio()` diagnostics confirmed `unlocked: true, contextState: "running", playing: true, activeLoops: ["music","ambience"]` — both loops are genuinely active during real gameplay, not dead code.
  - Fetched `/audio/gentle-breeze.wav` from the live temp server in-page and hashed it: sha256 `bda376c...` and 64044 bytes exactly matched the regenerated file and `bundledMedia.ts` — rules out any stale/cached asset being served.
  - Decoded via real `AudioContext.decodeAudioData` (resamples to the hardware 48 kHz) and ran the same dominant-bin-share spectral check in-page: 2.0% (vs. ~12–13% for the old asset simulated through the same resample) — confirms the fix holds through actual browser decoding, not just the raw file on disk.
- Did not touch `src/App.tsx`, `src/ui/screens/FinishScreen.tsx`, `src/ui/screens/finish-screen.css`, `src/capture/media.css`, or any `nimbalyst-local/` files from other in-progress workers — confirmed via `git status` before and after that only my 6 owned files changed.
- No paid/provider calls. Fully procedural, $0 spent.

## What actually changed, in plain language

The "breeze" ambience sound that plays continuously under the music was never actually random noise — a bug in the number-generating formula made it a disguised, very-slightly-detuned buzzy tone around 2 kHz (a "metallic ring") that got amplified by the playback engine's normalization. It sounded like a hum because, acoustically, it basically was one: a narrow, high-pitched, always-on tone, not broadband wind/static. The fix makes the same formula produce genuine broadband noise (verified by direct frequency analysis, both on the raw file and through the real browser's audio decoder), so the ambience now reads as quiet room/wind texture instead of a ringing artifact. The melody and all SFX are otherwise unchanged.

## Commit

Staged and committed via `developer_git_commit_proposal` (not CLI git), exactly 6 owned files:
`public/audio/gentle-breeze.wav`, `public/audio/fall-respawn.wav`, `public/audio/lost-colors-loop.wav`, `scripts/generate-bundled-audio.mjs`, `src/audio/bundledMedia.ts`, `src/audio/audio.test.ts`, plus this checkpoint.

## Remaining issues / open questions for the coordinator

- `trimAndNormalize` in `engine.ts` normalizes every decoded buffer toward peak 0.9 (capped 4x), ignoring each asset's authored `defaultGain` in `bundledMedia.ts`/`LevelMedia`. This is a real engine-level inconsistency (quiet-by-design ambience gets boosted the most) but is out of scope for this narrowly-targeted hum fix, since fixing the noise source alone fully resolved the tonal/"metallic" defect. Flagging in case a future mix-balance complaint ("ambience is too loud/present") comes in — that would be an `engine.ts` change, and would need coordination since it affects live/generated-world ambience mixing too, not just the bundled sample.
- Ambience has no independent volume bus — it's tied to the "Music" slider. Same status: noted, not changed, would need coordination if the user wants it addressed.
- Did not re-run the full `tests/e2e/browser` acceptance suite (B14 etc.) — scope was a focused regression per the assignment ("not repeated entire suites"). The one throwaway browser check above targeted exactly the changed asset + the diagnostics surface B14 already exercises; nothing else in the audio surface changed, so I judged the full suite unnecessary. Coordinator/user can request it if broader confidence is wanted.
- User's own subjective listening confirmation is still needed — this checkpoint is my honest technical/spectral assessment, not a substitute for it.
