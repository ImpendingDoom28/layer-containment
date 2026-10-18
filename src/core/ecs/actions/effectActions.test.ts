import { describe, expect, it, beforeEach } from "vitest";

import { effectActions } from "./effectActions";
import { Effect, IsEffect } from "../traits/effect";
import { testWorld } from "../world";

const clearEffects = () => {
  for (const entity of [...testWorld.query(IsEffect)]) {
    entity.destroy();
  }
};

describe("effectActions", () => {
  beforeEach(() => {
    clearEffects();
  });

  it("raises an effect entity with the provided data", () => {
    effectActions(testWorld).spawnEffect([1, 2, 3], "#f00", "spawn");

    const entity = testWorld.queryFirst(IsEffect);
    expect(entity).toBeDefined();
    expect(entity?.get(Effect)).toEqual({
      position: [1, 2, 3],
      color: "#f00",
      type: "spawn",
      duration: 0.4,
    });
  });

  it("defaults end effects to a 0.5s duration", () => {
    effectActions(testWorld).spawnEffect([0, 0, 0], "#00f", "end");

    const entity = testWorld.queryFirst(IsEffect);
    expect(entity?.get(Effect)?.type).toBe("end");
    expect(entity?.get(Effect)?.duration).toBe(0.5);
  });

  it("honours an explicit duration", () => {
    effectActions(testWorld).spawnEffect([0, 0, 0], "#000", "spawn", 0.2);

    const entity = testWorld.queryFirst(IsEffect);
    expect(entity?.get(Effect)?.duration).toBe(0.2);
  });

  it("destroys an effect when the entity is destroyed", () => {
    const entity = effectActions(testWorld).spawnEffect([0, 0, 0], "#000", "spawn");
    expect(entity.isAlive()).toBe(true);

    entity.destroy();

    expect(entity.isAlive()).toBe(false);
    expect(testWorld.queryFirst(IsEffect)).toBeUndefined();
  });
});
