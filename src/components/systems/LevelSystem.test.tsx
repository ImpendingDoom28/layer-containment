// @vitest-environment jsdom
import { createRoot } from "react-dom/client";
import { act, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LevelSystem } from "./LevelSystem";
import { useLevelStore } from "../../core/stores/useLevelStore";
import { useGameStore } from "../../core/stores/useGameStore";
import { EntityIdProvider } from "../../core/contexts/EntityIdContext";
import type { LevelConfigData } from "../../core/configs/levelConfig";

const levelConfigMock = vi.fn();
vi.mock("../../core/configs/levelConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../core/configs/levelConfig")>()),
  loadLevelConfigFile: (levelName: string) => levelConfigMock(levelName),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flushEffects = () => act(() => {});
// Flush the pending async load effect, then let React process the store update.
const flushLoad = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const minimalLevelData: LevelConfigData = {
  name: "test",
  label: "",
  description: "",
  startingMoney: 10,
  startingHealth: 1,
  gridSize: 8,
  pathWaypoints: [],
  waveConfigs: [],
  waters: [],
  buildings: [],
  towers: [],
  enemies: [],
  projectiles: [],
  enemyWeights: null,
};

describe("LevelSystem load failure", () => {
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
    useLevelStore.getState().resetLevelState();
    useGameStore.setState({
      tileSize: 0,
      towerTypes: null,
      enemyTypes: null,
      enemyUpgrades: null,
    });
    vi.clearAllMocks();
  });

  // `initializeLevelState` only indexes the game-config records when the level
  // has towers/enemies/upgrades; the empty test level never does, so the stubs
  // only need to exist.
  const seedGameConfig = () =>
    useGameStore.setState({
      tileSize: 1,
      towerTypes: {} as never,
      enemyTypes: {} as never,
      enemyUpgrades: {} as never,
    });

  it("records a failed level load in the store", async () => {
    seedGameConfig();
    levelConfigMock.mockRejectedValueOnce(new Error("load failed"));

    root = createRoot(container);
    const element: ReactNode = (
      <EntityIdProvider>
        <LevelSystem levelName="level_main" />
      </EntityIdProvider>
    );
    act(() => {
      root.render(element);
    });

    await flushLoad();
    expect(useLevelStore.getState().levelLoadError).toBe("load failed");
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(false);
  });

  it("retries after the error is cleared and then loads successfully", async () => {
    seedGameConfig();
    levelConfigMock
      .mockRejectedValueOnce(new Error("load failed"))
      .mockResolvedValueOnce(minimalLevelData);

    root = createRoot(container);
    const element: ReactNode = (
      <EntityIdProvider>
        <LevelSystem levelName="level_main" />
      </EntityIdProvider>
    );
    act(() => {
      root.render(element);
    });

    try {
      await flushLoad();
      expect(useLevelStore.getState().levelLoadError).toBe("load failed");
      expect(useLevelStore.getState().isLevelConfigLoaded).toBe(false);

      act(() => {
        useLevelStore.getState().retryLevelLoad();
      });
      expect(useLevelStore.getState().levelLoadError).toBe(null);
      flushEffects();

      await flushLoad();
      expect(useLevelStore.getState().isLevelConfigLoaded).toBe(true);
      expect(useLevelStore.getState().gridSize).toBe(8);
    } finally {
      flushEffects();
    }
  });
});

describe("useLevelStore level load error state", () => {
  it("exposes the error and clears it on retry, bumping the retry token", () => {
    const store = useLevelStore.getState();

    act(() => store.setLevelLoadError("boom"));
    expect(useLevelStore.getState().levelLoadError).toBe("boom");
    expect(useLevelStore.getState().levelLoadRetryToken).toBe(0);

    act(() => useLevelStore.getState().retryLevelLoad());
    expect(useLevelStore.getState().levelLoadError).toBe(null);
    expect(useLevelStore.getState().levelLoadRetryToken).toBe(1);

    act(() => useLevelStore.getState().retryLevelLoad());
    expect(useLevelStore.getState().levelLoadRetryToken).toBe(2);
  });
});
