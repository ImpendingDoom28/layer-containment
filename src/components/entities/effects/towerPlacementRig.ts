import type { Object3D } from "three";

// Placement drop tuning: a freshly placed tower is deployed from above. The
// drop starts with an ease-in (slow start, accelerating into the ground) and
// ends with a hard push — the body compresses on impact, then rebounds and
// settles with a slight overshoot. Everything is expressed in the drop group's
// local space (the surface-normal frame), so it works at any point on the
// curved planet surface.
//
// Drop height is a multiple of the tower's base radius, so a wide tower drops
// from proportionally higher than a narrow one.
const DROP_HEIGHT_FACTOR = 3.5;
// The drop itself: short, so the deploy reads as a snap, not a slow fall.
export const DROP_DURATION = 0.3;
// Impact: the hard push. The body starts at rest height (a smooth landing, no
// pop), squashes down to a fraction of its height, stretches back past full
// height (the springy rebound), and settles at rest — a classic squash-and-
// stretch settle on the pause-aware clock.
const IMPACT_DURATION = 0.28;
// The damped oscillation: how fast it rings (osc) and how quickly it dies out
// (damp). Tuned so the squash lands within ~30 ms of impact, the stretch
// rebounds by ~70 ms, and it is settled by the end of the window.
const IMPACT_OSC = 16;
const IMPACT_DAMP = 4.5;
// The squash-and-stretch amplitude of the damped oscillation (drives the
// body to ~0.7× height at its deepest dip, then rebounds a touch past full).
const IMPACT_SQUASH_AMPLITUDE = 0.45;

// The whole drop from release to settle.
const TOTAL_DURATION = DROP_DURATION + IMPACT_DURATION;

// The drop group's rest (fully landed) pose.
const REST_Y = 0;
const REST_SCALE_Y = 1;

// Easing for the drop start: ease-in (slow start, accelerating toward the
// ground) — the "mechanism releasing" feel of the deploy.
const easeInQuad = (p: number): number => p * p;

// The impact settle: a damped sine that starts at rest (no pop at the impact
// frame), squashes down, rebounds past full height (the springy stretch), and
// settles exactly at rest by the end of the window.
const impactScaleY = (p: number): number =>
  REST_SCALE_Y -
  IMPACT_SQUASH_AMPLITUDE *
    Math.sin(p * IMPACT_OSC) *
    Math.exp(-p * IMPACT_DAMP);

/**
 * The drop height for a tower of the given base radius: a fixed multiple of
 * the base, so a wide tower drops from proportionally higher than a narrow
 * one (the fall reads as the same "distance" relative to the tower's size).
 */
export const getPlacementDropHeight = (baseRadius: number): number =>
  baseRadius * DROP_HEIGHT_FACTOR;

export type TowerPlacementRig = {
  /** The group (local +Y = surface normal) the drop is applied to. */
  group: Object3D;
  /** Height of the drop in local units (proportional to the tower base). */
  dropHeight: number;
  /** Simulation time the drop started; `null` until the first frame. */
  startAt: number | null;
  /** Set once the drop has fully settled. */
  done: boolean;
};

/**
 * Creates the drop rig for a freshly placed tower. The group is left at its
 * rest pose until the first `updateTowerPlacementRig` call stamps the start
 * time on the pause-aware simulation clock (the drop freezes with the world on
 * pause and eases with time dilation).
 */
export const createTowerPlacementRig = (
  group: Object3D,
  dropHeight: number
): TowerPlacementRig => ({
  group,
  dropHeight,
  startAt: null,
  done: false,
});

/**
 * Advances one tower's placement drop to `simTime` by mutating the drop
 * group's transform (no React state, no per-tower `useFrame`):
 *
 * - `0 → DROP_DURATION`: the tower falls from `dropHeight` to `0` on an
 *   ease-in curve (slow start, accelerating into the ground).
 *   `DROP_DURATION → TOTAL`: the impact — the body squashes down (the hard
 *   push) and rebounds with a damped oscillation, settling at rest.
 *
 * `reducedMotion` snaps straight to the landed pose. Returns `true` exactly on
 * the frame the drop settles (and `false` before and after), so a caller can
 * fire its completion handler once.
 */
export const updateTowerPlacementRig = (
  rig: TowerPlacementRig,
  simTime: number,
  reducedMotion: boolean
): boolean => {
  if (rig.done) return false;

  if (reducedMotion) {
    rig.group.position.y = REST_Y;
    rig.group.scale.y = REST_SCALE_Y;
    rig.done = true;
    return true;
  }

  if (rig.startAt === null) rig.startAt = simTime;
  const elapsed = simTime - rig.startAt;

  if (elapsed < DROP_DURATION) {
    const p = Math.min(elapsed / DROP_DURATION, 1);
    rig.group.position.y = (1 - easeInQuad(p)) * rig.dropHeight;
    rig.group.scale.y = REST_SCALE_Y;
    return false;
  }

  const ip = Math.min((elapsed - DROP_DURATION) / IMPACT_DURATION, 1);
  rig.group.position.y = REST_Y;
  rig.group.scale.y = ip >= 1 ? REST_SCALE_Y : impactScaleY(ip);

  if (elapsed >= TOTAL_DURATION) {
    rig.done = true;
    return true;
  }
  return false;
};
