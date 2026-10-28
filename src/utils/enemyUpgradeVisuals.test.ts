import { describe, expect, it } from "vitest";

import type { EnemyUpgradeConfig, EnemyUpgradeId } from "../core/types/game";

import { getUpgradeIndicatorColors } from "./enemyUpgradeVisuals";

const sampleUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: {
    id: "armored",
    name: "a",
    description: "",
    displayRank: 1,
    rewardMultiplier: 1,
    indicatorColor: "#ff0000",
  },
  swift: {
    id: "swift",
    name: "s",
    description: "",
    displayRank: 1,
    rewardMultiplier: 1,
    indicatorColor: "#00ff00",
  },
  slowResistance: {
    id: "slowResistance",
    name: "si",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1,
    indicatorColor: "#0000ff",
  },
  regenerating: {
    id: "regenerating",
    name: "r",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1,
    indicatorColor: "#ffff00",
  },
  reinforcements: {
    id: "reinforcements",
    name: "rf",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1,
    indicatorColor: "#f97316",
  },
};

describe("getUpgradeIndicatorColors", () => {
  it("maps stack order with one color per stack tier per upgrade", () => {
    expect(
      getUpgradeIndicatorColors(["armored", "swift"], sampleUpgrades, "#fff")
    ).toEqual(["#ff0000", "#00ff00"]);
  });

  it("repeats a color once per stack tier for the same upgrade", () => {
    expect(
      getUpgradeIndicatorColors(
        ["armored", "armored", "swift"],
        sampleUpgrades,
        "#fff"
      )
    ).toEqual(["#ff0000", "#ff0000", "#00ff00"]);
  });

  it("uses fallback when config missing or id unknown", () => {
    expect(getUpgradeIndicatorColors(["armored"], null, "#abc")).toEqual([]);
  });
});
