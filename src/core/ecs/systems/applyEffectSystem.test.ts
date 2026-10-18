import { describe, expect, it, beforeEach } from "vitest";

import { runApplyEffectSystem } from "./applyEffectSystem";
import { effectActions } from "../actions/effectActions";
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

describe("applyEffectSystem", () => {
  beforeEach(() => {
    clearEffects();
  });

  it("consumes a request: spawns the effect entity, destroys the request", () => {
    effectActions(testWorld).requestSpawnEffect([4, 5, 6], "#0f0", "end");

    runApplyEffectSystem(testWorld);

    expect(testWorld.queryFirst(spawnEffectRequest)).toBeUndefined();

    const entity = testWorld.queryFirst(IsEffect);
    expect(entity).toBeDefined();
    expect(entity?.get(Effect)).toEqual({
      color: "#0f0",
      type: "end",
      duration: 0.5,
    });
    expect(entity?.get(Position)).toEqual({ x: 4, y: 5, z: 6 });
  });

  it("falls back to the per-type default when the request carries no duration", () => {
    effectActions(testWorld).requestSpawnEffect([0, 0, 0], "#f00", "spawn");

    runApplyEffectSystem(testWorld);

    expect(testWorld.queryFirst(IsEffect)?.get(Effect)?.duration).toBe(0.4);
  });

  it("honours an explicit request duration", () => {
    effectActions(testWorld).requestSpawnEffect([0, 0, 0], "#000", "spawn", 0.2);

    runApplyEffectSystem(testWorld);

    expect(testWorld.queryFirst(IsEffect)?.get(Effect)?.duration).toBe(0.2);
  });

  it("consumes multiple pending requests in one frame", () => {
    effectActions(testWorld).requestSpawnEffect([1, 0, 0], "#f00", "spawn");
    effectActions(testWorld).requestSpawnEffect([2, 0, 0], "#00f", "end");
    effectActions(testWorld).requestSpawnEffect([3, 0, 0], "#0f0", "spawn");

    runApplyEffectSystem(testWorld);

    expect(testWorld.query(spawnEffectRequest)).toHaveLength(0);
    expect(testWorld.query(IsEffect)).toHaveLength(3);
  });

  it("runs a no-op frame without spawning anything when nothing is pending", () => {
    expect(() => runApplyEffectSystem(testWorld)).not.toThrow();
    expect(testWorld.queryFirst(IsEffect)).toBeUndefined();
    expect(testWorld.queryFirst(spawnEffectRequest)).toBeUndefined();
  });
});
