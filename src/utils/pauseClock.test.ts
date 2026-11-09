import { describe, expect, it } from "vitest";

import {
  beginPauseSegment,
  createPauseClock,
  endPauseSegment,
  getEffectiveGameTime,
} from "./pauseClock";

describe("getEffectiveGameTime + pause clock", () => {
  it("matches raw time when never paused", () => {
    const clock = createPauseClock();
    expect(getEffectiveGameTime(10, clock)).toBe(10);
  });

  it("freezes effective time while paused", () => {
    const clock = createPauseClock();
    beginPauseSegment(clock, 10);
    expect(getEffectiveGameTime(10, clock)).toBe(10);
    expect(getEffectiveGameTime(100, clock)).toBe(10);
  });

  it("excludes completed pause segments from effective time", () => {
    const clock = createPauseClock();
    beginPauseSegment(clock, 10);
    endPauseSegment(clock, 15);
    expect(clock.pauseDurationTotal).toBe(5);
    expect(getEffectiveGameTime(20, clock)).toBe(15);
  });

  it("accumulates multiple pause segments", () => {
    const clock = createPauseClock();
    beginPauseSegment(clock, 0);
    endPauseSegment(clock, 3);
    beginPauseSegment(clock, 10);
    endPauseSegment(clock, 12);
    expect(clock.pauseDurationTotal).toBe(5);
    expect(getEffectiveGameTime(20, clock)).toBe(15);
  });

  it("folds a whole hidden gap into one segment", () => {
    const clock = createPauseClock();
    // The last visible frame ran at clock time 10 (wall 10_000 ms). The tab
    // hides right after that frame and returns at wall 30_000 ms; no frame
    // runs in between, so the effect records the segment from the last
    // frame's anchor reconstructed at each transition.
    const lastFrameClockTime = 10;
    const lastFrameWallMs = 10_000;
    const hiddenWallMs = 10_000;
    const resumeWallMs = 30_000;

    const pauseStart =
      lastFrameClockTime + (hiddenWallMs - lastFrameWallMs) / 1000;
    const resumeClockTime =
      lastFrameClockTime + (resumeWallMs - lastFrameWallMs) / 1000;

    beginPauseSegment(clock, pauseStart);
    endPauseSegment(clock, resumeClockTime);

    expect(clock.pauseDurationTotal).toBe(20);
    // A frame 1 s after resume reports effective time 11, not 31.
    expect(getEffectiveGameTime(31, clock)).toBe(11);
  });
});
