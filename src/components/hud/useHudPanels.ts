import { useMemo } from "react";

import {
  denyPulseSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerTypeToPlaceSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  nextWaveReadySelector,
  useWaveStore,
} from "../../core/stores/useWaveStore";
import {
  totalWavesSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type { TowerConfig, TowerType } from "../../core/types/game";

export type TowerShopEntry = {
  tower: TowerConfig;
  cost: number;
  canAfford: boolean;
  isSelected: boolean;
};

export type TowerShopState = {
  money: number;
  entries: TowerShopEntry[];
  hasSelection: boolean;
  denyPulse: Partial<Record<TowerType, number>>;
  onSelect: (towerType: TowerType) => void;
  onCancelSelection: () => void;
};

/**
 * All state + intent for the tower shop panel. Shared by every HUD theme
 * variant so the themes stay pure presentation.
 */
export const useHudShopState = (money: number): TowerShopState => {
  const setSelectedTowerType = useGameStore(
    setSelectedTowerTypeToPlaceSelector
  );
  const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
  const denyPulse = useGameStore(denyPulseSelector);
  const towerTypes = useGameStore(towerTypesSelector);

  const entries = useMemo(() => {
    const values = Object.values(towerTypes ?? {}).sort(
      (a, b) => a.cost - b.cost
    );
    return values.map((tower) => ({
      tower,
      cost: tower.cost,
      canAfford: money >= tower.cost,
      isSelected: selectedTowerType === tower.id,
    }));
  }, [towerTypes, money, selectedTowerType]);

  const onSelect = (towerType: TowerType) => {
    const entry = entries.find((e) => e.tower.id === towerType);
    if (entry?.isSelected) {
      setSelectedTowerType(null);
    } else if (entry?.canAfford) {
      setSelectedTowerType(towerType);
    }
  };

  const onCancelSelection = () => {
    setSelectedTowerType(null);
  };

  return {
    money,
    entries,
    hasSelection: selectedTowerType !== null,
    denyPulse,
    onSelect,
    onCancelSelection,
  };
};

export type HudStatsState = {
  money: number;
  health: number;
  maxHealth: number;
  currentWave: number;
  totalWaves: number;
  remainingEnemies: number;
  showEnemies: boolean;
  showStartWave: boolean;
  isPaused: boolean;
  onStartWave: () => void;
};

/**
 * All state for the game stats panel, derived once so the five theme
 * variants render identical data.
 */
export const useHudStatsState = (props: {
  money: number;
  health: number;
  currentWave: number;
  remainingEnemies: number;
  isPaused: boolean;
  onStartWave: () => void;
}): HudStatsState => {
  const totalWaves = useLevelStore(totalWavesSelector);
  const nextWaveReady = useWaveStore(nextWaveReadySelector);
  const maxHealth = useGameStore((state) => state.startingHealth);

  const resolvedMaxHealth = maxHealth > 0 ? maxHealth : 20;

  return {
    money: props.money,
    health: props.health,
    maxHealth: resolvedMaxHealth,
    currentWave: props.currentWave,
    totalWaves,
    remainingEnemies: props.remainingEnemies,
    showEnemies:
      props.currentWave > 0 &&
      props.currentWave <= totalWaves &&
      props.remainingEnemies > 0,
    showStartWave:
      props.currentWave < totalWaves && nextWaveReady && !props.isPaused,
    isPaused: props.isPaused,
    onStartWave: props.onStartWave,
  };
};
