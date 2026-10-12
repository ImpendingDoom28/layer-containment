import { describe, expect, it } from "vitest";

import { getCanPause } from "./getCanPause";

describe("getCanPause", () => {
  it("allows pausing while a wave is in progress (next wave not ready)", () => {
    expect(getCanPause("playing", false, true)).toBe(true);
  });

  it("allows pausing while waiting for the next wave when the flag is off", () => {
    expect(getCanPause("playing", true, false)).toBe(true);
  });

  it("disables pausing while waiting for the next wave when the flag is on", () => {
    expect(getCanPause("playing", true, true)).toBe(false);
  });

  it("allows resuming from a paused state regardless of the flag", () => {
    expect(getCanPause("paused", true, true)).toBe(true);
  });

  it("does not block non-playing statuses (menu, game over, won)", () => {
    expect(getCanPause("menu", true, true)).toBe(true);
    expect(getCanPause("gameOver", true, true)).toBe(true);
    expect(getCanPause("won", true, true)).toBe(true);
    expect(getCanPause("gameMenu", true, true)).toBe(true);
  });
});
