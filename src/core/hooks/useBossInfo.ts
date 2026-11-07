import { useQueryFirst, useTrait } from "koota/react";

import { EnemyState, IsBoss } from "../ecs/traits/enemy";

export type BossInfo = {
  name: string;
  health: number;
  maxHealth: number;
};

/**
 * The active level boss: the first live entity carrying `IsBoss` (at most one
 * exists at a time — the boss bar shows it while it is on the field and hides
 * it once it dies). `null` when no boss is present. Reads the `EnemyState`
 * directly, so the bar's health tracks the boss without re-rendering the
 * scene.
 */
export const useBossInfo = (): BossInfo | null => {
  const boss = useQueryFirst(IsBoss);
  const state = useTrait(boss, EnemyState);
  if (!boss || !state) return null;
  return {
    name: state.name,
    health: state.health,
    maxHealth: state.maxHealth,
  };
};
