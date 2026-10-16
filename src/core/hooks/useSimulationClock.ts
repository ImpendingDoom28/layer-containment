import { useCallback, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { useReducedMotion } from "./useReducedMotion";
import {
  beginPauseSegment,
  createPauseClock,
  endPauseSegment,
  getEffectiveGameTime,
} from "../../utils/pauseClock";

export type GetSimulationTime = (rawNow: number) => number;
export type GetTimeScale = () => number;

/** How long the world takes to ease to/from stillness, in seconds. */
const DILATION_DURATION = 0.2;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Exposes the pause-adjusted simulation clock and a visual time-scale.
 *
 * `getSimulationTime` freezes game logic (slow expiry, regen, heal-pulse
 * scheduling, tower fire timing) the instant movement stops. `getTimeScale`
 * is a separate value that eases 1 → 0 over `DILATION_DURATION` seconds when
 * movement stops and back to 1 on resume, so visible motion (enemy movement,
 * decorative rings) slows into stillness instead of cutting. Motion/effect
 * systems scale their per-frame `delta` by it; at 0 they simply freeze.
 * Under `prefers-reduced-motion` the scale snaps instead of easing.
 */
export const useSimulationClock = (
  shouldStopMovement: boolean
): [GetSimulationTime, GetTimeScale] => {
  const pauseClockRef = useRef(createPauseClock());
  const previousShouldStopMovementRef = useRef(shouldStopMovement);
  const timeScaleRef = useRef(1);
  const targetScaleRef = useRef(1);
  const transitionFromRef = useRef(1);
  const transitionElapsedRef = useRef(DILATION_DURATION);
  const reducedMotion = useReducedMotion();

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    const wasPaused = previousShouldStopMovementRef.current;

    if (!wasPaused && shouldStopMovement) {
      beginPauseSegment(pauseClockRef.current, now);
    } else if (wasPaused && !shouldStopMovement) {
      endPauseSegment(pauseClockRef.current, now);
    }

    previousShouldStopMovementRef.current = shouldStopMovement;

    const target = shouldStopMovement ? 0 : 1;
    if (target !== targetScaleRef.current) {
      targetScaleRef.current = target;
      transitionFromRef.current = timeScaleRef.current;
      transitionElapsedRef.current = 0;
    }

    if (timeScaleRef.current !== targetScaleRef.current) {
      if (reducedMotion) {
        timeScaleRef.current = targetScaleRef.current;
      } else {
        transitionElapsedRef.current = Math.min(
          DILATION_DURATION,
          transitionElapsedRef.current + delta
        );
        const t = transitionElapsedRef.current / DILATION_DURATION;
        timeScaleRef.current =
          t >= 1
            ? targetScaleRef.current
            : transitionFromRef.current +
              (targetScaleRef.current - transitionFromRef.current) *
                smoothstep(t);
      }
    }
  }, -2);

  const getSimulationTime = useCallback(
    (rawNow: number) => getEffectiveGameTime(rawNow, pauseClockRef.current),
    []
  );
  const getTimeScale = useCallback(() => timeScaleRef.current, []);

  return [getSimulationTime, getTimeScale];
};
