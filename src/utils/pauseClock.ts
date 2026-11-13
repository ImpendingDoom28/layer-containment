export type PauseClock = {
  pauseDurationTotal: number;
  pauseSegmentStart: number | null;
  /** Accumulated "(1 - rate) x wall duration" over finished slow-mo segments. */
  slowMoDurationTotal: number;
  slowMoSegmentStart: number | null;
  /** World rate (0 < rate <= 1) while a slow-mo segment is open. */
  slowMoRate: number;
};

export const createPauseClock = (): PauseClock => ({
  pauseDurationTotal: 0,
  pauseSegmentStart: null,
  slowMoDurationTotal: 0,
  slowMoSegmentStart: null,
  slowMoRate: 1,
});

export const beginPauseSegment = (clock: PauseClock, now: number): void => {
  clock.pauseSegmentStart = now;
};

export const endPauseSegment = (clock: PauseClock, now: number): void => {
  if (clock.pauseSegmentStart === null) return;

  clock.pauseDurationTotal += now - clock.pauseSegmentStart;
  clock.pauseSegmentStart = null;
};

/**
 * Open a time-dilation segment: from `now` on, effective game time advances
 * at `rate` (a pause is this with rate 0). The world's visible motion eases
 * toward the rate on its own; the effective-time jump is a hard step, exactly
 * like a pause segment.
 */
export const beginSlowMoSegment = (
  clock: PauseClock,
  now: number,
  rate: number
): void => {
  clock.slowMoSegmentStart = now;
  clock.slowMoRate = rate;
};

export const endSlowMoSegment = (
  clock: PauseClock,
  now: number,
  rate: number
): void => {
  if (clock.slowMoSegmentStart === null) return;

  clock.slowMoDurationTotal += (now - clock.slowMoSegmentStart) * (1 - rate);
  clock.slowMoSegmentStart = null;
};

/**
 * Effective game time: wall time minus everything that did not advance the
 * game — completed pauses and slow-mo (the "lost time" of a slow-mo segment
 * is `(1 - rate) x its wall duration`), plus the part of any in-flight
 * segment. A slow-mo segment advances at `rate` of wall time (a pause is the
 * same math at rate 0).
 */
export const getEffectiveGameTime = (
  now: number,
  clock: PauseClock
): number => {
  if (clock.pauseSegmentStart !== null) {
    // Frozen at the pause's start. If a slow-mo segment was still open when
    // the pause began, fold in the beat progress up to that instant.
    const atPause =
      clock.slowMoSegmentStart !== null
        ? clock.slowMoSegmentStart +
          (clock.pauseSegmentStart - clock.slowMoSegmentStart) *
            clock.slowMoRate
        : clock.pauseSegmentStart;
    return atPause - clock.pauseDurationTotal - clock.slowMoDurationTotal;
  }
  if (clock.slowMoSegmentStart !== null) {
    return (
      clock.slowMoSegmentStart -
      clock.pauseDurationTotal -
      clock.slowMoDurationTotal +
      (now - clock.slowMoSegmentStart) * clock.slowMoRate
    );
  }
  return now - clock.pauseDurationTotal - clock.slowMoDurationTotal;
};
