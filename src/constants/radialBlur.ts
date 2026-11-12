/**
 * Radial (camera-move) blur: a short burst of radial smearing when the player
 * yanks the camera, so the view feels like it has momentum instead of
 * teleporting. Driven by the camera's per-frame angular velocity; the blur
 * eases in within ~1–2 frames and eases out a touch slower as the camera
 * settles. Off under `prefers-reduced-motion`.
 */
/**
 * Peak radial smear, in screen-space UV offset (a fraction of the viewport
 * half-width). ~0.02 ≈ a 1.8° smear at a default 40° fov — visible but subtle.
 */
export const RADIAL_BLUR_MAX_OFFSET_UV = 0.02;

/**
 * Camera angular velocity (radians/s, ~57°/s) below which no blur is applied.
 * A deliberate turn stays crisp; only a faster yank trips the effect.
 */
export const RADIAL_BLUR_VELOCITY_THRESHOLD_RAD_S = 1.0;

/**
 * Camera angular velocity (radians/s, ~344°/s) at which the smear reaches its
 * peak offset. Smoothstep between the threshold and this value maps velocity to
 * blur strength, so the ramp is gentle near the threshold and saturates for a
 * hard flick.
 */
export const RADIAL_BLUR_VELOCITY_MAX_RAD_S = 6.0;

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
