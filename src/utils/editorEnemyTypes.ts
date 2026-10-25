import type { EnemyConfig, EnemyType } from "../core/types/game";

export const FALLBACK_ENEMY_TYPES: EnemyType[] = [
  "basic",
  "fast",
  "tank",
  "medic",
  "splitter",
];

export const getEnemyTypeOptions = (
  enemyTypes: Record<EnemyType, EnemyConfig> | null,
): EnemyType[] => {
  if (!enemyTypes) return FALLBACK_ENEMY_TYPES;
  return Object.keys(enemyTypes) as EnemyType[];
};
