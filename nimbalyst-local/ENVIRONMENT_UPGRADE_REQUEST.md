Upgrade the game’s entire environment system from placeholder-quality low-poly visuals into a polished, cohesive stylized 3D world system.

CONTEXT

This game takes a user-uploaded image of a real-world surface, such as:
- a sofa
- a desk
- a table
- a bed
- or another similar surface

That uploaded surface becomes the playable world base.

A small stylized character moves around on top of that world, exploring and collecting points.

Different themed biomes are then layered onto the uploaded surface. Current examples include:
- Tropical
- Desert

More biomes will be added in the future.

The current biome assets are functional but visually too primitive. Trees, bushes, cacti, rocks, walls, cliffs, and other environment props often look like raw low-poly primitives rather than intentionally designed stylized game assets.

The objective is NOT photorealism.

The objective is a high-quality stylized miniature-world aesthetic: polished enough to feel like a real indie game, while still remaining playful, readable, lightweight, and visually compatible with the stylized player character.

Think:
- polished stylized low/mid-poly
- strong silhouettes
- appealing simplified shapes
- coherent color palettes
- tasteful material variation
- deliberate composition
- miniature adventure world

Do not make the assets overly realistic, noisy, or detailed.


==================================================
PRIMARY OBJECTIVES
==================================================

Improve visual quality across the entire environment system, including:

- vegetation
- trees
- bushes
- shrubs
- cacti
- tropical plants
- rocks
- boulders
- walls
- cliffs
- large terrain structures
- environmental props
- ground dressing
- biome-specific decorations
- materials
- lighting
- shadows
- procedural placement
- biome architecture

The improvements should apply not just to Tropical and Desert, but to every future biome added to the game.

The final system should make procedural environments feel art-directed rather than randomly populated.


==================================================
GLOBAL ART DIRECTION
==================================================

Use these rules across every biome.

1. POLISHED STYLIZED 3D

Keep everything stylized rather than photorealistic.

Assets should look intentionally modeled rather than generated from obvious primitives.

Simple geometry is fine when the silhouette and proportions are strong.

Favor:
- clean readable forms
- appealing exaggeration
- controlled curves
- asymmetry
- strong silhouettes
- cohesive palettes

Avoid:
- raw cones
- raw cylinders
- obvious spheres
- plain boxes
- giant triangular foliage planes
- repeated identical meshes


2. VISUAL COHESION

The player, plants, rocks, structures, walls, and props must feel as though they belong to the same game.

Do not introduce realistic scanned assets that clash with the existing stylized character.

All environment assets should share a compatible level of:
- simplification
- material response
- geometric detail
- color saturation
- edge treatment


3. STRONG SILHOUETTES

From normal gameplay camera distance, objects should be identifiable primarily from shape.

Do not rely on texture detail to make an object interesting.

A good:
- palm should clearly read as a palm
- cactus should clearly read as a cactus
- boulder should have a distinctive silhouette
- cliff should have an intentionally sculpted profile


4. CONTROLLED COLOR VARIATION

Avoid giving every object one perfectly uniform material color.

Use restrained tonal variation.

Examples:

Vegetation:
- lighter exposed foliage
- medium base foliage
- darker interior/lower foliage
- occasional warmer or yellow-green new growth

Rocks:
- lighter upper-facing surfaces
- medium sides
- darker recessed or downward-facing areas

Walls:
- subtle differences between top surfaces, sides, edges, and recesses

Do not create noisy random rainbow variation.

Each biome should have a controlled palette.


==================================================
ASSET QUALITY RULES
==================================================

Apply these principles globally.


TREES

Trees should not look like:
- one cylinder
- plus several simple triangles

Use:
- tapered trunks
- slight curvature or lean
- segmented or sculpted trunk forms where appropriate
- varied crown shapes
- layered foliage
- controlled asymmetry
- multiple tree variants

Tree instances should vary subtly in:
- height
- trunk lean
- rotation
- crown width
- foliage spread
- color
- scale


BUSHES AND SHRUBS

Do not use a single green polyhedral blob.

Construct bushes from layered overlapping foliage masses.

A bush may consist of approximately:
- 4–10 overlapping irregular forms
- slightly different scales
- subtly different green tones
- irregular outer silhouettes

Create multiple bush families and size variants.


ROCKS AND BOULDERS

Improve rocks globally.

Rocks should:
- have asymmetric silhouettes
- have flatter bottoms
- appear partially embedded into the ground
- have intentional slopes and planes
- avoid looking like scaled icospheres

Create several shape families:
- tiny stones
- pebbles
- medium rocks
- clustered rocks
- large boulders

Include different:
- widths
- heights
- angularity
- orientations

Large rocks should occasionally have smaller companion stones nearby.


WALLS, CLIFFS, AND LARGE STRUCTURES

Large environmental geometry currently risks looking especially artificial when represented by simple boxes.

Improve all walls, cliffs, biome boundaries, and large masses.

Use techniques such as:
- beveling
- tapering
- stepped shapes
- layered formations
- erosion-like cutouts
- uneven edges
- stylized cracks
- ledges
- slight overhangs
- surface breakup
- silhouette variation

Avoid perfectly rectangular masses unless they are intentionally man-made.

Keep collision shapes understandable and gameplay-friendly.


==================================================
ENVIRONMENTAL DRESSING
==================================================

Major props should rarely exist in isolation.

Give major objects a small environmental ecosystem around their base.

Examples:

TREE CLUSTER
- tree
- small shrubs
- ground plants
- stones
- fallen leaf/frond
- subtle ground patch

ROCK CLUSTER
- large rock
- 2–5 smaller stones
- grass or biome-specific plant
- subtle ground decal

CACTUS CLUSTER
- cactus
- pebbles
- tiny desert plant
- dry grass
- small rock

This secondary dressing is important for making props feel embedded in the environment rather than dropped onto the surface.


==================================================
PROCEDURAL COMPOSITION
==================================================

Do not simply scatter individual props independently across the world.

Introduce composition-based procedural generation.

Instead of:

tree
rock
tree
bush
rock
tree

placed independently,

define reusable environment compositions or clusters such as:

- tree grove
- palm oasis
- bush patch
- rock cluster
- cactus group
- cliff formation
- vegetation pocket
- sparse desert patch
- dense tropical patch

Each composition can contain:
- 1 primary prop
- several secondary props
- micro-dressing
- randomized orientation
- constrained scaling
- biome-specific spacing


==================================================
REPETITION REDUCTION
==================================================

The environment should not visibly repeat identical assets.

Each important asset category should support multiple variants.

Suggested minimum target:

Trees:
3–5 variants

Bushes:
4–8 variants

Rocks:
6–12 variants

Cacti:
4–6 variants

Large walls/cliff formations:
multiple modular variations

Use randomized:
- rotation
- scale
- mirroring where safe
- lean
- vertical offset
- tone
- composition

Keep randomness constrained enough that the biome retains a coherent art direction.


==================================================
GROUND CONTACT
==================================================

Every prop should feel physically connected to the surface.

Improve grounding using some combination of:

- contact shadows
- ambient occlusion
- small ground decals
- darker material beneath props
- subtle dirt/sand patches
- surrounding stones
- grass tufts
- base foliage
- partial mesh embedding

Avoid objects that appear to hover or sit perfectly cleanly on top of the environment.


==================================================
LIGHTING AND SHADING
==================================================

Improve lighting globally without dramatically increasing rendering cost.

Use:
- directional sunlight
- softer shadows
- good ambient/environment lighting
- contact shading
- ambient occlusion if practical
- proper roughness/material response

Avoid overly flat uniform lighting.

Objects should have clear:
- lit sides
- shaded sides
- contact shadows

If appropriate for the existing rendering stack, consider lightweight:
- SSAO
- GTAO
- baked AO
- vertex color AO

Do not sacrifice game performance unnecessarily.


==================================================
MATERIALS
==================================================

Where practical, use stylized PBR-compatible materials.

Potential channels:
- base color
- roughness
- normal
- ambient occlusion

However, textures are not mandatory.

Good geometry and controlled flat-color materials are preferable to bad or overly detailed textures.

Use textures only where they noticeably improve visual quality.


==================================================
TROPICAL BIOME
==================================================

Upgrade the Tropical biome specifically.

Target feeling:

bright
lush
playful
warm
miniature tropical island


PALM TREES

Current palms are too primitive.

Improve them with:
- curved or leaning trunks
- tapered silhouettes
- subtle trunk segmentation
- varied trunk height
- richer palm crowns
- curved fronds
- more believable frond structure

Palm fronds should not consist of only a few giant triangular planes.

Prefer:
- curved central frond stems
- layered blade shapes
- multiple leaflets
- controlled overlap
- downward droop
- variation in spread


TROPICAL BUSHES

Build layered irregular foliage clusters.

Use:
- multiple lobes
- several green tones
- different heights
- better silhouettes


TROPICAL ROCKS

Create:
- rounded weathered stones
- angular coastal rocks
- medium boulders
- small companion stones


TROPICAL DRESSING

Possible secondary assets:
- broad-leaf plants
- small palms
- ground foliage
- tropical grass
- fallen palm fronds
- tiny stones
- driftwood-like debris
- flowers used sparingly
- sand patches

Do not make the biome visually cluttered.

Use clusters with open space between them.


==================================================
DESERT BIOME
==================================================

Upgrade the Desert biome specifically.

Target feeling:

warm
sun-baked
stylized
spacious
adventurous


CACTI

Current cactus geometry is too simple.

Improve cactus forms using:
- subtle curvature
- tapering
- rib structure
- asymmetrical arms
- different heights
- controlled branching

Create multiple cactus families:

- tall column cactus
- branching cactus
- short cactus
- clustered cactus
- small succulent/desert plant


DESERT ROCKS

Create several families:
- small stones
- layered stones
- angular desert rocks
- larger sandstone boulders
- small rock clusters


DESERT WALLS AND CLIFFS

Use a stylized sandstone-like visual language.

Possible features:
- horizontal layering
- erosion
- stepped forms
- rounded wind-worn edges
- fractured ledges
- warm color gradients
- irregular silhouettes


DESERT DRESSING

Possible supporting elements:
- pebbles
- dry grass
- scrub
- small desert plants
- cracked patches
- dry branches
- scattered stones
- subtle sand variation

Keep meaningful negative space.

A desert should not become as densely populated as the tropical biome.


==================================================
BIOME ARCHITECTURE
==================================================

Refactor the environment generation architecture so that biomes use a shared reusable framework.

Do not hard-code the visual logic independently for Tropical and Desert if it can be generalized.

Create a reusable biome configuration/data structure.

Each biome should be able to define:

- biome name
- palette
- primary asset categories
- secondary asset categories
- micro-dressing assets
- terrain/wall style
- scale ranges
- rotation ranges
- lean ranges
- density
- clustering rules
- spacing rules
- composition presets
- color variation ranges
- lighting adjustments
- rarity weights


A conceptual biome definition might include:

Biome
  palette

  heroProps
  supportingProps
  microDressing

  rockSet
  vegetationSet
  wallSet

  clusterPresets

  densityRules
  scaleRules
  spacingRules
  materialRules


Do not copy this exact structure blindly if a better architecture fits the existing codebase.


==================================================
ASSET SYSTEM
==================================================

Where appropriate, move away from constructing every environment asset from simple runtime primitives.

Reusable GLB/GLTF assets are acceptable and encouraged where they significantly improve quality.

However:

Do not blindly import a random assortment of third-party models with conflicting art styles.

All models must share a consistent aesthetic.

If procedural geometry is retained, increase its visual intentionality rather than merely increasing polygon counts.


==================================================
PERFORMANCE
==================================================

Maintain good performance.

Use optimization techniques where appropriate:

- geometry instancing
- InstancedMesh
- shared materials
- texture atlases
- LODs if necessary
- sensible polygon budgets
- asset pooling
- frustum culling
- merged static geometry where appropriate

Do not solve visual quality simply by dramatically increasing polygon counts.

The target is better art direction per polygon.


==================================================
GAMEPLAY READABILITY
==================================================

Visual upgrades must not hurt gameplay.

Keep:
- walkable areas readable
- collectible objects visible
- collision boundaries understandable
- player silhouette visible
- navigation clear

Do not make foliage excessively dense around the player.

Do not create visually noisy ground cover that hides gameplay objects.


==================================================
UPLOADED SURFACE PRESERVATION
==================================================

The user's uploaded furniture or surface remains an important part of the experience.

The environment should feel layered ON TOP of that surface rather than completely replacing it.

The visual fantasy is:

"My desk / sofa / bed has turned into a tiny adventure world."

Preserve enough of the original surface and recognizable geometry for that idea to remain obvious.


==================================================
FUTURE BIOMES
==================================================

The new architecture must support adding future biomes without changing the core procedural generation system.

For example, a future biome could be:

- snow
- forest
- volcanic
- alien
- candy
- swamp
- autumn
- underwater-inspired
- fantasy

Adding one should mostly involve supplying:

- asset sets
- palette
- placement rules
- environmental compositions
- material rules
- wall rules
- dressing assets

rather than rewriting world-generation logic.


==================================================
WORK PLAN
==================================================

Before modifying the code:

1. Inspect the existing environment-generation architecture.
2. Locate where biome selection occurs.
3. Locate where props are constructed.
4. Locate where props are placed.
5. Identify which current assets are:
   - procedural primitives
   - imported models
   - shared assets
6. Inspect the rendering/lighting setup.
7. Identify performance constraints.

Then design the refactor.

Suggested implementation phases:

PHASE 1
Biome architecture and reusable configuration.

PHASE 2
Shared rock, wall, vegetation, and dressing systems.

PHASE 3
Upgrade Tropical.

PHASE 4
Upgrade Desert.

PHASE 5
Cluster/composition-based world generation.

PHASE 6
Lighting/material/contact improvements.

PHASE 7
Variation, polish, and performance optimization.


==================================================
ACCEPTANCE CRITERIA
==================================================

Do not consider this task finished merely because the meshes contain more polygons.

The upgrade is successful when:

1. Tropical palms no longer resemble cylinders with triangular leaves.

2. Tropical bushes no longer resemble simple green polygon blobs.

3. Desert cacti have multiple convincing stylized silhouettes.

4. Rocks show clearly different families, forms, and sizes.

5. Walls and cliffs no longer resemble plain rectangular blocks.

6. Repeated assets are substantially less noticeable.

7. Props are grouped into believable environmental compositions.

8. Major props have appropriate secondary dressing.

9. Objects feel grounded rather than placed on top of the surface.

10. Tropical and Desert clearly feel like different biomes while still belonging to the same game.

11. The visual style remains stylized rather than photorealistic.

12. The player's surroundings look substantially more polished at normal gameplay camera distance.

13. The original uploaded furniture/surface remains recognizable.

14. New biomes can be added through the same reusable architecture.

15. Performance remains suitable for interactive gameplay.


==================================================
DECISION PRIORITIES
==================================================

When tradeoffs arise, optimize in this order:

1. Cohesive stylized visual quality
2. Strong silhouettes and reduction of placeholder-looking geometry
3. Gameplay readability
4. Reduced repetition
5. Natural-looking procedural composition
6. Biome identity
7. Performance
8. Extensibility


==================================================
ORCHESTRATOR INSTRUCTIONS
==================================================

Treat this as an environment-system refactor, not merely an asset replacement task.

Break the implementation into coherent worker tasks where useful.

Workers should inspect the existing code before changing architecture.

Do not allow separate workers to independently invent conflicting visual systems for different biomes.

The shared biome framework, rendering assumptions, art direction, and asset conventions must remain consistent across all worker tasks.

Prefer incremental changes that can be visually tested.

After each major phase, verify the result in-game from the normal gameplay camera rather than judging assets only in isolation.

The final result should look like a deliberately art-directed stylized miniature adventure world rather than a prototype populated with low-poly primitives.