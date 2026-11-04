/**
 * Computes the gold a spawned enemy pays. The base reward is scaled by the
 * product of the picked upgrades' per-tier reward multipliers, then rounded.
 *
 * Stacked negative gold multipliers can round a positive base reward down to
 * zero (e.g. a full stack of negative-reward upgrades), which would starve the
 * player's economy. Positive-reward enemies therefore pay at least 1 gold.
 * Zero-reward enemies (splitter shrapnel) keep their intended 0, since their
 * base reward is 0.
 */
export const computeSpawnedReward = (
  baseReward: number,
  rewardMultiplier: number
): number => {
  let reward = Math.round(baseReward * rewardMultiplier);
  if (baseReward > 0 && reward < 1) {
    reward = 1;
  }
  return reward;
};
