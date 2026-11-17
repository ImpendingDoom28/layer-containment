import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";
import { connectQuestCounters, useQuestStore } from "./useQuestStore";

const state = () => useQuestStore.getState();

describe("useQuestStore + connectQuestCounters", () => {
  beforeEach(() => {
    state().resetQuests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("counts every live counter from its game event", () => {
    connectQuestCounters();

    gameEvents.emit(GameEvent.WAVE_STARTED);
    gameEvents.emit(GameEvent.WAVE_STARTED);
    gameEvents.emit(GameEvent.ENEMY_KILLED, {
      enemyId: 1,
      enemyType: "tank",
      reward: 25,
    });
    gameEvents.emit(GameEvent.ENEMY_KILLED, {
      enemyId: 2,
      enemyType: "fast",
      reward: 5,
    });
    gameEvents.emit(GameEvent.ENEMY_REACHED_END);
    gameEvents.emit(GameEvent.TOWER_PLACED);
    gameEvents.emit(GameEvent.TOWER_SOLD);
    gameEvents.emit(GameEvent.MONEY_CHANGED, { amount: 50, direction: "increase" });
    gameEvents.emit(GameEvent.MONEY_CHANGED, { amount: 30, direction: "decrease" });
    gameEvents.emit(GameEvent.GAME_WON);

    expect(state().counters).toEqual({
      leaks: 1,
      victory: true,
      wavesStarted: 2,
      towersPlaced: 1,
      towersSold: 1,
      kills: 2,
      killsByType: { tank: 1, fast: 1 },
      totalGoldEarned: 50,
    });
  });

  it("ignores money spends for totalGoldEarned (gains only)", () => {
    connectQuestCounters();
    gameEvents.emit(GameEvent.MONEY_CHANGED, { amount: 40, direction: "decrease" });
    expect(state().counters.totalGoldEarned).toBe(0);
  });

  it("resets quests and counters", () => {
    state().setQuests([
      { id: "a", labelKey: "quests.kills", counters: { kills: 3 } },
    ]);
    connectQuestCounters();
    gameEvents.emit(GameEvent.ENEMY_KILLED, {
      enemyId: 1,
      enemyType: "basic",
      reward: 10,
    });
    expect(state().quests).toHaveLength(1);
    expect(state().counters.kills).toBe(1);

    state().resetQuests();
    expect(state().quests).toEqual([]);
    expect(state().counters.kills).toBe(0);
  });
});
