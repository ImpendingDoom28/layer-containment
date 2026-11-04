import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useMemo,
} from "react";

import { useFrame } from "@react-three/fiber";

import type { WaterTimeUniform } from "../../utils/waterMaterial";

export type WaterClockValue = {
  /**
   * Shared `{ value }` uniform referenced by every animated water material in
   * the scene. Mutated once per frame by the provider — a single write drives
   * all water bodies, so water never re-renders and no per-body state churns.
   */
  time: WaterTimeUniform;
};

const WaterClockContext = createContext<WaterClockValue | null>(null);

/**
 * Returns the scene's shared water ripple clock. Falls back to a frozen
 * (static) uniform when called outside a `WaterClockProvider` so tests and
 * standalone scenes render calm, unanimated water instead of throwing.
 */
export const useWaterClock = (): WaterClockValue => {
  const value = useContext(WaterClockContext);
  if (!value) {
    return FROZEN_WATER_CLOCK;
  }
  return value;
};

const FROZEN_WATER_CLOCK: WaterClockValue = {
  time: { value: 0 },
};

type WaterClockProviderProps = {
  children: ReactNode;
};

/**
 * Owns the single per-frame write that animates every water body in a scene.
 * Mounted once per `<Canvas>` (inside the R3F tree) so `useFrame` runs inside
 * the render loop. The uniform object is stable for the scene's lifetime, so
 * consumers read it in `useMemo` and never re-render while it ticks.
 */
export const WaterClockProvider: FC<WaterClockProviderProps> = ({
  children,
}) => {
  const value = useMemo<WaterClockValue>(
    () => ({ time: { value: 0 } }),
    []
  );

  // Negative priority so the ripple advances before the scene renders; a
  // water body mounted later in the same frame still reads the new time.
  useFrame((state) => {
    value.time.value = state.clock.elapsedTime;
  }, -1);

  return (
    <WaterClockContext.Provider value={value}>
      {children}
    </WaterClockContext.Provider>
  );
};
