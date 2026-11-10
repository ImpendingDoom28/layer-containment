import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameEvent } from "../types/enums/events";
import type { MoneyChangedData } from "../types/game";
import { gameEvents } from "../../utils/eventEmitter";
import { useLevelStore } from "./useLevelStore";

const state = () => useLevelStore.getState();

describe("useLevelStore money events", () => {
  let offMoneyChanged: (() => void) | null;
  const events: MoneyChangedData[] = [];

  beforeEach(() => {
    events.length = 0;
    offMoneyChanged = gameEvents.on<MoneyChangedData>(
      GameEvent.MONEY_CHANGED,
      (data) => {
        events.push(data);
      }
    );
    useLevelStore.setState({ money: 100 });
  });

  afterEach(() => {
    offMoneyChanged?.();
    offMoneyChanged = null;
    useLevelStore.setState({ money: 0 });
    vi.restoreAllMocks();
  });

  it("raises MONEY_CHANGED (increase) with the new total on addMoney", () => {
    state().addMoney(30);
    expect(state().money).toBe(130);
    expect(events).toEqual([{ amount: 130, direction: "increase" }]);
  });

  it("raises MONEY_CHANGED (decrease) with the new total on spendMoney", () => {
    state().spendMoney(40);
    expect(state().money).toBe(60);
    expect(events).toEqual([{ amount: 60, direction: "decrease" }]);
  });

  it("raises no event when the spend is unaffordable", () => {
    state().spendMoney(101);
    expect(state().money).toBe(100);
    expect(events).toHaveLength(0);
  });

  it("raises no event for a zero or negative change", () => {
    state().addMoney(0);
    state().spendMoney(0);
    state().addMoney(-5);
    state().spendMoney(-5);
    expect(state().money).toBe(100);
    expect(events).toHaveLength(0);
  });
});
