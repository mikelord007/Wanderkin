# Themes and new adventures: hands-on test guide

For the user. Agents did not play-test missions or judge feel; that is yours.
Nothing below claims traversal or enjoyment has been accepted.

**Revision:** committed as **`f3b9477`**
(`f3b9477da69dd4af1243670c8ff2fb5f99b8c89e`, parent `2193c5c`, 2026-09-25 16:10 IST).
- Scope: exactly the 53 files approved by the independent final review
  (`BIOME_FINAL_REVIEW.md`).
- Gate: `npm run build` exit 0; `npx vitest run` 87 files 717/717.

## Where to play

Open **http://localhost:5173/**.

The dev servers on 5173 (app) and 8787 (API) run straight from this working
tree. At the commit, the working tree equals `f3b9477`. If a page was open
before the commit, or looks stale, reload it.

## Getting to the controls

1. On the start page, scroll to **Worlds to borrow**.
2. Pick one of the two scanned rooms and press **Play now**:
   - **The desk & sofa adventure** (Rodin scan);
   - **A different perspective** (Tripo scan).
3. The world loads and shows a **Click to play** card. Below its **Play**
   button, open **Look & adventure**.

The same **Look & adventure** section also appears in the **Paused** card.
Press **Esc** during play to pause.

### Change the look (keeps your progress)

Under **Look**, choose **Original**, **Tropical Island** or **Desert**. The
world changes appearance after a short "Preparing your world…". Your position,
checkpoints and fragments stay as they were.

**Reduce effects** gives fewer plants, particles and shadows.

### Start a new adventure (resets progress)

1. Under **Next adventure**, choose **Restore the Portal** or **Reach the
   Beacon**.
2. Press **Start new adventure**.
3. Once a run has started, confirm with **Reset and start**; **Keep playing**
   cancels. The confirmation is skipped before the first Play, when there is
   no progress to lose.

You get a new world with a new route, starting from the spawn. The HUD shows
**Fragments 0 / 3** or **Beacon 0 / 1**.

A generated adventure is a private, unsaved draft. It is only saved if you
choose to save it from the Finish screen. Changing the look never saves or
alters a saved or shared world.

**Shared challenges (played from a share link):** the look can change, but
there is no "Start new adventure" because the course is fixed.

## Controls

- **WASD:** move.
- **Mouse:** look.
- **Space:** jump.
- **E:** climb up a ledge.
- **R:** back to the last checkpoint.
- **Esc:** pause (and release the mouse).
- **M:** mute.
- **C:** start or stop gameplay capture.

## What to check (from the independent reviewer)

Try both scanned rooms.

1. Before starting, switch Original → Tropical → Desert → Original several
   times. The look changes each time and the furniture stays recognisable. The
   character is never buried, and Original looks exactly as before.
2. Pause mid-run after picking up a fragment, then switch looks. Your
   position, fragment count and checkpoint should be unchanged.
3. **Desert:** find the windsock. Its tail should point the way the dust
   drifts and the plants lean.
4. **Tropical:** water should sit only beyond the floor edge, never over your
   path or the furniture.
5. Start a new adventure: **Restore the Portal** on the desk & sofa room, then
   **Reach the Beacon** on the other room. Expect a clearly separate action,
   then "Fragments 0 / 3" or "Beacon 0 / 1".
   - Collect all fragments, then reach the portal or beacon.
   - Checkpoints should light up in order.
   - **R** should return you to the last one.
6. **L4, Tripo stairs:** walk to the generated steps under the sofa overhang.
   Do they look like deliberate steps? Do they hide a recognisable part of the
   sofa? Are they comfortable to climb?
7. **V1, Desert spawn marker:** at the start, can you see the spawn marker?
   In screenshots it was faint on sand.
8. **Desk & sofa (Rodin) generated route:** the raised part is a stepped
   platform course on the open floor with one jump gap, not a climb up the
   furniture. Does that feel fine?
9. **Reduce effects:** fewer props, and the scene should still read clearly.
10. Watch for a freeze of more than about 1 s after pressing **Start new
    adventure**. Also watch for any error or blank screen after the world is
    replaced; this is the target of the crash fix.

If you see a problem, a screenshot and the step number are enough.

## Current status and known limitations

**Crash fix (world replacement):** a guard now stops the game from touching a
physics world that has already been freed. It was checked with 30 repeated
new-adventure replacements in real Chrome (desk & sofa room, before play and
while paused): 0 errors, and the new world ran after Play. The original error
was intermittent and never reproduced on this machine, so the exact trigger is
inferred, not proven.

**New adventure generation:**
- It runs on the main thread. Expect a brief pause, typically 0.15–0.4 s on
  these rooms.
- A 2-second work budget stops it on unplayable or very complex scenes, with
  the message "We couldn't find a safe new adventure here. Your current world
  is unchanged."
  - The budget is checked between stages, so the worst pause is about 2 s plus
    one stage.
  - The raw desk & sofa scan takes about 1.5 s here. On a device roughly 1.5×
    or more slower, a scene that works on this machine may be refused.
  - Scans above 200k collision triangles are always refused for new
    adventures.
- Nothing changes when it refuses.

**Generated structures** (steps, bridges, platforms) are simple boxes in a
wood tone. They can sit under overhangs or flush against furniture.

**Narration on a new adventure (F-1, not fixed):** a generated adventure
keeps the source world's intro audio.
- On a world with its own generated narration, the spoken intro describes
  the source quest, while the subtitle and HUD show the new adventure.
- Other worlds play the standard bundled intro clip, as before.
- This was left as is on purpose. Tell us if it bothers you.

**Intro subtitle look (F-2):** the one-time intro subtitle names the goal
using the look saved with the world. The HUD uses the look you have chosen
now. So after a look change, the intro may say "island gate" while the HUD
says "oasis gate". This is cosmetic.

**Saving a sample-derived adventure (F-3):** starting a new adventure on one
of the bundled sample rooms makes a private draft. Finish then offers
**Save and share** for it. Nothing is saved unless you click it. Say so if
sample-based worlds should never be saveable.

**Other disclosed limits:**
- The Desert windsock is placed even when the route is unproven.
- Preparing a look is not time-budgeted; it takes 15–230 ms on these rooms.
- The crash-fix trigger is inferred. Resource release is shown only by
  bounded renderer counts; there is no memory or WebGL-context count.

**Theme naming** uses built-in presets. There is no online AI planner; the
game works fully offline.

**Existing "Lost Colors" sample:** an automated legacy test fails to collect
its first fragment. The same failure happens on the pre-feature version
`2193c5c` (per integration; that log was not retained), so it is not caused
by this work. It is not fixed, and it is not counted as passing.

**Already known HUD quirks (not new):**
- The intro hint can sit under the narration subtitle.
- The pre-start Play button renders grey.

**What agents did verify** (not gameplay feel):
- Automated unit and contract tests.
- Controller-driven traversal of generated routes in the physics engine.
- Theme switching, Original restoration and resource counts in real Chrome.
- One scripted fragment pickup on each room.
- The world-replacement crash check.
