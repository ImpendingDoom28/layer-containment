import ReactThreeTestRenderer from "@react-three/test-renderer";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { WorldProvider } from "koota/react";

import { EntityIdProvider } from "../../core/contexts/EntityIdContext";
import { enemyActions } from "../../core/ecs/actions/enemyActions";
import { getEnemySnapshots } from "../../core/ecs/selectors/enemySnapshots";
import { IsEnemy, requestEnemyDeath } from "../../core/ecs/traits/enemy";
import { testWorld } from "../../core/ecs/world";
import { useGameStore } from "../../core/stores/useGameStore";
import { useLevelStore } from "../../core/stores/useLevelStore";
import type { Enemy } from "../../core/types/game";
import { EntitiesSystem } from "./EntitiesSystem";

// The visual/interactive subtrees are not under test; the regression is that
// EntitiesSystem settles requestEnemyDeath in every scene (including the main
// menu), so the heavy children are replaced with empty nodes.
vi.mock("./TowerSystem", () => ({ TowerSystem: () => null }));
vi.mock("../entities/Enemy", () => ({ Enemy: () => null }));
vi.mock("../../core/hooks/useInstancedProjectiles", () => ({
  useInstancedProjectiles: () => ({
    InstancedProjectiles: () => null,
    fireProjectile: vi.fn(),
  }),
}));

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
  reward: 3,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 0,
  upgrades: [],
});

const entitiesSystemProps = {
  onEnemyReachEnd: vi.fn(),
  onProjectileHit: vi.fn(),
  onProjectileRemove: vi.fn(),
  onSellTower: null,
  hoveredTile: null,
  selectedTower: null,
  shouldStopMovement: false,
};

describe("EntitiesSystem enemy death settlement", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useLevelStore.getState().resetLevelState();
    enemyActions(testWorld).clearAllEnemies();
  });

  it("destroys a killed enemy in the main menu (requestEnemyDeath consumed)", async () => {
    useGameStore.getState().setGameStatus("menu");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <EntitiesSystem {...entitiesSystemProps} />
        </EntityIdProvider>
      </WorldProvider>
    );

    try {
      enemyActions(testWorld).spawnEnemy(baseEnemy(1, 50));

      // A lethal hit leaves the entity alive with the request raised — the
      // death system (mounted by EntitiesSystem) must clear it.
      enemyActions(testWorld).damageEnemy(1, 50);
      expect(getEnemySnapshots(testWorld)).toHaveLength(1);
      expect(testWorld.queryFirst(IsEnemy, requestEnemyDeath)).toBeDefined();

      await advance(renderer);
      await advance(renderer);

      // Entity destroyed, request consumed.
      expect(getEnemySnapshots(testWorld)).toHaveLength(0);
      expect(testWorld.queryFirst(IsEnemy, requestEnemyDeath)).toBeUndefined();

      // The kill still settles its reward, but the menu does not count kills.
      expect(useLevelStore.getState().money).toBe(3);
      expect(useLevelStore.getState().enemiesKilled).toBe(0);
    } finally {
      renderer.unmount();
    }
  });

  it("destroys a killed enemy in the game scene too", async () => {
    useGameStore.getState().setGameStatus("playing");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <EntitiesSystem {...entitiesSystemProps} />
        </EntityIdProvider>
      </WorldProvider>
    );

    try {
      enemyActions(testWorld).spawnEnemy(baseEnemy(2, 50));
      enemyActions(testWorld).damageEnemy(2, 50);

      await advance(renderer);
      await advance(renderer);

      expect(getEnemySnapshots(testWorld)).toHaveLength(0);
      expect(testWorld.queryFirst(IsEnemy, requestEnemyDeath)).toBeUndefined();
      expect(useLevelStore.getState().enemiesKilled).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("leaves a living enemy untouched", async () => {
    useGameStore.getState().setGameStatus("menu");

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <EntitiesSystem {...entitiesSystemProps} />
        </EntityIdProvider>
      </WorldProvider>
    );

    try {
      enemyActions(testWorld).spawnEnemy(baseEnemy(3, 50));
      enemyActions(testWorld).damageEnemy(3, 10);

      await advance(renderer);
      await advance(renderer);

      expect(getEnemySnapshots(testWorld)).toHaveLength(1);
      expect(testWorld.queryFirst(IsEnemy, requestEnemyDeath)).toBeUndefined();
    } finally {
      renderer.unmount();
    }
  });
});
