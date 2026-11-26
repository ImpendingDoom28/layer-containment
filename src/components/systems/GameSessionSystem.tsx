import { useFrame } from "@react-three/fiber";
import {
  createContext,
  type FC,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

import type { Object3D } from "three";

import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import { SIM_SPEED } from "../../core/flags/simSpeed";
import { getShouldStopMovement } from "../../core/getShouldStopMovement";
import { useEnemyActions } from "../../core/hooks/useEnemyActions";
import { useInstancedProjectiles } from "../../core/hooks/useInstancedProjectiles";
import { useProjectileSystem } from "../../core/hooks/useProjectileSystem";
import type {
  GameSessionController,
  GameSessionRuntime,
} from "../../core/session/types";
import {
  projectileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import { clampFrameDelta, MAX_FRAME_DELTA } from "../../utils/gameDelta";

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
  const projectileSize = useGameStore(projectileSizeSelector);
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
    projectileSize,
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

  // Simulation-time accumulator for the e2e fast-forward (see `SIM_SPEED`),
  // local to the accelerated session and independent of the view clock (which
  // keeps running at wall time for the FX). Starts at 0 when the accelerated
  // path first runs; the session's simulation time is absolute only in the
  // sense of its own deltas, which is what every system consumes.
  const fastSimTimeRef = useRef<number | null>(null);

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
    const canResolveGameplay = !shouldStopMovement;
    // The world's per-frame delta (real delta, clamped for a hidden-tab resume,
    // dilated to 0 while the world is stopped). This is the production step
    // size the fast-forward integrates in.
    const frameDelta =
      clampFrameDelta(delta, pauseWhenTabHidden) * getTimeScale();

    if (SIM_SPEED <= 1) {
      // Production path: exactly the original single tick (real-time
      // simulation). `SIM_SPEED` is 1 unless the e2e suite injects it, so this
      // is also the path the unit tests exercise — they keep asserting the
      // original tick shape.
      session.tick({
        deltaSeconds: frameDelta,
        simulationTimeSeconds: getSimulationTime(state.clock.elapsedTime),
        canResolveGameplay,
      });
      return;
    }

    // Fast-forward (e2e only): advance the simulation `SIM_SPEED`× per wall
    // second. The test cost is simulation time (a wave must be *traversed*
    // before it clears), not frame count, so the only real speedup is moving
    // simulation time faster than wall time. To keep the integration stable the
    // frame is split into sub-ticks whose per-step delta is capped at
    // `MAX_FRAME_DELTA` (the same 0.05 s bound the background-tick path
    // already uses for a 50 ms tick — proven stable for enemy movement,
    // projectile travel and firing), so no single step is large enough for an
    // enemy to skip a path corner or a projectile to tunnel through a target.
    // The step count is bounded by the frame's wall delta, so a slow CI box and
    // a fast desktop do the same work per wall second.
    //
    // The accelerated session keeps its own simulation clock, decoupled from
    // the scene's view clock (which keeps running at wall time for the FX).
    // It starts at 0; the only cross-boundary value is the comet reveal's
    // `revealedAt` (stamped on the view clock), so the wave-1 "reveal has
    // settled" gate is evaluated against the view clock (carried on the frame
    // as `viewTimeSeconds`) and opens exactly when the reveal visually lands.
    if (fastSimTimeRef.current === null) {
      fastSimTimeRef.current = 0;
    }
    const viewTime = getSimulationTime(state.clock.elapsedTime);
    const targetAdvance = frameDelta * SIM_SPEED; // world-seconds this frame
    const subTicks = Math.max(1, Math.ceil(targetAdvance / MAX_FRAME_DELTA));
    const per = targetAdvance / subTicks;
    let simTime = fastSimTimeRef.current;
    for (let i = 0; i < subTicks; i += 1) {
      simTime += per;
      session.tick({
        deltaSeconds: per,
        simulationTimeSeconds: simTime,
        viewTimeSeconds: viewTime,
        canResolveGameplay,
      });
    }
    fastSimTimeRef.current = simTime;
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
