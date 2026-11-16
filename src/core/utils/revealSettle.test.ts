import { beforeEach, describe, expect, it } from "vitest";

import { useLevelStore } from "../stores/useLevelStore";
import { isRevealSettled } from "./revealSettle";

// The settle time is `PORTAL_REVEAL_DURATION_S` (1.0) + a 0.3 buffer.
const SETTLE_AFTER_REVEAL = 1.3;

describe("isRevealSettled", () => {
  beforeEach(() => {
    useLevelStore.getState().setCometReveal(null);
  });

  it("treats a level with no comet reveal as settled", () => {
    expect(isRevealSettled(0)).toBe(true);
  });

  it("is not settled while the comet is still in flight (armed)", () => {
    const run = useLevelStore.getState().levelEnterRun;
    useLevelStore.getState().setCometReveal({ run, phase: "armed" });

    // The portals have not even been struck yet, no matter how much time has
    // passed.
    expect(isRevealSettled(100)).toBe(false);
  });

  it("holds while the portals are still rising out of the scorch", () => {
    const run = useLevelStore.getState().levelEnterRun;
    // The comet struck at sim time 0, so the reveal settles exactly at
    // `SETTLE_AFTER_REVEAL` (no float offset in the arithmetic).
    useLevelStore.getState().setCometReveal({
      run,
      phase: "revealed",
      revealedAt: 0,
    });

    expect(isRevealSettled(SETTLE_AFTER_REVEAL - 0.1)).toBe(false);
    expect(isRevealSettled(SETTLE_AFTER_REVEAL)).toBe(true);
  });

  it("is not settled when the impact time is missing", () => {
    const run = useLevelStore.getState().levelEnterRun;
    useLevelStore.getState().setCometReveal({ run, phase: "revealed" });

    expect(isRevealSettled(100)).toBe(false);
  });

  it("treats a stale reveal from a previous level as settled", () => {
    const run = useLevelStore.getState().levelEnterRun;
    // A reveal left over from an earlier level (a different run id) must not
    // hold the current level's spawns.
    useLevelStore.getState().setCometReveal({
      run: run + 1000,
      phase: "armed",
    });

    expect(isRevealSettled(0)).toBe(true);
  });
});
