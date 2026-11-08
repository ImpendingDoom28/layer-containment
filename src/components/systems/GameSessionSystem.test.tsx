import ReactThreeTestRenderer from "@react-three/test-renderer";
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
});
