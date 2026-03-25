import { describe, expect, it } from "vitest";

import type { EnemyUpgradeConfig, EnemyUpgradeId } from "../core/types/game";

import { getUpgradeIndicatorColors } from "./enemyUpgradeVisuals";

const sampleUpgrades: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: {
    id: "armored",
    name: "a",
    description: "",
    tier: 1,
    rewardMultiplier: 1,
    indicatorColor: "#ff0000",
  },
  swift: {
    id: "swift",
    name: "s",
    description: "",
    tier: 1,
    rewardMultiplier: 1,
    indicatorColor: "#00ff00",
  },
  slowImmune: {
    id: "slowImmune",
    name: "si",
    description: "",
    tier: 2,
    rewardMultiplier: 1,
    indicatorColor: "#0000ff",
  },
  regenerating: {
    id: "regenerating",
    name: "r",
    description: "",
    tier: 2,
    rewardMultiplier: 1,
    indicatorColor: "#ffff00",
  },
};

describe("getUpgradeIndicatorColors", () => {
  it("maps ids to indicator colors from config", () => {
    expect(
      getUpgradeIndicatorColors(["armored", "swift"], sampleUpgrades, "#fff")
    ).toEqual(["#ff0000", "#00ff00"]);
  });

  it("uses fallback when config missing or id unknown", () => {
    expect(getUpgradeIndicatorColors(["armored"], null, "#abc")).toEqual([
      "#abc",
    ]);
  });
});
