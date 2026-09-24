# ObjectQuest hackathon demo

This is the canonical ten-step sequence from the product brief. Use a current
desktop Chromium browser with keyboard and mouse. Do not improvise a paid run:
refresh capability/price/allowance immediately before the demo and use a new
photo only when that batch is authorized. Never show `.env` or a secret.

## Preflight

1. Open the dedicated ObjectQuest origin and check `/api/health` in a separate
   tab. It must return `{"status":"ok"}`.
2. Confirm the durable volume is mounted and the release revision passed the
   checks in [`DELIVERY_CHECKLIST.md`](DELIVERY_CHECKLIST.md).
3. Open **My worlds** on the welcome page and confirm the planned demo world or
   pending job is visible. Keep the bundled fallback available.
4. Disable browser extensions/notifications, connect audio but keep it muted,
   and close the health tab before presenting.
5. Have [`EVIDENCE.md`](EVIDENCE.md) ready for the final evidence step.

## Exact ten-step sequence

### 1. Show the original photograph

**Click:** From **Your everyday objects. Extraordinary little worlds.**, click
**Create my world**, then **Add photos** (or the final capture/upload label) and
select the authorized demo image. Confirm/use the image when prompted.

**Expected:** The whole recognizable object is visible in an oriented preview,
with replace/retake available. Explain: “This is the source photograph; no 3D
asset existed in ObjectQuest yet.”

**Integrated UI:** The creation journey now provides **Choose from photos**,
**Take a photo**, drag-and-drop, a real preview, **Use this photo**, and
**Retake or replace**. The complete journey still needs final browser validation
on the release revision.

### 2. Review the object

**Click:** On **Here’s your object**, compare the isolated/cropped object with
the source. Click **Looks good**. If isolation damaged the object, click **Use
the original image** or replace it.

**Expected:** The intended object is complete and centered before any expensive
3D work. The original remains available for comparison.

**Fallback:** If background removal is unavailable, click **Use original photo**
and state that this provider step has no real execution evidence; never show a
fabricated cutout.

### 3. Choose and approve the visual direction

**Click:** Choose **Cartoon**, **Collect** (the default), optionally enter the
prepared atmosphere, then click **Preview my world**. On **Like this
direction?**, compare original and preview, click **Use this preview**, then
click **Build my world**.

**Expected:** The actual uploaded object appears as the approved style
direction. Explain that the production mesh still comes from the original
photo set; the engine applies the coordinated playable style. The preview is
not promised as an exact mesh texture.

**Fallback:** Show the real
[`kontext-edit` result](evidence/style-spike-cartoon-reference.jpg) beside its
source only as dated evidence, clearly labelled as the 2026-09-24 spike—not as
the current visitor's result.

### 4. Show generation progress

**Click:** After **Build my world**, remain on **Your world is taking shape**.
Refresh once to demonstrate that the same job resumes, then click **My worlds**
and return to the pending world to show durable recovery.

**Expected:** Real job-backed stages change without a fabricated percentage.
Elapsed time is visible; refresh observes the existing job ID rather than
resubmitting. If a stage fails, show its retry action and preserved outputs.

**Fallback:** If the provider is slow or down, stop the live path without
retrying blindly and use **Play a sample**. Do not say leaving cancels the
provider job.

### 5. Enter the actual playable object world

**Click:** On the rendered **World ready** view, click **Enter world**. Click
the game once to capture the mouse; use `W/A/S/D`, mouse, `Space`, and `E`.

**Expected:** The generated/bundled GLB—not a concept image—fills the game
view. The object remains recognizable and collision, spawn, checkpoints, and
helpers load. If preparation reports a placement problem, open **Adjust
course**, address the named issue, save, and then enter.

### 6. Demonstrate Lost Colors progression

**Click/action:** Collect the red, yellow, and blue fragments in the flagship
world. Use `R` only if a quick checkpoint respawn is useful. Enter the portal
after the third fragment.

**Expected:** **Colors found** changes from `0/3` to `3/3`; each pickup gives
feedback and increases color restoration. The finish portal activates only
after all required fragments, then completion shows **You brought the colors
back.**

### 7. Play matching music, effects, and narration

**Click:** Open **Sound**, unmute deliberately, play the narration once, then
collect a fragment to demonstrate its effect while the matching music/ambience
continues. Show subtitles with narration.

**Expected:** Playback is user-initiated, channel controls work, and audio is
tied to the saved world without restarting generation.

**Current evidence boundary:** Worker 4's progress screen can submit story,
music, and narration jobs and preview returned music/narration deliberately.
Worker 6's complete quest/audio-to-saved-world integration has not landed, the
bundled Lost Colors manifest has an empty audio array, and no real ObjectQuest
execution exists yet for music, SFX, or TTS. Skip this step unless Worker 6
supplies and validates those assets; do not substitute unrelated audio or
claim generated sound evidence.

### 8. Save and share the challenge

**Click:** From a generated world, save it before play. At completion click
**Share this world**, open the returned `/share/<shareId>` link in a private
window, then click **Play** on the friend landing page.

**Expected:** The landing page shows title, real 3D preview, mode, immutable
course version, and challenge. The friend uploads nothing and triggers no
generation. Explain that later private edits create a new publication rather
than changing this link. Source photos are omitted by default.

**Bundled fallback preparation:** A bundled sample itself is intentionally not
publishable. Choose **Edit course**, then **Save** to create a private durable
copy; play and complete that saved copy before using **Share this world**.

### 9. Show optional media honestly

**Click:** If integrated and already prepared, click **Create animated
postcard** or **Download gameplay highlight** from completion. For a postcard,
wait on its independent job; for a highlight, play the captured game clip.

**Expected:** A postcard is labelled generated animation; a highlight is
labelled actual gameplay. Failure does not block replay or the share link.

**Current evidence boundary:** No real image-to-video execution is recorded.
If the release has neither a validated postcard nor capture action, state that
this optional extension is not demo-ready and continue. Never relabel the
style-spike render as a postcard or gameplay capture.

### 10. Show the real Livepeer evidence

**Click:** Open [`EVIDENCE.md`](EVIDENCE.md), then the linked redacted
provenance and artifacts. Point to the job IDs and costs rather than an endpoint
logo alone.

**Expected:** Show `mjob_7c10fc5aa558` (`kontext-edit`, $0.042 estimated) and
`mjob_03a06e271b73` (`rodin-i3d`, $0.420 estimated), plus the 2026-09-18
`mjob_cfb2286bf2b5` Rodin success with unknown retained cost. Explain the five
separate claims: catalog availability, historical health, our execution,
visual quality, and gameplay usability. Provider-metered cost for the spike
jobs is unknown because their terminal records returned null.

## Provider-down fallback path

The fallback requires no credentials and starts no provider jobs. These paths
were verified present after Integration #3:

- flagship manifest: [`shared/fixtures/lost-colors.json`](../shared/fixtures/lost-colors.json),
- bundled-world adapter: [`src/game/bundledSamples.ts`](../src/game/bundledSamples.ts),
- source photograph: [`public/samples/photo-4.jpg`](../public/samples/photo-4.jpg),
- Rodin GLB: [`public/samples/rodin.glb`](../public/samples/rodin.glb),
- Tripo GLB: [`public/samples/tripo.glb`](../public/samples/tripo.glb).

To switch cleanly:

1. Say, “The live provider is unavailable, so I’m switching to the bundled
   world; this does not represent a new generation.” Do not submit repeated
   retries.
2. Return to the welcome page and click **Play a sample**, or scroll to **A
   little taste of adventure** and click **Play now** on **The Lost Colors of
   Teacup Island**.
3. Complete steps 5 and 6 with the bundled Rodin world. For sharing, use **Edit
   course** → **Save** first, then complete and share the saved copy as described
   in step 8.
4. For steps 3, 9, and 10, show only the committed dated evidence and state its
   date and boundary. Skip step 7 unless validated generated audio has landed.

This fallback still demonstrates recognizable real provider geometry, authored
gameplay, Lost Colors progression, persistence, immutable sharing, and honest
provenance. It does not demonstrate a new live job, automatic course quality,
generated audio, or generated postcard media.
