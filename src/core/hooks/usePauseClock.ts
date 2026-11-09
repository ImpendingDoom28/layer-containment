import { useCallback, useEffect, useRef } from "react";
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
 * The pause-aware simulation clock engine: a `getSimulationTime` that freezes
 * game logic (slow expiry, regen, heal-pulse scheduling, tower fire timing)
 * the instant movement stops, and a `getTimeScale` that eases 1 → 0 over
 * `DILATION_DURATION` seconds when movement stops and back to 1 on resume, so
 * visible motion (enemy movement, decorative rings) slows into stillness
 * instead of cutting. Motion/effect systems scale their per-frame `delta` by
 * it; at 0 they simply freeze. Under `prefers-reduced-motion` the scale snaps
 * instead of easing.
 *
 * The pause segment is opened by an effect on `shouldStopMovement`, not by a
 * `useFrame` transition: the browser suspends requestAnimationFrame while the
 * tab is hidden, so a frame-driven transition can never observe a pause that
 * starts there — wave spawning then bursts the whole queue on resume. The
 * segment opens at the last frame's clock time and is closed at the first
 * frame's clock time after resuming. The clock is wall-driven and never
 * stopped, so that first frame reports a clock time that has advanced by the
 * whole hidden gap; folding the gap between the two exact anchors excludes it
 * from simulation time. `useFrame` refreshes the anchor, performs the close,
 * and maintains the dilation, so the hook is mounted once per scene by
 * `SimulationClockProvider`, not by each consumer.
 */
export const usePauseClock = (
  shouldStopMovement: boolean
): [GetSimulationTime, GetTimeScale] => {
  const pauseClockRef = useRef(createPauseClock());
  const timeScaleRef = useRef(1);
  const targetScaleRef = useRef(1);
  const transitionFromRef = useRef(1);
  const transitionElapsedRef = useRef(DILATION_DURATION);
  // Clock time of the most recent frame: the anchor the pause segment opens at.
  const lastFrameClockTimeRef = useRef(0);
  // True once at least one frame has run, so a provider mounted already
  // stopped (main menu) doesn't open a segment before the game has started.
  const hasRunFrameRef = useRef(false);
  // Set on resume so the segment is closed at the first frame's exact clock
  // time, which already spans the hidden gap.
  const pendingResumeRef = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (shouldStopMovement) {
      pendingResumeRef.current = false;
      if (hasRunFrameRef.current && pauseClockRef.current.pauseSegmentStart === null) {
        beginPauseSegment(pauseClockRef.current, lastFrameClockTimeRef.current);
      }
    } else if (pauseClockRef.current.pauseSegmentStart !== null) {
      pendingResumeRef.current = true;
    }
  }, [shouldStopMovement]);

  useFrame((state, delta) => {
    hasRunFrameRef.current = true;
    lastFrameClockTimeRef.current = state.clock.elapsedTime;

    if (pendingResumeRef.current) {
      endPauseSegment(pauseClockRef.current, state.clock.elapsedTime);
      pendingResumeRef.current = false;
    }

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
