import { trait, type TraitRecord } from "koota";

import type { EnemyType, TowerType } from "../../types/game";

export type TowerTypeTotals = Partial<Record<TowerType, number>>;
export type EnemyKillsByType = Partial<Record<EnemyType, number>>;
export type KillsByTowerType = Partial<Record<TowerType, EnemyKillsByType>>;

/** Tags the per-run stats entity (spawned on run start, destroyed on end). */
export const IsStats = trait();

const createTowerTypeTotals = (): TowerTypeTotals => ({});
const createKillsByTowerType = (): KillsByTowerType => ({});

/**
 * Per-tower-type damage dealt during the run. AoS so the stats system can
 * fold receipts in by mutating the record and signalling `changed()`.
 */
export const DamageByTowerType = trait(createTowerTypeTotals);

/**
 * Per-tower-type money spent (purchases only — sells don't subtract, and
 * pre-placed config towers cost the player nothing).
 */
export const SpendByTowerType = trait(createTowerTypeTotals);

/**
 * Total money earned during the run (kill rewards only; starting money and
 * tower sells are excluded).
 */
export const MoneyEarned = trait({ total: 0 });
export type MoneyEarnedData = TraitRecord<typeof MoneyEarned>;

/** Kills by tower type, broken down by enemy type (last hit credits the kill). */
export const KillsByTowerType = trait(createKillsByTowerType);

/**
 * Receipt for a settled damage hit. One entity per hit (never merged), so
 * per-source attribution survives multiple towers striking the same enemy on
 * the same frame. `amount` is the effective damage (clamped at 0); `killed`
 * marks the final hit.
 */
export type DamageDealtRequestData = {
  towerType: TowerType;
  enemyType: EnemyType;
  amount: number;
  killed: boolean;
};

export const damageDealtRequest = trait<DamageDealtRequestData>({
  towerType: "basic",
  enemyType: "basic",
  amount: 0,
  killed: false,
});

/** Receipt for kill rewards collected this run. */
export type MoneyEarnedRequestData = {
  amount: number;
};

export const moneyEarnedRequest = trait<MoneyEarnedRequestData>({
  amount: 0,
});

/** Receipt for a tower purchase. */
export type MoneySpentRequestData = {
  towerType: TowerType;
  amount: number;
};

export const moneySpentRequest = trait<MoneySpentRequestData>({
  towerType: "basic",
  amount: 0,
});
