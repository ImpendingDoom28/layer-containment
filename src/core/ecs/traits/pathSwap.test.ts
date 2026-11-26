import { describe, expect, it } from "vitest";

import {
  getPathSwapAnimationState,
  PATH_SWAP_ARRIVAL_SECONDS,
  PATH_SWAP_BEAM_UP_SECONDS,
  PATH_SWAP_TELEGRAPH_SECONDS,
} from "./pathSwap";

// The trait shape `getPathSwapAnimationState` reads — no world needed, the
// resolver is a pure function of the two timestamps.
const swapAt = (telegraphReadyAt: number, lastCrossAt = 0) => ({
  telegraphReadyAt,
  lastCrossAt,
});

describe("getPathSwapAnimationState", () => {
  it("is null before any telegraph starts", () => {
    expect(getPathSwapAnimationState(swapAt(0), 5)).toBe(null);
  });

  it("is null during the early telegraph (the body just blinks)", () => {
    // 0.8s into the 1s telegraph: still 0.2s to the jump, outside the
    // 0.38s beam-up window.
    expect(getPathSwapAnimationState(swapAt(1), 0.2)).toBe(null);
    // Just inside the window (0.37s remaining) the beam-up starts.
    expect(getPathSwapAnimationState(swapAt(1), 0.63)).toBe("teleport-out");
  });

  it("is teleport-out during the last beam-up stretch of the telegraph", () => {
    for (const now of [0.63, 0.8, 0.99]) {
      expect(getPathSwapAnimationState(swapAt(1), now)).toBe("teleport-out");
    }
    // The boundary is exact: just before 0.38s remaining it is still null.
    expect(
      getPathSwapAnimationState(swapAt(1), 1 - PATH_SWAP_BEAM_UP_SECONDS - 0.01)
    ).toBe(null);
  });

  it("is teleport-in for the arrival window after the cross", () => {
    const cross = 1;
    expect(getPathSwapAnimationState(swapAt(cross, cross), cross)).toBe(
      "teleport-in"
    );
    expect(
      getPathSwapAnimationState(swapAt(cross, cross), cross + 0.2)
    ).toBe("teleport-in");
    // Just past the arrival window (0.45s after the cross) it goes null.
    expect(
      getPathSwapAnimationState(swapAt(cross, cross), cross + PATH_SWAP_ARRIVAL_SECONDS + 0.01)
    ).toBe(null);
  });

  it("is null well after the cross", () => {
    expect(getPathSwapAnimationState(swapAt(1, 1), 10)).toBe(null);
  });

  it("keeps teleport-out while a later telegraph is pending (multi-swap boss)", () => {
    // A second swap telegraphed while the first cross's arrival window is
    // still live: the pending telegraph wins (the body is about to jump again
    // and must beam up at its old position).
    const cross = 1;
    const telegraph = 1.8; // 0.8s after the cross: arrival still live
    // 0.5s before the jump: the arrival window is still live, but the
    // beam-up window has not opened yet → the ordinary (walk/idle) state.
    expect(getPathSwapAnimationState(swapAt(telegraph, cross), 1.3)).toBe(null);
    // 0.3s before the jump: inside the beam-up window.
    expect(getPathSwapAnimationState(swapAt(telegraph, cross), 1.5)).toBe(
      "teleport-out"
    );
  });
});

describe("path-swap timing constants", () => {
  it("beam-up fits inside the telegraph", () => {
    expect(PATH_SWAP_BEAM_UP_SECONDS).toBeLessThan(
      PATH_SWAP_TELEGRAPH_SECONDS
    );
  });
});
