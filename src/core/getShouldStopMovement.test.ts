import { describe, expect, it } from "vitest";

import { getShouldStopMovement } from "./getShouldStopMovement";

describe("getShouldStopMovement", () => {
  it("is true when paused", () => {
    expect(getShouldStopMovement("paused", true)).toBe(true);
  });

  it("is false when playing and page visible", () => {
    expect(getShouldStopMovement("playing", true)).toBe(false);
  });

  it("is true when page not visible", () => {
    expect(getShouldStopMovement("playing", false)).toBe(true);
  });
});
