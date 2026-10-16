import { describe, expect, it } from "vitest";

import { getTowerPlacementDenyReason } from "./towerPlacementDenyReason";
import type { TilePlacementState } from "../../utils/tilePlacement";

const blocked: TilePlacementState = {
  isOccupiedByTower: true,
  isOccupiedByBuilding: false,
  isOnPath: false,
  isWater: false,
  isBlocked: true,
};

const free: TilePlacementState = {
  isOccupiedByTower: false,
  isOccupiedByBuilding: false,
  isOnPath: false,
  isWater: false,
  isBlocked: false,
};

describe("getTowerPlacementDenyReason", () => {
  it("returns insufficient_funds when the tower is unaffordable", () => {
    expect(getTowerPlacementDenyReason(false, free)).toBe("insufficient_funds");
  });

  it("returns blocked_tile when the tile is unavailable", () => {
    expect(getTowerPlacementDenyReason(true, blocked)).toBe("blocked_tile");
  });

  it("returns null when the placement is allowed", () => {
    expect(getTowerPlacementDenyReason(true, free)).toBeNull();
  });

  it("evaluates the gates in placement order (funds before blocked tile)", () => {
    expect(getTowerPlacementDenyReason(false, blocked)).toBe(
      "insufficient_funds"
    );
  });
});
