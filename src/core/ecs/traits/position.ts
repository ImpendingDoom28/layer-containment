import { trait, type TraitRecord } from "koota";

/**
 * Generic hot world position (SoA), reusable by any entity that moves.
 *
 * Kept separate from per-system traits (e.g. EnemyMotion) so movement
 * systems, render components and spatial queries can share one position
 * record. Written per frame by movement systems; no React hook should
 * subscribe to it (reads are imperative via entity.get inside useFrame).
 */
export const Position = trait({ x: 0, y: 0, z: 0 });

export type PositionData = TraitRecord<typeof Position>;

export const createDefaultPosition = (): PositionData => ({
  x: 0,
  y: 0,
  z: 0,
});
