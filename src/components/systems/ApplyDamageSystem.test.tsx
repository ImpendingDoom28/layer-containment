import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, beforeEach } from "vitest";

import { WorldProvider } from "koota/react";

import { worldBaseActions } from "../../core/ecs/actions/baseActions";
import { enemyActions } from "../../core/ecs/actions/enemyActions";
import type { Enemy } from "../../core/types/game";
import { isBase } from "../../core/ecs/traits/base";
import { damageRequest } from "../../core/ecs/traits/damage";
import { HealthInfo, isDead } from "../../core/ecs/traits/health";
import { testWorld } from "../../core/ecs/world";
import { ApplyDamageSystem } from "./ApplyDamageSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const advance = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(1, 1);
  });
};

const baseEnemy = (id: number, health: number): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health,
  maxHealth: 100,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 0,
  upgrades: [],
});

describe("DamageSystem", () => {
  beforeEach(() => {
    worldBaseActions(testWorld).removeBase();
    enemyActions(testWorld).clearAllEnemies();
  });

  it("applies a pending damageRequest: health reduced, request removed", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyDamageSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      const base = testWorld.queryFirst(isBase)!;
      base.add(damageRequest({ amount: 6 }));

      await advance(renderer);

      expect(base.get(HealthInfo)!.currentHealth).toBe(14);
      expect(base.get(HealthInfo)!.maxHealth).toBe(20);
      expect(base.has(damageRequest)).toBe(false);
      expect(base.has(isDead)).toBe(false);
    } finally {
      renderer.unmount();
    }
  });

  it("a lethal damageRequest sets health to 0 and isDead", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyDamageSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      const base = testWorld.queryFirst(isBase)!;
      base.add(damageRequest({ amount: 20 }));

      await advance(renderer);

      expect(base.get(HealthInfo)!.currentHealth).toBe(0);
      expect(base.has(isDead)).toBe(true);
    } finally {
      renderer.unmount();
    }
  });

  it("clamps health at zero when damage exceeds it", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyDamageSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      const base = testWorld.queryFirst(isBase)!;
      base.add(damageRequest({ amount: 50 }));

      await advance(renderer);

      expect(base.get(HealthInfo)!.currentHealth).toBe(0);
      expect(base.has(isDead)).toBe(true);
    } finally {
      renderer.unmount();
    }
  });

  it("merges same-frame reach-end requests so no damage is lost", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyDamageSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);

      const enemyA: Enemy = { ...baseEnemy(1, 100) };
      enemyA.healthLoss = 12;
      const enemyB: Enemy = { ...baseEnemy(2, 100) };
      enemyB.healthLoss = 12;
      enemyActions(testWorld).spawnEnemy(enemyA);
      enemyActions(testWorld).spawnEnemy(enemyB);
      enemyActions(testWorld).removeEnemy(1, true);
      enemyActions(testWorld).removeEnemy(2, true);

      const base = testWorld.queryFirst(isBase)!;
      expect(base.get(damageRequest)!.amount).toBe(24);

      await advance(renderer);

      expect(base.get(HealthInfo)!.currentHealth).toBe(0);
      expect(base.has(isDead)).toBe(true);
    } finally {
      renderer.unmount();
    }
  });

  it("does nothing without a pending request", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <ApplyDamageSystem />
      </WorldProvider>
    );

    try {
      worldBaseActions(testWorld).spawnBase(20);
      await advance(renderer);

      expect(testWorld.queryFirst(isBase)!.get(HealthInfo)!.currentHealth).toBe(
        20
      );
    } finally {
      renderer.unmount();
    }
  });
});
