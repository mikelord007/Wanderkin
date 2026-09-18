# src/scene — Scene preparation (owner: Scene preparation worker, Opus)

GLB import, bounds/orientation inspection, rotate/scale/floor-alignment
calibration, collider generation, surface sampling, and course
candidate/validation logic. Produces and edits `SceneManifest` data
(`shared/manifest.ts`); does not depend on provider job shapes directly.
