import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";

import { SLOW_MO_BEAT_SECONDS, SLOW_MO_RATE } from "../../constants/slowMo";
import { useReducedMotion } from "./useReducedMotion";
import {
  beginPauseSegment,
  beginSlowMoSegment,
  createPauseClock,
  endPauseSegment,
  endSlowMoSegment,
  getEffectiveGameTime,
} from "../../utils/pauseClock";
import { useWaveStore } from "../stores/useWaveStore";

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
 *
 * The last-enemy slow-mo beat reuses the same machinery: when the wave store
 * bumps `waveClearedPulse` (the field just cleared) the hook marks a beat
 * pending and the next running frame opens a slow-mo segment — the world eases
 * down to `SLOW_MO_RATE` for `SLOW_MO_BEAT_SECONDS` of wall time and back, and
 * effective game time advances at that rate for the segment — so the
 * completion delay, the last kill's dust burst, and every sim-timed effect run
 * out in slow motion before the upgrade gate opens. A real pause owns the
 * clock from the instant it starts: an open beat is folded up and a pending
 * one is dropped, so no beat time is counted while the world is stopped.
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
  // Last observed wave-cleared pulse: a bump requests the slow-mo beat.
  const lastClearedPulseRef = useRef(useWaveStore.getState().waveClearedPulse);
  // A beat has been requested and is waiting for the next running frame.
  const pendingSlowMoRef = useRef(false);
  // Wall-time end of the current slow-mo beat, or null while it is not open.
  const slowMoEndRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (shouldStopMovement) {
      pendingResumeRef.current = false;
      // The world is stopping: drop a beat that hasn't opened yet and fold up
      // one that is, so no beat time is counted while the world is stopped.
      pendingSlowMoRef.current = false;
      if (pauseClockRef.current.slowMoSegmentStart !== null) {
        endSlowMoSegment(
          pauseClockRef.current,
          lastFrameClockTimeRef.current,
          SLOW_MO_RATE
        );
        slowMoEndRef.current = null;
      }
      if (
        hasRunFrameRef.current &&
        pauseClockRef.current.pauseSegmentStart === null
      ) {
        beginPauseSegment(pauseClockRef.current, lastFrameClockTimeRef.current);
      }
    } else if (pauseClockRef.current.pauseSegmentStart !== null) {
      pendingResumeRef.current = true;
    }
  }, [shouldStopMovement]);

  useEffect(
    () =>
      useWaveStore.subscribe((state) => {
        if (state.waveClearedPulse === lastClearedPulseRef.current) return;
        lastClearedPulseRef.current = state.waveClearedPulse;
        if (!shouldStopMovement) pendingSlowMoRef.current = true;
      }),
    [shouldStopMovement]
  );

  useFrame((state, delta) => {
    hasRunFrameRef.current = true;
    lastFrameClockTimeRef.current = state.clock.elapsedTime;

    if (pendingResumeRef.current) {
      endPauseSegment(pauseClockRef.current, state.clock.elapsedTime);
      pendingResumeRef.current = false;
    }

    // Open a beat requested while the world is running, on this frame.
    if (
      pendingSlowMoRef.current &&
      !shouldStopMovement &&
      pauseClockRef.current.slowMoSegmentStart === null
    ) {
      beginSlowMoSegment(
        pauseClockRef.current,
        state.clock.elapsedTime,
        SLOW_MO_RATE
      );
      slowMoEndRef.current = state.clock.elapsedTime + SLOW_MO_BEAT_SECONDS;
      pendingSlowMoRef.current = false;
    }

    // Close the beat once its wall-time budget is spent.
    if (
      slowMoEndRef.current !== null &&
      state.clock.elapsedTime >= slowMoEndRef.current
    ) {
      endSlowMoSegment(
        pauseClockRef.current,
        state.clock.elapsedTime,
        SLOW_MO_RATE
      );
      slowMoEndRef.current = null;
    }

    const target = shouldStopMovement
      ? 0
      : slowMoEndRef.current !== null
        ? SLOW_MO_RATE
        : 1;
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
