import { useCallback, memo, type FC, type ReactNode } from "react";
import { Box3, Group, Vector3, type Object3D } from "three";

import { TOWER_MODELS, type TowerModelSpec } from "../../constants/models";
import type { TowerType } from "../../core/types/game";
import { ModelLoader } from "./ModelLoader";

// Shared, cached scratch vectors for the one-time recenter math (towers are
// placed a handful at a time; the vectors are reused and are not per-frame).
const _center = new Vector3();
const _size = new Vector3();

/**
 * Rescales a tower model so its largest span fits within `size`, recenters it
 * horizontally on the origin, and grounds its base at `y = 0`. Unlike enemies
 * the model is not yawed: a tower has no direction of travel, and its "Azimuth"
 * turret is static in the game (the projectile beam, not the mesh, aims at the
 * target). The source node is cloned, so the cached GLTF (shared by every tower
 * of a type) is never mutated; the clone only *references* the shared
 * geometry/material, so it needs no dispose on unmount.
 */
export const prepareTowerModel = (source: Object3D, size: number): Group => {
  source.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(source);
  box.getCenter(_center);
  box.getSize(_size);
  const maxSpan = Math.max(_size.x, _size.y, _size.z);
  const scale = maxSpan > 0 ? size / maxSpan : 1;

  const group = new Group();
  group.scale.setScalar(scale);
  // Recenter horizontally on the origin and ground the lowest point at y = 0.
  // The model root sits at its baked collection position (e.g. x = -3,
  // z = -3), so the center is negated and scaled to pull the geometry back to
  // the tile centre; min.y (the model's world-space base) is negated so the
  // lowest point lands exactly on the ground.
  group.position.set(
    -_center.x * scale,
    -box.min.y * scale,
    -_center.z * scale
  );
  group.add(source.clone());
  return group;
};

type TowerModelProps = {
  type: TowerType;
  size: number;
  fallback: ReactNode;
};

/**
 * Renders the 3D model of a tower type as the body. Loading, node extraction,
 * and Suspense isolation are all delegated to the generic `ModelLoader`; this
 * component only supplies the shared `prepare` transform (scale to the tile
 * footprint, recenter, and ground the base). `size` is the target footprint;
 * `type` picks the model from `TOWER_MODELS`.
 */
export const TowerModel: FC<TowerModelProps> = memo(
  ({ type, size, fallback }) => {
    const model: TowerModelSpec = TOWER_MODELS[type];
    const prepare = useCallback(
      (source: Object3D) => prepareTowerModel(source, size),
      [size]
    );
    return (
      <ModelLoader
        url={model.url}
        node={model.node}
        prepare={prepare}
        fallback={fallback}
      />
    );
  }
);

TowerModel.displayName = "TowerModel";
