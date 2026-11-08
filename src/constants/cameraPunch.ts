/**
 * Micro camera punch for big events: a tiny kick when an AoE / rocket
 * explosion lands, and a slightly stronger, red-tinted one when the base
 * takes damage. Reuses the denied-action camera shake machinery in
 * `GameCamera` (the same decaying shake offset) at a much smaller amplitude
 * over a longer window, so it reads as a camera "punch" rather than a shake.
 *
 * Amplitudes are in world units (the denied shake uses 0.09). At the default
 * camera distance (~25 units from the field) 0.05 is the smallest kick that
 * still reads clearly, so the explosion uses that and the base damage is
 * ~1.5× it — noticeable, never nauseating.
 */

export const CAMERA_PUNCH_EXPLOSION_DURATION_MS = 150;
export const CAMERA_PUNCH_EXPLOSION_AMPLITUDE = 0.05;

export const CAMERA_PUNCH_BASE_DAMAGE_DURATION_MS = 220;
export const CAMERA_PUNCH_BASE_DAMAGE_AMPLITUDE = 0.07;

/** Fallback world position for punches without a hit location (the field center). */
export const CAMERA_PUNCH_ORIGIN = { x: 0, y: 0, z: 0 } as const;
