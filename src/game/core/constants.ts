/**
 * Runtime tuning that is NOT part of the shared `MovementConfig` contract.
 *
 * `shared/movement.ts` owns the numbers a designer would retune per tuning
 * set (speed, jump height, mantle envelope, camera framing). The values
 * here are implementation details of this controller — solver offsets,
 * input forgiveness windows, and safety margins. Anything expressed as a
 * `_RATIO` is a multiple of `MovementConfig.characterRadius` so the feel
 * stays coherent if the toy capsule is ever resized.
 */

/** Grace period after walking off a ledge during which a jump still fires. */
export const COYOTE_TIME_SECONDS = 0.12;

/** How early a jump press is remembered before landing. */
export const JUMP_BUFFER_SECONDS = 0.12;

/**
 * Rapier character-controller skin width. Must be non-zero for numerical
 * stability but small enough that the character never visibly hovers.
 */
export const CONTROLLER_OFFSET_RATIO = 0.06;

/** Small obstacles the controller steps over instead of being stopped by. */
export const AUTOSTEP_MAX_HEIGHT_RATIO = 0.55;
export const AUTOSTEP_MIN_WIDTH_RATIO = 0.25;

/** Keeps the capsule stuck to the floor over bumps and downward slopes. */
export const SNAP_TO_GROUND_RATIO = 0.5;

export const MAX_SLOPE_CLIMB_RADIANS = (50 * Math.PI) / 180;
export const MIN_SLOPE_SLIDE_RADIANS = (45 * Math.PI) / 180;

/**
 * Small constant downward speed applied while grounded. Without it the
 * controller alternates between grounded and airborne on flat ground and
 * the capsule visibly jitters.
 */
export const GROUND_STICK_SPEED = 0.5;

/** A surface is standable when its normal is at least this vertical. */
export const MIN_STANDABLE_NORMAL_Y = Math.cos(MAX_SLOPE_CLIMB_RADIANS);

/** A surface counts as a climbable wall face when its normal is this flat. */
export const MAX_LEDGE_FACE_NORMAL_Y = 0.6;

/** Total duration of the scripted mantle movement. */
export const MANTLE_DURATION_SECONDS = 0.3;

/** Fraction of the mantle spent rising before moving forward. */
export const MANTLE_VERTICAL_FRACTION = 0.45;

/** Mantle availability is re-probed every N fixed steps (not every step). */
export const MANTLE_PROBE_INTERVAL_STEPS = 3;

/** Extra gap left above a mantle destination surface when placing the capsule. */
export const MANTLE_LANDING_SKIN = 0.02;

/** How far past the ledge face the capsule is placed, as a ratio of radius. */
export const MANTLE_LANDING_INSET_RATIO = 1.5;

/** Respawn trigger: this far below the lowest collision surface. */
export const FALL_MARGIN_METERS = 3;

/** Respawn trigger: this far outside the scene's horizontal bounds. */
export const HORIZONTAL_BOUNDS_MARGIN_METERS = 10;

/**
 * Longest real frame delta fed to the fixed-step accumulator. A tab that
 * was backgrounded must not try to catch up thousands of steps at once.
 */
export const MAX_FRAME_DELTA_SECONDS = 0.25;

/** Closest the third-person camera may be pulled in by collision. */
export const CAMERA_MIN_DISTANCE_RATIO = 1.6;

/** Camera looks at the capsule centre raised by this ratio of radius. */
export const CAMERA_TARGET_LIFT_RATIO = 0.7;

/** How quickly the camera eases back out after a collision clears (1/s). */
export const CAMERA_EXTEND_RATE = 6;

/** Radians of yaw/pitch per pixel of pointer movement. */
export const MOUSE_SENSITIVITY = 0.0022;

/** How quickly the avatar turns to face its movement direction (1/s). */
export const AVATAR_TURN_RATE = 14;
