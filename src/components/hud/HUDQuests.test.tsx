// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { i18n } from "../../core/i18n/i18n";
import {
  questCountersSelector,
  questsSelector,
  useQuestStore,
} from "../../core/stores/useQuestStore";
import type { QuestConfig, QuestCounters } from "../../core/types/quests";
import { HUDQuests } from "./HUDQuests";

(globalThis as unknown as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] =
  true;

void i18n;

const QUESTS: QuestConfig[] = [
  {
    id: "start-2-waves",
    labelKey: "quests.startWave",
    labelParams: { count: 2 },
    counters: { wavesStarted: 2 },
  },
  {
    id: "hold-front",
    labelKey: "quests.noLeaks",
    labelParams: { count: 3 },
    counters: { leaks: 3 },
    deferred: true,
  },
  {
    id: "kill-3-tanks",
    additional: true,
    labelKey: "quests.defeatType",
    counters: { killsByType: { tank: 3 } },
  },
  {
    id: "place-2-towers",
    additional: true,
    labelKey: "quests.placeTowers",
    labelParams: { count: 2 },
    counters: { towersPlaced: 2 },
  },
];

const COUNTERS: QuestCounters = {
  leaks: 0,
  victory: false,
  runOver: false,
  wavesStarted: 2,
  towersPlaced: 1,
  towersSold: 0,
  kills: 0,
  killsByType: { tank: 3 },
  totalGoldEarned: 0,
};

describe("HUDQuests", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeAll(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  beforeEach(() => {
    useQuestStore.setState({ quests: QUESTS, counters: COUNTERS });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    useQuestStore.setState({ quests: [], counters: { ...COUNTERS } });
  });

  const mount = () => {
    root = createRoot(container);
    act(() => {
      root.render(<HUDQuests />);
    });
    act(() => {});
  };

  it("renders nothing for a level without quests", () => {
    useQuestStore.setState({ quests: [], counters: COUNTERS });
    mount();
    expect(container.querySelector('[data-testid="quests-card"]')).toBeNull();
  });

  it("renders the main and bonus sections with their headers", () => {
    mount();
    expect(container.querySelector('[data-testid="quests-card"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="quests-main"]')?.textContent
    ).toContain("Objectives");
    expect(
      container.querySelector('[data-testid="quests-additional"]')?.textContent
    ).toContain("Bonus");
  });

  it("splits quests into main (top) and bonus (below) sections", () => {
    mount();
    const main = container.querySelector('[data-testid="quests-main"]');
    const bonus = container.querySelector('[data-testid="quests-additional"]');
    // Main section holds the two non-additional quests; bonus the two additional.
    expect(main?.querySelectorAll('[data-testid^="quest-row-"]').length).toBe(2);
    expect(bonus?.querySelectorAll('[data-testid^="quest-row-"]').length).toBe(2);
    // The bonus section sits below the main one in the DOM.
    expect(
      main!.compareDocumentPosition(bonus!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows current/target per quest and marks completed ones", () => {
    mount();
    // start-2-waves: 2/2 complete (wavesStarted reached).
    const startRow = container.querySelector(
      '[data-testid="quest-row-start-2-waves"]'
    );
    expect(startRow?.textContent).toContain("2/2");
    // hold-front (leaks cap): 0 leaks, cap 3 -> 3/3 complete.
    const holdRow = container.querySelector(
      '[data-testid="quest-row-hold-front"]'
    );
    expect(holdRow?.textContent).toContain("3/3");
    // kill-3-tanks: 3/3 complete.
    const tankRow = container.querySelector(
      '[data-testid="quest-row-kill-3-tanks"]'
    );
    expect(tankRow?.textContent).toContain("3/3");
    // place-2-towers: 1/2 not complete.
    const placeRow = container.querySelector(
      '[data-testid="quest-row-place-2-towers"]'
    );
    expect(placeRow?.textContent).toContain("1/2");
  });

  it("localises the per-type quest label with the enemy name and count", () => {
    mount();
    const tankRow = container.querySelector(
      '[data-testid="quest-row-kill-3-tanks"]'
    );
    expect(tankRow?.textContent).toContain("Defeat 3");
    expect(tankRow?.textContent).toContain("Tankee");
  });

  it("strikethroughs a completed quest label", () => {
    mount();
    const startLabel =
      container.querySelector('[data-testid="quest-row-start-2-waves"]')
        ?.querySelector("p");
    expect(startLabel?.className).toContain("line-through");
    // An incomplete quest is not struck through.
    const placeLabel =
      container.querySelector('[data-testid="quest-row-place-2-towers"]')
        ?.querySelector("p");
    expect(placeLabel?.className).not.toContain("line-through");
  });

  it("de-emphasises the bonus rows (dimmed) vs the main rows", () => {
    mount();
    const bonusRow = container.querySelector(
      '[data-testid="quest-row-kill-3-tanks"]'
    );
    const mainRow = container.querySelector(
      '[data-testid="quest-row-start-2-waves"]'
    );
    expect(bonusRow?.className).toContain("opacity-60");
    expect(mainRow?.className).not.toContain("opacity-60");
  });

  it("reflects quest progress updates from the counters", () => {
    mount();
    // Bump towersPlaced to 2 -> place-2-towers completes.
    act(() => {
      useQuestStore.setState({
        counters: { ...useQuestStore.getState().counters, towersPlaced: 2 },
      });
    });
    const placeRow = container.querySelector(
      '[data-testid="quest-row-place-2-towers"]'
    );
    expect(placeRow?.textContent).toContain("2/2");
  });

  it("renders no panel background (fully transparent card)", () => {
    mount();
    for (const testid of ["quests-card", "quests-main", "quests-additional"]) {
      const section = container.querySelector(`[data-testid="${testid}"]`);
      expect(section?.className).not.toMatch(/bg-|backdrop-blur|rounded/);
    }
  });

  it("marks a quest failed when its leak cap is exceeded", () => {
    mount();
    act(() => {
      useQuestStore.setState({
        counters: { ...useQuestStore.getState().counters, leaks: 4 },
      });
    });
    const holdRow = container.querySelector(
      '[data-testid="quest-row-hold-front"]'
    );
    expect(holdRow?.getAttribute("data-state")).toBe("failed");
    // The checkbox shows the failed state instead of a check.
    expect(holdRow?.querySelector('[data-state="failed"]')).not.toBeNull();
  });

  it("keeps a deferred leak cap open mid-run even while the cap holds", () => {
    mount();
    // hold-front is deferred (level 1): holding the cap is not yet a win.
    const holdRow = container.querySelector(
      '[data-testid="quest-row-hold-front"]'
    );
    expect(holdRow?.getAttribute("data-state")).toBe("open");
    expect(holdRow?.textContent).toContain("3/3");
  });

  it("fails every incomplete quest when the run is lost", () => {
    mount();
    act(() => {
      useQuestStore.setState({
        counters: { ...useQuestStore.getState().counters, runOver: true },
      });
    });
    // place-2-towers was the only incomplete quest (1/2) -> now failed.
    const placeRow = container.querySelector(
      '[data-testid="quest-row-place-2-towers"]'
    );
    expect(placeRow?.getAttribute("data-state")).toBe("failed");
    // The completed quests stay complete, not failed.
    const startRow = container.querySelector(
      '[data-testid="quest-row-start-2-waves"]'
    );
    expect(startRow?.getAttribute("data-state")).toBe("complete");
    // hold-front is deferred: a lost run means the line was not held to the
    // end, so the still-open cap quest fails (it is not "complete" anymore).
    const holdRow = container.querySelector(
      '[data-testid="quest-row-hold-front"]'
    );
    expect(holdRow?.getAttribute("data-state")).toBe("failed");
  });

  it("keeps incomplete quests uncompleted (not failed) when the run is won", () => {
    mount();
    act(() => {
      useQuestStore.setState({
        counters: { ...useQuestStore.getState().counters, victory: true },
      });
    });
    const placeRow = container.querySelector(
      '[data-testid="quest-row-place-2-towers"]'
    );
    expect(placeRow?.getAttribute("data-state")).toBe("open");
    expect(
      placeRow?.querySelector('[data-state="failed"]')
    ).toBeNull();
    // The deferred leak cap completes on the win (the line was held to the end).
    const holdRow = container.querySelector(
      '[data-testid="quest-row-hold-front"]'
    );
    expect(holdRow?.getAttribute("data-state")).toBe("complete");
  });

  it("exposes the quest selectors over the store state", () => {
    const state = useQuestStore.getState();
    expect(questsSelector(state)).toEqual(QUESTS);
    expect(questCountersSelector(state)).toEqual(COUNTERS);
  });
});
