/**
 * The last-enemy slow-mo beat: when a wave's field clears, the world eases
 * down to `SLOW_MO_RATE` of real time for `SLOW_MO_BEAT_SECONDS` of wall time
 * before the upgrade gate opens, so the wave's end lands with a beat. Both
 * the wave system's completion delay and the simulation clock read these, so
 * the beat's length and the extra simulation time it adds always agree.
 */
export const SLOW_MO_BEAT_SECONDS = 0.25;
export const SLOW_MO_RATE = 0.3;
