// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
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
import { useQuestStore } from "../../core/stores/useQuestStore";
import type { QuestConfig, QuestCounters } from "../../core/types/quests";
import { HUDGameOver } from "./HUDGameOver";

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] =
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
    model: { url: "assets/models/tower_basic.glb", node: "Tower_Basic_ROOT" },
    muzzle: { turretNode: "Azimuth", muzzle: { x: 0, y: 0.3731, z: 1.071 } },
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

const QUESTS: QuestConfig[] = [
  {
    id: "hold-front",
    labelKey: "quests.noLeaks",
    labelParams: { count: 3 },
    counters: { leaks: 3 },
    deferred: true,
  },
  {
    id: "start-2-waves",
    labelKey: "quests.startWave",
    labelParams: { count: 2 },
    counters: { wavesStarted: 2 },
  },
  {
    id: "kill-3-tanks",
    additional: true,
    labelKey: "quests.defeatType",
    counters: { killsByType: { tank: 3 } },
  },
];

const terminalCounters = (
  overrides: Partial<QuestCounters> = {}
): QuestCounters => ({
  leaks: 0,
  victory: false,
  runOver: false,
  wavesStarted: 0,
  towersPlaced: 0,
  towersSold: 0,
  kills: 0,
  killsByType: {},
  totalGoldEarned: 0,
  ...overrides,
});

describe("HUDGameOver", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  beforeEach(() => {
    useQuestStore.getState().resetQuests();
    // The stats table derives its rows from the config in the store.
    useGameStore.setState({
      towerTypes: {
        basic: makeTowerConfig("basic", "Basic Tower"),
        slow: makeTowerConfig("slow", "Slow Tower"),
        brl: makeTowerConfig("brl", "BRL"),
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
    useQuestStore.getState().resetQuests();
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

  it("summarises the level's quests in the modal (main + bonus)", () => {
    root = createRoot(container);
    act(() => {
      useQuestStore.setState({
        quests: QUESTS,
        counters: terminalCounters({ wavesStarted: 2, killsByType: { tank: 3 } }),
      });
    });
    mountOverlay(statsWithUsage(), "gameOver");

    const overlay = container.querySelector("[data-game-camera-block]")!;
    expect(
      overlay.querySelector('[data-testid="quests-list"]')
    ).not.toBeNull();
    const main = overlay.querySelector('[data-testid="quests-main"]');
    const bonus = overlay.querySelector('[data-testid="quests-additional"]');
    expect(main?.querySelectorAll('[data-testid^="quest-row-"]').length).toBe(2);
    expect(bonus?.querySelectorAll('[data-testid^="quest-row-"]').length).toBe(1);
  });

  it("shows no quest list for a level without quests", () => {
    root = createRoot(container);
    mountOverlay(statsWithUsage(), "won");
    const overlay = container.querySelector("[data-game-camera-block]")!;
    expect(
      overlay.querySelector('[data-testid="quests-list"]')
    ).toBeNull();
  });

  it("settles the deferred leak cap on the outcome of the run", () => {
    // Won with zero leaks: the line was held to the end -> complete.
    root = createRoot(container);
    act(() => {
      useQuestStore.setState({
        quests: QUESTS,
        counters: terminalCounters({ victory: true }),
      });
    });
    mountOverlay(statsWithUsage(), "won");
    let holdRow = container.querySelector(
      '[data-testid="quest-row-hold-front"]'
    );
    expect(holdRow?.getAttribute("data-state")).toBe("complete");

    // Defeated: the line could not be held to the end -> failed.
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    act(() => {
      useQuestStore.setState({
        quests: QUESTS,
        counters: terminalCounters({ runOver: true }),
      });
    });
    mountOverlay(statsWithUsage(), "gameOver");
    holdRow = container.querySelector(
      '[data-testid="quest-row-hold-front"]'
    );
    expect(holdRow?.getAttribute("data-state")).toBe("failed");
  });

  it("enlarges the modal so the stats and the quest summary both fit", () => {
    root = createRoot(container);
    act(() => {
      useQuestStore.setState({
        quests: QUESTS,
        counters: terminalCounters(),
      });
    });
    mountOverlay(statsWithUsage(), "gameOver");
    const overlay = container.querySelector("[data-game-camera-block]")!;
    // The content box carries the enlarged width classes.
    const content = overlay.firstElementChild as HTMLElement;
    expect(content.className).toContain("max-w-xl");
    expect(content.className).toContain("md:max-w-2xl");
    // ...and the quest summary still renders inside it.
    expect(
      overlay.querySelector('[data-testid="quests-list"]')
    ).not.toBeNull();
  });
});
