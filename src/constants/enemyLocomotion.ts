import type { EnemyType } from "../core/types/game";

// Idle/death locomotion animation tunables for enemy bodies. The spec map
// below is the single place that decides *which* enemy type animates *how*;
// `spawnEnemy` resolves it onto the entity's `EnemyLocomotion` trait, and the
// renderer (`EnemyLocomotion`) animates purely from that trait — neither side
// knows about enemy types or models. All animations are driven on the
// pause-aware simulation clock, so they freeze with the game and speed up
// with the time scale. Durations are in simulation seconds, frequencies in
// rad/s, amplitudes in world units, scale units, or radians.

// Troop: alternating leg swings around the model's hip pivots.
export const TROOP_WALK_AMPLITUDE = 0.55;
export const TROOP_WALK_FREQUENCY = 9.5;

// Wraith (fast): the drone hovers, bobbing vertically as it travels.
export const WRAITH_BOB_AMPLITUDE_RATIO = 0.12; // of the body radius
export const WRAITH_BOB_FREQUENCY = 7;

// Splitter: the cell colony breathes like a creature (±3% scale).
export const SPLITTER_BREATH_AMPLITUDE = 0.03;
export const SPLITTER_BREATH_FREQUENCY = 3.4;

// Splitter death: the colony lingers this long after the killing blow while
// the renderer plays the squash-stretch anticipation, then bursts (the split
// children and the death burst spawn at the end of the window, so the pop
// and the shrapnel land together).
export const SPLITTER_DEATH_PREBURST_SECONDS = 0.28;

/**
 * Per-type animation recipe. `bobAmplitudeRatio` is relative to the body
 * radius (resolved to world units at spawn, when the size is known); the rest
 * are absolute. A zero channel is off.
 */
export type EnemyLocomotionSpec = {
  bobAmplitudeRatio: number;
  bobFrequency: number;
  breathAmplitude: number;
  breathFrequency: number;
  walkAmplitude: number;
  walkFrequency: number;
  deathPreburstSeconds: number;
};

const NO_LOCOMOTION: EnemyLocomotionSpec = {
  bobAmplitudeRatio: 0,
  bobFrequency: 0,
  breathAmplitude: 0,
  breathFrequency: 0,
  walkAmplitude: 0,
  walkFrequency: 0,
  deathPreburstSeconds: 0,
};

export const ENEMY_LOCOMOTION: Record<EnemyType, EnemyLocomotionSpec> = {
  basic: {
    ...NO_LOCOMOTION,
    walkAmplitude: TROOP_WALK_AMPLITUDE,
    walkFrequency: TROOP_WALK_FREQUENCY,
  },
  medic: NO_LOCOMOTION,
  tank: NO_LOCOMOTION,
  fast: {
    ...NO_LOCOMOTION,
    bobAmplitudeRatio: WRAITH_BOB_AMPLITUDE_RATIO,
    bobFrequency: WRAITH_BOB_FREQUENCY,
  },
  splitter: {
    ...NO_LOCOMOTION,
    breathAmplitude: SPLITTER_BREATH_AMPLITUDE,
    breathFrequency: SPLITTER_BREATH_FREQUENCY,
    deathPreburstSeconds: SPLITTER_DEATH_PREBURST_SECONDS,
  },
};

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t: number): number => t * t * t;

/** Fraction of the pre-burst spent squashing down before the upward stretch. */
const SQUASH_PHASE = 0.45;

/**
 * Squash-stretch scale curve for a death anticipation. Progress 0→0.45
 * squashes the body down and wide (winding up), 0.45→1 stretches it up and
 * narrow (launching into the burst). Returns scale multipliers for the
 * vertical axis and both horizontal axes.
 */
export const getDeathSquashScale = (
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
