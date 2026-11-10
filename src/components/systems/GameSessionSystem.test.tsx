import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useFrame } from "@react-three/fiber";
import { type FC } from "react";
import { type Clock } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorldProvider } from "koota/react";

import { EntityIdProvider } from "../../core/contexts/EntityIdContext";
import { SimulationClockProvider } from "../../core/contexts/SimulationClockContext";
import { testWorld } from "../../core/ecs/world";
import type { GameSessionController } from "../../core/session/types";
import { useGameStore } from "../../core/stores/useGameStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import { GameSessionSystem } from "./GameSessionSystem";

vi.mock("../../core/hooks/useInstancedProjectiles", () => ({
  useInstancedProjectiles: () => ({
    InstancedProjectiles: null,
    fireProjectile: vi.fn(),
    updateProjectiles: vi.fn(),
    clearAllProjectiles: vi.fn(),
    getActiveProjectiles: vi.fn(),
    getTrailPoolStats: vi.fn(),
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const createSession = () => {
  const disconnectRuntime = vi.fn();
  const session: GameSessionController = {
    startRun: vi.fn(async () => {}),
    restartRun: vi.fn(async () => {}),
    endRun: vi.fn(),
    tick: vi.fn(),
    startWave: vi.fn(),
    getRemainingEnemiesInWave: vi.fn(() => 0),
    isRunStarting: false,
    dispose: vi.fn(),
    connectRuntime: vi.fn(() => disconnectRuntime),
    registerTurretNode: vi.fn(),
    hasTowerTarget: vi.fn(() => false),
    markTowerDeploying: vi.fn(),
  };
  return { session, disconnectRuntime };
};

describe("GameSessionSystem", () => {
  beforeEach(() => {
    useGameStore.getState().setGameStatus("playing");
    useGameStore.getState().setIsPageVisible(true);
    useSettingsStore.getState().setPauseWhenTabHidden(false);
  });

  it("calls session.tick exactly once per R3F frame", async () => {
    const { session, disconnectRuntime } = createSession();
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <SimulationClockProvider>
            <GameSessionSystem session={session}>
              <group />
            </GameSessionSystem>
          </SimulationClockProvider>
        </EntityIdProvider>
      </WorldProvider>
    );

    try {
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(2, 0.25);
      });

      expect(session.tick).toHaveBeenCalledTimes(2);
      expect(session.tick).toHaveBeenLastCalledWith({
        deltaSeconds: 0.25,
        simulationTimeSeconds: expect.any(Number),
        canResolveGameplay: true,
      });
      expect(session.connectRuntime).toHaveBeenCalledTimes(1);
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }

    expect(disconnectRuntime).toHaveBeenCalledTimes(1);
  });

  it("keeps simulation time continuous across a hidden-tab gap", async () => {
    // Regression: while the tab is hidden, requestAnimationFrame is
    // suspended and the background ticker is off, so no frame runs. The
    // pause segment must still be recorded (from the store-driven flag,
    // not a frame), or the wall-driven clock resumes with the whole hidden
    // duration baked into simulation time and the wave queue spawns in a
    // burst.
    const clockHolder: { current: Clock | null } = { current: null };
    const ClockCapture: FC = () => {
      useFrame((state) => {
        clockHolder.current = state.clock;
      });
      return null;
    };

    const { session } = createSession();
    // "Pause when tab hidden" must be on: it is the setting that makes
    // `isPageVisible` feed into `shouldStopMovement`.
    useSettingsStore.getState().setPauseWhenTabHidden(true);
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <SimulationClockProvider>
            <ClockCapture />
            <GameSessionSystem session={session}>
              <group />
            </GameSessionSystem>
          </SimulationClockProvider>
        </EntityIdProvider>
      </WorldProvider>
    );

    try {
      // The game has been running, visible, for 10s of wall time. The first
      // frame captures the clock; the second establishes the anchor (the
      // last frame's clock time) before the tab hides.
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 0.016);
      });
      expect(clockHolder.current).not.toBeNull();
      const clock = clockHolder.current as Clock;
      clock.elapsedTime = 10;
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 0.016);
      });

      // The tab hides. The store update (not a frame) is what the fix
      // observes: the pause segment is begun at the last frame's clock time
      // (10) even though no frame runs while hidden.
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.getState().setIsPageVisible(false);
      });
      // No frames run while hidden: no advanceFrames here.

      // The tab returns 30s later. The THREE clock is wall-driven and never
      // stopped, so the next frame reports the full wall time (40), not the
      // frozen value. The pause segment is closed at that first frame's clock
      // time, folding the whole hidden gap into one pause segment.
      clock.elapsedTime = 40;
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.getState().setIsPageVisible(true);
      });
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 0.016);
      });

      // Without the fix the 30s hidden gap leaks into simulation time (40
      // instead of 10) and the wave queue spawns in a burst. The effective
      // time must be the 10s frozen at hide, not the 40s wall time.
      expect(session.tick).toHaveBeenLastCalledWith({
        deltaSeconds: expect.closeTo(0.016, 3),
        simulationTimeSeconds: expect.closeTo(10, 3),
        canResolveGameplay: true,
      });
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });
});
