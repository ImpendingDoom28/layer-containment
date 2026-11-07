import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { EnemyType } from "../types/game";

import { GAME_NAME_ID } from "../../constants/game";

type AlmanacStoreState = {
  discoveredEnemies: EnemyType[];
  /** Boss names the player has met in battle (persisted across sessions). */
  discoveredBosses: string[];
};

type AlmanacStoreActions = {
  discoverEnemy: (type: EnemyType) => void;
  discoverBoss: (name: string) => void;
  isDiscovered: (type: EnemyType) => boolean;
  resetDiscoveries: () => void;
};

type AlmanacStore = AlmanacStoreState & AlmanacStoreActions;

const DEFAULT_STATE: AlmanacStoreState = {
  discoveredEnemies: [],
  discoveredBosses: [],
};

export const useAlmanacStore = create<AlmanacStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      discoverEnemy: (type: EnemyType) => {
        const { discoveredEnemies, isDiscovered } = get();
        if (!isDiscovered(type)) {
          set({ discoveredEnemies: [...discoveredEnemies, type] });
        }
      },

      discoverBoss: (name: string) => {
        const { discoveredBosses } = get();
        if (!discoveredBosses.includes(name)) {
          set({ discoveredBosses: [...discoveredBosses, name] });
        }
      },

      isDiscovered: (type: EnemyType) => {
        return get().discoveredEnemies.includes(type);
      },

      resetDiscoveries: () => {
        set({ discoveredEnemies: [], discoveredBosses: [] });
      },
    }),
    {
      name: `${GAME_NAME_ID}-almanac`,
    }
  )
);

export const discoveredEnemiesSelector = (state: AlmanacStore) =>
  state.discoveredEnemies;
export const discoveredBossesSelector = (state: AlmanacStore) =>
  state.discoveredBosses;
export const discoverEnemySelector = (state: AlmanacStore) =>
  state.discoverEnemy;
export const isDiscoveredSelector = (state: AlmanacStore) => state.isDiscovered;
export const resetDiscoveriesSelector = (state: AlmanacStore) =>
  state.resetDiscoveries;
