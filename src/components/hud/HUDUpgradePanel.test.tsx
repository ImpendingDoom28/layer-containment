// @vitest-environment jsdom
import { createRoot, type ReactNode } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { useGameStore } from "../../core/stores/useGameStore";
import { useUpgradeStore } from "../../core/stores/useUpgradeStore";
import type { EnemyUpgradeConfig, EnemyUpgradeId } from "../../core/types/game";
import { HUDUpgradePanel } from "./HUDUpgradePanel";

// React's synthetic `onAnimationEnd` does not fire under jsdom (its delegated
// animationend listener never receives the dispatched event), so the
// "card's own exit animation ends -> unmount" step is covered by the Playwright
// e2e in a real browser. Here we verify the rest of the lifecycle: the panel
// renders on open and, crucially, stays mounted while sliding out after a pick
// is confirmed (the "it just disappears" regression).
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
  true;

const upgradeConfigs: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: {
    id: "armored",
    name: "Armored",
    description: "",
    displayRank: 1,
    healthMultiplier: 1.5,
    rewardMultiplier: 1.4,
    indicatorColor: "#6b7280",
  },
  swift: {
    id: "swift",
    name: "Swift",
    description: "",
    displayRank: 1,
    speedMultiplier: 1.3,
    rewardMultiplier: 1.3,
    indicatorColor: "#fbbf24",
  },
  slowResistance: {
    id: "slowResistance",
    name: "Unstoppable",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.5,
    resistances: { slow: 0.25 },
    indicatorColor: "#8b5cf6",
  },
  regenerating: {
    id: "regenerating",
    name: "Regenerating",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.6,
    abilities: { regeneration: 3 },
    indicatorColor: "#22c55e",
  },
};

const flushEffects = () => act(() => {});

describe("HUDUpgradePanel", () => {
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
    useUpgradeStore.getState().resetLevelEnemyUpgrades();
    useGameStore.setState({ enemyUpgrades: null });
  });

  const mountPanel = () => {
    const element: ReactNode = (
      <HUDUpgradePanel
        onEnemyUpgradePick={(id) =>
          useUpgradeStore.getState().confirmEnemyUpgradePick(id)
        }
      />
    );
    act(() => {
      root.render(element);
    });
    flushEffects();
  };

  it("renders nothing while the upgrade gate is closed", () => {
    root = createRoot(container);
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    mountPanel();
    expect(container.querySelector("[data-game-camera-block]")).toBeNull();
  });

  it("stays mounted and slides out (without vanishing) after a pick is confirmed", () => {
    root = createRoot(container);
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    mountPanel();

    act(() => {
      useUpgradeStore
        .getState()
        .openEnemyUpgradeGate(["armored", "swift", "slowResistance"]);
    });
    flushEffects();

    const opened = container.querySelector("[data-game-camera-block]");
    expect(opened).not.toBeNull();
    expect(opened!.textContent).toContain("Armored");
    expect(container.querySelector('[data-slot="card"]')!.className).toContain(
      "animate-in"
    );

    // Confirming the pick closes the gate. The panel must NOT unmount right
    // away — it has to stay on screen and play its exit (slide-out) animation.
    act(() => {
      useUpgradeStore.getState().confirmEnemyUpgradePick("armored");
    });
    flushEffects();

    const exiting = container.querySelector("[data-game-camera-block]");
    expect(exiting).not.toBeNull();
    // Cards remain visible during the exit (frozen choices).
    expect(exiting!.textContent).toContain("Armored");
    // Interaction is disabled while it slides away.
    expect(exiting!.className).toContain("pointer-events-none");
    // The card switches to the exit animation.
    expect(container.querySelector('[data-slot="card"]')!.className).toContain(
      "animate-out"
    );
  });
});
