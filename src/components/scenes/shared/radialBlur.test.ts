import { describe, expect, it } from "vitest";

import {
  RADIAL_BLUR_VELOCITY_MAX_RAD_S,
  RADIAL_BLUR_VELOCITY_THRESHOLD_RAD_S,
} from "../../../constants/radialBlur";
import { computeRadialBlurStrength } from "./RadialBlurEffect";

const THRESHOLD = RADIAL_BLUR_VELOCITY_THRESHOLD_RAD_S;
const MAX = RADIAL_BLUR_VELOCITY_MAX_RAD_S;

describe("computeRadialBlurStrength", () => {
  it("is 0 below the threshold (a near-still camera stays crisp)", () => {
    expect(computeRadialBlurStrength(0, THRESHOLD, MAX)).toBe(0);
    expect(computeRadialBlurStrength(THRESHOLD * 0.5, THRESHOLD, MAX)).toBe(0);
    expect(computeRadialBlurStrength(THRESHOLD, THRESHOLD, MAX)).toBe(0);
  });

  it("is 1 at or above the max (a hard yank saturates)", () => {
    expect(computeRadialBlurStrength(MAX, THRESHOLD, MAX)).toBe(1);
    expect(computeRadialBlurStrength(MAX * 2, THRESHOLD, MAX)).toBe(1);
  });

  it("ramps smoothly between threshold and max", () => {
    const mid = computeRadialBlurStrength(
      (THRESHOLD + MAX) / 2,
      THRESHOLD,
      MAX
    );
    // Smoothstep at x = 0.5 is exactly 0.5.
    expect(mid).toBeCloseTo(0.5, 5);
    const low = computeRadialBlurStrength(
      THRESHOLD + (MAX - THRESHOLD) * 0.25,
      THRESHOLD,
      MAX
    );
    const high = computeRadialBlurStrength(
      THRESHOLD + (MAX - THRESHOLD) * 0.75,
      THRESHOLD,
      MAX
    );
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(high);
    expect(high).toBeLessThan(1);
  });

  it("is monotonic with velocity", () => {
    const values = [0, 0.2, 0.5, 1, 2, 4, 8].map((v) =>
      computeRadialBlurStrength(v, THRESHOLD, MAX)
    );
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it("returns 0 when the range is degenerate", () => {
    expect(computeRadialBlurStrength(1, 0.9, 0.9)).toBe(0);
    expect(computeRadialBlurStrength(1, 1, 0.9)).toBe(0);
  });
});
