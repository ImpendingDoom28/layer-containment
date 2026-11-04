import type { TowerType } from "../core/types/game";

/**
 * The rotating part of each tower model, and where its barrel tip sits at rest
 * (the model's local +Z is the rest muzzle direction; every model bakes the
 * turret at identity orientation).
 *
 * `turretNode` is the node that is rotated toward the target at runtime
 * (missing for the relay, whose "Azimuth003" is an empty pivot and never
 * fires). `muzzle` is the barrel tip in the **turret node's local frame** at
 * model size 1 (the furthest vertex along the rest muzzle direction). At
 * runtime it is transformed by the live node's `localToWorld`, which applies
 * the model's fit scale, base recentering, the planet curvature, and the
 * turret's current aim in one step — so no per-frame math is needed.
 */
export type TowerMuzzleSpec = {
  turretNode?: string;
  muzzle: { x: number; y: number; z: number } | null;
};

export const TOWER_MUZZLES = {
  basic: {
    turretNode: "Azimuth",
    muzzle: { x: 0, y: 0.3731, z: 1.071 },
  },
  slow: {
    turretNode: "Azimuth004",
    muzzle: { x: 0, y: 0.5511, z: 0.6325 },
  },
  aoe: {
    turretNode: "Azimuth001",
    muzzle: { x: -0.194, y: 0.386, z: 0.4025 },
  },
  laser: {
    turretNode: "Azimuth002",
    muzzle: { x: 0, y: 0.3761, z: 1.1725 },
  },
  relay: {
    // The relay's "Azimuth003" node is an empty pivot; the tower never fires.
    muzzle: null,
  },
  chain: {
    turretNode: "Field_Array",
    muzzle: { x: -0.0092, y: 0.764, z: 1.0387 },
  },
} as const satisfies Record<TowerType, TowerMuzzleSpec>;

/**
 * A tower only fires once its turret is within this many degrees of the
 * target direction, so a shot leaves the barrel only when the barrel actually
 * points at the enemy (instead of a projectile arcing sideways off a tower
 * that is still swinging around).
 */
export const TOWER_AIM_TOLERANCE = Math.PI / 12;

/**
 * How fast a turret swings (same rate the enemies use to smooth their facing,
 * `delta * timeScale * 8` in `Enemy.tsx`), so a turn reads as a gradual swing
 * instead of an instant snap.
 */
export const TOWER_TURN_LAMBDA = 8;
