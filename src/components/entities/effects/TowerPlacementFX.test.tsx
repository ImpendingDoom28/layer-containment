import { beforeEach, describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useThree } from "@react-three/fiber";
import { Group } from "three";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import { TowerPlacementFX } from "./TowerPlacementFX";
import { DROP_DURATION } from "./towerPlacementRig";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let sceneClock: { elapsedTime: number };

const ClockCapture = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return null;
};

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const advanceFrame = async (renderer: Renderer, rawTime: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

const DROP_HEIGHT = 1.05;

const createHarness = async (onDone: () => void = () => {}) => {
  const dropGroup = new Group();
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <ClockCapture />
      <TowerPlacementFX
        dropGroup={dropGroup}
        dropHeight={DROP_HEIGHT}
        onDone={onDone}
      />
    </SimulationClockProvider>
  );
  return { renderer, dropGroup };
};

beforeEach(() => {
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

describe("TowerPlacementFX", () => {
  it("drives the drop group from the top to the ground, then reports done once", async () => {
    let done = 0;
    const { renderer, dropGroup } = await createHarness(() => {
      done += 1;
    });
    try {
      // First frame stamps the start: the tower begins at the top of the drop.
      await advanceFrame(renderer, 0);
      expect(dropGroup.position.y).toBeCloseTo(DROP_HEIGHT, 3);

      // Partway through the drop it is falling (below the top, above the ground).
      await advanceFrame(renderer, DROP_DURATION / 2);
      expect(dropGroup.position.y).toBeLessThan(DROP_HEIGHT);
      expect(dropGroup.position.y).toBeGreaterThan(0);
      expect(done).toBe(0);

      // At the end of the drop it has reached the ground.
      await advanceFrame(renderer, DROP_DURATION);
      expect(dropGroup.position.y).toBeCloseTo(0, 3);
      expect(done).toBe(0);

      // The impact settle runs after the drop; once it finishes the driver
      // reports done exactly once and the group sits at rest.
      await advanceFrame(renderer, DROP_DURATION + 0.3);
      expect(done).toBe(1);
      expect(dropGroup.position.y).toBeCloseTo(0, 6);
      expect(dropGroup.scale.y).toBeCloseTo(1, 6);

      // No further completions.
      await advanceFrame(renderer, 5);
      expect(done).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("squashes the drop group on impact before it rebounds to rest", async () => {
    const { renderer, dropGroup } = await createHarness();
    try {
      // Just after the drop ends (into the impact window) the body is
      // compressed (the hard push).
      await advanceFrame(renderer, 0);
      await advanceFrame(renderer, DROP_DURATION + 0.02);
      expect(dropGroup.position.y).toBeCloseTo(0, 3);
      expect(dropGroup.scale.y).toBeLessThan(1);

      // By the end of the impact it has rebounded back to full height.
      await advanceFrame(renderer, DROP_DURATION + 0.3);
      expect(dropGroup.scale.y).toBeCloseTo(1, 6);
    } finally {
      renderer.unmount();
    }
  });

  it("freezes the drop with the world when the simulation clock stops", async () => {
    const { renderer, dropGroup } = await createHarness();
    try {
      // Stamp the drop's start at t = 0 (unpaused).
      await advanceFrame(renderer, 0);

      // Pause the world; the pause clock's segment begins on this next frame
      // (the first frame the clock sees movement stopped).
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.setState({ gameStatus: "paused" });
      });
      await advanceFrame(renderer, 0.1);
      const frozenY = dropGroup.position.y;
      // The drop is mid-fall, not yet at rest.
      expect(frozenY).toBeGreaterThan(0);
      expect(frozenY).toBeLessThan(DROP_HEIGHT);

      // The simulation clock is frozen, so the drop holds its pose even though
      // raw time keeps advancing (the tiny last-ulp difference is floating-
      // point noise from the clock's subtraction, not real motion).
      await advanceFrame(renderer, 0.5);
      await advanceFrame(renderer, 1.0);
      expect(dropGroup.position.y).toBeCloseTo(frozenY, 6);
    } finally {
      renderer.unmount();
    }
  });
});
