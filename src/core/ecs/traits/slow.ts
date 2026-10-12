import { trait, type TraitRecord } from "koota";

/**
 * Pending slow request, raised on discrete events (a slow tower's projectile
 * hit) by the `slowEnemy` action and consumed by the ApplySlowSystem.
 *
 * `multiplier` is the resistance-adjusted slow strength (1 = no effect);
 * `expiresAt` is the pause-adjusted simulation timestamp at which the slow
 * expires. Same-frame requests merge: the last hit wins the strength and the
 * expiry is the latest, so a refresh never shortens an active slow.
 */
export const slowRequest = trait({
  multiplier: 1,
  expiresAt: 0,
});

/**
 * An active slow on an enemy. Present only while a slow is in effect; the
 * ApplySlowSystem adds it when a pending request is consumed and removes it
 * once the slow expires.
 *
 * Kept in its own trait (rather than `EnemyState`) so slow application and
 * expiry are handled entirely by the slow systems: an enemy that is never
 * slowed never carries it, and expiry is a plain trait removal.
 *
 * `multiplier` is the resistance-adjusted slow strength (1 = no effect);
 * `until` is the pause-adjusted simulation timestamp at which the slow
 * expires.
 */
export const EnemySlow = trait({
  multiplier: 1,
  until: 0,
});

export type EnemySlowData = TraitRecord<typeof EnemySlow>;
