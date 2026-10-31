import { createContext, FC, ReactNode, useContext, useMemo } from "react";

import {
  usePauseClock,
  type GetSimulationTime,
  type GetTimeScale,
} from "../hooks/usePauseClock";
import { getShouldStopMovement } from "../getShouldStopMovement";
import {
  gameStatusSelector,
  isPageVisibleSelector,
  useGameStore,
} from "../stores/useGameStore";
import {
  pauseWhenTabHiddenSelector,
  useSettingsStore,
} from "../stores/useSettingsStore";

export type SimulationClockValue = {
  /** Simulation time that freezes the moment movement stops. */
  getSimulationTime: GetSimulationTime;
  /** Eases 1 → 0 over ~200ms while movement stops; scale per-frame deltas by it. */
  getTimeScale: GetTimeScale;
  /** True while the world is stopped (pause, game over, tab hidden). */
  shouldStopMovement: boolean;
};

const SimulationClockContext = createContext<SimulationClockValue | null>(null);

/**
 * Reads the scene's shared simulation clock. Must be used within a
 * `SimulationClockProvider` (mounted inside the `<Canvas>`).
 */
export const useSimulationClock = (): SimulationClockValue => {
  const value = useContext(SimulationClockContext);
  if (!value) {
    throw new Error(
      "useSimulationClock must be used within a SimulationClockProvider"
    );
  }
  return value;
};

type SimulationClockProviderProps = {
  children: ReactNode;
  /**
   * Freeze the clock at zero. Used by the asset-showcase scene, whose enemies
   * and effects must render static while the decorative portals keep
   * animating on the scene's live clock.
   */
  frozen?: boolean;
};

// The showcase clock never moves: simulation time is a constant zero, the
// scale never dilates, and movement is always stopped.
const FROZEN_CLOCK: SimulationClockValue = {
  getSimulationTime: () => 0,
  getTimeScale: () => 0,
  shouldStopMovement: true,
};

/**
 * Owns the one pause-aware simulation clock for a scene and shares it with
 * every consumer (portals, floating text, enemy effects, movement, tower
 * fire, projectiles) via `useSimulationClock`. Mount it inside the
 * `<Canvas>`.
 *
 * The live clock derives `shouldStopMovement` from the game stores — the same
 * derivation `useGameSystem` uses — so the whole world slows into stillness on
 * pause as a single unit instead of each component easing its own clock. The
 * clock callbacks are stable, so the value only changes identity when
 * `shouldStopMovement` toggles: consumers re-render on pause/resume (rare)
 * and never per frame; the dilation itself is maintained imperatively in
 * `useFrame` inside `usePauseClock`.
 */
export const SimulationClockProvider: FC<SimulationClockProviderProps> = ({
  children,
  frozen = false,
}) => {
  if (frozen) {
    return (
      <SimulationClockContext.Provider value={FROZEN_CLOCK}>
        {children}
      </SimulationClockContext.Provider>
    );
  }

  return (
    <LiveSimulationClockProvider>{children}</LiveSimulationClockProvider>
  );
};

const LiveSimulationClockProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const gameStatus = useGameStore(gameStatusSelector);
  const isPageVisible = useGameStore(isPageVisibleSelector);
  const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);
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

  const [getSimulationTime, getTimeScale] = usePauseClock(shouldStopMovement);

  const value = useMemo(
    (): SimulationClockValue => ({
      getSimulationTime,
      getTimeScale,
      shouldStopMovement,
    }),
    [getSimulationTime, getTimeScale, shouldStopMovement]
  );

  return (
    <SimulationClockContext.Provider value={value}>
      {children}
    </SimulationClockContext.Provider>
  );
};
