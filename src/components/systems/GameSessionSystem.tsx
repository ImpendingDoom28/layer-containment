import { useFrame } from "@react-three/fiber";
import {
  createContext,
  type FC,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";

import type { Object3D } from "three";

import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import { getShouldStopMovement } from "../../core/getShouldStopMovement";
import { useEnemyActions } from "../../core/hooks/useEnemyActions";
import { useInstancedProjectiles } from "../../core/hooks/useInstancedProjectiles";
import { useProjectileSystem } from "../../core/hooks/useProjectileSystem";
import type {
  GameSessionController,
  GameSessionRuntime,
} from "../../core/session/types";
import { useGameStore } from "../../core/stores/useGameStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import { clampFrameDelta } from "../../utils/gameDelta";

type GameSessionRuntimeContextValue = {
  InstancedProjectiles: ReactElement;
  fireProjectile: GameSessionRuntime["fireProjectile"];
  registerTurretNode: (towerId: number, node: Object3D | null) => void;
  hasTowerTarget: (towerId: number) => boolean;
  markTowerDeploying: (towerId: number, deploying: boolean) => void;
};

const GameSessionRuntimeContext =
  createContext<GameSessionRuntimeContextValue | null>(null);

export const useGameSessionRuntime = (): GameSessionRuntimeContextValue => {
  const value = useContext(GameSessionRuntimeContext);
  if (!value) {
    throw new Error(
      "useGameSessionRuntime must be used within a GameSessionSystem"
    );
  }
  return value;
};

// The scene-less variant: scenes that render a `Tower` without a game session
// (the static testing-level showcase) get `null` instead of an error, so the
// tower simply skips session-backed behaviour (the deploy gate).
export const useGameSessionRuntimeOptional =
  (): GameSessionRuntimeContextValue | null =>
    useContext(GameSessionRuntimeContext);

type GameSessionSystemProps = {
  session: GameSessionController;
  children: ReactNode;
};

export const GameSessionSystem: FC<GameSessionSystemProps> = ({
  session,
  children,
}) => {
  const { getSimulationTime, getTimeScale } = useSimulationClock();
  const enemyActions = useEnemyActions();
  const { onProjectileHit, onProjectileRemove } =
    useProjectileSystem(enemyActions);
  const {
    InstancedProjectiles,
    fireProjectile,
    updateProjectiles,
    clearAllProjectiles,
  } = useInstancedProjectiles({
    maxProjectiles: 500,
    maxBeams: 50,
    projectileSize: 0.1,
    onHit: onProjectileHit,
    onRemove: onProjectileRemove,
  });

  const runtime = useMemo<GameSessionRuntime>(
    () => ({
      fireProjectile,
      updateProjectiles,
      clearProjectiles: clearAllProjectiles,
    }),
    [fireProjectile, updateProjectiles, clearAllProjectiles]
  );

  useEffect(() => session.connectRuntime(runtime), [session, runtime]);

  useFrame((state, delta) => {
    const { gameStatus, isPageVisible } = useGameStore.getState();
    const { pauseWhenTabHidden } = useSettingsStore.getState();
    const shouldDisableControls =
      gameStatus === "gameOver" ||
      gameStatus === "won" ||
      gameStatus === "gameMenu";
    const shouldStopMovement = getShouldStopMovement(
      gameStatus,
      shouldDisableControls,
      isPageVisible,
      pauseWhenTabHidden
    );

    session.tick({
      deltaSeconds: clampFrameDelta(delta, pauseWhenTabHidden) * getTimeScale(),
      simulationTimeSeconds: getSimulationTime(state.clock.elapsedTime),
      canResolveGameplay: !shouldStopMovement,
    });
  }, -1);

  const registerTurretNode = session.registerTurretNode;
  const hasTowerTarget = session.hasTowerTarget;
  const markTowerDeploying = session.markTowerDeploying;
  const value = useMemo<GameSessionRuntimeContextValue>(
    () => ({
      InstancedProjectiles,
      fireProjectile,
      registerTurretNode,
      hasTowerTarget,
      markTowerDeploying,
    }),
    [
      InstancedProjectiles,
      fireProjectile,
      registerTurretNode,
      hasTowerTarget,
      markTowerDeploying,
    ]
  );

  return (
    <GameSessionRuntimeContext.Provider value={value}>
      {children}
    </GameSessionRuntimeContext.Provider>
  );
};
