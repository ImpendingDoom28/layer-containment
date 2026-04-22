import { create } from "zustand";

import type { EnemyUpgradeId } from "../types/game";
import { countUpgradePicks } from "../../utils/enemyUpgradeTierEffects";
import { pickRandomDistinct } from "../../utils/pickRandomDistinct";

const CHOICE_COUNT = 3;

type UpgradeStoreState = {
  levelEnemyUpgradeStack: EnemyUpgradeId[];
  pendingEnemyUpgradeGate: boolean;
  upgradeChoiceOptions: EnemyUpgradeId[];
};

type UpgradeStoreActions = {
  openEnemyUpgradeGate: (allUpgradeIds: EnemyUpgradeId[]) => boolean;
  confirmEnemyUpgradePick: (id: EnemyUpgradeId) => void;
  resetLevelEnemyUpgrades: () => void;
};

type UpgradeStore = UpgradeStoreState & UpgradeStoreActions;

const DEFAULT_STATE: UpgradeStoreState = {
  levelEnemyUpgradeStack: [],
  pendingEnemyUpgradeGate: false,
  upgradeChoiceOptions: [],
};

export const useUpgradeStore = create<UpgradeStore>((set, get) => ({
  ...DEFAULT_STATE,

  openEnemyUpgradeGate: (allUpgradeIds) => {
    if (allUpgradeIds.length === 0) return false;
    const { levelEnemyUpgradeStack } = get();
    const available = allUpgradeIds.filter(
      (uid) => countUpgradePicks(levelEnemyUpgradeStack, uid) < 3
    );
    if (available.length === 0) return false;
    const upgradeChoiceOptions = pickRandomDistinct(
      available,
      Math.min(CHOICE_COUNT, available.length)
    );
    set({ pendingEnemyUpgradeGate: true, upgradeChoiceOptions });
    return true;
  },

  confirmEnemyUpgradePick: (id) => {
    const { levelEnemyUpgradeStack } = get();
    if (countUpgradePicks(levelEnemyUpgradeStack, id) >= 3) return;
    set({
      levelEnemyUpgradeStack: [...levelEnemyUpgradeStack, id],
      pendingEnemyUpgradeGate: false,
      upgradeChoiceOptions: [],
    });
  },

  resetLevelEnemyUpgrades: () => {
    set({ ...DEFAULT_STATE });
  },
}));

export const levelEnemyUpgradeStackSelector = (state: UpgradeStore) =>
  state.levelEnemyUpgradeStack;
export const pendingEnemyUpgradeGateSelector = (state: UpgradeStore) =>
  state.pendingEnemyUpgradeGate;
export const upgradeChoiceOptionsSelector = (state: UpgradeStore) =>
  state.upgradeChoiceOptions;
export const confirmEnemyUpgradePickSelector = (state: UpgradeStore) =>
  state.confirmEnemyUpgradePick;
export const resetLevelEnemyUpgradesSelector = (state: UpgradeStore) =>
  state.resetLevelEnemyUpgrades;
