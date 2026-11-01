import { useCallback, memo, type FC, type ReactNode } from "react";
import { Box3, Euler, Group, Quaternion, Vector3, type Object3D } from "three";

import {
  WRAITH_MODEL_URL,
  WRAITH_NODE,
  WRAITH_ROTATION_Y,
} from "../../../constants/models";
import { ModelLoader } from "./ModelLoader";

// Shared, cached scratch vectors for the one-time recenter math (enemies
// spawn a handful at a time; the vectors are reused and are not per-frame).
const _center = new Vector3();
const _size = new Vector3();
const _offset = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();

/**
 * Rescales the Wraith so its largest span equals `size`, recenters it on the
 * origin, then yaws it so the nose points down the group's local +X (the
 * enemy's direction of travel). The source node is cloned, so the cached GLTF
 * (shared by every enemy) is never mutated; the clone only *references* the
 * shared geometry/material, so it needs no dispose on unmount.
 */
const prepareWraith = (
  source: Object3D,
  size: number,
  rotationY: number
): Group => {
  source.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(source);
  box.getCenter(_center);
  box.getSize(_size);
  const maxSpan = Math.max(_size.x, _size.y, _size.z);
  const scale = maxSpan > 0 ? size / maxSpan : 1;
  // Offset = -(scale) * R * center: the center is rotated into the target
  // orientation before being negated, so the recentered model stays centered
  // for any yaw.
  _euler.set(0, rotationY, 0);
  _quat.setFromEuler(_euler);
  _offset.copy(_center).multiplyScalar(scale).applyQuaternion(_quat).negate();

  const group = new Group();
  group.position.copy(_offset);
  group.quaternion.copy(_quat);
  group.scale.setScalar(scale);
  group.add(source.clone());
  return group;
};

type WraithDroneProps = {
  size: number;
  fallback: ReactNode;
};

/**
 * Renders the Wraith drone as the enemy body. Loading, node extraction, and
 * Suspense isolation are all delegated to the generic `ModelLoader`; this
 * component only supplies the Wraith-specific `prepare` transform (scale to
 * the body's diameter, recenter, and yaw the nose into the direction of
 * travel). `size` is the enemy body radius.
 */
export const WraithDrone: FC<WraithDroneProps> = memo(({ size, fallback }) => {
  const prepare = useCallback(
    (source: Object3D) => prepareWraith(source, size * 2, WRAITH_ROTATION_Y),
    [size]
  );
  return (
    <ModelLoader
      url={WRAITH_MODEL_URL}
      node={WRAITH_NODE}
      prepare={prepare}
      fallback={fallback}
    />
  );
});

WraithDrone.displayName = "WraithDrone";
