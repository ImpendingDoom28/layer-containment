import { describe, expect, it } from "vitest";

import { getUpgradeStacks } from "./upgradeStacks";

describe("getUpgradeStacks", () => {
  it("returns one stack per unique upgrade in first-pick order", () => {
    expect(getUpgradeStacks(["swift", "armored"])).toEqual([
      { id: "swift", tier: 1 },
      { id: "armored", tier: 1 },
    ]);
  });

  it("counts repeats as tier (1 pick = 1, 3 picks = 3)", () => {
    expect(getUpgradeStacks(["armored", "armored", "armored"])).toEqual([
      { id: "armored", tier: 3 },
    ]);
    expect(getUpgradeStacks(["armored", "armored"])).toEqual([
      { id: "armored", tier: 2 },
    ]);
  });

  it("caps the tier at 3 for a repeated pick beyond three", () => {
    expect(
      getUpgradeStacks(["swift", "swift", "swift", "swift", "regenerating"])
    ).toEqual([
      { id: "swift", tier: 3 },
      { id: "regenerating", tier: 1 },
    ]);
  });

  it("keeps interleaved repeats in first-pick order", () => {
    expect(
      getUpgradeStacks([
        "slowResistance",
        "armored",
        "slowResistance",
        "armored",
      ])
    ).toEqual([
      { id: "slowResistance", tier: 2 },
      { id: "armored", tier: 2 },
    ]);
  });

  it("returns an empty array for an empty stack", () => {
    expect(getUpgradeStacks([])).toEqual([]);
  });
});
