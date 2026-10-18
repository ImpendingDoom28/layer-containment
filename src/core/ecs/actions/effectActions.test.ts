import { describe, expect, it, beforeEach } from "vitest";

import { effectActions } from "./effectActions";
import {
  Effect,
  IsEffect,
  spawnEffectRequest,
} from "../traits/effect";
import { Position } from "../traits/position";
import { testWorld } from "../world";

const clearEffects = () => {
  for (const entity of [...testWorld.query(IsEffect)]) {
    entity.destroy();
  }
  for (const entity of [...testWorld.query(spawnEffectRequest)]) {
    entity.destroy();
  }
};

describe("effectActions", () => {
  beforeEach(() => {
    clearEffects();
  });

  it("raises an effect entity with the visual data and a Position trait", () => {
    effectActions(testWorld).spawnEffect([1, 2, 3], "#f00", "spawn");

    const entity = testWorld.queryFirst(IsEffect);
    expect(entity).toBeDefined();
    expect(entity?.get(Effect)).toEqual({
      color: "#f00",
      type: "spawn",
      duration: 0.4,
    });
    expect(entity?.get(Position)).toEqual({ x: 1, y: 2, z: 3 });
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

  it("raises a spawn-effect request entity carrying the burst parameters", () => {
    effectActions(testWorld).requestSpawnEffect([4, 5, 6], "#0f0", "end");

    const request = testWorld.queryFirst(spawnEffectRequest);
    expect(request).toBeDefined();
    expect(request?.get(spawnEffectRequest)).toEqual({
      x: 4,
      y: 5,
      z: 6,
      color: "#0f0",
      type: "end",
      duration: 0,
    });
    // The request is a separate entity: no effect exists yet.
    expect(testWorld.queryFirst(IsEffect)).toBeUndefined();
  });
});
