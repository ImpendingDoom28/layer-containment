import { create } from "zustand";

import type { EnemyType } from "../types/game";
import type { QuestConfig, QuestCounters } from "../types/quests";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";

type EnemyKilledData = {
  enemyId: number;
  enemyType: EnemyType;
  reward: number;
};

const EMPTY_COUNTERS: QuestCounters = {
  leaks: 0,
  victory: false,
  wavesStarted: 0,
  towersPlaced: 0,
  towersSold: 0,
  kills: 0,
  killsByType: {},
  totalGoldEarned: 0,
};

type QuestStoreState = {
  /** The level's declarative quest definitions (main + additional). */
  quests: QuestConfig[];
  /** Live counters accumulated from gameplay events for the current run. */
  counters: QuestCounters;
  setQuests: (quests: QuestConfig[]) => void;
  /** Resets the quest definitions and all counters (a new run or level load). */
  resetQuests: () => void;
};

type QuestStore = QuestStoreState;

export const useQuestStore = create<QuestStore>((set) => ({
  quests: [],
  counters: EMPTY_COUNTERS,

  setQuests: (quests) => {
    set({ quests, counters: EMPTY_COUNTERS });
  },

  resetQuests: () => {
    set({ quests: [], counters: EMPTY_COUNTERS });
  },
}));

export const questsSelector = (state: QuestStore) => state.quests;
export const questCountersSelector = (state: QuestStore) => state.counters;
export const setQuestsSelector = (state: QuestStore) => state.setQuests;
export const resetQuestsSelector = (state: QuestStore) => state.resetQuests;

let listenersConnected = false;

/**
 * Connects the quest store to the game event stream. Every counter has one
 * event source — the same events the combat juice, stats, and audio systems
 * already consume — so quests need no ECS of their own and levels stay pure
 * data. Idempotent: the global `gameEvents` outlives any mount, so the
 * listeners are registered once per page and never torn down.
 */
export const connectQuestCounters = (): void => {
  if (listenersConnected) return;
  listenersConnected = true;

  const bump = (
    update: (counters: QuestCounters) => Partial<QuestCounters>
  ): void => {
    useQuestStore.setState((state) => ({
      counters: { ...state.counters, ...update(state.counters) },
    }));
  };

  gameEvents.on(GameEvent.WAVE_STARTED, () => {
    bump((counters) => ({ wavesStarted: counters.wavesStarted + 1 }));
  });

  gameEvents.on<EnemyKilledData>(GameEvent.ENEMY_KILLED, (data) => {
    bump((counters) => ({
      kills: counters.kills + 1,
      killsByType: {
        ...counters.killsByType,
        [data.enemyType]: (counters.killsByType[data.enemyType] ?? 0) + 1,
      },
    }));
  });

  gameEvents.on(GameEvent.ENEMY_REACHED_END, () => {
    bump((counters) => ({ leaks: counters.leaks + 1 }));
  });

  gameEvents.on(GameEvent.TOWER_PLACED, () => {
    bump((counters) => ({ towersPlaced: counters.towersPlaced + 1 }));
  });

  gameEvents.on(GameEvent.TOWER_SOLD, () => {
    bump((counters) => ({ towersSold: counters.towersSold + 1 }));
  });

  // `MONEY_CHANGED.amount` is the new balance, not the gain, so the "earned
  // gold" counter sums `MONEY_EARNED` (the gain itself) instead.
  gameEvents.on<{ amount: number }>(GameEvent.MONEY_EARNED, (data) => {
    bump((counters) => ({
      totalGoldEarned: counters.totalGoldEarned + data.amount,
    }));
  });

  gameEvents.on(GameEvent.GAME_WON, () => {
    bump(() => ({ victory: true }));
  });
};
