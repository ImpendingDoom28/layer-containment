import { describe, expect, it } from "vitest";

import { clampFrameDelta, MAX_FRAME_DELTA } from "./gameDelta";

describe("clampFrameDelta", () => {
  it("caps the resume frame after a hidden tab when pause-when-hidden is on", () => {
    expect(clampFrameDelta(30, true)).toBe(MAX_FRAME_DELTA);
    expect(clampFrameDelta(1.5, true)).toBe(MAX_FRAME_DELTA);
  });

  it("leaves normal frames untouched when pause-when-hidden is on", () => {
    expect(clampFrameDelta(0.016, true)).toBe(0.016);
    expect(clampFrameDelta(0.05, true)).toBe(0.05);
  });

  it("never clamps when pause-when-hidden is off (background worker keeps the sim running)", () => {
    expect(clampFrameDelta(30, false)).toBe(30);
    expect(clampFrameDelta(0.016, false)).toBe(0.016);
  });
});
