import ReactThreeTestRenderer from "@react-three/test-renderer";
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
} from "vitest";

import { WorldProvider } from "koota/react";

import { effectActions } from "../../core/ecs/actions/effectActions";
import { IsEffect, spawnEffectRequest } from "../../core/ecs/traits/effect";
import { testWorld } from "../../core/ecs/world";
import { ApplyEffectSystem } from "./ApplyEffectSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const clearEffects = () => {
  for (const entity of [...testWorld.query(IsEffect)]) {
    entity.destroy();
  }
  for (const entity of [...testWorld.query(spawnEffectRequest)]) {
    entity.destroy();
  }
};

describe("ApplyEffectSystem", () => {
  beforeEach(() => {
    clearEffects();
  });

  afterEach(() => {
    clearEffects();
  });

  it("consumes a pending request on the frame pass", async () => {
    effectActions(testWorld).requestSpawnEffect([0, 1, 0], "#f00", "spawn");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyEffectSystem />
      </WorldProvider>
    );

    try {
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 1);
      });

      expect(testWorld.queryFirst(spawnEffectRequest)).toBeUndefined();
      expect(testWorld.queryFirst(IsEffect)).toBeDefined();
    } finally {
      renderer.unmount();
    }
  });

  it("sweeps a request raised after the last frame pass on unmount", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyEffectSystem />
      </WorldProvider>
    );

    try {
      // Raised after the frame pass (the scene's final frame): no further
      // frame will consume it.
      effectActions(testWorld).requestSpawnEffect([0, 2, 0], "#0f0", "end");
      expect(testWorld.queryFirst(spawnEffectRequest)).toBeDefined();
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }

    expect(testWorld.queryFirst(spawnEffectRequest)).toBeUndefined();
    // The straggler was never turned into an effect entity.
    expect(testWorld.queryFirst(IsEffect)).toBeUndefined();
  });
});
