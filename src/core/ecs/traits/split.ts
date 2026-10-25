import { trait, type TraitRecord } from "koota";

import type { EnemyType } from "../../types/game";

/**
 * Request to spawn the death-children of a Splitter, carried by the dead
 * enemy entity between the frame the kill is raised and the frame the
 * EnemySplitSystem consumes it (mirrors `requestEnemyDeath` / `damageRequest`).
 *
 * The parent's stats are captured here because the parent entity is destroyed
 * by the death system on the next frame, before the split system runs. The
 * split system derives weaker zero-reward children from these values.
 */
export type SplitRequestData = {
  type: EnemyType;
  color: string;
  /** Parent max health; children spawn at a reduced fraction of it. */
  health: number;
  speed: number;
  size: number;
  healthLoss: number;
  /** Inclusive child count range (from the parent's `split` config). */
  minChildren: number;
  maxChildren: number;
  /** Where the parent died along the path; children continue from here. */
  x: number;
  z: number;
  pathProgress: number;
  pathIndex: number;
};

export const splitRequest = trait<SplitRequestData>({
  type: "splitter",
  color: "",
  health: 0,
  speed: 0,
  size: 0,
  healthLoss: 0,
  minChildren: 2,
  maxChildren: 4,
  x: 0,
  z: 0,
  pathProgress: 0,
  pathIndex: 0,
});

export type SplitRequestRecord = TraitRecord<typeof splitRequest>;
