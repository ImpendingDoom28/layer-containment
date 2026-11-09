import { describe, expect, it } from "vitest";
import { Group } from "three";

import {
  DROP_DURATION,
  createTowerPlacementRig,
  getPlacementDropHeight,
  updateTowerPlacementRig,
} from "./towerPlacementRig";

// The impact tuning is mirrored here so the assertions stay exact (the same
// pattern the TowerIdleAnimation test uses for its rig constants).
const IMPACT_DURATION = 0.28;
const IMPACT_OSC = 16;
const IMPACT_DAMP = 4.5;
const IMPACT_SQUASH_AMPLITUDE = 0.45;
const TOTAL_DURATION = DROP_DURATION + IMPACT_DURATION;

const impactScaleY = (p: number): number =>
  1 -
  IMPACT_SQUASH_AMPLITUDE *
  Math.sin(p * IMPACT_OSC) *
  Math.exp(-p * IMPACT_DAMP);

// Stamps the rig's start time at t = 0 (so elapsed = simTime), leaving the
// tower at the top of the drop.
const makeRig = (dropHeight = 1.0) => {
  const group = new Group();
  const rig = createTowerPlacementRig(group, dropHeight);
  updateTowerPlacementRig(rig, 0, false);
  return { group, rig };
};

describe("getPlacementDropHeight", () => {
  it("scales the drop to the tower base radius", () => {
    expect(getPlacementDropHeight(0.3)).toBeCloseTo(0.3 * 3.5, 6);
    // A wider tower drops from proportionally higher.
    expect(getPlacementDropHeight(0.6)).toBeGreaterThan(
      getPlacementDropHeight(0.3)
    );
  });
});

describe("updateTowerPlacementRig", () => {
  it("falls from the drop height to the ground on an ease-in (accelerating) curve", () => {
    const { group, rig } = makeRig(1);

    // At the start the tower is at the top of the drop.
    expect(group.position.y).toBeCloseTo(1, 6);

    // Ease-in: it covers less ground early than late — at p = 0.5 the drop
    // has covered only a quarter of the height.
    updateTowerPlacementRig(rig, DROP_DURATION / 2, false);
    expect(group.position.y).toBeCloseTo(1 - 0.25, 6);

    // It accelerates into the ground: deep into the drop it is close to the
    // ground.
    updateTowerPlacementRig(rig, DROP_DURATION * 0.9, false);
    expect(group.position.y).toBeLessThan(0.3);
  });

  it("reaches the ground exactly at the end of the drop", () => {
    const { group, rig } = makeRig(1);
    updateTowerPlacementRig(rig, DROP_DURATION, false);
    expect(group.position.y).toBeCloseTo(0, 6);
  });

  it("squashes down on impact (the hard push), rebounds past rest, and settles", () => {
    const { group, rig } = makeRig(1);

    // Right at the impact frame the body is at rest height (a smooth landing,
    // no pop).
    updateTowerPlacementRig(rig, DROP_DURATION, false);
    expect(group.position.y).toBeCloseTo(0, 6);
    expect(group.scale.y).toBeCloseTo(1, 6);

    // Just after impact the body is compressed (the squash).
    const squashTime = DROP_DURATION + 0.02;
    updateTowerPlacementRig(rig, squashTime, false);
    expect(group.position.y).toBeCloseTo(0, 6);
    expect(group.scale.y).toBeLessThan(1);
    // The dip matches the damped-oscillation curve.
    const p = (squashTime - DROP_DURATION) / IMPACT_DURATION;
    expect(group.scale.y).toBeCloseTo(impactScaleY(p), 6);

    // The squash dips to ~0.7× height (within 10% of the tuning amplitude).
    const minScale = Math.min(
      ...Array.from({ length: 28 }, (_, i) => impactScaleY((i / 27) * 1))
    );
    expect(minScale).toBeGreaterThan(0.6);
    expect(minScale).toBeLessThan(0.75);

    // By the end of the impact the body has rebounded back to rest height.
    updateTowerPlacementRig(rig, TOTAL_DURATION, false);
    expect(group.scale.y).toBeCloseTo(1, 6);
    expect(group.position.y).toBeCloseTo(0, 6);
  });

  it("reports the settle exactly once (on the settle frame), then stays at rest", () => {
    const { group, rig } = makeRig(1);
    expect(updateTowerPlacementRig(rig, DROP_DURATION - 0.1, false)).toBe(false);
    // The settle frame reports the completion...
    expect(updateTowerPlacementRig(rig, TOTAL_DURATION, false)).toBe(true);
    // ...and later frames do not (no re-fires).
    expect(updateTowerPlacementRig(rig, TOTAL_DURATION + 1, false)).toBe(false);
    // A settled tower stays at rest (no further motion).
    const y = group.position.y;
    const s = group.scale.y;
    updateTowerPlacementRig(rig, TOTAL_DURATION + 2, false);
    expect(group.position.y).toBe(y);
    expect(group.scale.y).toBe(s);
  });

  it("snaps to rest under reduced motion", () => {
    const { group, rig } = makeRig(1);
    // Mid-fall, reduced motion snaps straight to the landed pose.
    updateTowerPlacementRig(rig, DROP_DURATION / 2, false);
    expect(group.position.y).not.toBeCloseTo(0, 3);
    expect(
      updateTowerPlacementRig(rig, DROP_DURATION / 2 + 0.01, true)
    ).toBe(true);
    expect(group.position.y).toBeCloseTo(0, 6);
    expect(group.scale.y).toBeCloseTo(1, 6);
  });
});
