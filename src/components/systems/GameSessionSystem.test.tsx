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
import { MAX_FRAME_DELTA } from "../../utils/gameDelta";
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

// The e2e fast-forward factor (`SIM_SPEED`) is read at module load from
// `window.__SIM_SPEED__`; this mock re-exposes it as a getter over a mutable
// global so each test can switch between the production single-tick path
// (`__SIM_SPEED_TEST__ === 1`) and the sub-ticked fast-forward path (any value
// > 1) without reloading modules.
vi.mock("../../core/flags/simSpeed", () => ({
  get SIM_SPEED() {
    return (globalThis as { __SIM_SPEED_TEST__?: number }).__SIM_SPEED_TEST__ ?? 1;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const createSession = () => {
  const disconnectRuntime = vi.fn();
  const session: GameSessionController = {
    startRun: vi.fn(async () => true),
    restartRun: vi.fn(async () => true),
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
    // Default to the production single-tick path; the fast-forward test opts
    // into the sub-ticked path explicitly.
    (globalThis as { __SIM_SPEED_TEST__?: number }).__SIM_SPEED_TEST__ = 1;
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

  it("sub-ticks the frame when the e2e fast-forward is enabled", async () => {
    // With `SIM_SPEED` 20 a 0.1 s frame must advance simulation time by
    // 0.1 × 20 = 2 s — split into sub-ticks no larger than `MAX_FRAME_DELTA`
    // (so an enemy cannot skip a corner and a projectile cannot tunnel),
    // unlike the production path where simulation time only advances ~0.1 s.
    (globalThis as { __SIM_SPEED_TEST__?: number }).__SIM_SPEED_TEST__ = 20;
    const { session } = createSession();
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
        await renderer.advanceFrames(1, 0.1);
      });

      // 2 s of simulation time over a 0.1 s frame: ceil(2 / 0.05) = 40
      // sub-ticks of 0.05 s each (exactly `MAX_FRAME_DELTA`).
      expect(session.tick).toHaveBeenCalledTimes(40);
      for (const call of vi.mocked(session.tick).mock.calls) {
        expect(call[0].deltaSeconds).toBeLessThanOrEqual(
          MAX_FRAME_DELTA + 1e-9
        );
      }
      // `viewTimeSeconds` is the view-clock time where the reveal gate reads
      // `revealedAt` from; on the first frame the view clock is at 0.
      expect(session.tick).toHaveBeenLastCalledWith({
        deltaSeconds: expect.closeTo(0.05, 9),
        simulationTimeSeconds: expect.closeTo(2, 6),
        viewTimeSeconds: expect.closeTo(0, 6),
        canResolveGameplay: true,
      });
    } finally {
      await ReactThreeTestRenderer.act(async () => {
        renderer.unmount();
      });
    }
  });
});
