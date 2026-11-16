/**
 * Radial (camera-move) blur: a light, continuous radial smear while the player
 * moves the camera in any direction (panning with WASD, or rotating with a
 * mouse-drag), growing with the move speed, so the view feels like it has
 * momentum instead of teleporting. Driven by the camera's per-frame linear and
 * angular velocity; the blur eases in within ~1–2 frames and eases out a touch
 * slower as the camera settles. Off under `prefers-reduced-motion` and via the
 * "Motion blur (camera)" quality setting.
 */
/**
 * Peak radial smear, in screen-space UV offset (a fraction of the viewport
 * half-width). ~0.01 ≈ a 0.9° smear at a default 40° fov — subtle on purpose:
 * the blur should read as motion, not as a lens effect.
 */
export const RADIAL_BLUR_MAX_OFFSET_UV = 0.01;

/**
 * Camera linear speed (world units/s) below which no blur is applied. Set low
 * on purpose: any real pan (WASD / touch D-pad) should show a hint of the
 * smear; only a near-still camera stays fully crisp. (The game's camera move
 * speed is ~10 u/s at full throttle.) A punch/shake jolt is a one-frame ~3–4
 * u/s spike, so it reads as a brief, modest smear — the camera reacting to
 * impact — rather than a full blur.
 */
export const RADIAL_BLUR_LINEAR_THRESHOLD_UNITS_S = 0.3;

/**
 * Camera linear speed (world units/s) at which the smear reaches its peak
 * offset from panning alone. Slightly below the full-throttle pan speed (10)
 * so a hard pan saturates the ramp.
 */
export const RADIAL_BLUR_LINEAR_MAX_UNITS_S = 8.0;

/**
 * Camera angular velocity (radians/s, ~17°/s) below which no blur is applied
 * from rotation alone. Set low on purpose: any real turn should show a hint
 * of the smear; only a near-still camera stays fully crisp.
 */
export const RADIAL_BLUR_ANGULAR_THRESHOLD_RAD_S = 0.3;

/**
 * Camera angular velocity (radians/s, ~229°/s) at which the smear reaches its
 * peak offset from turning alone.
 */
export const RADIAL_BLUR_ANGULAR_MAX_RAD_S = 4.0;

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
