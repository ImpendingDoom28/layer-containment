import { describe, expect, it } from "vitest";

import {
  createPauseClock,
  getEffectiveGameTime,
  stepPauseClock,
} from "./pauseClock";

describe("getEffectiveGameTime + pause clock", () => {
  it("matches raw time when never paused", () => {
    const clock = createPauseClock();
    expect(getEffectiveGameTime(10, clock)).toBe(10);
  });

  it("freezes effective time while paused", () => {
    const clock = createPauseClock();
    stepPauseClock(clock, 10, true, false);
    expect(getEffectiveGameTime(10, clock)).toBe(10);
    expect(getEffectiveGameTime(100, clock)).toBe(10);
  });

  it("excludes completed pause segments from effective time", () => {
    const clock = createPauseClock();
    stepPauseClock(clock, 10, true, false);
    stepPauseClock(clock, 15, false, true);
    expect(clock.pauseDurationTotal).toBe(5);
    expect(getEffectiveGameTime(20, clock)).toBe(15);
  });

  it("accumulates multiple pause segments", () => {
    const clock = createPauseClock();
    stepPauseClock(clock, 0, true, false);
    stepPauseClock(clock, 3, false, true);
    stepPauseClock(clock, 10, true, false);
    stepPauseClock(clock, 12, false, true);
    expect(clock.pauseDurationTotal).toBe(5);
    expect(getEffectiveGameTime(20, clock)).toBe(15);
  });
});
