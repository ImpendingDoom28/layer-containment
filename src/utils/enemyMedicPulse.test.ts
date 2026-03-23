import { describe, expect, it } from "vitest";

import type { Enemy, HealPulseConfig } from "../core/types/game";

import {
  computeHealPulseHealthUpdates,
  didHealPulseJustReschedule,
  getHealPulseTargetIds,
  getInitialNextHealPulseAt,
} from "./enemyMedicPulse";

const baseEnemy = (overrides: Partial<Enemy> & Pick<Enemy, "id">): Enemy => ({
  color: "#fff",
  health: 50,
  healthLoss: 1,
  maxHealth: 50,
  name: "x",
  pathIndex: 0,
  pathProgress: 0,
  reward: 1,
  size: 0.4,
  slowMultiplier: 1,
  slowUntil: 0,
  speed: 1,
  type: "basic",
  upgrades: [],
  x: 0,
  z: 0,
  ...overrides,
});

const healPulse: HealPulseConfig = {
  healAmount: 15,
  intervalSeconds: 2,
  radius: 2,
};

describe("getHealPulseTargetIds", () => {
  it("excludes the medic", () => {
    const medic = baseEnemy({ id: 1, x: 0, z: 0 });
    const enemies = [medic, baseEnemy({ id: 2, x: 1, z: 0, health: 40 })];
    expect(getHealPulseTargetIds(medic, enemies, healPulse)).toEqual([2]);
  });

  it("excludes dead enemies", () => {
    const medic = baseEnemy({ id: 1, x: 0, z: 0 });
    const enemies = [medic, baseEnemy({ id: 2, x: 1, z: 0, health: 0 })];
    expect(getHealPulseTargetIds(medic, enemies, healPulse)).toEqual([]);
  });

  it("respects radius on xz plane", () => {
    const medic = baseEnemy({ id: 1, x: 0, z: 0 });
    const inside = baseEnemy({ id: 2, x: 1.9, z: 0 });
    const outside = baseEnemy({ id: 3, x: 2.1, z: 0 });
    const enemies = [medic, inside, outside];
    expect(getHealPulseTargetIds(medic, enemies, healPulse)).toEqual([2]);
  });
});

describe("computeHealPulseHealthUpdates", () => {
  it("applies healAmount capped at maxHealth", () => {
    const medic = baseEnemy({ id: 1, x: 0, z: 0 });
    const ally = baseEnemy({
      id: 2,
      x: 0,
      z: 0,
      health: 45,
      maxHealth: 50,
    });
    const updates = computeHealPulseHealthUpdates(medic, [medic, ally], {
      ...healPulse,
      healAmount: 20,
    });
    expect(updates).toEqual([{ enemyId: 2, health: 50 }]);
  });

  it("second pulse on same ally adds heal again", () => {
    const medic = baseEnemy({
      id: 1,
      x: 0,
      z: 0,
      type: "medic",
      healPulse,
    });
    const ally = baseEnemy({
      id: 2,
      x: 0.5,
      z: 0,
      health: 20,
      maxHealth: 50,
    });
    const u1 = computeHealPulseHealthUpdates(medic, [medic, ally], healPulse);
    expect(u1).toEqual([{ enemyId: 2, health: 35 }]);
    const u2 = computeHealPulseHealthUpdates(
      medic,
      [medic, { ...ally, health: 35 }],
      healPulse
    );
    expect(u2).toEqual([{ enemyId: 2, health: 50 }]);
  });
});

describe("pulse scheduling helpers", () => {
  it("first deadline is effectiveTime + interval", () => {
    expect(getInitialNextHealPulseAt(5, 2)).toBe(7);
  });
});

describe("didHealPulseJustReschedule", () => {
  it("is false when prev is undefined (initial schedule only)", () => {
    expect(didHealPulseJustReschedule(undefined, 7, 2)).toBe(false);
  });

  it("is false when next is undefined", () => {
    expect(didHealPulseJustReschedule(5, undefined, 2)).toBe(false);
  });

  it("is false when next barely moved (same frame noise)", () => {
    expect(didHealPulseJustReschedule(10, 10.001, 2)).toBe(false);
  });

  it("is true when next jumped forward by at least half the interval", () => {
    expect(didHealPulseJustReschedule(5, 6.1, 2)).toBe(true);
    expect(didHealPulseJustReschedule(5, 6.0, 2)).toBe(true);
  });

  it("is false when jump is below half interval", () => {
    expect(didHealPulseJustReschedule(5, 5.9, 2)).toBe(false);
  });

  it("matches typical post-heal schedule bump", () => {
    const interval = 2.5;
    const prev = 10;
    const next = 10 + interval;
    expect(didHealPulseJustReschedule(prev, next, interval)).toBe(true);
  });
});
