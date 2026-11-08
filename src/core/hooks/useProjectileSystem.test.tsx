// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useProjectileSystem } from "./useProjectileSystem";
import type { EnemyActions } from "./useEnemyActions";
import { enemyActions } from "../ecs/actions/enemyActions";
import { getEnemySnapshots } from "../ecs/selectors/enemySnapshots";
import { testWorld } from "../ecs/world";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";
import type { Enemy, Projectile } from "../types/game";

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] =
  true;

const baseEnemy = (id: number, x: number, z: number): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health: 100,
  maxHealth: 100,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x,
  z,
  upgrades: [],
});

const makeProjectile = (over: Partial<Projectile>): Projectile => ({
  id: 1,
  towerId: 1,
  towerType: "brl",
  projectileType: "rocket",
  startX: 0,
  startY: 0,
  startZ: 0,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
  targetId: 1,
  damage: 10,
  speed: 5,
  range: 5,
  color: "#fff",
  aoeRadius: 2,
  ...over,
});

// The probe component stashes the hook's hit handler in a module-scoped slot
// so the test can drive it with a crafted projectile + target.
const capturedHit: { fn?: (p: Projectile, e: Enemy) => void } = {};

type HitProbeProps = { actions: EnemyActions };

const HitProbe = ({ actions }: HitProbeProps) => {
  const { onProjectileHit } = useProjectileSystem(actions);
  capturedHit.fn = onProjectileHit;
  return null;
};

describe("useProjectileSystem explosion event", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  const damageSpy = vi.fn();
  const onExplosion = vi.fn();
  const onHit = vi.fn();

  const mount = () => {
    const element: ReactNode = (
      <HitProbe
        actions={{
          damageEnemy: damageSpy,
          slowEnemy: vi.fn(),
        } as unknown as EnemyActions}
      />
    );
    const newRoot = createRoot(container);
    root = newRoot;
    act(() => {
      newRoot.render(element);
    });
  };

  beforeEach(() => {
    damageSpy.mockClear();
    onExplosion.mockClear();
    onHit.mockClear();
    gameEvents.on(GameEvent.PROJECTILE_EXPLOSION, onExplosion);
    gameEvents.on(GameEvent.PROJECTILE_HIT, onHit);
    capturedHit.fn = undefined;
    container = document.createElement("div");
    document.body.appendChild(container);
    enemyActions(testWorld).clearAllEnemies();
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    gameEvents.off(GameEvent.PROJECTILE_EXPLOSION, onExplosion);
    gameEvents.off(GameEvent.PROJECTILE_HIT, onHit);
    enemyActions(testWorld).clearAllEnemies();
    container.remove();
  });

  it("raises PROJECTILE_EXPLOSION for a rocket/AoE detonation", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 3, -2));
    mount();

    const target = getEnemySnapshots(testWorld)[0]!;
    act(() => {
      capturedHit.fn!(
        makeProjectile({ projectileType: "rocket", aoeRadius: 2 }),
        target
      );
    });

    expect(onHit).toHaveBeenCalledTimes(1);
    expect(onExplosion).toHaveBeenCalledTimes(1);
    expect(onExplosion).toHaveBeenCalledWith(
      expect.objectContaining({
        projectileId: 1,
        towerType: "brl",
        worldPosition: { x: 3, y: 0, z: -2 },
      })
    );
  });

  it("raises PROJECTILE_EXPLOSION for an aoe shot", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 1, 1));
    mount();

    const target = getEnemySnapshots(testWorld)[0]!;
    act(() => {
      capturedHit.fn!(
        makeProjectile({ projectileType: "aoe", aoeRadius: 3 }),
        target
      );
    });

    expect(onExplosion).toHaveBeenCalledTimes(1);
  });

  it("does not raise PROJECTILE_EXPLOSION for a single-target hit", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 0, 0));
    mount();

    const target = getEnemySnapshots(testWorld)[0]!;
    act(() => {
      capturedHit.fn!(
        makeProjectile({
          projectileType: "single",
          aoeRadius: undefined,
          towerType: "basic",
        }),
        target
      );
    });

    expect(onHit).toHaveBeenCalledTimes(1);
    expect(damageSpy).toHaveBeenCalled();
    expect(onExplosion).not.toHaveBeenCalled();
  });

  it("does not raise PROJECTILE_EXPLOSION for a beam hit", () => {
    enemyActions(testWorld).spawnEnemy(baseEnemy(1, 0, 0));
    mount();

    const target = getEnemySnapshots(testWorld)[0]!;
    act(() => {
      capturedHit.fn!(
        makeProjectile({ projectileType: "beam", towerType: "laser" }),
        target
      );
    });

    expect(onExplosion).not.toHaveBeenCalled();
  });
});
