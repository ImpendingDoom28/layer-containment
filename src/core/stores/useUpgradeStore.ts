import { create } from "zustand";

import type { EnemyUpgradeId } from "../types/game";
import { pickRandomDistinct } from "../../utils/pickRandomDistinct";

const CHOICE_COUNT = 3;

type UpgradeStoreState = {
  levelEnemyUpgradeStack: EnemyUpgradeId[];
  pendingEnemyUpgradeGate: boolean;
  upgradeChoiceOptions: EnemyUpgradeId[];
};

type UpgradeStoreActions = {
  openEnemyUpgradeGate: (allUpgradeIds: EnemyUpgradeId[]) => void;
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
    if (allUpgradeIds.length === 0) return;
    const upgradeChoiceOptions = pickRandomDistinct(
      allUpgradeIds,
      Math.min(CHOICE_COUNT, allUpgradeIds.length)
    );
    set({ pendingEnemyUpgradeGate: true, upgradeChoiceOptions });
  },

  confirmEnemyUpgradePick: (id) => {
    const { levelEnemyUpgradeStack } = get();
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
