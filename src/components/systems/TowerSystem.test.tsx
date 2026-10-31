import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorldProvider } from "koota/react";

import { enemyActions } from "../../core/ecs/actions/enemyActions";
import { testWorld } from "../../core/ecs/world";
import { SimulationClockProvider } from "../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../core/stores/useGameStore";
import { useLevelStore } from "../../core/stores/useLevelStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import type {
  Building,
  Enemy,
  Projectile,
  Tower,
  TowerConfig,
} from "../../core/types/game";
import { TowerSystem } from "./TowerSystem";

// The tower mesh is purely visual and not under test.
vi.mock("../entities/Tower", () => ({ Tower: () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The test renderer runs in frameloop "never" mode and never advances the
// THREE clock, so the test drives raw elapsed time by writing to the scene
// clock directly before each frame — exactly the value `useFrame` readers
// observe in the real app.
let sceneClock: { elapsedTime: number };

const fireProjectile = vi.fn(
  (params: Omit<Projectile, "id">) => ({ ...params, id: 1 })
);

const TowerHarness = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;

  // The provider derives `shouldStopMovement` from the game stores (the same
  // derivation `useGameSystem` uses), so the tower's fire clock eases to stillness
  // when the status flips to "paused" and resumes on "playing".
  return (
    <SimulationClockProvider>
      <TowerSystem
        fireProjectile={fireProjectile}
        selectedTower={null}
        onTowerClick={null}
        onSellTower={null}
        hoveredTile={null}
        hoveredTilePlacementState={null}
        selectedTowerType={null}
      />
    </SimulationClockProvider>
  );
};

const basicConfig: TowerConfig = {
  id: "basic",
  name: "Basic",
  cost: 10,
  damage: 10,
  range: 2,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 5,
  color: "#fff",
  description: "",
};

const tower: Tower = {
  ...basicConfig,
  id: 1,
  type: "basic",
  lastFireTime: 0,
  gridX: 0,
  gridZ: 0,
  x: 0,
  z: 0,
};

const makeEnemy = (id: number): Enemy => ({
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
  // Within the tower's range of 2.
  x: 0.5,
  z: 0,
  upgrades: [],
});

const advanceFrame = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>,
  rawTime: number
) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

const setPaused = async (paused: boolean) => {
  await ReactThreeTestRenderer.act(async () => {
    useGameStore.getState().setGameStatus(paused ? "paused" : "playing");
  });
};

beforeEach(() => {
  fireProjectile.mockClear();
  enemyActions(testWorld).clearAllEnemies();
  useLevelStore.getState().resetLevelState();
  useLevelStore.setState({
    gridSize: 8,
    pathWaypoints: [],
    towers: [tower],
    isLevelConfigLoaded: true,
  });
  useGameStore.setState({
    gameStatus: "playing",
    isPageVisible: true,
    towerTypes: { basic: basicConfig } as Record<
      (typeof basicConfig)["id"],
      TowerConfig
    >,
    tileSize: 1,
    pathWidth: 1,
    towerHeight: 1,
  });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

describe("TowerSystem fire timing", () => {
  it("keeps firing at its fire rate while playing", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <TowerHarness />
      </WorldProvider>
    );

    try {
      enemyActions(testWorld).spawnEnemy(makeEnemy(1));

      await advanceFrame(renderer, 1);
      expect(fireProjectile).toHaveBeenCalledTimes(1);

      await advanceFrame(renderer, 2);
      expect(fireProjectile).toHaveBeenCalledTimes(2);

      // Half a fire-rate later: still on cooldown.
      await advanceFrame(renderer, 2.4);
      expect(fireProjectile).toHaveBeenCalledTimes(2);

      await advanceFrame(renderer, 3);
      expect(fireProjectile).toHaveBeenCalledTimes(3);
    } finally {
      renderer.unmount();
    }
  });

  it("does not fire the instant the game resumes after a pause", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <TowerHarness />
      </WorldProvider>
    );

    try {
      enemyActions(testWorld).spawnEnemy(makeEnemy(1));

      // Fire once at simulation time 1.
      await advanceFrame(renderer, 1);
      expect(fireProjectile).toHaveBeenCalledTimes(1);

      // Pause at the very next frame, before any more simulation time
      // elapses: the world (and the tower's cooldown) freeze at sim time 1.
      await setPaused(true);
      for (const raw of [1, 2, 3, 4, 5, 6]) {
        await advanceFrame(renderer, raw);
      }
      expect(fireProjectile).toHaveBeenCalledTimes(1);

      // Resume. The raw clock now reads 7, but only simulation time 1 has
      // elapsed — a full fire-rate cooldown is still in effect, so no shot
      // is due on the first resumable frame (the old bug fired here).
      await setPaused(false);
      await advanceFrame(renderer, 7);
      expect(fireProjectile).toHaveBeenCalledTimes(1);

      // One full fire-rate of simulation time later, the tower fires again.
      await advanceFrame(renderer, 8);
      expect(fireProjectile).toHaveBeenCalledTimes(2);
    } finally {
      renderer.unmount();
    }
  });
});

describe("TowerSystem line of sight", () => {
  // A 0.4-wide square building; positioned per test.
  const makeBuilding = (gridX: number, gridZ: number): Building => ({
    id: 1,
    gridX,
    gridZ,
    x: gridX,
    z: gridZ,
    shape: "box",
    width: 0.4,
    depth: 0.4,
    height: 1,
    color: "#fff",
  });

  const enemyA = (): Enemy => ({ ...makeEnemy(1), x: 1, z: 0 });
  const enemyB = (): Enemy => ({ ...makeEnemy(2), x: 0, z: 1 });

  const setupWith = async (
    buildings: Building[],
    spawn: Array<() => Enemy>
  ) => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <TowerHarness />
      </WorldProvider>
    );
    // Set up the store (and the ECS world) inside `act` so the re-render
    // with the new buildings is flushed before the frame under test runs.
    await ReactThreeTestRenderer.act(async () => {
      useLevelStore.getState().setBuildings(buildings);
      for (const make of spawn) {
        enemyActions(testWorld).spawnEnemy(make());
      }
    });
    await advanceFrame(renderer, 1);
    return renderer;
  };

  it("does not shoot through a building: skips the hidden enemy", async () => {
    // Building at (0.5, 0) sits between the tower (0, 0) and enemy A (1, 0),
    // so the tower must skip A and fire at enemy B (0, 1) instead.
    const renderer = await setupWith(
      [makeBuilding(0.5, 0)],
      [enemyA, enemyB]
    );

    try {
      expect(fireProjectile).toHaveBeenCalledTimes(1);
      expect(fireProjectile.mock.calls[0][0].targetId).toBe(2);
    } finally {
      renderer.unmount();
    }
  });

  it("fires at the nearest enemy when the building is off the sight line", async () => {
    // Building at (0, 0.5) blocks nothing on the tower→A segment, so the
    // tower still picks the nearest enemy, A.
    const renderer = await setupWith(
      [makeBuilding(0, 0.5)],
      [enemyA, enemyB]
    );

    try {
      expect(fireProjectile).toHaveBeenCalledTimes(1);
      expect(fireProjectile.mock.calls[0][0].targetId).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("does not fire when every in-range enemy is hidden behind a building", async () => {
    const renderer = await setupWith([makeBuilding(0.5, 0)], [enemyA]);

    try {
      expect(fireProjectile).not.toHaveBeenCalled();
    } finally {
      renderer.unmount();
    }
  });

  it("still blocks a hidden enemy when other buildings sit off the sight line", async () => {
    // Regression: the slab check must test each building independently.
    // The (0.5, 0.5) building is off both the tower→A and tower→B segments;
    // the (0.5, 0) building sits on the tower→A segment. A check that
    // stopped at the first (non-blocking) building let the tower shoot A
    // through the second one.
    const renderer = await setupWith(
      [makeBuilding(0.5, 0.5), makeBuilding(0.5, 0)],
      [enemyA, enemyB]
    );

    try {
      expect(fireProjectile).toHaveBeenCalledTimes(1);
      expect(fireProjectile.mock.calls[0][0].targetId).toBe(2);
    } finally {
      renderer.unmount();
    }
  });
});

describe("TowerSystem targeting strategies", () => {
  // Enemy A is the nearest (distance 1), enemy B the furthest (distance 1.4).
  // B also carries the most health, A the least — so "highest" picks B and
  // "lowest" picks A, unambiguously.
  const enemyA = (): Enemy => ({
    ...makeEnemy(1),
    x: 1,
    z: 0,
    health: 10,
    maxHealth: 10,
  });
  const enemyB = (): Enemy => ({
    ...makeEnemy(2),
    x: 1,
    z: 1,
    health: 80,
    maxHealth: 80,
  });

  const withStrategy = async (targeting: Tower["targeting"], spawn: Enemy[]) => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <TowerHarness />
      </WorldProvider>
    );
    await ReactThreeTestRenderer.act(async () => {
      useLevelStore.getState().setTowers([
        { ...tower, targeting },
      ]);
      for (const enemy of spawn) {
        enemyActions(testWorld).spawnEnemy(enemy);
      }
    });
    await advanceFrame(renderer, 1);
    return renderer;
  };

  it("fires at the lowest-HP enemy for the lowest strategy", async () => {
    const renderer = await withStrategy("lowest", [enemyA(), enemyB()]);
    try {
      expect(fireProjectile).toHaveBeenCalledTimes(1);
      expect(fireProjectile.mock.calls[0][0].targetId).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("fires at the highest-HP enemy for the highest strategy", async () => {
    const renderer = await withStrategy("highest", [enemyA(), enemyB()]);
    try {
      expect(fireProjectile).toHaveBeenCalledTimes(1);
      expect(fireProjectile.mock.calls[0][0].targetId).toBe(2);
    } finally {
      renderer.unmount();
    }
  });

  it("keeps firing the same enemy for the focused strategy while it is in range", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <TowerHarness />
      </WorldProvider>
    );
    await ReactThreeTestRenderer.act(async () => {
      useLevelStore.getState().setTowers([{ ...tower, targeting: "focused" }]);
      enemyActions(testWorld).spawnEnemy(enemyA());
      enemyActions(testWorld).spawnEnemy(enemyB());
    });

    try {
      // First volley: no prior target, so focused falls back to the nearest (A).
      await advanceFrame(renderer, 1);
      expect(fireProjectile).toHaveBeenCalledTimes(1);
      expect(fireProjectile.mock.calls[0][0].targetId).toBe(1);

      // Second volley: the tower remembers A and keeps firing it even though
      // A is only as near as before and B is now also in range.
      await advanceFrame(renderer, 2);
      expect(fireProjectile).toHaveBeenCalledTimes(2);
      expect(fireProjectile.mock.calls[1][0].targetId).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("re-targets the nearest enemy for the focused strategy once its target dies", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <TowerHarness />
      </WorldProvider>
    );
    await ReactThreeTestRenderer.act(async () => {
      useLevelStore.getState().setTowers([{ ...tower, targeting: "focused" }]);
      enemyActions(testWorld).spawnEnemy(enemyA());
      enemyActions(testWorld).spawnEnemy(enemyB());
    });

    try {
      // Fire at A (nearest) on the first volley.
      await advanceFrame(renderer, 1);
      expect(fireProjectile).toHaveBeenCalledTimes(1);
      expect(fireProjectile.mock.calls[0][0].targetId).toBe(1);

      // Kill A so the focused tower must fall back to B.
      await ReactThreeTestRenderer.act(async () => {
        enemyActions(testWorld).updateEnemy(1, { health: 0 });
      });

      await advanceFrame(renderer, 2);
      expect(fireProjectile).toHaveBeenCalledTimes(2);
      expect(fireProjectile.mock.calls[1][0].targetId).toBe(2);
    } finally {
      renderer.unmount();
    }
  });
});
