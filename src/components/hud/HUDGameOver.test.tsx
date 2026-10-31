// @vitest-environment jsdom
import { createRoot, type ReactNode } from "react-dom/client";
import { act } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { i18n } from "../../core/i18n/i18n";
import type {
  EnemyConfig,
  EnemyType,
  TowerConfig,
  TowerType,
} from "../../core/types/game";
import type { RunStatsSnapshot } from "../../core/ecs/selectors/runStats";
import { useGameStore } from "../../core/stores/useGameStore";
import { HUDGameOver } from "./HUDGameOver";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
  true;

// Load the locale so `t()` resolves real strings instead of raw keys.
void i18n;

const makeTowerConfig = (id: TowerType, name: string): TowerConfig =>
  ({
    id,
    name,
    cost: 10,
    damage: 5,
    range: 4,
    fireRate: 1,
    targeting: "nearest",
    projectileType: "single",
    projectileSpeed: 10,
    color: "#fff",
    description: "",
  }) as TowerConfig;

const makeEnemyConfig = (id: EnemyType, name: string): EnemyConfig =>
  ({
    id,
    name,
    health: 10,
    speed: 1,
    reward: 5,
    color: "#fff",
    size: 1,
    healthLoss: 1,
  }) as EnemyConfig;

const emptyStats = (): RunStatsSnapshot => ({
  totalEarned: 0,
  damageByTowerType: {},
  spendByTowerType: {},
  killsByTowerType: {},
});

const statsWithUsage = (): RunStatsSnapshot => ({
  totalEarned: 123,
  damageByTowerType: { basic: 50, laser: 12 },
  spendByTowerType: { basic: 100, laser: 200 },
  killsByTowerType: {
    basic: { tank: 2, fast: 1 },
    laser: { basic: 3 },
  },
});

describe("HUDGameOver", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  beforeEach(() => {
    // The stats table derives its rows from the config in the store.
    useGameStore.setState({
      towerTypes: {
        basic: makeTowerConfig("basic", "Basic Tower"),
        slow: makeTowerConfig("slow", "Slow Tower"),
        aoe: makeTowerConfig("aoe", "AOE Tower"),
        laser: makeTowerConfig("laser", "Laser Tower"),
        relay: makeTowerConfig("relay", "Relay Tower"),
        chain: makeTowerConfig("chain", "Chain Tower"),
      } as Record<TowerType, TowerConfig>,
      enemyTypes: {
        basic: makeEnemyConfig("basic", "Basic Enemy"),
        fast: makeEnemyConfig("fast", "Fast Enemy"),
        tank: makeEnemyConfig("tank", "Tank Enemy"),
        medic: makeEnemyConfig("medic", "Medic Enemy"),
      } as Record<EnemyType, EnemyConfig>,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    useGameStore.setState({ towerTypes: null, enemyTypes: null });
  });

  const mountOverlay = (
    stats: RunStatsSnapshot,
    status: "won" | "gameOver",
    onNextLevel?: () => void
  ) => {
    const element: ReactNode = (
      <HUDGameOver
        gameStatus={status}
        currentWave={7}
        money={500}
        enemiesKilled={9}
        stats={stats}
        onRestart={() => {}}
        onGoToMainMenu={() => {}}
        onNextLevel={onNextLevel}
      />
    );
    act(() => {
      root.render(element);
    });
    act(() => {});
  };

  it("renders nothing until the run ends", () => {
    root = createRoot(container);
    const element: ReactNode = (
      <HUDGameOver
        gameStatus="playing"
        currentWave={3}
        money={100}
        enemiesKilled={2}
        stats={emptyStats()}
        onRestart={() => {}}
        onGoToMainMenu={() => {}}
      />
    );
    act(() => {
      root.render(element);
    });
    act(() => {});
    expect(container.querySelector("[data-game-camera-block]")).toBeNull();
  });

  it("shows the total-earned stat and the per-tower table on a win", () => {
    root = createRoot(container);
    mountOverlay(statsWithUsage(), "won");

    const overlay = container.querySelector("[data-game-camera-block]");
    expect(overlay).not.toBeNull();

    // Total Earned value is present (i18n resolves the real label).
    expect(overlay!.textContent).toContain("Total Earned");
    expect(overlay!.textContent).toContain("123");

    // Only the tower types that did something appear.
    expect(overlay!.textContent).toContain("Basic Tower");
    expect(overlay!.textContent).toContain("Laser Tower");
    // Relay was never used, so it is excluded.
    expect(overlay!.textContent).not.toContain("Relay Tower");

    // Table shows damage / spent / kills for the active types.
    expect(overlay!.textContent).toContain("50");
    expect(overlay!.textContent).toContain("100");
  });

  it("renders no table when no tower type did anything", () => {
    root = createRoot(container);
    mountOverlay(emptyStats(), "gameOver");

    const overlay = container.querySelector("[data-game-camera-block]");
    expect(overlay).not.toBeNull();
    // The header + final money still render, but there is no table.
    expect(overlay!.querySelector("table")).toBeNull();
  });

  it("shows the Next Level button on a win when a next level is offered", () => {
    root = createRoot(container);
    mountOverlay(statsWithUsage(), "won", () => {});

    const overlay = container.querySelector("[data-game-camera-block]")!;
    const nextButton = [...overlay.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Next Level")
    );
    expect(nextButton).not.toBeUndefined();
    // "Play Again" is still present alongside it.
    const playAgain = [...overlay.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Play Again")
    );
    expect(playAgain).not.toBeUndefined();
  });

  it("hides the Next Level button when no next level is offered", () => {
    root = createRoot(container);
    mountOverlay(statsWithUsage(), "won");

    const overlay = container.querySelector("[data-game-camera-block]")!;
    const nextButton = [...overlay.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Next Level")
    );
    expect(nextButton).toBeUndefined();
  });

  it("hides the Next Level button on a defeat", () => {
    root = createRoot(container);
    mountOverlay(statsWithUsage(), "gameOver", () => {});

    const overlay = container.querySelector("[data-game-camera-block]")!;
    const nextButton = [...overlay.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Next Level")
    );
    expect(nextButton).toBeUndefined();
  });

  it("invokes onNextLevel when the Next Level button is clicked", () => {
    root = createRoot(container);
    const onNextLevel = vi.fn();
    mountOverlay(statsWithUsage(), "won", onNextLevel);

    const overlay = container.querySelector("[data-game-camera-block]")!;
    const nextButton = [...overlay.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Next Level")
    );
    act(() => {
      nextButton!.click();
    });
    expect(onNextLevel).toHaveBeenCalledTimes(1);
  });
});
