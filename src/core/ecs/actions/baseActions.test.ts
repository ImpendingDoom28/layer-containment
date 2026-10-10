import { describe, expect, it, beforeEach } from "vitest";

import { worldBaseActions } from "./baseActions";
import { isBase } from "../traits/base";
import { HealthInfo, isDead } from "../traits/health";
import { testWorld } from "../world";

const getBase = () => testWorld.queryFirst(isBase);

describe("baseActions", () => {
  beforeEach(() => {
    worldBaseActions(testWorld).removeBase();
  });

  it("spawnBase creates a single base entity with full HealthInfo", () => {
    worldBaseActions(testWorld).spawnBase(20);

    const base = getBase();
    expect(base).toBeDefined();
    const health = base!.get(HealthInfo);
    expect(health).toEqual({ currentHealth: 20, maxHealth: 20 });
    expect(base!.has(isDead)).toBe(false);
  });

  it("spawnBase replaces an existing base so there is always one", () => {
    worldBaseActions(testWorld).spawnBase(20);
    worldBaseActions(testWorld).spawnBase(30);

    const bases = testWorld.query(isBase);
    expect(bases).toHaveLength(1);
    expect(bases[0].get(HealthInfo)).toEqual({
      currentHealth: 30,
      maxHealth: 30,
    });
  });

  it("damageBase reduces health and clamps at 0, setting isDead", () => {
    worldBaseActions(testWorld).spawnBase(20);

    worldBaseActions(testWorld).damageBase(5);
    expect(getBase()!.get(HealthInfo)!.currentHealth).toBe(15);
    expect(getBase()!.has(isDead)).toBe(false);

    worldBaseActions(testWorld).damageBase(50);
    expect(getBase()!.get(HealthInfo)!.currentHealth).toBe(0);
    expect(getBase()!.has(isDead)).toBe(true);
  });

  it("damageBase does nothing when no base exists", () => {
    worldBaseActions(testWorld).damageBase(10);
    expect(getBase()).toBeUndefined();
  });

  it("removeBase destroys the base entity", () => {
    worldBaseActions(testWorld).spawnBase(20);
    worldBaseActions(testWorld).removeBase();
    expect(getBase()).toBeUndefined();
  });
});
