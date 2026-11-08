/**
 * Micro camera punch for big events: a tiny kick when an AoE / rocket
 * explosion lands, and a slightly stronger, red-tinted one when the base
 * takes damage. Reuses the denied-action camera shake machinery in
 * `GameCamera` (the same decaying shake offset) at a much smaller amplitude
 * over a longer window, so it reads as a camera "punch" rather than a shake.
 *
 * Amplitudes are in world units (the denied shake uses 0.09). Base damage is
 * ~1.5× the explosion kick — noticeable, never nauseating.
 */

export const CAMERA_PUNCH_EXPLOSION_DURATION_MS = 160;
export const CAMERA_PUNCH_EXPLOSION_AMPLITUDE = 0.022;

export const CAMERA_PUNCH_BASE_DAMAGE_DURATION_MS = 240;
export const CAMERA_PUNCH_BASE_DAMAGE_AMPLITUDE = 0.036;

/** Fallback world position for punches without a hit location (the field center). */
export const CAMERA_PUNCH_ORIGIN = { x: 0, y: 0, z: 0 } as const;
