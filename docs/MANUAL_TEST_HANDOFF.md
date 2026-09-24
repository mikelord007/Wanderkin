# Manual play-test handoff

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
4. **Three visual styles:** compare Cartoon, Collect, and Explore/adventure
   presentation in the design kit or creation journey; each should look
   materially distinct, including color, type, and surface treatment.
5. **Editor:** open **Adjust course** or **Edit**, move an available course
   marker, save, reload the world, and confirm the adjustment persists.
6. **Publish and share:** save a private copy, publish it, and open the returned
   `/share/<shareId>` URL in a fresh incognito window. It should be playable
   without an upload, owner cookie, or generation request.
7. **My worlds:** try the action appropriate to each visible card—Resume/View
   progress, Play, Edit, Retry, Export—and verify private versus published state
   is clear.
8. **Accessibility and sound:** open **Sound**, toggle mute and subtitles, move
   each available slider, and confirm labels, values, keyboard focus, and saved
   settings remain coherent even when optional audio is absent.
9. **Optional media without a provider:** try the postcard and gameplay
   highlight buttons. Missing-provider or missing-recording states must be
   honest and isolated; replay, save, and sharing must remain available.
10. **Capture failures:** on **Create my world**, deny camera access and confirm
    a useful fallback to file upload. Then choose an invalid/non-image file and
    confirm a clear validation message without losing the rest of the journey.

## Do not do this

Do not click **Build my world** during this manual pass. It submits a paid
provider job. Preview, bundled samples, editing, local persistence, and the
failure-state checks above are sufficient for this no-provider play-test.

## Evidence boundary

Bundled samples demonstrate existing geometry and gameplay; they are not a new
provider generation. Optional audio, postcard, and highlight failures must not
be presented as successful generated media. See [DEMO.md](DEMO.md) for the full
demo narrative and [GAMEPLAY.md](GAMEPLAY.md) for runtime details.
