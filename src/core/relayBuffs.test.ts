import { describe, expect, it } from "vitest";

import type { Tower, TowerConfig } from "./types/game";
import { getEffectiveTowerCombatStats } from "./relayBuffs";

const relayTemplate: TowerConfig = {
  id: "relay",
  name: "Relay",
  cost: 1,
  damage: 0,
  range: 0,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 0,
  color: "#fff",
  description: "",
  relayNeighborDamageBonusFraction: 0.15,
  relayNeighborRangeBonusFraction: 0.08,
  relayDiminishingFactor: 0.5,
};

const basicTemplate: TowerConfig = {
  id: "basic",
  name: "Basic",
  cost: 1,
  damage: 100,
  range: 10,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 10,
  color: "#fff",
  description: "",
};

const towerTypes: Record<string, TowerConfig> = {
  relay: relayTemplate,
};

const baseTower = (
  overrides: Partial<Tower> & Pick<Tower, "id" | "gridX" | "gridZ">
): Tower => ({
  ...basicTemplate,
  type: "basic",
  x: overrides.x ?? 0,
  z: overrides.z ?? 0,
  lastFireTime: 0,
  ...overrides,
});

describe("getEffectiveTowerCombatStats", () => {
  it("applies one adjacent relay bonus", () => {
    const basic = baseTower({ id: 1, gridX: 5, gridZ: 5, x: 0, z: 0 });
    const relay: Tower = {
      ...relayTemplate,
      type: "relay",
      id: 2,
      gridX: 6,
      gridZ: 5,
      x: 1,
      z: 0,
      lastFireTime: 0,
    };
    const eff = getEffectiveTowerCombatStats(basic, [basic, relay], towerTypes);
    expect(eff.damage).toBeCloseTo(115);
    expect(eff.range).toBeCloseTo(10.8);
  });

  it("applies diminishing returns for two relays", () => {
    const basic = baseTower({ id: 1, gridX: 5, gridZ: 5 });
    const r1: Tower = {
      ...relayTemplate,
      type: "relay",
      id: 2,
      gridX: 6,
      gridZ: 5,
      x: 0,
      z: 0,
      lastFireTime: 0,
    };
    const r2: Tower = {
      ...relayTemplate,
      type: "relay",
      id: 3,
      gridX: 4,
      gridZ: 5,
      x: 0,
      z: 0,
      lastFireTime: 0,
    };
    const eff = getEffectiveTowerCombatStats(
      basic,
      [basic, r1, r2],
      towerTypes
    );
    expect(eff.damage).toBeCloseTo(100 * (1 + 0.15 + 0.075));
  });
});
