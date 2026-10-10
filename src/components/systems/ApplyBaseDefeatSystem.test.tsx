import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { WorldProvider } from "koota/react";

import { worldBaseActions } from "../../core/ecs/actions/baseActions";
import { isBase, requestBaseDefeat } from "../../core/ecs/traits/base";
import { isDead } from "../../core/ecs/traits/health";
import { testWorld } from "../../core/ecs/world";
import { ApplyBaseDefeatSystem } from "./ApplyBaseDefeatSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const advance = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(1, 1);
  });
};

const hasPendingDefeatRequest = () =>
  testWorld.queryFirst(requestBaseDefeat) !== undefined;

describe("HealthSystem", () => {
  beforeEach(() => {
    worldBaseActions(testWorld).removeBase();
  });

  afterEach(() => {
    testWorld.query(requestBaseDefeat).forEach((entity) => {
      entity.remove(requestBaseDefeat);
    });
  });

  it("raises requestBaseDefeat when the base is dead", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyBaseDefeatSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      worldBaseActions(testWorld).damageBase(20);

      await advance(renderer);

      expect(hasPendingDefeatRequest()).toBe(true);
    } finally {
      renderer.unmount();
    }
  });

  it("keeps the request pending on each frame while the base stays dead", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyBaseDefeatSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      worldBaseActions(testWorld).damageBase(20);
      await advance(renderer);
      expect(hasPendingDefeatRequest()).toBe(true);

      await advance(renderer);
      expect(testWorld.query(requestBaseDefeat)).toHaveLength(1);
    } finally {
      renderer.unmount();
    }
  });

  it("does not raise the request when the base is alive", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyBaseDefeatSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      worldBaseActions(testWorld).damageBase(5);
      await advance(renderer);

      expect(hasPendingDefeatRequest()).toBe(false);
      expect(testWorld.queryFirst(isBase)!.has(isDead)).toBe(false);
    } finally {
      renderer.unmount();
    }
  });

  it("does not raise the request when no base exists", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyBaseDefeatSystem />
      </WorldProvider>
    );

    try {
      await advance(renderer);

      expect(hasPendingDefeatRequest()).toBe(false);
      expect(testWorld.queryFirst(isBase)).toBeUndefined();
    } finally {
      renderer.unmount();
    }
  });
});
