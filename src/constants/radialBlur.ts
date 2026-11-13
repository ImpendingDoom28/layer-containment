/**
 * Radial (camera-move) blur: a light, continuous radial smear while the player
 * moves the camera, growing with the turn speed, so the view feels like it has
 * momentum instead of teleporting. Driven by the camera's per-frame angular
 * velocity; the blur eases in within ~1–2 frames and eases out a touch slower
 * as the camera settles. Off under `prefers-reduced-motion` and via the
 * "Motion blur (camera)" quality setting.
 */
/**
 * Peak radial smear, in screen-space UV offset (a fraction of the viewport
 * half-width). ~0.01 ≈ a 0.9° smear at a default 40° fov — subtle on purpose:
 * the blur should read as motion, not as a lens effect.
 */
export const RADIAL_BLUR_MAX_OFFSET_UV = 0.01;

/**
 * Camera angular velocity (radians/s, ~17°/s) below which no blur is applied.
 * Set low on purpose: any real camera move should show a hint of the smear;
 * only a near-still camera (micro-drift, a very slow pan) stays fully crisp.
 */
export const RADIAL_BLUR_VELOCITY_THRESHOLD_RAD_S = 0.3;

/**
 * Camera angular velocity (radians/s, ~229°/s) at which the smear reaches its
 * peak offset. Smoothstep between the threshold and this value maps velocity to
 * blur strength, so the ramp is gentle near the threshold and saturates for a
 * hard flick.
 */
export const RADIAL_BLUR_VELOCITY_MAX_RAD_S = 4.0;

/**
 * Attack time-constant (1/s): how quickly the smear builds while the camera is
 * still moving. ~0.055s ≈ 3 frames at 60 fps.
 */
export const RADIAL_BLUR_ATTACK_LAMBDA = 18;

/**
 * Release time-constant (1/s): how quickly the smear decays once the camera
 * stops. Slower than the attack so the tail lingers ~1–2 frames (≈0.09s ≈ 5
 * frames) before the view snaps crisp.
 */
export const RADIAL_BLUR_RELEASE_LAMBDA = 9;

/**
 * Strength below which the effect is treated as off (the pass skips its
 * per-pixel work).
 */
export const RADIAL_BLUR_STRENGTH_EPSILON = 0.015;
