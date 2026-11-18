import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";
import { useLevelStore } from "./useLevelStore";
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
    gameEvents.emit(GameEvent.MONEY_EARNED, { amount: 25 });
    gameEvents.emit(GameEvent.MONEY_EARNED, { amount: 5 });
    gameEvents.emit(GameEvent.MONEY_CHANGED, { amount: 130, direction: "decrease" });
    gameEvents.emit(GameEvent.GAME_WON);
    gameEvents.emit(GameEvent.GAME_OVER, { gameOverType: "loss" });

    expect(state().counters).toEqual({
      leaks: 1,
      victory: true,
      runOver: true,
      wavesStarted: 2,
      towersPlaced: 1,
      towersSold: 1,
      kills: 2,
      killsByType: { tank: 1, fast: 1 },
      totalGoldEarned: 30,
    });
  });

  it("ignores money changes for totalGoldEarned (gains only)", () => {
    connectQuestCounters();
    gameEvents.emit(GameEvent.MONEY_CHANGED, { amount: 130, direction: "increase" });
    gameEvents.emit(GameEvent.MONEY_CHANGED, { amount: 90, direction: "decrease" });
    expect(state().counters.totalGoldEarned).toBe(0);
  });

  // Regression: `MONEY_CHANGED` carries the new balance, not the gain, so
  // totalGoldEarned must sum the gains themselves (two +5 from a 10 balance
  // is 10 earned, not 15+20).
  it("counts only the gold actually earned, independent of the balance", () => {
    connectQuestCounters();
    useLevelStore.setState({ money: 10 });
    useLevelStore.getState().addMoney(5);
    useLevelStore.getState().addMoney(5);
    expect(useLevelStore.getState().money).toBe(20);
    expect(state().counters.totalGoldEarned).toBe(10);
  });

  it("marks the run over on GAME_OVER (loss)", () => {
    connectQuestCounters();
    expect(state().counters.runOver).toBe(false);
    gameEvents.emit(GameEvent.GAME_OVER, { gameOverType: "loss" });
    expect(state().counters.runOver).toBe(true);
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
