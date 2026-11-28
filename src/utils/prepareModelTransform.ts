import {
  Box3,
  Euler,
  Group,
  Quaternion,
  Vector3,
  type Object3D,
} from "three";

// Shared, cached scratch vectors for the one-time recenter math (models are
// prepared once per URL, not per frame).
const _center = new Vector3();
const _size = new Vector3();
const _offset = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();

/**
 * Builds the per-instance transform group for a model extracted from a GLB:
 * rescaled so its largest span equals `size`, recentered on the origin, and
 * yawned by `rotationY` (enemy models face local +Z, so PI/2 turns the nose
 * into the enemy's local +X direction of travel). The returned group is empty —
 * the caller adds the (cloned) model content to it. The source node is never
 * mutated.
 */
export const prepareModelTransform = (
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
  return group;
};
