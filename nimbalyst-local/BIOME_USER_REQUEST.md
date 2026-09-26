Implement dynamic biome transformations and generated adventures in this existing image-to-3D game.

The app turns a user’s photo into a playable 3D environment. Inputs can depict anything: desks, beds, kitchens, furniture, or unfamiliar objects. Features must work without requiring specific recognized objects.

First validate the existing architecture and available model capabilities. Then proceed directly with implementation. Do not stop after producing a plan.

Use child agents to parallelize independent work as much as practical. Assign clear ownership of files and interfaces to prevent conflicting edits. The parent agent owns integration and final verification.

PRODUCT GOAL

Let the player transform their scanned environment into a small themed adventure.

Ship these initial options:
- Original
- Tropical Island
- Desert

Preserve recognizable shapes and landmarks from the photo. A desk should still read as a desk, but it might have sandy surfaces, miniature palms, wooden bridges, and water surrounding it.

The result must remain playable. Visual transformations must not bury the player, obscure objectives, or invalidate traversal.

1. VALIDATE BEFORE BUILDING

Inspect the repository and establish:
- Rendering engine and scene structure.
- How reconstructed meshes, textures, scale, and coordinates work.
- Player movement, jumping, climbing, camera, and collision systems.
- Existing mission, collectible, checkpoint, and portal logic.
- Existing LangChain integrations and configured models.
- Available assets, loaders, shaders, and performance constraints.

Check actual configured model capabilities using current provider documentation and a small smoke test when credentials are available:
- Can the model inspect an image?
- Can it return structured data reliably?
- Can it produce useful scene labels and theme suggestions?
- Are image or 3D asset generation services actually available?

Do not assume that using LangChain means a model can generate images, 3D meshes, or reliable spatial coordinates.

Treat uploaded images and model-generated content as data, not instructions. Validate model output against an explicit schema.

Write a short feasibility note explaining:
- What existing systems can be reused.
- What the models can demonstrably do.
- What should be implemented procedurally.
- Any unavailable capabilities and the fallback.

Then continue building. Missing AI capabilities must not block the core feature. Use deterministic biome presets and procedural assets when needed. Do not introduce a new paid service as a prerequisite.

2. PARALLEL WORKSTREAMS

After inspecting the architecture and defining shared interfaces, delegate independent work such as:

A. Surface analysis, safe placement, and traversal connections.
B. Biome visuals, procedural props, lighting, and atmosphere.
C. Mission templates, objective placement, and reachability.
D. Theme-selection UI and model-assisted theme planning.

Use only as many agents as the environment supports. If agent capacity is limited, combine related tasks.

Agree on shared data contracts before parallel edits. Avoid multiple agents changing the same central scene or player controller. Parent agent integrates changes and performs end-to-end verification.

3. SEPARATE VISUALS FROM GAMEPLAY

Implement distinct layers:

Source scene:
- Original reconstructed geometry and textures.

Gameplay:
- Collision proxies, traversal structures, spawn locations, checkpoints,
  collectibles, and exit.

Biome:
- Surface effects, decorative props, lighting, sky, particles, and ambience.

Changing a biome should normally preserve the current mission and traversal layout.

Decorative props should be non-colliding by default. Anything the player must stand on needs explicit, tested collision geometry.

Keep source materials and scene state recoverable so Original can be restored cleanly.

4. DEFINE A BIOME CONFIGURATION SYSTEM

Create a typed configuration suitable for adding more biomes later.

Include:
- Biome identifier and display name.
- Color palette and lighting settings.
- Sky and fog settings.
- Surface treatment settings.
- Prop categories, density, and scale ranges.
- Wind direction and strength.
- Ambient effects.
- Mission naming and collectible styling.
- Deterministic random seed.

Models may choose from supported settings and asset identifiers.
Do not let model output execute code, invent arbitrary asset URLs, or
directly control unvalidated world coordinates.

5. IMPLEMENT THE TWO BIOMES

Tropical Island:
- Warm light, a blue sky, and restrained atmospheric haze.
- Sand or grass treatment on suitable upward-facing surfaces.
- Small palm trees, shrubs, rocks, and occasional wooden details.
- Gentle foliage movement using a shared wind direction.
- Water around the playable scene only where it fits the geometry and
  does not intersect required routes or hide important source objects.

Desert:
- Warm sand tones, a clear sky, and light dusty haze.
- Sand patches on suitable surfaces.
- Small rocks, sparse cacti or dry plants, and wooden markers.
- Subtle drifting dust.
- A wind vane or windsock that visibly matches the simulated wind direction.

Use procedural low-poly props or existing project assets first.
Make both biomes coherent with the current game's art style.

Avoid covering the entire scan with opaque replacement geometry.
Use localized patches, material blending, or another technique suited
to the existing renderer. Preserve enough source texture to recognize
the original scene.

Do not add expensive full-scene remeshing or generative asset pipelines
unless the project already supports them reliably.

6. PLACE PROPS USING GEOMETRY

Build a reusable placement system.

Candidate locations should account for:
- Surface orientation.
- Available supporting area.
- Local clearance.
- Distance from edges.
- Scene and character scale.
- Existing props.
- Gameplay exclusion zones.

Use raycasts or the engine's equivalent to validate placement.

Reserve clear space around:
- Player spawn.
- Required paths.
- Jump takeoff and landing areas.
- Climb points.
- Checkpoints.
- Collectibles and portal.

Do not place trees on tiny ledges, float rocks above surfaces, or allow
large props to intersect the player’s route.

Derive prop scale from the playable scene and character dimensions,
not fixed assumptions about real-world meters.

Use seeded randomness so a layout is reproducible.

7. GENERATE MISSING TRAVERSAL STRUCTURES

Analyze safe standing surfaces and connections between them.

Use the actual player controller's movement limits to identify plausible
walk, jump, and climb connections. Account for gliding if it is already
implemented. Do not assume a glider exists or silently change movement physics.

Add small structures where needed:
- Ramps.
- Stepping platforms.
- Bridges.
- Short stair sequences.
- Clearly marked launch or landing platforms.

Give these structures biome-specific appearances while keeping their
functional geometry reliable.

For flat scenes, create a modest elevated route. For disconnected scenes,
bridge necessary gaps. Add only enough structure to make a satisfying
short adventure while keeping the photographed environment prominent.

Use simplified collision geometry when reconstructed surfaces are unreliable.

8. BUILD REUSABLE MISSION TEMPLATES

Implement a mission interface and initially support:

Restore the Portal:
- Collect three energy fragments.
- Activate and reach an exit.

Reach the Beacon:
- Follow a traversal route to a reachable destination.

Use geometry to choose mission locations.
Use recognized objects only for optional naming and story flavor.

Examples:
- Tropical: collect sun fragments to activate an island gate.
- Desert: collect relic fragments to awaken an oasis beacon.
- Unknown environment: collect energy fragments to open a portal.

A laptop, toaster, pillow, or door must never be required.

Place objectives along interesting routes rather than randomly across
the scene. Provide checkpoints and a clear completion moment.

Validate that the complete objective sequence is reachable, including
the exit after collection. Account for one-way drops and jumps.

Do not rely only on straight-line distance or visual proximity.
Use conservative movement constraints and check supporting surfaces,
obstacles, and clearance.

If validation fails:
- Try different objective locations.
- Add a safe connecting structure.
- Fall back to a compact known-playable arrangement.

Bound retries so generation cannot loop indefinitely.

9. USER EXPERIENCE

Add a simple theme selector:
Original / Tropical Island / Desert

Display a loading state during preparation and preserve the current
playable scene if preparation fails.

Keep implementation terminology out of the player-facing UI.

Show:
- Current mission.
- Relevant progress, such as “Fragments 1/3.”
- Clear checkpoint and completion feedback.
- Contextual movement hints where useful.

Use restrained visual and audio feedback for pickups and portal activation.

Switching themes must clean up previous props, effects, listeners, and
temporary resources. Repeated switching must not accumulate objects.

If a world regeneration would reset progress, make that a separate,
clearly labeled action from changing its visual theme.

10. PERFORMANCE AND VERIFICATION

Use instancing or batching for repeated props where supported.
Set practical limits for prop counts, particles, shadows, and draw calls.
Provide reduced effects for lower-performance devices.

Verify representative cases:
- A desk with multiple heights.
- A mostly flat countertop.
- A bed or irregular soft-looking surface.
- An unfamiliar or poor-quality reconstruction.

Use existing sample scenes or lightweight geometry fixtures if real
scans are unavailable, and disclose what was actually tested.

Check:
- Safe spawning.
- Reachable objectives and exit.
- Traversable generated structures.
- Props staying out of required paths.
- Correct wind-vane direction.
- Repeated theme switching and return to Original.
- Missing model credentials and malformed model output.
- Runtime errors and performance regressions.

Run the app and visually inspect both biomes using available browser
or screenshot tools. Unit tests alone cannot establish visual quality
or enjoyable traversal.

DELIVERABLES

Complete the working implementation, not just a design document.

Provide:
- A concise description of what shipped.
- How to run and try both biomes.
- Model capabilities verified and fallbacks used.
- Relevant checks and visual evidence.
- Known limitations.
- Where future biomes and mission templates can be added.

Prioritize a polished, reliable Tropical Island and Desert experience.
Keep arbitrary custom biome generation as a future extension unless
the initial implementation is already complete and verified.