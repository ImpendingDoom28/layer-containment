// @vitest-environment jsdom
import { createRoot, type ReactNode } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { i18n } from "../../core/i18n/i18n";
import type { RunStatsSnapshot } from "../../core/ecs/selectors/runStats";
import { HUDGameOver } from "./HUDGameOver";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
  true;

// Load the locale so `t()` resolves real strings instead of raw keys.
void i18n;

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

  afterEach(() => {
    act(() => {
      root.unmount();
    });
  });

  const mountOverlay = (stats: RunStatsSnapshot, status: "won" | "gameOver") => {
    const element: ReactNode = (
      <HUDGameOver
        gameStatus={status}
        currentWave={7}
        money={500}
        enemiesKilled={9}
        stats={stats}
        onRestart={() => {}}
        onGoToMainMenu={() => {}}
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
});
