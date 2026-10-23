import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorldProvider } from "koota/react";

import { enemyActions } from "../../core/ecs/actions/enemyActions";
import { testWorld } from "../../core/ecs/world";
import { useSimulationClock } from "../../core/hooks/useSimulationClock";
import { useGameStore } from "../../core/stores/useGameStore";
import { useLevelStore } from "../../core/stores/useLevelStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import type { Enemy, Projectile, Tower, TowerConfig } from "../../core/types/game";
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
  const gameStatus = useGameStore((s) => s.gameStatus);
  // Same derivation as GamePage → EntitiesSystem: movement (and the pause
  // clock) stops when the game is paused.
  const [getSimulationTime] = useSimulationClock(gameStatus === "paused");

  return (
    <TowerSystem
      fireProjectile={fireProjectile}
      selectedTower={null}
      onTowerClick={null}
      onSellTower={null}
      hoveredTile={null}
      hoveredTilePlacementState={null}
      selectedTowerType={null}
      getSimulationTime={getSimulationTime}
    />
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

describe("TowerSystem fire timing", () => {
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
