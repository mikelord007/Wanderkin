# ObjectQuest hackathon demo

Snapshot: **2026-09-24**, integrated revision `e269fa9`. This is the canonical
ten-step sequence from the product brief. Use a current
desktop Chromium browser with keyboard and mouse. Do not improvise a paid run:
refresh capability/price/allowance immediately before the demo and use a new
photo only when that batch is authorized. Never show `.env` or a secret.

## Preflight

1. Open the authorized ObjectQuest origin and check `/api/health` in a separate
   tab. It must return `{"status":"ok"}`. No hosted origin exists at this
   snapshot; use the documented local topology until one is supplied.
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

**Integrated UI:** The creation journey provides **Choose from photos**,
**Take a photo**, drag-and-drop, a real preview, **Use this photo**, and
**Retake or replace**. The integrated browser suite passed 37/43 with six
intentional skips and no failures; target-device camera and user hands-on review
remain open.

### 2. Review the object

**Click:** On **Here’s your object**, compare the isolated/cropped object with
the source. Click **Looks good**. If isolation damaged the object, click **Use
the original image** or replace it.

**Expected:** The intended object is complete and centered before any expensive
3D work. The original remains available for comparison.

**Fallback:** If background removal is unavailable, click **Use original photo**.
ObjectQuest has one real cutout job (`mjob_a2426904c928`), but it is dated batch
evidence, not a result for the current visitor. Never show a fabricated cutout.

### 3. Choose and approve the visual direction

**Click:** Choose one visual style—**Cartoon**, **Hand-painted**, or
**Watercolor**—then choose the gameplay mode **Collect** (the default),
optionally enter the prepared atmosphere, and click **Preview my world**. On **Like this
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

**Current evidence boundary:** Quest/audio integration, independent optional
jobs, bundled Lost Colors audio, gesture-gated playback, four audio buses,
subtitles, and one-shot narration are implemented. The final B14 run made three
WAV requests with zero runtime errors. That proves bundled playback, not real
generated media: no current music, ambience, SFX, or TTS job has been submitted.
If using the fallback, say “bundled audio.” If using a generated world, perform
this step only after the corresponding real media has been generated and
reviewed.

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

**Click:** From completion, click **Download gameplay highlight** and preview
the recorded play if the browser supports capture. Click **Create animated
postcard** only when a real postcard has already been authorized and prepared;
wait on its independent job, then preview/download it.

**Expected:** A postcard is labelled generated animation; a highlight is
labelled actual gameplay. Failure does not block replay or the share link.

**Current evidence boundary:** Actual gameplay capture plus postcard screenshot,
cache, retry, resume, preview, and download are implemented and covered by local
contracts. No real image-to-video execution is recorded. In a no-provider demo,
show the gameplay highlight only and describe the postcard as implemented but
unvalidated live. Never relabel gameplay footage or the style-spike render as a
generated postcard.

### 10. Show the real Livepeer evidence

**Click:** Open [`EVIDENCE.md`](EVIDENCE.md), then the linked redacted
provenance and artifacts. Point to the job IDs and costs rather than an endpoint
logo alone.

**Expected:** Start with current ready rows: `mjob_a2426904c928` (cutout),
`mjob_d3d1797a1657` (Kontext), `mjob_4a0b2bde417b` (GPT image edit), and
`mjob_0001ef7f3201` (Rodin). Explain that quest job
`mjob_13e739e8d5af` was recovered ready from its existing provider result at
zero new spend, with four validated fields and model `fal-ai/any-llm`. Rows
6–16 are authorized/in flight but have no successful evidence yet. Then
show the $0.042 Kontext and $0.420 Rodin style spike and the 2026-09-18 Rodin
success. The current batch estimate is $0.6932 and the combined batch-plus-
spike estimate is $1.1552 before any rows 6–16 results; provider-metered costs
are unknown, not zero.

## Provider-down fallback path

The fallback requires no credentials and starts no provider jobs. These paths
were verified present after Integration #3:

- flagship manifest: [`shared/fixtures/lost-colors.json`](../shared/fixtures/lost-colors.json),
- bundled-world adapter: [`src/game/bundledSamples.ts`](../src/game/bundledSamples.ts),
- source photograph: [`public/samples/photo-4.jpg`](../public/samples/photo-4.jpg),
- Rodin GLB: [`public/samples/rodin.glb`](../public/samples/rodin.glb),
- Tripo GLB: [`public/samples/tripo.glb`](../public/samples/tripo.glb).
- bundled audio is referenced by
  [`shared/fixtures/lost-colors.json`](../shared/fixtures/lost-colors.json) and
  served from [`public/audio`](../public/audio).

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
4. Use the bundled Lost Colors tracks for step 7 and call them bundled. For
   steps 3, 9, and 10, show only committed dated evidence and state its date and
   boundary. Do not click **Preview my world**, **Build my world**, or **Create
   animated postcard** in this no-provider path.

This fallback demonstrates recognizable bundled real-provider geometry,
authored gameplay, Lost Colors progression and audio, gameplay capture,
persistence, immutable sharing, and honest provenance. It does not demonstrate
a new live job, automatic course quality, generated audio, or generated
postcard media.
