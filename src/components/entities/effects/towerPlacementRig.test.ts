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
const IMPACT_DURATION = 0.3;
const IMPACT_SQUASH_DEPTH = 0.2;
const TOTAL_DURATION = DROP_DURATION + IMPACT_DURATION;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const impactScaleY = (p: number): number =>
  1 - IMPACT_SQUASH_DEPTH * smoothstep(Math.sin(Math.PI * p));

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

  it("squashes once on impact (the hard push) without rebounding (heavy machinery)", () => {
    const { group, rig } = makeRig(1);

    // Right at the impact frame the body is at rest height (a smooth landing,
    // no pop).
    updateTowerPlacementRig(rig, DROP_DURATION, false);
    expect(group.position.y).toBeCloseTo(0, 6);
    expect(group.scale.y).toBeCloseTo(1, 6);

    // Mid-settle the body is compressed (the hard push)...
    const midSettle = DROP_DURATION + IMPACT_DURATION / 2;
    updateTowerPlacementRig(rig, midSettle, false);
    expect(group.position.y).toBeCloseTo(0, 6);
    expect(group.scale.y).toBeCloseTo(1 - IMPACT_SQUASH_DEPTH, 6);

    // ...and the dip matches the settle curve.
    const p = (midSettle - DROP_DURATION) / IMPACT_DURATION;
    expect(group.scale.y).toBeCloseTo(impactScaleY(p), 6);

    // Nowhere in the settle does the body rebound past rest height (no
    // springy stretch) or squash deeper than the tuned depth.
    for (let i = 0; i <= 28; i++) {
      const t = (i / 28) * IMPACT_DURATION;
      const scale = impactScaleY(t / IMPACT_DURATION);
      expect(scale).toBeLessThanOrEqual(1 + 1e-9);
      expect(scale).toBeGreaterThanOrEqual(1 - IMPACT_SQUASH_DEPTH - 1e-9);
    }

    // By the end of the impact the body is back at rest height.
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
