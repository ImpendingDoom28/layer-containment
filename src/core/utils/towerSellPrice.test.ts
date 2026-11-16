import { describe, expect, it } from "vitest";

import type { Tower } from "../types/game";
import { getTowerSellPrice } from "./towerSellPrice";

const makeTower = (over: Partial<Tower> = {}): Tower => ({
  id: 1,
  type: "basic",
  name: "Basic",
  cost: 100,
  damage: 10,
  range: 2,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 5,
  color: "#fff",
  description: "",
  model: { url: "assets/models/tower_basic.glb", node: "Tower_Basic_ROOT" },
  muzzle: { turretNode: "Azimuth", muzzle: { x: 0, y: 0.3731, z: 1.071 } },
  lastFireTime: 0,
  gridX: 0,
  gridZ: 0,
  x: 0,
  z: 0,
  ...over,
});

describe("getTowerSellPrice", () => {
  it("refunds the full cost for a tower placed between waves", () => {
    expect(getTowerSellPrice(makeTower({ placedBetweenWaves: true }), 0.75)).toBe(
      100
    );
  });

  it("refunds the standard fraction for a tower placed during an active wave", () => {
    expect(
      getTowerSellPrice(makeTower({ placedBetweenWaves: false }), 0.75)
    ).toBe(75);
  });

  it("treats a pre-placed tower (absent flag) as the standard price", () => {
    expect(getTowerSellPrice(makeTower(), 0.75)).toBe(75);
  });

  it("floors the standard price to a whole number", () => {
    expect(getTowerSellPrice(makeTower({ cost: 50 }), 0.75)).toBe(37);
    expect(
      getTowerSellPrice(makeTower({ cost: 50, placedBetweenWaves: true }), 0.75)
    ).toBe(50);
  });
});
