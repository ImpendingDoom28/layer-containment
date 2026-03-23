export type PauseClock = {
  pauseDurationTotal: number;
  pauseSegmentStart: number | null;
};

export const createPauseClock = (): PauseClock => ({
  pauseDurationTotal: 0,
  pauseSegmentStart: null,
});

export const stepPauseClock = (
  clock: PauseClock,
  now: number,
  isPaused: boolean,
  wasPaused: boolean
): void => {
  if (!wasPaused && isPaused) {
    clock.pauseSegmentStart = now;
  } else if (wasPaused && !isPaused && clock.pauseSegmentStart !== null) {
    clock.pauseDurationTotal += now - clock.pauseSegmentStart;
    clock.pauseSegmentStart = null;
  }
};

export const getEffectiveGameTime = (
  now: number,
  clock: PauseClock
): number => {
  if (clock.pauseSegmentStart !== null) {
    const currentPauseDuration = now - clock.pauseSegmentStart;
    return now - clock.pauseDurationTotal - currentPauseDuration;
  }
  return now - clock.pauseDurationTotal;
};
