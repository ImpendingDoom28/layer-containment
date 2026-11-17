import { describe, expect, it } from "vitest";

import { getQuestProgress, getQuestsProgress } from "./evaluateQuests";
import type { QuestConfig, QuestCounters } from "../types/quests";

const baseCounters = (overrides: Partial<QuestCounters> = {}): QuestCounters => ({
  leaks: 0,
  victory: false,
  runOver: false,
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
      failed: false,
    });
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 5 }))).toEqual({
      current: 5,
      target: 5,
      complete: true,
      failed: false,
    });
  });

  it("clamps current at the target so surplus cannot pad another quest", () => {
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 12 }))).toEqual({
      current: 5,
      target: 5,
      complete: true,
      failed: false,
    });
  });

  it("tracks per-enemy-type kills from the killsByType counter", () => {
    const q = quest({ killsByType: { tank: 3 } });
    expect(getQuestProgress(q, baseCounters({ killsByType: { tank: 2, basic: 9 } }))).toEqual({
      current: 2,
      target: 3,
      complete: false,
      failed: false,
    });
    expect(getQuestProgress(q, baseCounters({ killsByType: { tank: 4 } }))).toEqual({
      current: 3,
      target: 3,
      complete: true,
      failed: false,
    });
  });

  it("treats a missing per-type counter as zero", () => {
    expect(getQuestProgress(quest({ killsByType: { splitter: 2 } }), baseCounters())).toEqual({
      current: 0,
      target: 2,
      complete: false,
      failed: false,
    });
  });

  it("leaves a quest with an empty killsByType incomplete (no crash)", () => {
    expect(getQuestProgress(quest({ killsByType: {} }), baseCounters())).toEqual({
      current: 0,
      target: 0,
      complete: false,
      failed: false,
    });
  });

  it("completes a leak cap while leaks stay within the limit", () => {
    const q = quest({ leaks: 3 });
    expect(getQuestProgress(q, baseCounters({ leaks: 0 }))).toEqual({
      current: 3,
      target: 3,
      complete: true,
      failed: false,
    });
    expect(getQuestProgress(q, baseCounters({ leaks: 2 }))).toEqual({
      current: 1,
      target: 3,
      complete: true,
      failed: false,
    });
  });

  it("holds a leak cap at exactly the limit (current empties to 0)", () => {
    const q = quest({ leaks: 3 });
    expect(getQuestProgress(q, baseCounters({ leaks: 3 }))).toEqual({
      current: 0,
      target: 3,
      complete: true,
      failed: false,
    });
  });

  it("fails a leak cap once the limit is exceeded (mid-run, no game over)", () => {
    const q = quest({ leaks: 3 });
    expect(getQuestProgress(q, baseCounters({ leaks: 4 }))).toEqual({
      current: 0,
      target: 3,
      complete: false,
      failed: true,
    });
    expect(getQuestProgress(q, baseCounters({ leaks: 7 }))).toEqual({
      current: 0,
      target: 3,
      complete: false,
      failed: true,
    });
  });

  it("keeps a held leak cap complete even after the run is lost", () => {
    const q = quest({ leaks: 3 });
    expect(getQuestProgress(q, baseCounters({ leaks: 2, runOver: true }))).toEqual({
      current: 1,
      target: 3,
      complete: true,
      failed: false,
    });
  });

  it("completes the victory quest only when the run is won", () => {
    const q = quest({ victory: true });
    expect(getQuestProgress(q, baseCounters())).toEqual({
      current: 0,
      target: 1,
      complete: false,
      failed: false,
    });
    expect(getQuestProgress(q, baseCounters({ victory: true }))).toEqual({
      current: 1,
      target: 1,
      complete: true,
      failed: false,
    });
  });

  it("fails the victory quest when the run is lost", () => {
    const q = quest({ victory: true });
    expect(getQuestProgress(q, baseCounters({ runOver: true }))).toEqual({
      current: 0,
      target: 1,
      complete: false,
      failed: true,
    });
  });

  it("fails every uncompleted quest once the run is lost", () => {
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 2, runOver: true }))).toEqual({
      current: 2,
      target: 5,
      complete: false,
      failed: true,
    });
    expect(getQuestProgress(quest({ towersPlaced: 2 }), baseCounters({ towersPlaced: 1, runOver: true }))).toEqual({
      current: 1,
      target: 2,
      complete: false,
      failed: true,
    });
    expect(getQuestProgress(quest({ killsByType: { tank: 3 } }), baseCounters({ killsByType: { tank: 1 }, runOver: true }))).toEqual({
      current: 1,
      target: 3,
      complete: false,
      failed: true,
    });
  });

  it("keeps completed quests complete when the run is lost", () => {
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 5, runOver: true }))).toEqual({
      current: 5,
      target: 5,
      complete: true,
      failed: false,
    });
  });

  it("leaves uncompleted quests uncompleted (not failed) when the run is won", () => {
    expect(getQuestProgress(quest({ kills: 5 }), baseCounters({ kills: 2, victory: true }))).toEqual({
      current: 2,
      target: 5,
      complete: false,
      failed: false,
    });
  });

  it("leaves a quest with no counters incomplete", () => {
    expect(getQuestProgress(quest({}), baseCounters())).toEqual({ current: 0, target: 0, complete: false, failed: false });
  });
});

describe("getQuestsProgress", () => {
  it("returns one progress entry per quest keyed by id", () => {
    const quests: QuestConfig[] = [
      quest({ kills: 10 }, "a"),
      quest({ killsByType: { tank: 2 } }, "b"),
    ];
    const progress = getQuestsProgress(quests, baseCounters({ kills: 10, killsByType: { tank: 1 } }));
    expect(progress.get("a")).toEqual({ current: 10, target: 10, complete: true, failed: false });
    expect(progress.get("b")).toEqual({ current: 1, target: 2, complete: false, failed: false });
  });
});
