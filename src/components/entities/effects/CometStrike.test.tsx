import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";

import { useGameStore } from "../../../core/stores/useGameStore";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import type { LevelConfigData } from "../../../core/configs/levelConfig";
import { CometStrike } from "./CometStrike";

// The FX is the only piece of CometStrike this test does not want to exercise
// (it needs a real WebGL scene + clock). Mock it to a no-op `<group>` and
// capture its callbacks so a test can drive the strike's lifecycle. `vi.hoisted`
// keeps the capture array alive above the hoisted mock factory.
const fxProps = vi.hoisted(() => [] as { onImpact?: () => void }[]);
vi.mock("./CometStrikeFX", () => ({
  CometStrikeFX: (props: { onImpact?: () => void }) => {
    fxProps.push(props);
    return <group />;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

describe("CometStrike", () => {
  beforeEach(() => {
    fxProps.length = 0;
    seedGameConfig();
    useLevelStore.getState().resetLevelState();
  });

  afterEach(() => {
    useLevelStore.getState().resetLevelState();
    useGameStore.setState({
      tileSize: 0,
      towerTypes: null,
      enemyTypes: null,
      enemyUpgrades: null,
    });
  });

  it("replays the strike when the level was loaded before the scene mounted (catch-up)", async () => {
    // The game flow: `startRun` initializes the level (emitting `LEVEL_ENTERED`)
    // *before* this scene mounts, so the subscription misses the event. The
    // level store retains the load id, and the orchestrator reads it on mount.
    useLevelStore.getState().initializeLevelState(levelData, 1);
    const run = useLevelStore.getState().levelEnterRun;
    expect(useLevelStore.getState().cometReveal).toBe(null); // not armed yet

    const renderer = await ReactThreeTestRenderer.create(<CometStrike />);
    try {
      // On mount, the catch-up arms the reveal, mounts one FX per portal, and
      // consumes the retained load id (so it does not replay on a remount).
      expect(useLevelStore.getState().cometReveal).toEqual({
        run,
        phase: "armed",
      });
      expect(useLevelStore.getState().unseenLevelEnterRun).toBe(null);
      expect(fxProps.length).toBe(2);

      // A strike landing flips the reveal to `revealed` (the portals grow out
      // of the rock) — the same lockstep the event path relies on.
      fxProps[0].onImpact?.();
      expect(useLevelStore.getState().cometReveal).toEqual({
        run,
        phase: "revealed",
      });
    } finally {
      renderer.unmount();
    }
  });

  it("plays the strike when the level loads while the scene is mounted (event path)", async () => {
    const renderer = await ReactThreeTestRenderer.create(<CometStrike />);
    try {
      expect(fxProps.length).toBe(0); // nothing loaded yet
      // The menu flow: the scene is mounted, then the level loads, so
      // `LEVEL_ENTERED` fires while the subscription exists.
      await ReactThreeTestRenderer.act(async () => {
        useLevelStore.getState().initializeLevelState(levelData, 1);
      });
      const run = useLevelStore.getState().levelEnterRun;
      expect(useLevelStore.getState().cometReveal).toEqual({
        run,
        phase: "armed",
      });
      expect(fxProps.length).toBe(2);
    } finally {
      renderer.unmount();
    }
  });

  it("does not replay a stale load after a reset (gridSize guard)", async () => {
    // A level was loaded (e.g. the menu's ambient level) and no scene consumed
    // it, then a reset clears the level (gridSize → 0). The retained load id is
    // now stale and must not arm a strike.
    useLevelStore.getState().initializeLevelState(levelData, 1);
    useLevelStore.getState().resetLevelState();
    expect(useLevelStore.getState().unseenLevelEnterRun).not.toBeNull();
    expect(useLevelStore.getState().gridSize).toBe(0);

    const renderer = await ReactThreeTestRenderer.create(<CometStrike />);
    try {
      expect(useLevelStore.getState().cometReveal).toBe(null);
      expect(fxProps.length).toBe(0);
    } finally {
      renderer.unmount();
    }
  });
});
