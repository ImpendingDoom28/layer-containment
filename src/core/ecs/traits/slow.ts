import { trait } from "koota";

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
