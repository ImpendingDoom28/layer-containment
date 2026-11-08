import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runDamageSystem } from "./damageSystem";
import { isBase } from "../traits/base";
import { damageRequest } from "../traits/damage";
import { HealthInfo } from "../traits/health";
import { testWorld } from "../world";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../types/enums/events";

const clearDamaged = () => {
  for (const entity of [...testWorld.query(HealthInfo, damageRequest)]) {
    entity.destroy();
  }
  for (const entity of [...testWorld.query(HealthInfo)]) {
    entity.destroy();
  }
};

describe("damageSystem base-damage punch event", () => {
  const onBaseDamage = vi.fn();
  let offBaseDamage: () => void;

  beforeEach(() => {
    clearDamaged();
    onBaseDamage.mockClear();
    offBaseDamage = gameEvents.on(GameEvent.BASE_DAMAGE_TAKEN, onBaseDamage);
  });

  afterEach(() => {
    offBaseDamage();
    clearDamaged();
  });

  it("raises BASE_DAMAGE_TAKEN with the merged amount when the base is hit", () => {
    testWorld
      .spawn(isBase, HealthInfo({ currentHealth: 100, maxHealth: 100 }))
      .add(damageRequest({ amount: 37 }));

    runDamageSystem(testWorld);

    expect(onBaseDamage).toHaveBeenCalledTimes(1);
    expect(onBaseDamage).toHaveBeenCalledWith({ amount: 37 });
    expect(testWorld.queryFirst(isBase)?.get(HealthInfo)?.currentHealth).toBe(
      63
    );
  });

  it("does not raise the event for non-base damage targets", () => {
    testWorld
      .spawn(HealthInfo({ currentHealth: 10, maxHealth: 10 }))
      .add(damageRequest({ amount: 4 }));

    runDamageSystem(testWorld);

    expect(onBaseDamage).not.toHaveBeenCalled();
  });

  it("raises nothing when there is no pending damage", () => {
    runDamageSystem(testWorld);

    expect(onBaseDamage).not.toHaveBeenCalled();
  });

  it("raises nothing when the base has no pending damage", () => {
    testWorld.spawn(isBase, HealthInfo({ currentHealth: 100, maxHealth: 100 }));

    runDamageSystem(testWorld);

    expect(onBaseDamage).not.toHaveBeenCalled();
  });
});
