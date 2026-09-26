# Gameplay: movement, mantling, checkpoints and camera

Owner: Player and camera worker (`src/game/**`).

The same code runs every level. A level is a `SceneManifest`
(`shared/manifest.ts`); the only other input is `DEFAULT_MOVEMENT_CONFIG`
(`shared/movement.ts`). There is no per-level physics tuning and no
furniture-specific gameplay code — if two levels feel different, the
difference is in their manifest data.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrow keys | Move, relative to the camera |
| Mouse | Look (third-person orbit; requires pointer lock) |
| `Space` | Jump |
| `E` | Contextual mantle, when the prompt is showing |
| `F` / right mouse | Fire the grappling hook at the reticle; press again (or `Space`) to let go |
| `R` | Return to the last activated checkpoint |
| `Esc` | Pause and release the mouse |

Clicking the game captures the mouse. `Esc` releases it and pauses; so does
the browser dropping pointer lock for any other reason, so the game can
never keep simulating while the player has lost control of the camera.

## Gameplay event bus

`src/game/events.ts` exports `GameplayEventBus` and the default
`gameplayEvents` instance. Audio, analytics and browser QA consume
this typed event stream; none of them infer rewards from rendered objects.
Events are synchronous and carry immutable primitive payloads. A subscriber
returns an unsubscribe function and may listen to a named event or `*`.

| Event | Emitted when |
| --- | --- |
| `fragmentCollected` | A required or optional fragment is credited for the first time. Includes progress, color, and the new 0..1 restoration target. |
| `allFragmentsCollected` | The last required fragment is credited. |
| `portalActivated` | A previously locked portal becomes enterable. |
| `checkpointReached` | The next ordered course/race checkpoint is reached. |
| `playerFell` | The movement controller detects out-of-bounds, before respawn feedback. |
| `respawned` | A fall or manual return moves the capsule to its safe pose. |
| `raceCountdown` | The visible whole-second countdown changes. |
| `raceStarted` | Countdown ends and the monotonic race clock starts. |
| `raceFinished` | A result is frozen and the local personal best is evaluated. |
| `worldCompleted` | Any mode reaches its completion rule; emitted once per run. |
| `introShown` | The contextual movement/jump introduction is shown for this world. |
| `grappleAttached` | The grappling hook bites an anchor. Carries the anchor kind and distance; audio plays the synthesised bite. |

Fragment and completion events are idempotent per run. Respawn never clears
progress. Restart creates a new run and may therefore emit the same reward
sequence again, but it first returns all mode state to its authored initial
values.

## Simulation model

Rapier runs at a **fixed timestep** of `fixedTimestepSeconds` (1/60 s),
independent of the display refresh rate. Each animation frame adds its real
elapsed time to an accumulator and runs at most `maxSubSteps` (4) fixed
steps; any remaining backlog is dropped rather than replayed, so a
backgrounded tab does not resume in fast-forward. Rendering interpolates
between the last two fixed steps, so a 144 Hz display is smooth without
changing the physics.

Edge-triggered inputs (jump, mantle, respawn) are latched until a fixed
step consumes them. A key pressed during a frame that happens to run zero
fixed steps is still honoured.

The player is a **kinematic-position-based capsule** driven by Rapier's
`KinematicCharacterController`. All level geometry is static. There are no
dynamic bodies, which is what makes the whole simulation deterministic and
re-runnable headlessly — the tests drive the same `GameSimulation` class the
browser does, not a parallel model of it.

### Grounding

Rapier's own `computedGrounded()` drops out for the occasional step: its
normal-nudge lifts the capsule a few millimetres past the controller offset
while moving, and on a triangle mesh the contact normal also shifts across
triangle seams. Measured on a flat trimesh floor, that produced 6–12
spurious airborne steps per 300 while walking.

Grounding is therefore confirmed with an explicit downward probe using the
same criterion snap-to-ground uses: standable ground (normal within the
50° slope limit) within the snap distance below the feet, while not moving
upward. With that in place the measured figure is 0 airborne steps per 300
on both cuboid and triangle-mesh floors.

A resting capsule sits about one controller skin width (≈11 mm) above the
surface. That is the solver's contact gap, not a bug; it is far below the
~1 cm that would be visible on a 70 cm character, and the contact shadow is
drawn at the true surface height.

### Step-over and blocking

The capsule's rounded base rolls over small obstacles. Measured against
solid steps with default tuning:

| Obstacle height | Result |
| --- | --- |
| ≤ 0.12 m | Walked over without leaving the ground |
| 0.20 m – 0.30 m | Blocked; must be jumped |
| 0.30 m – 0.90 m | Blocked on foot; **mantle** applies |
| > 0.90 m | Blocked; not climbable |

Rapier's `enableAutostep` is configured but did not measurably change this
boundary in testing — the step-over behaviour observed comes from the
capsule's own rounding at roughly the character radius (0.18 m). This is
stated rather than claimed as autostep working.

There is a small dead zone between ~0.18 m (too tall to walk over) and
0.30 m (`mantle.minLedgeHeight`, too low to mantle). Obstacles in that band
have to be jumped, which the 0.6 m jump height covers comfortably. Closing
it would mean lowering `minLedgeHeight` in `shared/movement.ts`, which is
not owned here.

### Solid biome props

In a themed look (Tropical, Desert, Alpine, Autumn, Ember) the trees, cacti,
rocks, stumps, bushes and the windsock pole are solid. Each drawn member
gets one cheap primitive collider measured from its own mesh: trunks, cacti
and poles are capsules, rocks and logs are boxes, and bushes are cylinders.
Grass, pebbles, flowers and fallen fronds stay walk-through. The colliders
are attached to the running world when a look is shown, and removed when it
changes (`GameSimulation.setPropColliders`). Level collision is never touched.

| Prop height (runtime body 0.175 m) | Result |
| --- | --- |
| Below the autostep height (~2.5 cm) | Not solid; walked over |
| Up to 2 body heights (0.35 m) | Solid; jump onto it (boulders, stumps, bushes), or mantle it when it is inside the envelope |
| Taller | Solid wall; never a mantle target (trunks, cacti, poles) |

Pushing within 25° of straight into a round prop (a trunk or cactus) stops
the character against it. Without that, the controller's slide would glide
round a thin trunk in a fifth of a second, which reads as walking through
it. A glancing push still slides smoothly round. Box props (rocks, logs)
behave exactly like level walls. A prop that would appear around the player
on a look switch waits until they walk clear, so the capsule can never be
trapped inside one.

Placement keeps every solid footprint off the verified route. It stays
clear of the spawn, checkpoints, objectives and every walk, jump and mantle
node, so props can never block the mission. At most 400 prop colliders are
installed. Real layouts use 60–160.

### Jump

`jumpHeight` (0.6 m) is converted to an impulse velocity of
`sqrt(2 · gravity · jumpHeight)`. Measured apex is within ±20% of the
configured height. A jump is allowed for 0.12 s of **coyote time** after
walking off a ledge, and a press is **buffered** for 0.12 s before landing.
Jumping into a ceiling zeroes the upward velocity rather than grinding
along it.

## Contextual mantle

Pressing `E` near a climbable ledge pulls the character up onto it. The
movement is **scripted** — straight up, then forward — rather than resolved
through the collision solver, which is why the whole path has to be proved
clear before the move starts. Four independent conditions must all hold:

1. **A ledge face.** Six forward rays between the feet and the maximum
   ledge height must find a wall-like surface (normal more vertical than
   0.6) within `maxReachDistance` of the capsule.
2. **A standable top.** The landing column is scanned downwards for the
   highest point in open air inside the ledge-height envelope, and a ray
   is dropped from there. The surface found must be between
   `minLedgeHeight` and `maxLedgeHeight` above the feet, and its normal
   must be within the 50° slope limit.
3. **Room to stand.** A capsule at the destination must not intersect
   anything, and a column of `requiredClearanceHeight` standing on the
   ledge must be clear. This is what makes a low ceiling block a mantle.
4. **A clear sweep.** A capsule shape-cast straight up from the current
   position, and then forward from the apex to the destination, must both
   be unobstructed. This is what stops a mantle passing through a wall or
   a ceiling.

The probe reports *why* it refused. The reasons are surfaced in development
diagnostics and are asserted individually in `src/game/core/mantle.test.ts`:

`no-facing-direction`, `no-ledge`, `no-top-surface`, `ledge-too-low`,
`ledge-too-high`, `top-not-standable`, `destination-blocked`,
`insufficient-headroom`, `path-blocked-up`, `path-blocked-forward`.

Two notes on interpreting these:

- With the default tuning, `requiredClearanceHeight` (0.7 m) equals the
  capsule height, so the "does it fit" and "is there head room" checks
  coincide and a low ceiling reports `destination-blocked`.
  `insufficient-headroom` only appears if the required clearance is raised
  above the capsule height.
- An object sitting on a ledge raises the effective landing surface. A
  crate on a 0.5 m shelf reports `ledge-too-high`, because the surface you
  would actually land on is the crate's top.

The path sweep uses a capsule 8% slimmer than the player's. The controller
keeps the real capsule within a skin width of surfaces it is touching, and
a full-width sweep from there reports a grazing hit at t = 0 and refuses
otherwise-valid mantles. 8% is comfortably wider than the skin and far
narrower than any gap a player could pass through.

Availability is re-probed every third fixed step (20 Hz) for the prompt,
and always re-probed fresh on the key press, so `E` never acts on a stale
result. The direction probed is the movement direction when there is input,
otherwise the camera's forward direction.

## Grappling hook

When the main object is too tall to climb, the hook pulls the explorer up
to where the reticle points, Just Cause style. It is a player ability in
every world, look and mode. It adds nothing to the manifest and does not
touch the editor.

**Aim.** A small reticle sits at screen centre. A ray from the camera
through it looks for an anchor within `2.5 ×` the main object's height,
and never less than 1 m (`grappleRange`). The height is taken from the
tallest generated mesh, or from the scene when there is none. The ray
starts level with the character, so things between the camera and the
player are ignored. Biome props are never anchors: the ray looks through
them, and a prop (enabled in physics or not) across the rope blocks the
shot. Anchors closer than two body heights are refused. The reticle is a
plain ring over nothing. Over a valid anchor it closes into four ticks
and a marigold gem. It dims while the hook is out or cooling down. Every
mark is a plum under-stroke beneath a light top stroke, so it holds
contrast on both bright and dark backgrounds.

**Anchors.** Every anchor resolves to a kind, and every route is swept
with the capsule before the reticle offers it:

- `surface`: a standable top. The explorer is pulled to stand on it. If
  the straight way is blocked, the route goes out past the lip nearest the
  player (found by walking the top back toward them), up above it, then
  across. The rope wraps over that lip.
- `ledge`: a face, chamfer or lip with a top within a mantle's height
  above it. The hook moves up to bite that lip, and the explorer goes out,
  up and over. This is what gets round an overhang, like a desk top over
  its drawers.
- `wall`: anything else. The explorer is pulled up to hang off the face,
  then mantles if a ledge is in reach, or drops with a small hop.

The hook bites 1 cm off the surface along its normal, never inside it.

**Fire and reel.** The hook flies to the anchor in 0.15–0.3 s along a
slight arc, with the rope slack behind it. On the bite there is a puff, a
synthesised click-and-thunk on the effects bus (no manifest cue or asset),
and the rope goes taut. The reel moves the capsule through the same
`KinematicCharacterController` as walking, from `locomotionStep`. There is
no joint, so collisions, autostep and mantling keep working, and the
solver stops the capsule at first contact. It accelerates at 30 m/s² to
3.5× walk speed, lofts the first leg above its goal, and brakes into the
arrival. It ends when the explorer:

- stands on the target (stops there);
- is within 0.6 m of a wall anchor, then mantles or hops;
- stops making progress for 0.18 s, or hits a 3 s ceiling. A mantle, or a
  swept pull-over onto the target, is tried before hopping. The hop
  drifts toward the target.

Pressing `F` again or `Space` lets go. The momentum is kept and gravity
takes over. Letting go by jumping does not also jump.

**Rules.** A 0.6 s cooldown follows every release, and a miss costs the
same cooldown from the shot. There is no hook while mantling, respawning,
or once the course is complete. A respawn or restart mid-reel drops the
hook (`grapple-release` reason `cancelled`) with nothing carried over.
Mission gates are unchanged: fragments, beacons and the portal still
need the capsule to reach their triggers.

**Camera.** A mild FOV kick (up to 5°) follows rope tension, with a 0.18 s
shake on the bite. Under `prefers-reduced-motion` both are dropped, the
puff fades in place, and the mechanic is unchanged. A two-line hint
("Aim at a ledge, / press F to hook") shows once per browser session,
after the movement intro, under `objectquest:intro:grapple-hook` in
`sessionStorage`.

**Touch.** There are no touch controls yet (see the limitations below).
`InputController.fireGrapple()` is the single entry point for a future
on-screen button.

Diagnostics expose `grapple.{phase, ready, range, aimAnchor, aimRejection,
aimPoint, target, tension, fov, lastRelease}`. Tuning constants live at
the top of `src/game/core/grapple.ts` and `src/game/render/grappleVisuals.ts`.

## Checkpoints, respawn and completion

V2 mode progress lives in `GameplaySession`, beside rather than inside the
Rapier controller:

- **Collect** credits each authored fragment once, applies monotonic authored
  restoration steps, and unlocks the portal only after every required unique
  fragment. Respawn preserves the set; restart clears it.
- **Explore** points at authored destinations and optional collectibles. There
  is no countdown or elapsed-time display, and visiting every destination (or
  entering an authored always-active portal) completes the run.
- **Race** freezes movement during its authored countdown, requires checkpoint
  IDs in order, excludes paused time, freezes one final result, and stores a
  personal best under the immutable published version ID. Draft runs use the
  world ID as a clearly local fallback key.

The older checkpoint-only course behavior below remains intact for legacy
manifests and both original bundled samples.

Checkpoints are collected **in manifest `order`**, not by proximity:
walking through checkpoint 3 before checkpoint 2 does nothing. Without
that, "next objective" would be meaningless and a course could be
short-cut. The trigger is a sphere of `triggerRadius` around the capsule
centre — the same volume drawn translucently around the marker, so what
looks collectable is exactly what is.

Only the active objective is bright, pulsing and lit; later checkpoints are
dim and still; collected ones turn green. Collecting the last one completes
the course, pauses the simulation, releases the mouse and calls
`onComplete`.

`R` and falling out of the level both respawn at the most recently
activated checkpoint's `safeRespawn` pose, or at the level spawn before the
first one. Respawning also re-aims the camera to that pose's heading, so
the player is looking the right way instead of back at wherever they fell
from.

Out of bounds is derived from the level's own collision bounds: 3 m below
the lowest collidable surface, or 10 m outside its horizontal extent.

**Replay** is supported two ways: the built-in "Play again" resets the
simulation and checkpoints in place, and remounting `GameView` (a new React
`key`) rebuilds the level from scratch. Scene preparation, the editor, game
startup and replay all use the one cache in `src/scene/loader.ts`, so crossing
those screen boundaries does not re-download or re-decode the GLB.

## Camera

Third-person orbit. Yaw is unbounded; pitch is clamped to the config's
`minPitchRadians`/`maxPitchRadians`. Moving the mouse right turns the
character to its right, and moving it up looks up (not inverted).

Collision avoidance sphere-casts from the look target towards the desired
camera position and shortens the boom to the first hit, clamped to a
minimum of 1.6 × the character radius. It pulls in **instantly** when
something gets in the way — a frame spent inside a sofa is very obvious —
and eases back out afterwards, so the view does not snap every time the
player brushes a table leg. Biome prop colliders are ignored by this sweep
(a trunk between the camera and the player fades out instead), so the boom
never pumps in and out past a grove.

The camera near plane is 2 cm, because at toy scale the boom can
legitimately be under 30 cm long.

## Loading and readiness

Downloading, decoding, building physics and rendering the first frame are
reported as four distinct stages. `ready` becomes true only after a frame
has genuinely been drawn with physics in place — the first `useFrame`
callback runs *before* the first render completes, so readiness is signalled
on the second.

A download percentage is only shown when the server reported a real
content length. Otherwise the indicator is indeterminate and says so,
rather than fabricating a percentage.

The game imports the scene worker's runtime loader directly. Downloading,
decoding, collision extraction, cache state and failure eviction therefore
have one implementation across preparation, the editor and play. Unsupported
Draco, Meshopt and sparse-accessor assets are rejected explicitly by scene
loading rather than being given approximate collision.

## Authoring a level for this runtime

Coordinate convention is Y-up, right-handed, metres (`shared/geometry.ts`).

Before save or publish, `validateExperiencePlacements` projects the active
mode's ordered fragments, destinations, checkpoints, and portal into the same
conservative walk/jump/mantle validation used by scene preparation. The result
is a discriminated `PlacementValidationResult`; `ok: false` contains
display-ready repair issues and must block publication. For example, an
unreachable race marker reports “Move this checkpoint closer to the previous
platform.” `assertPlayableExperience` throws a `PlacementValidationError`
carrying that result for boundaries that prefer exceptions.

- `spawn.position` and `checkpoint.position` are **capsule centres**, not
  standing surfaces. A character standing on a surface at `y` has its
  centre at `y + 0.35` (`characterHalfHeight + characterRadius`) plus a
  small skin margin.
- `headingRadians` is measured around +Y from +Z, so heading 0 faces +Z.
- **Generated mesh** entities collide with the exact triangles that are
  rendered, with the entity transform baked into the vertices. Scale is
  baked rather than applied to the collider, because Rapier colliders have
  no scale.
- **Helper geometry** (added game floor, boxes, ramps) is rendered and
  collided from the same `helperLocalSoup` triangles, derived from
  `dimensions`. If a manifest's `collider.halfExtents` disagrees with the
  rendered dimensions, the rendered geometry wins and a warning is
  recorded — collision must never describe something other than what the
  player can see. Warnings are shown on the pause screen and in
  diagnostics.
- A **ramp** rises along its local +Z, from the bottom edge at `-Z` to the
  top edge at `+Z`, centred in its own bounding box. Rotate it about +Y to
  aim it: a +90° rotation (`[0, 0.7071, 0, 0.7071]`) makes it rise along
  +X. Declaring a box collider on a ramp is overridden with wedge
  collision, with a warning.
- Where a ramp meets a raised platform, let the ramp's top edge reach the
  platform's top height *before* the platform's vertical face, or leave a
  step no taller than ~0.12 m at the junction. A ramp that stops flush
  against a taller vertical face leaves a lip the capsule has to grind
  over slowly.

## Development diagnostics

In development builds, `window.__objectquest.get()` returns a frozen
read-only snapshot: player position and velocity, measured speed, grounded
and mantling flags, whether a mantle is currently offered and the rejection
reason when it is not, checkpoint progress and the next checkpoint's
position, camera yaw/pitch/distance and whether it is occluded, fixed steps
run, scene bounds, collision triangle count, and any level-data warnings.
In a themed look, `biome.propColliders` / `biome.propCollidersDeferred`
count the solid props live in physics and those still waiting for the
player to move clear.

This surface is **strictly observational**. There is deliberately no way to
move the player, skip to a checkpoint, or mark the course complete from it,
because doing so would let a verification run "complete" a course the
controller cannot actually complete.

## Tested behaviour and known limitations

Covered by the automated game tests:

- Stable grounding, no jitter (< 1 mm over 300 steps), no sinking or
  hovering, grounded throughout a walk.
- Jump height within ±20% of configured; no double jump.
- Cannot walk through a wall; does not tunnel through a 2 cm plate while
  falling at over 8 m/s; does not pass through a ceiling.
- Step-over and blocking thresholds above; ramp climb onto a platform.
- Mantle accepted for a valid ledge and actually landing grounded on it;
  refused for too-low, too-high, out-of-reach, occupied destination, low
  ceiling, insufficient head clearance, blocked upward path; the player
  never moves when the probe refuses.
- Ordered checkpoint collection, including passing a later checkpoint
  first; completion on the last; respawn to spawn and to the last
  checkpoint; reset for replay.
- Collision matching rendered geometry, transform baking, helper collider
  override warnings.
- Solid biome props: a trunk stops the capsule dead with no horizontal
  jitter. A glancing hit slides round without back-and-forth. A rock face
  slides exactly like a wall. Sub-step props are walked over, and a boulder
  can be jumped onto. Tall props are never mantle targets. The camera
  ignores props. On both real scans, in every themed look (standard and
  reduced), no prop collider touches the capsule on any route node or
  corridor. Generated adventures are driven to completion through every
  look's solid props.
- Both bundled GLBs: decode, collider triangle count matching the rendered
  mesh, normalisation to the documented game scale, standing stably beside
  the furniture, landing on the furniture from above without falling
  through, and the same code driving a course on both.
- The authored Rodin climb (helper steps topping out at 0.4287 and 0.8573,
  onto a furniture surface at 1.286) is driven end to end by the real
  controller: every rise is inside the mantle envelope, the character
  reaches the furniture surface grounded without ever respawning, and the
  floor and elevated checkpoints are collected in order. Reachability is
  established by running the controller, not by measuring distances.

  Observed: the climb completes in **two** mantles rather than three. The
  landing inset carries the capsule far enough onto the lower step that
  the next probe already sees the upper step, so one press covers both.
  This is behaviour worth knowing when authoring closely-stacked steps;
  it does not make the route harder.

Known limitations:

- **No full browser course completion yet.** Chrome has rendered the first
  game frame at full viewport size, and the start/editor layouts have been
  checked at desktop and narrow widths. The movement and route results above
  are still from headless simulation; an input-driven end-to-end play-through
  of both sample courses remains separate acceptance work.
- **The authored sample manifests have not had a browser play-through.**
  Their data and headless controller checks do not substitute for completing
  both checkpoint routes with real keyboard and mouse input.
- **Compressed GLBs are not accepted yet.** They fail clearly instead of
  silently producing incomplete collision.
- **Textures do not decode under Node.** The sample tests log
  `THREE.GLTFLoader: Couldn't load texture` because Node has no image
  decoding. Geometry and collision are unaffected; this does not occur in
  the browser.
- **Mobile is not supported.** There is no touch input and pointer lock is
  desktop-only. Coarse-pointer layouts explicitly say that keyboard and mouse
  are the supported controls instead of presenting inert touch controls.
- **No audio.**
- **Grappling hook on real scans.** Anchor paths are swept with the
  capsule, but the arrival on some scanned lips (rounded arms, thin
  overhangs) is confirmed by play, not by an automated route. Where the
  route can't be proved, the reticle offers `wall` (reel up, then mantle or
  drop) rather than promising the top.
- Mantle `insufficient-headroom` is unreachable with the default tuning
  (see above); it exists for tunings where required clearance exceeds the
  capsule height.
