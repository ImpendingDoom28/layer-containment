import { Suspense, memo, useMemo, type FC, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { Box3, Euler, Group, Quaternion, Vector3, type Object3D } from "three";

import {
  WRAITH_MODEL_URL,
  WRAITH_NODE,
  WRAITH_ROTATION_Y,
} from "../../../constants/models";

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
 * Renders the Wraith drone as the enemy body. It is isolated in its own
 * Suspense boundary so a GLTF load race can only hide this one enemy (falling
 * back to its placeholder); it never suspends the whole scene. `useGLTF` is
 * cached, so every drone shares a single parse of the (extracted, ~215 KB)
 * GLB.
 *
 * `size` is the enemy body radius; the drone is scaled to the body's diameter
 * so it reads the same size as the sphere it replaces.
 */
export const WraithDrone: FC<WraithDroneProps> = memo(({ size, fallback }) => (
  <Suspense fallback={fallback}>
    <WraithDroneModel size={size} />
  </Suspense>
));

WraithDrone.displayName = "WraithDrone";

const WraithDroneModel: FC<{ size: number }> = ({ size }) => {
  const gltf = useGLTF(WRAITH_MODEL_URL);
  const source = gltf.scene.getObjectByName(WRAITH_NODE);
  const drone = useMemo(
    // The body sphere has radius `size` (diameter `2*size`), so scale the
    // drone's largest span to the body's diameter to preserve the enemy
    // size.
    () => (source ? prepareWraith(source, size * 2, WRAITH_ROTATION_Y) : null),
    [source, size]
  );
  if (!drone) return null;
  return <primitive object={drone} />;
};

WraithDroneModel.displayName = "WraithDroneModel";
