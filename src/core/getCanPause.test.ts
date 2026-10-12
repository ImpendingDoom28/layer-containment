import { describe, expect, it } from "vitest";

import { getCanPause } from "./getCanPause";

describe("getCanPause", () => {
  it("allows pausing while a wave is in progress (next wave not ready)", () => {
    expect(getCanPause("playing", false)).toBe(true);
  });

  it("disables pausing while waiting for the next wave", () => {
    expect(getCanPause("playing", true)).toBe(false);
  });

  it("allows resuming from a paused state", () => {
    expect(getCanPause("paused", true)).toBe(true);
  });

  it("does not block non-playing statuses (menu, game over, won)", () => {
    expect(getCanPause("menu", true)).toBe(true);
    expect(getCanPause("gameOver", true)).toBe(true);
    expect(getCanPause("won", true)).toBe(true);
    expect(getCanPause("gameMenu", true)).toBe(true);
  });
});
