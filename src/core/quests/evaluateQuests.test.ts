import { describe, expect, it } from "vitest";

import { getQuestProgress, getQuestsProgress } from "./evaluateQuests";
import type { QuestConfig, QuestCounters } from "../types/quests";

const baseCounters = (overrides: Partial<QuestCounters> = {}): QuestCounters => ({
  leaks: 0,
  victory: false,
  wavesStarted: 0,
  towersPlaced: 0,
  towersSold: 0,
  kills: 0,
  killsByType: {},
  totalGoldEarned: 0,
  ...overrides,
});

const quest = (counters: QuestConfig["counters"], id = "q"): QuestConfig => ({
  id,
  labelKey: "quests.kills",
  counters,
});

describe("getQuestProgress", () => {
  it("completes an accumulator when the counter reaches the target", () => {
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 4 }))).toEqual({
      current: 4,
      target: 5,
      complete: false,
    });
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 5 }))).toEqual({
      current: 5,
      target: 5,
      complete: true,
    });
  });

  it("clamps current at the target so surplus cannot pad another quest", () => {
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 12 }))).toEqual({
      current: 5,
      target: 5,
      complete: true,
    });
  });

  it("tracks per-enemy-type kills from the killsByType counter", () => {
    const q = quest({ killsByType: { tank: 3 } });
    expect(getQuestProgress(q, baseCounters({ killsByType: { tank: 2, basic: 9 } }))).toEqual({
      current: 2,
      target: 3,
      complete: false,
    });
    expect(getQuestProgress(q, baseCounters({ killsByType: { tank: 4 } }))).toEqual({
      current: 3,
      target: 3,
      complete: true,
    });
  });

  it("treats a missing per-type counter as zero", () => {
    expect(getQuestProgress(quest({ killsByType: { splitter: 2 } }), baseCounters())).toEqual({
      current: 0,
      target: 2,
      complete: false,
    });
  });

  it("completes a leak cap while leaks stay within the limit", () => {
    const q = quest({ leaks: 3 });
    expect(getQuestProgress(q, baseCounters({ leaks: 0 }))).toEqual({
      current: 3,
      target: 3,
      complete: true,
    });
    expect(getQuestProgress(q, baseCounters({ leaks: 2 }))).toEqual({
      current: 1,
      target: 3,
      complete: true,
    });
  });

  it("holds a leak cap at exactly the limit (current empties to 0)", () => {
    const q = quest({ leaks: 3 });
    expect(getQuestProgress(q, baseCounters({ leaks: 3 }))).toEqual({
      current: 0,
      target: 3,
      complete: true,
    });
  });

  it("fails a leak cap once the limit is exceeded (current empties to 0)", () => {
    const q = quest({ leaks: 3 });
    expect(getQuestProgress(q, baseCounters({ leaks: 4 }))).toEqual({
      current: 0,
      target: 3,
      complete: false,
    });
    expect(getQuestProgress(q, baseCounters({ leaks: 7 }))).toEqual({
      current: 0,
      target: 3,
      complete: false,
    });
  });

  it("completes the victory quest only when the run is won", () => {
    const q = quest({ victory: true });
    expect(getQuestProgress(q, baseCounters())).toEqual({
      current: 0,
      target: 1,
      complete: false,
    });
    expect(getQuestProgress(q, baseCounters({ victory: true }))).toEqual({
      current: 1,
      target: 1,
      complete: true,
    });
  });

  it("leaves a quest with no counters incomplete", () => {
    expect(getQuestProgress(quest({}), baseCounters())).toEqual({ current: 0, target: 0, complete: false });
  });
});

describe("getQuestsProgress", () => {
  it("returns one progress entry per quest keyed by id", () => {
    const quests: QuestConfig[] = [
      quest({ kills: 10 }, "a"),
      quest({ killsByType: { tank: 2 } }, "b"),
    ];
    const progress = getQuestsProgress(quests, baseCounters({ kills: 10, killsByType: { tank: 1 } }));
    expect(progress.get("a")).toEqual({ current: 10, target: 10, complete: true });
    expect(progress.get("b")).toEqual({ current: 1, target: 2, complete: false });
  });
});
