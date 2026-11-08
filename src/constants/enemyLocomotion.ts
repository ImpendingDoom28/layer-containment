// Idle/death locomotion animation tunables for enemy bodies. All animations
// are driven on the pause-aware simulation clock, so they freeze with the
// game and speed up with the time scale. Durations are in simulation
// seconds, frequencies in rad/s, amplitudes in radians or scale units.

// Wraith (fast): the drone hovers, bobbing vertically as it travels.
export const WRAITH_BOB_AMPLITUDE_RATIO = 0.12; // of the body radius
export const WRAITH_BOB_FREQUENCY = 7;

// Tankee (tank): the armor plates sit loose on the chassis and wobble.
export const TANKEE_PLATE_WOBBLE_AMPLITUDE = 0.05; // radians (~3°)
export const TANKEE_PLATE_WOBBLE_FREQUENCY = 5.5;

// Splitter: the cell colony breathes like a creature (±3% scale).
export const SPLITTER_BREATH_AMPLITUDE = 0.03;
export const SPLITTER_BREATH_FREQUENCY = 3.4;

// Splitter death: the colony lingers this long after the killing blow while
// the renderer plays the squash-stretch anticipation, then bursts (the split
// children and the death burst spawn at the end of the window, so the pop
// and the shrapnel land together).
export const SPLITTER_DEATH_PREBURST_SECONDS = 0.28;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number): number => t * t * t;

/** Fraction of the pre-burst spent squashing down before the upward stretch. */
const SQUASH_PHASE = 0.45;

/**
 * Squash-stretch scale curve for the splitter's death anticipation.
 * Progress 0→0.45 squashes the colony down and wide (winding up), 0.45→1
 * stretches it up and narrow (launching into the burst). Returns scale
 * multipliers for the vertical axis and both horizontal axes.
 */
export const getSplitterDeathSquashScale = (
  progress: number
): { y: number; xz: number } => {
  const p = Math.min(1, Math.max(0, progress));
  if (p < SQUASH_PHASE) {
    const t = easeOutCubic(p / SQUASH_PHASE);
    return { y: 1 - 0.38 * t, xz: 1 + 0.22 * t };
  }
  const t = easeInCubic((p - SQUASH_PHASE) / (1 - SQUASH_PHASE));
  return { y: 0.62 + 0.78 * t, xz: 1.22 - 0.5 * t };
};

/** Deterministic per-enemy animation phase so a wave never bobs in sync. */
export const getLocomotionPhase = (seed: number): number =>
  (seed * 2.399963) % (Math.PI * 2);
