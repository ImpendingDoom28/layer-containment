import type { World } from "koota";

import {
  DamageByTowerType,
  KillsByTowerType,
  IsStats,
  MoneyEarned,
  SpendByTowerType,
  damageDealtRequest,
  moneyEarnedRequest,
  moneySpentRequest,
} from "../traits/stats";

/**
 * Consumes pending damage/spend/earn receipt entities and folds them into
 * the `IsStats` entity, then destroys the receipts. Mirrors
 * `runApplyEffectSystem` (collect, consume, destroy). When no stats entity
 * exists (main menu), nothing is recorded.
 */
export const runStatsSystem = (world: World): void => {
  const statsEntity = world.queryFirst(IsStats);
  if (!statsEntity) return;

  const damageReceipts = world.query(damageDealtRequest);
  const spendReceipts = world.query(moneySpentRequest);
  const earnReceipts = world.query(moneyEarnedRequest);

  if (damageReceipts.length === 0 && spendReceipts.length === 0 && earnReceipts.length === 0) {
    return;
  }

  const damage = statsEntity.get(DamageByTowerType)!;
  const spend = statsEntity.get(SpendByTowerType)!;
  const kills = statsEntity.get(KillsByTowerType)!;
  // SoA trait: `get()` returns a per-entity snapshot, so accumulate the total
  // locally and write it back with `set()` (which signals the change).
  let earnedTotal = statsEntity.get(MoneyEarned)!.total;

  let damageDirty = false;
  let spendDirty = false;
  let earnedDirty = false;
  let killsDirty = false;

  for (const entity of damageReceipts) {
    const receipt = entity.get(damageDealtRequest);
    if (receipt) {
      damage[receipt.towerType] = (damage[receipt.towerType] ?? 0) + receipt.amount;
      damageDirty = true;

      if (receipt.killed) {
        const perTower = kills[receipt.towerType] ?? {};
        perTower[receipt.enemyType] = (perTower[receipt.enemyType] ?? 0) + 1;
        kills[receipt.towerType] = perTower;
        killsDirty = true;
      }
    }
    entity.destroy();
  }

  for (const entity of spendReceipts) {
    const receipt = entity.get(moneySpentRequest);
    if (receipt) {
      spend[receipt.towerType] = (spend[receipt.towerType] ?? 0) + receipt.amount;
      spendDirty = true;
    }
    entity.destroy();
  }

  for (const entity of earnReceipts) {
    const receipt = entity.get(moneyEarnedRequest);
    if (receipt) {
      earnedTotal += receipt.amount;
      earnedDirty = true;
    }
    entity.destroy();
  }

  if (damageDirty) {
    statsEntity.changed(DamageByTowerType);
  }
  if (spendDirty) {
    statsEntity.changed(SpendByTowerType);
  }
  if (earnedDirty) {
    statsEntity.set(MoneyEarned, { total: earnedTotal });
  }
  if (killsDirty) {
    statsEntity.changed(KillsByTowerType);
  }
};
