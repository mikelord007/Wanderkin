# Manual play-test handoff

Snapshot: **2026-09-24**, integrated revision `e269fa9`. This is the
**no-provider** hands-on path: it must not submit a preview, mesh, quest, audio,
or postcard job.

Use a current desktop Chromium browser with keyboard and mouse. Start the app
from the repository root with `npm run dev`, then wait for both URLs below to
respond before testing.

## URLs

- App: <http://localhost:5173/>
- Design kit: <http://localhost:5173/design-kit/>
- API health: <http://localhost:8787/api/health>
- Shared-world route pattern: `http://localhost:5173/share/<shareId>`

Confirmed on 2026-09-24: the app and design kit return their expected pages,
the API health route returns `{"status":"ok"}`, and an unknown `/share/...`
client URL returns the ObjectQuest SPA for client-side routing.

Leave `npm run dev` running throughout the manual play-test so Vite remains on
port 5173 and the API remains on port 8787. Stop it only after testing is done.

## Controls

- `W` `A` `S` `D` or arrow keys: move relative to the camera.
- Mouse: orbit the third-person camera after clicking the game to capture it.
- `Space`: jump.
- `E`: mantle when the prompt appears.
- `R`: return to the latest checkpoint.
- `Esc`: pause and release the mouse.

## Ten things to try

1. **Lost Colors:** choose **Play a sample**, collect all three color
   fragments, confirm **Colors found** reaches `3/3`, enter the newly active
   portal, and reach **You brought the colors back.**
2. **Race:** verify movement is frozen during the visible countdown, the timer
   starts afterward, checkpoints must be taken in order, and restart resets the
   run and timer.
3. **Explore:** confirm there is no countdown or elapsed-time display and that
   destinations can be visited at your own pace.
4. **Three visual styles:** compare **Cartoon**, **Hand-painted**, and
   **Watercolor** using the design kit, bundled/saved variants, or other
   pre-existing assets. These are styles. Separately verify that **Explore**,
   **Collect**, and **Race** are gameplay modes. Do not generate a paid preview
   for this comparison.
5. **Editor:** open **Adjust course** or **Edit**, move an available course
   marker, save, reload the world, and confirm the adjustment persists.
6. **Publish and share:** save a private copy, publish it, and open the returned
   `/share/<shareId>` URL in a fresh incognito window. It should be playable
   without an upload, owner cookie, or generation request.
7. **My worlds:** try only no-provider actions appropriate to each visible
   card—Resume/View progress, Play, Edit, and Export—and verify private versus
   published state is clear. If a failed card exposes **Retry**, confirm that
   the action is labelled clearly but do not activate it during this pass.
8. **Accessibility and sound:** in Lost Colors, open **Sound**, deliberately
   unmute after entering play, toggle subtitles, move each channel slider, and
   confirm labels, values, keyboard focus, persistence, and one-shot narration.
   These are bundled tracks; do not describe them as generated audio.
9. **Optional media without a provider:** record, preview, and download a
   gameplay highlight if the browser supports capture. Verify it is labelled
   actual gameplay. Do **not** click **Create animated postcard**: that starts a
   paid image-to-video job. Confirm that the unexecuted postcard remains
   distinct from the local gameplay recording.
10. **Capture failures:** on **Create my world**, deny camera access and confirm
    a useful fallback to file upload. Then choose an invalid/non-image file and
    confirm a clear validation message without losing the rest of the journey.

## Do not do this

Do not click **Preview my world**, **Build my world**, **Create animated
postcard**, or any generation retry during this manual pass. Preview generation
is not free: it submits a paid image-edit request. You may exercise capture,
upload validation, object review, style/mode selection, bundled samples,
editing, local persistence, and gameplay capture, stopping before every paid
action.

## Evidence boundary

Bundled samples demonstrate existing geometry, gameplay, and bundled audio;
they are not a new provider generation. A gameplay highlight is a local record
of play, not generated animation. The current real batch has no saved level,
generated audio, or postcard, so those claims remain outside this pass. The user
owns the resulting controls, course-feel, visual, listening, persistence, and
share acceptance. See [DEMO.md](DEMO.md) for the full demo narrative and
[GAMEPLAY.md](GAMEPLAY.md) for runtime details.
