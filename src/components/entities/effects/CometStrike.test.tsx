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
const fxProps = vi.hoisted(() => [] as { onImpact?: (simTime: number) => void }[]);
vi.mock("./CometStrikeFX", () => ({
  CometStrikeFX: (props: { onImpact?: (simTime: number) => void }) => {
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

const fxCount = () => fxProps.length;

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

  it("re-arms the strike when the level was loaded before the scene mounted", async () => {
    // The game flow: `startRun` initializes the level (emitting `LEVEL_ENTERED`)
    // *before* this scene mounts, so the subscription misses the event. On
    // mount the reveal for the current run is `null` (never armed), so the
    // catch-up arms it.
    useLevelStore.getState().initializeLevelState(levelData, 1);
    const run = useLevelStore.getState().levelEnterRun;
    // Never armed yet: the event fired before any scene was subscribed.
    useLevelStore.getState().setCometReveal(null);
    const before = fxCount();

    const renderer = await ReactThreeTestRenderer.create(<CometStrike />);
    try {
      // On mount, the catch-up arms the reveal and mounts one FX per portal.
      expect(useLevelStore.getState().cometReveal).toEqual({
        run,
        phase: "armed",
      });
      expect(fxCount()).toBe(before + 2);

      // A strike landing flips the reveal to `revealed` (the portals grow out
      // of the rock) and stamps the impact's simulation time, so the wave
      // system can hold wave 1 until the portals settle.
      fxProps[before].onImpact?.(1.2);
      expect(useLevelStore.getState().cometReveal).toEqual({
        run,
        phase: "revealed",
        revealedAt: 1.2,
      });
    } finally {
      await renderer.unmount();
    }
  });

  it("restores an in-flight strike when the scene remounts before impact", async () => {
    // React StrictMode's simulated unmount (dev) tears the FX down without a
    // level reset, leaving the reveal `armed` for the current run — the portal
    // is hidden. On remount the catch-up must re-arm the strike (not skip it),
    // or the portal stays hidden indefinitely.
    useLevelStore.getState().initializeLevelState(levelData, 1);
    const run = useLevelStore.getState().levelEnterRun;

    const first = await ReactThreeTestRenderer.create(<CometStrike />);
    expect(useLevelStore.getState().cometReveal).toEqual({
      run,
      phase: "armed",
    });
    await first.unmount(); // tears the FX down; the reveal stays `armed`
    expect(useLevelStore.getState().cometReveal).toEqual({
      run,
      phase: "armed",
    });

    const before = fxCount();
    const second = await ReactThreeTestRenderer.create(<CometStrike />);
    try {
      // Re-armed: the FX is mounted again and the reveal still arms this run.
      expect(fxCount()).toBe(before + 2);
      expect(useLevelStore.getState().cometReveal).toEqual({
        run,
        phase: "armed",
      });
    } finally {
      await second.unmount();
    }
  });

  it("does not replay the strike after it has completed", async () => {
    // The level is loaded (run N) and its strike has already completed (the
    // reveal is `revealed` for run N). Mounting must not arm the same run
    // again, or the portals would hide a second time. The completed state is
    // set directly on the store (not via the `LEVEL_ENTERED` emit) so the
    // assertion is isolated from any cross-test subscription.
    useLevelStore.getState().initializeLevelState(levelData, 1);
    const run = useLevelStore.getState().levelEnterRun;
    useLevelStore.getState().setCometReveal({ run, phase: "revealed" });

    const before = fxCount();
    const renderer = await ReactThreeTestRenderer.create(<CometStrike />);
    try {
      // No replay: the completed reveal for the current run is left alone.
      expect(fxCount()).toBe(before);
      expect(useLevelStore.getState().cometReveal).toEqual({
        run,
        phase: "revealed",
      });
    } finally {
      await renderer.unmount();
    }
  });

  it("does not arm a stale reveal from a previous level after a reset", async () => {
    // A level was loaded (e.g. the menu's ambient level), then a reset clears
    // the store (gridSize → 0). Mounting must not arm a strike for the stale
    // level (its reveal, if any, has a different run id and is already inert).
    useLevelStore.getState().initializeLevelState(levelData, 1);
    useLevelStore.getState().resetLevelState();
    expect(useLevelStore.getState().gridSize).toBe(0);

    const before = fxCount();
    const renderer = await ReactThreeTestRenderer.create(<CometStrike />);
    try {
      expect(useLevelStore.getState().cometReveal).toBe(null);
      expect(fxCount()).toBe(before);
    } finally {
      await renderer.unmount();
    }
  });
});
