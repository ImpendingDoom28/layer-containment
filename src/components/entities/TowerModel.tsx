import { useCallback, memo, type FC, type ReactNode } from "react";
import { Box3, Group, Vector3, type Object3D } from "three";

import { TOWER_MODELS, type TowerModelSpec } from "../../constants/models";
import type { TowerType } from "../../core/types/game";
import { ModelLoader } from "./ModelLoader";

// Shared, cached scratch state for the one-time recenter math (towers are
// placed a handful at a time; the vectors and accumulator are reused and are
// not per-frame).
const _center = new Vector3();
const _size = new Vector3();
const _box = new Box3();
const _groundBox = new Box3();

// A model part "touches the ground" when its bottom is within this tolerance
// of the lowest point of the whole model.
const GROUND_EPSILON = 0.02;

/**
 * Computes the world-space bounding box of every part of `source` that touches
 * the ground. In these models that is exactly the chassis/base (the tower
 * body everything sits on), because the turret parts — barrels, pulse rings,
 * field arrays — are elevated or float above it.
 */
const groundFootprint = (source: Object3D): Box3 => {
  _box.setFromObject(source);
  _groundBox.makeEmpty();
  const min = _box.min.y;
  source.traverse((obj) => {
    if (obj.children.length > 0) return;
    const partBox = new Box3().setFromObject(obj);
    if (partBox.min.y <= min + GROUND_EPSILON) {
      _groundBox.union(partBox);
    }
  });
  return _groundBox;
};

/**
 * Rescales a tower model so its **base** footprint fits within `size`,
 * recenters the base on the origin, and grounds its bottom at `y = 0`.
 *
 * The scale and the horizontal centering are both taken from the base
 * (chassis) rather than from the model's full bounding box: the turrets stick
 * out beyond the base (long barrels on the basic and laser towers, a tall
 * sphere on the slow tower), so a full-box fit would shrink those towers and
 * pull their bases off the tile center. The turret overhang is intentional
 * design and is preserved as-is.
 *
 * Unlike enemies the model is not yawed: a tower has no direction of travel,
 * and its "Azimuth" turret is static in the game (the projectile beam, not the
 * mesh, aims at the target). The source node is cloned, so the cached GLTF
 * (shared by every tower of a type) is never mutated; the clone only
 * *references* the shared geometry/material, so it needs no dispose on unmount.
 */
export const prepareTowerModel = (source: Object3D, size: number): Group => {
  source.updateWorldMatrix(true, true);
  const fullBox = new Box3().setFromObject(source);
  const baseBox = groundFootprint(source);
  const box = baseBox.isEmpty() ? fullBox : baseBox;
  box.getCenter(_center);
  box.getSize(_size);
  const span = Math.max(_size.x, _size.z);
  const scale = span > 0 ? size / span : 1;

  const group = new Group();
  group.scale.setScalar(scale);
  // Center the base's horizontal midpoint on the origin and ground the model's
  // lowest point at y = 0. The model root sits at its baked collection
  // position (e.g. x = -3, z = -3), so the base center is negated and scaled
  // to pull the geometry back to the tile centre.
  group.position.set(
    -_center.x * scale,
    -fullBox.min.y * scale,
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
 * component only supplies the shared `prepare` transform (fit the base to the
 * tile footprint, recenter the base, and ground it). `size` is the target
 * base footprint; `type` picks the model from `TOWER_MODELS`.
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
