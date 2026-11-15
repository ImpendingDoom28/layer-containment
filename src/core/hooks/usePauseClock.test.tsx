import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useFrame } from "@react-three/fiber";
import { type FC } from "react";
import { type Clock } from "three";
import { beforeEach, describe, expect, it } from "vitest";

import {
  SimulationClockProvider,
  useSimulationClock,
} from "../contexts/SimulationClockContext";
import { useGameStore } from "../stores/useGameStore";
import { useSettingsStore } from "../stores/useSettingsStore";
import { useWaveStore } from "../stores/useWaveStore";
import { SLOW_MO_BEAT_SECONDS, SLOW_MO_RATE } from "../../constants/slowMo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const holder: {
  clock: Clock | null;
  simTime: ((rawNow: number) => number) | null;
  timeScale: (() => number) | null;
} = { clock: null, simTime: null, timeScale: null };

const ClockProbe: FC = () => {
  const { getSimulationTime, getTimeScale } = useSimulationClock();
  useFrame((state) => {
    holder.clock = state.clock;
  });
  holder.simTime = getSimulationTime;
  holder.timeScale = getTimeScale;
  return null;
};

const STEP = 0.05;

// RTTR does not advance the three clock's elapsed time from the `delta`
// argument, so each test drives the clock by setting `elapsedTime` explicitly
// before advancing a single frame (the same pattern the hidden-tab test uses).
const makeStepper =
  (renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) =>
  async (t: number) => {
    await ReactThreeTestRenderer.act(async () => {
      (holder.clock as Clock).elapsedTime = t;
      await renderer.advanceFrames(1, STEP);
    });
  };

describe("usePauseClock slow-mo beat", () => {
  beforeEach(() => {
    holder.clock = null;
    holder.simTime = null;
    holder.timeScale = null;
    useGameStore.getState().setGameStatus("playing");
    useGameStore.getState().setIsPageVisible(true);
    useSettingsStore.getState().setPauseWhenTabHidden(false);
    useWaveStore.setState({ waveClearedPulse: 0 });
  });

  const mount = async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <SimulationClockProvider>
        <ClockProbe />
      </SimulationClockProvider>
    );
    // One frame to capture the clock, then normalize it to zero so every
    // anchor the clock opens at is an exact number.
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(1, STEP);
    });
    return renderer;
  };

  it("eases the world to the beat rate while the beat runs, then back", async () => {
    const renderer = await mount();
    const step = makeStepper(renderer);
    try {
      await step(0);
      expect(holder.timeScale!()).toBe(1);

      useWaveStore.getState().bumpWaveClearedPulse();

      // The beat opens on the next frame (t=0.05) and runs
      // SLOW_MO_BEAT_SECONDS of wall time; the scale eases 1 → SLOW_MO_RATE
      // over 0.2s (4 steps), well before the beat ends.
      for (const t of [0.05, 0.1, 0.15, 0.2, 0.25]) await step(t);
      expect(holder.timeScale!()).toBeCloseTo(SLOW_MO_RATE, 5);
      // While the beat is open, simulation time advances at the beat rate:
      // 0.2s of wall time from the beat's start at 0.05 → 0.06s of game time.
      expect(holder.simTime!(holder.clock!.elapsedTime)).toBeCloseTo(
        0.05 + 0.2 * SLOW_MO_RATE,
        5
      );

      // The beat ends at its wall-time budget and the world eases back to
      // full speed over 0.2s; the banked loss is the beat's lost time:
      // SLOW_MO_BEAT_SECONDS × (1 − rate).
      const beatEnd = 0.05 + SLOW_MO_BEAT_SECONDS;
      const wall = beatEnd + 0.2;
      for (
        let t = 0.3;
        t <= wall;
        t = Math.round((t + 0.05) * 100) / 100
      ) {
        await step(t);
      }
      expect(holder.timeScale!()).toBe(1);
      expect(holder.simTime!(holder.clock!.elapsedTime)).toBeCloseTo(
        wall - SLOW_MO_BEAT_SECONDS * (1 - SLOW_MO_RATE),
        5
      );
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });

  it("lets a real pause own the clock over a beat in flight", async () => {
    const renderer = await mount();
    const step = makeStepper(renderer);
    try {
      await step(0);
      useWaveStore.getState().bumpWaveClearedPulse();
      await step(0.05); // beat opens at t=0.05

      // Pausing mid-beat folds the beat up and freezes simulation time at
      // the pause's start (the last frame's clock time, 0.05).
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.getState().setGameStatus("paused");
      });
      await step(0.1);
      expect(holder.simTime!(holder.clock!.elapsedTime)).toBeCloseTo(0.05, 5);

      // While paused, simulation time stays frozen and the scale reaches 0.
      for (const t of [0.15, 0.2, 0.25, 0.3]) await step(t);
      expect(holder.simTime!(holder.clock!.elapsedTime)).toBeCloseTo(0.05, 5);
      expect(holder.timeScale!()).toBe(0);
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });

  it("drops a beat requested while paused", async () => {
    const renderer = await mount();
    const step = makeStepper(renderer);
    try {
      await step(0);
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.getState().setGameStatus("paused");
      });
      useWaveStore.getState().bumpWaveClearedPulse();
      for (const t of [0.05, 0.1, 0.15, 0.2]) await step(t);
      expect(holder.timeScale!()).toBe(0);

      // Resuming restores full speed with no beat lag: only the pause
      // (0 → the first resumed frame at 0.25) is excluded from simulation
      // time — if the dropped beat had leaked, there would be an extra
      // SLOW_MO_BEAT_SECONDS × (1 − rate) of loss on top.
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.getState().setGameStatus("playing");
      });
      for (const t of [0.25, 0.3, 0.35, 0.4, 0.45]) await step(t);
      const wall = holder.clock!.elapsedTime;
      expect(holder.timeScale!()).toBe(1);
      expect(holder.simTime!(wall)).toBeCloseTo(wall - 0.25, 5);
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });
});
