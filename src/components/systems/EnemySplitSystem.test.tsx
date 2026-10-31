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

import { enemyActions } from "../../core/ecs/actions/enemyActions";
import { getEnemySnapshots } from "../../core/ecs/selectors/enemySnapshots";
import { splitRequest } from "../../core/ecs/traits/split";
import { testWorld } from "../../core/ecs/world";
import { EntityIdProvider } from "../../core/contexts/EntityIdContext";
import { SimulationClockProvider } from "../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../core/stores/useGameStore";
import { useLevelStore } from "../../core/stores/useLevelStore";
import type { Enemy, EnemyConfig, EnemyType } from "../../core/types/game";
import { EntitiesSystem } from "./EntitiesSystem";

// The visual/interactive subtrees are not under test.
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

const splitterEnemy = (id: number, health: number): Enemy => ({
  id,
  type: "splitter",
  name: "Splitter",
  health,
  maxHealth: health,
  speed: 1.5,
  reward: 18,
  color: "#06b6d4",
  size: 0.45,
  healthLoss: 2,
  pathProgress: 0.4,
  pathIndex: 1,
  x: 3,
  z: 4,
  upgrades: [],
  split: { minChildren: 2, maxChildren: 4 },
});

const entitiesSystemProps = {
  onEnemyReachEnd: vi.fn(),
  onProjectileHit: vi.fn(),
  onProjectileRemove: vi.fn(),
  onSellTower: null,
  hoveredTile: null,
  selectedTower: null,
};

describe("EnemySplitSystem (death -> split flow)", () => {
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useLevelStore.getState().resetLevelState();
    useGameStore.getState().setGameStatus("playing");
    useGameStore.setState({
      enemyTypes: {
        splitter: {
          id: "splitter",
          name: "Splitter",
          health: 90,
          speed: 1.5,
          reward: 18,
          color: "#06b6d4",
          size: 0.45,
          healthLoss: 2,
          split: { minChildren: 2, maxChildren: 4 },
        },
      } as Record<EnemyType, EnemyConfig>,
    });
    enemyActions(testWorld).clearAllEnemies();
    for (const entity of testWorld.query(splitRequest)) entity.destroy();
  });

  const mount = async () =>
    ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <SimulationClockProvider>
            <EntitiesSystem {...entitiesSystemProps} />
          </SimulationClockProvider>
        </EntityIdProvider>
      </WorldProvider>
    );

  it("a killed splitter spawns 2-4 weaker zero-reward children that continue the path", async () => {
    const renderer = await mount();

    try {
      enemyActions(testWorld).spawnEnemy(splitterEnemy(10, 90));
      enemyActions(testWorld).damageEnemy(10, 90);

      // The request is raised the frame the parent dies; the split system
      // (same frame, after death) consumes it and spawns the children.
      await advance(renderer);
      await advance(renderer);

      // Parent is gone.
      expect(
        getEnemySnapshots(testWorld).some((e) => e.id === 10)
      ).toBe(false);
      expect(testWorld.queryFirst(splitRequest)).toBeUndefined();

      const children = getEnemySnapshots(testWorld);
      expect(children.length).toBeGreaterThanOrEqual(2);
      expect(children.length).toBeLessThanOrEqual(4);
      for (const child of children) {
        expect(child.reward).toBe(0);
        expect(child.health).toBe(27);
        expect(child.type).toBe("splitter");
        // Children continue on the parent's path (pathIndex is not mutated by
        // the movement system, so it stays the parent's). The exact x/z and
        // pathProgress are re-derived from the path each frame, so they are not
        // asserted here (see the core-system test for the spawn-location check).
        expect(child.pathIndex).toBe(1);
        expect(child.split).toBeUndefined();
      }
    } finally {
      renderer.unmount();
    }
  });

  it("a non-splitter death spawns no children", async () => {
    const renderer = await mount();

    try {
      enemyActions(testWorld).spawnEnemy({
        id: 20,
        type: "basic",
        name: "E",
        health: 50,
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
      enemyActions(testWorld).damageEnemy(20, 50);

      await advance(renderer);
      await advance(renderer);

      expect(getEnemySnapshots(testWorld)).toHaveLength(0);
      expect(testWorld.queryFirst(splitRequest)).toBeUndefined();
    } finally {
      renderer.unmount();
    }
  });

  it("children never re-split (one generation only)", async () => {
    const renderer = await mount();

    try {
      enemyActions(testWorld).spawnEnemy(splitterEnemy(30, 90));
      enemyActions(testWorld).damageEnemy(30, 90);
      await advance(renderer);
      await advance(renderer);

      const firstGen = getEnemySnapshots(testWorld);
      expect(firstGen.length).toBeGreaterThanOrEqual(2);

      // Kill every first-generation child; none carries a split config, so
      // killing them must produce no further children.
      for (const child of firstGen) {
        enemyActions(testWorld).damageEnemy(child.id, child.maxHealth + 1);
      }
      await advance(renderer);
      await advance(renderer);

      expect(getEnemySnapshots(testWorld)).toHaveLength(0);
    } finally {
      renderer.unmount();
    }
  });
});
