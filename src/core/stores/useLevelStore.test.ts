import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";
import type { LevelConfigData } from "../configs/levelConfig";
import type { MoneyChangedData } from "../types/game";
import { useGameStore } from "./useGameStore";
import { useLevelStore } from "./useLevelStore";

const state = () => useLevelStore.getState();

describe("useLevelStore money events", () => {
  let offMoneyChanged: (() => void) | null;
  const events: MoneyChangedData[] = [];

  beforeEach(() => {
    events.length = 0;
    offMoneyChanged = gameEvents.on<MoneyChangedData>(
      GameEvent.MONEY_CHANGED,
      (data) => {
        events.push(data);
      }
    );
    useLevelStore.setState({ money: 100 });
  });

  afterEach(() => {
    offMoneyChanged?.();
    offMoneyChanged = null;
    useLevelStore.setState({ money: 0 });
    vi.restoreAllMocks();
  });

  it("raises MONEY_CHANGED (increase) with the new total on addMoney", () => {
    state().addMoney(30);
    expect(state().money).toBe(130);
    expect(events).toEqual([{ amount: 130, direction: "increase" }]);
  });

  it("raises MONEY_CHANGED (decrease) with the new total on spendMoney", () => {
    state().spendMoney(40);
    expect(state().money).toBe(60);
    expect(events).toEqual([{ amount: 60, direction: "decrease" }]);
  });

  it("raises no event when the spend is unaffordable", () => {
    state().spendMoney(101);
    expect(state().money).toBe(100);
    expect(events).toHaveLength(0);
  });

  it("raises no event for a zero or negative change", () => {
    state().addMoney(0);
    state().spendMoney(0);
    state().addMoney(-5);
    state().spendMoney(-5);
    expect(state().money).toBe(100);
    expect(events).toHaveLength(0);
  });
});

type LevelEnteredData = {
  run: number;
  portalPositions: { x: number; z: number }[];
};

// `initializeLevelState` only indexes the game-config records when the level
// has towers/enemies; the empty test level never does, so the stubs only need
// to be non-null for the early return to be skipped.
const seedGameConfig = () =>
  useGameStore.setState({
    tileSize: 1,
    towerTypes: {} as never,
    enemyTypes: {} as never,
    enemyUpgrades: {} as never,
  });

const levelData: LevelConfigData = {
  name: "test",
  label: "",
  description: "",
  startingMoney: 10,
  startingHealth: 1,
  gridSize: 4,
  // Two spawn portals; each portal's flat position is its first waypoint.
  pathWaypoints: [
    [{ x: 1, y: 0, z: 2 }, { x: 3, y: 0, z: 4 }],
    [{ x: 0, y: 0, z: 1 }, { x: 2, y: 0, z: 3 }],
  ],
  waveConfigs: [],
  waters: [],
  buildings: [],
  towers: [],
  enemies: [],
  projectiles: [],
  enemyWeights: null,
};

describe("useLevelStore comet reveal", () => {
  let unsubscribe: (() => void) | undefined;
  const received: LevelEnteredData[] = [];

  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
    received.length = 0;
    useLevelStore.getState().resetLevelState();
    useGameStore.setState({
      tileSize: 0,
      towerTypes: null,
      enemyTypes: null,
      enemyUpgrades: null,
    });
  });

  const subscribe = () => {
    unsubscribe = gameEvents.on<LevelEnteredData>(
      GameEvent.LEVEL_ENTERED,
      (data) => {
        received.push(data);
      }
    );
  };

  it("emits LEVEL_ENTERED with the load id and each spawn portal's flat position", () => {
    seedGameConfig();
    subscribe();

    useLevelStore.getState().initializeLevelState(levelData, 1);

    expect(received.length).toBe(1);
    const { run, portalPositions } = received[0];
    expect(run).toBe(useLevelStore.getState().levelEnterRun);
    expect(run).toBeGreaterThan(0);
    // The first waypoint of each path, in flat (x, z) field coordinates.
    expect(portalPositions).toEqual([
      { x: 1, z: 2 },
      { x: 0, z: 1 },
    ]);
    // The store does not arm the reveal itself — the scene's CometStrike
    // orchestrator does, so a level loaded by a scene without a comet (the
    // testing level) is unaffected.
    expect(useLevelStore.getState().cometReveal).toBe(null);
  });

  it("bumps the load id per load and keeps it monotonic across resetLevelState", () => {
    seedGameConfig();
    subscribe();

    const baseline = useLevelStore.getState().levelEnterRun;
    useLevelStore.getState().initializeLevelState(levelData, 1);
    const runA = useLevelStore.getState().levelEnterRun;
    expect(runA).toBe(baseline + 1);

    // A reset preserves the monotonic id (so a restart gets a fresh id) and
    // clears any in-flight reveal.
    useLevelStore.getState().setCometReveal({ run: runA, phase: "armed" });
    expect(useLevelStore.getState().cometReveal?.phase).toBe("armed");
    useLevelStore.getState().resetLevelState();
    expect(useLevelStore.getState().levelEnterRun).toBe(runA);
    expect(useLevelStore.getState().cometReveal).toBe(null);

    // The next load gets a strictly higher id, so a restart replays the
    // comet reveal even on the same level.
    useLevelStore.getState().initializeLevelState(levelData, 1);
    const runB = useLevelStore.getState().levelEnterRun;
    expect(runB).toBe(runA + 1);
    expect(runB).toBeGreaterThan(runA);
    expect(received[1]?.run).toBe(runB);
  });

  it("omits a path with no waypoints from the portal positions (no throw)", () => {
    seedGameConfig();
    subscribe();
    // The level-config schema permits an empty inner array; such a path has no
    // spawn portal, so it must be skipped rather than indexed at `[0]`.
    const emptyPathLevel: LevelConfigData = {
      ...levelData,
      pathWaypoints: [[{ x: 1, y: 0, z: 2 }], []],
    };

    expect(() =>
      useLevelStore.getState().initializeLevelState(emptyPathLevel, 1)
    ).not.toThrow();
    expect(received.length).toBe(1);
    expect(received[0].portalPositions).toEqual([{ x: 1, z: 2 }]);
  });
});
