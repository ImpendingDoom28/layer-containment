import { trait, type TraitRecord } from "koota";

/**
 * Cold per-enemy animation spec, resolved from `ENEMY_LOCOMOTION` by
 * `spawnEnemy` (bob amplitude already converted from the size ratio to world
 * units, `phase` seeded by the enemy id so a wave never animates in sync).
 * Set once at spawn and never mutated, like `EnemyState`'s cold fields.
 *
 * The renderer (`components/entities/EnemyLocomotion`) animates the body
 * purely from this trait — it never branches on enemy type or model — and
 * the EnemyDeathSystem reads `deathPreburstSeconds` from here to hold a dead
 * enemy back for its squash-stretch anticipation. A zero channel is off.
 */
export const EnemyLocomotion = trait({
  phase: 0,
  /** Hover bob: vertical sine offset amplitude in world units. */
  bobAmplitude: 0,
  bobFrequency: 0,
  /** Breathing loop: scale oscillation amplitude (0.03 = ±3%). */
  breathAmplitude: 0,
  breathFrequency: 0,
  /** Biped walk: hip swing amplitude in radians and frequency in rad/s. */
  walkAmplitude: 0,
  walkFrequency: 0,
  /** Death anticipation: seconds the dead entity lingers for squash-stretch. */
  deathPreburstSeconds: 0,
});

export type EnemyLocomotionData = TraitRecord<typeof EnemyLocomotion>;
