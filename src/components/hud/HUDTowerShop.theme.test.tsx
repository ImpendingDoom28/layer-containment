// @vitest-environment jsdom
import { createRoot, type ReactNode } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { i18n } from "../../core/i18n/i18n";
import type { TowerConfig, TowerType } from "../../core/types/game";
import { useGameStore } from "../../core/stores/useGameStore";
import {
  useHudThemeStore,
  type HudThemeId,
} from "../../core/stores/useHudThemeStore";
import { HUDTowerShop } from "./HUDTowerShop";

(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT =
  true;

// Load the locale so `t()` resolves real strings instead of raw keys.
void i18n;

// Distinct costs so the affordability split is unambiguous at money = 10
// (only the basic tower is affordable).
const TOWER_COSTS: Record<TowerType, number> = {
  basic: 10,
  slow: 50,
  aoe: 150,
  laser: 200,
  relay: 90,
  chain: 120,
};

const TOWER_NAMES: Record<TowerType, string> = {
  basic: "Basic Tower",
  slow: "Slow Tower",
  aoe: "AOE Tower",
  laser: "Laser Tower",
  relay: "Relay Tower",
  chain: "Chain Lightning",
};

const makeTowerConfig = (
  id: TowerType,
  name: string,
  cost: number
): TowerConfig =>
  ({
    id,
    name,
    cost,
    damage: 5,
    range: 4,
    fireRate: 1,
    targeting: "nearest",
    projectileType: "single",
    projectileSpeed: 10,
    color: "#fff",
    description: "",
  }) as TowerConfig;

describe("HUDTowerShop themes", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  beforeEach(() => {
    const towerTypes = {
      basic: makeTowerConfig("basic", TOWER_NAMES.basic, TOWER_COSTS.basic),
      slow: makeTowerConfig("slow", TOWER_NAMES.slow, TOWER_COSTS.slow),
      aoe: makeTowerConfig("aoe", TOWER_NAMES.aoe, TOWER_COSTS.aoe),
      laser: makeTowerConfig("laser", TOWER_NAMES.laser, TOWER_COSTS.laser),
      relay: makeTowerConfig("relay", TOWER_NAMES.relay, TOWER_COSTS.relay),
      chain: makeTowerConfig("chain", TOWER_NAMES.chain, TOWER_COSTS.chain),
    } as Record<TowerType, TowerConfig>;
    useGameStore.setState({
      towerTypes,
      selectedTowerTypeToPlace: null,
      denyPulse: {},
    });
    useHudThemeStore.setState({ theme: "command" });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    useGameStore.setState({ towerTypes: null });
    useHudThemeStore.setState({ theme: "command" });
  });

  const mountShop = (theme: HudThemeId, money = 10) => {
    useHudThemeStore.setState({ theme });
    root = createRoot(container);
    const element: ReactNode = <HUDTowerShop money={money} />;
    act(() => {
      root.render(element);
    });
    act(() => {});
  };

  it.each(["command", "hologram", "tactical", "arcade", "glass"])(
    "renders the shop region and all tower buttons on the %s theme",
    (theme) => {
      mountShop(theme, 1000);

      const shop = container.querySelector(
        '[data-testid="tower-shop"]'
      ) as HTMLElement;
      expect(shop).not.toBeNull();
      expect(shop.getAttribute("role")).toBe("region");
      // "Tower Shop" is the accessible name for every theme (the e2e suite
      // locates the panel by this heading).
      expect(shop.getAttribute("aria-label")).toBe("Tower Shop");

      for (const id of Object.keys(TOWER_NAMES) as TowerType[]) {
        const button = container.querySelector(
          `[data-testid="tower-${id}"]`
        ) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.textContent).toContain(TOWER_NAMES[id]);
      }
    }
  );

  it("keeps the cancel-selection flow working in every theme", () => {
    for (const theme of [
      "command",
      "hologram",
      "tactical",
      "arcade",
      "glass",
    ] as const) {
      mountShop(theme, 1000);

      const basic = container.querySelector(
        '[data-testid="tower-basic"]'
      ) as HTMLButtonElement;
      act(() => {
        basic.click();
      });
      act(() => {});
      expect(useGameStore.getState().selectedTowerTypeToPlace).toBe("basic");
      const cancel = container.querySelector(
        '[data-testid="tower-cancel-selection"]'
      ) as HTMLButtonElement;
      expect(cancel).not.toBeNull();

      act(() => {
        cancel.click();
      });
      act(() => {});
      expect(useGameStore.getState().selectedTowerTypeToPlace).toBeNull();
      expect(
        container.querySelector('[data-testid="tower-cancel-selection"]')
      ).toBeNull();

      act(() => {
        root.unmount();
      });
    }
  });

  it("marks unaffordable towers as disabled in every theme", () => {
    // money = 10 covers only the $10 basic tower.
    for (const theme of [
      "command",
      "hologram",
      "tactical",
      "arcade",
      "glass",
    ] as const) {
      mountShop(theme, 10);

      const basic = container.querySelector(
        '[data-testid="tower-basic"]'
      ) as HTMLButtonElement;
      expect(basic.getAttribute("aria-disabled")).not.toBe("true");

      for (const id of ["slow", "aoe", "laser", "relay", "chain"] as const) {
        const button = container.querySelector(
          `[data-testid="tower-${id}"]`
        ) as HTMLButtonElement;
        expect(button).not.toBeNull();
        expect(button.getAttribute("aria-disabled")).toBe("true");
      }

      act(() => {
        root.unmount();
      });
    }
  });
});
