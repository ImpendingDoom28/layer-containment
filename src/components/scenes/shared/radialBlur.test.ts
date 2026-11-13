import { describe, expect, it } from "vitest";

import {
  RADIAL_BLUR_ANGULAR_MAX_RAD_S,
  RADIAL_BLUR_ANGULAR_THRESHOLD_RAD_S,
  RADIAL_BLUR_LINEAR_MAX_UNITS_S,
  RADIAL_BLUR_LINEAR_THRESHOLD_UNITS_S,
} from "../../../constants/radialBlur";
import { computeRadialBlurStrength } from "./RadialBlurEffect";

const LINEAR_THRESHOLD = RADIAL_BLUR_LINEAR_THRESHOLD_UNITS_S;
const LINEAR_MAX = RADIAL_BLUR_LINEAR_MAX_UNITS_S;
const ANGULAR_THRESHOLD = RADIAL_BLUR_ANGULAR_THRESHOLD_RAD_S;
const ANGULAR_MAX = RADIAL_BLUR_ANGULAR_MAX_RAD_S;

describe("computeRadialBlurStrength", () => {
  it("is 0 when the camera is still (no pan, no turn)", () => {
    expect(computeRadialBlurStrength(0, 0)).toBe(0);
  });

  it("is 0 below both thresholds (a near-still camera stays crisp)", () => {
    expect(computeRadialBlurStrength(LINEAR_THRESHOLD * 0.5, 0)).toBe(0);
    expect(computeRadialBlurStrength(0, ANGULAR_THRESHOLD * 0.5)).toBe(0);
    expect(computeRadialBlurStrength(LINEAR_THRESHOLD, ANGULAR_THRESHOLD)).toBe(
      0
    );
  });

  it("responds to a pan (linear) even with no rotation", () => {
    expect(computeRadialBlurStrength(1, 0)).toBeGreaterThan(0);
    expect(computeRadialBlurStrength(1, 0)).toBeLessThan(1);
    expect(computeRadialBlurStrength(LINEAR_MAX, 0)).toBe(1);
    expect(computeRadialBlurStrength(LINEAR_MAX * 2, 0)).toBe(1);
  });

  it("responds to a turn (angular) even with no pan", () => {
    expect(computeRadialBlurStrength(0, 1)).toBeGreaterThan(0);
    expect(computeRadialBlurStrength(0, 1)).toBeLessThan(1);
    expect(computeRadialBlurStrength(0, ANGULAR_MAX)).toBe(1);
    expect(computeRadialBlurStrength(0, ANGULAR_MAX * 2)).toBe(1);
  });

  it("ramps smoothly for a pan between threshold and max", () => {
    const mid = computeRadialBlurStrength(
      (LINEAR_THRESHOLD + LINEAR_MAX) / 2,
      0
    );
    // Smoothstep at x = 0.5 is exactly 0.5.
    expect(mid).toBeCloseTo(0.5, 5);
    const low = computeRadialBlurStrength(
      LINEAR_THRESHOLD + (LINEAR_MAX - LINEAR_THRESHOLD) * 0.25,
      0
    );
    const high = computeRadialBlurStrength(
      LINEAR_THRESHOLD + (LINEAR_MAX - LINEAR_THRESHOLD) * 0.75,
      0
    );
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(high);
    expect(high).toBeLessThan(1);
  });

  it("is the larger of the two ramps, not the sum (a hard move saturates at 1)", () => {
    const linear = computeRadialBlurStrength(2, 0);
    const angular = computeRadialBlurStrength(0, 2);
    const both = computeRadialBlurStrength(2, 2);
    expect(both).toBe(Math.max(linear, angular));
    expect(both).toBeLessThanOrEqual(1);
    // Far past both maxima the combined value is exactly 1, never > 1.
    expect(computeRadialBlurStrength(LINEAR_MAX * 3, ANGULAR_MAX * 3)).toBe(1);
  });

  it("is monotonic in linear speed", () => {
    const values = [0, 0.5, 1, 3, 6, 10].map((v) =>
      computeRadialBlurStrength(v, 0)
    );
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });

  it("is monotonic in angular velocity", () => {
    const values = [0, 0.5, 1, 2, 4, 8].map((v) =>
      computeRadialBlurStrength(0, v)
    );
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
  });
});
