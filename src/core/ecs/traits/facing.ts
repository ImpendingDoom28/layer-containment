import { trait, type TraitRecord } from "koota";

/**
 * Generic hot facing direction (SoA), reusable by any entity that orients
 * itself along a path or travel direction.
 *
 * Kept separate from per-system traits (e.g. EnemyMotion) so movement
 * systems, render components and queries can share one facing record, just
 * like the generic `Position` trait. Written per frame by the owning system;
 * no React hook should subscribe to it (reads are imperative via entity.get
 * inside useFrame).
 *
 * The direction is a unit vector in the flat x/z plane (the "local +x axis"
 * of the entity's orientation); the default +x doubles as the fallback for
 * degenerate paths.
 */
export const FacingDirection = trait({ x: 1, z: 0 });

export type FacingDirectionData = TraitRecord<typeof FacingDirection>;

export const createDefaultFacingDirection = (): FacingDirectionData => ({
  x: 1,
  z: 0,
});
