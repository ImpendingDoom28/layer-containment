import { Suspense, memo, forwardRef, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import {
  Box3,
  Euler,
  Group,
  Quaternion,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from "three";

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

type WraithDroneModelProps = {
  size: number;
  /** The per-enemy material the hit-flash clone renders with. */
  flashMaterial: MeshStandardMaterial;
  /** Scales the hit-flash clone off the model surface. */
  flashScale?: number;
};

type WraithDroneProps = WraithDroneModelProps & {
  fallback: ReactNode;
};

/**
 * Renders the Wraith drone as the enemy body, plus a hidden clone of the drone
 * that the parent uses as a model-shaped hit marker. Because the marker is a
 * clone of the model itself, its shape always matches the model (a box model
 * would get a box marker, the Wraith gets a Wraith-shaped one) with no
 * per-model support. The drone is isolated in its own Suspense boundary so a
 * GLTF load race can only hide this one enemy (falling back to its
 * placeholder); it never suspends the whole scene. `useGLTF` is cached, so
 * every drone shares a single parse of the (extracted, ~215 KB) GLB.
 *
 * `size` is the enemy body radius; the drone is scaled to the body's diameter
 * so it reads the same size as the sphere it replaces.
 */
export const WraithDrone = memo(
  forwardRef<Group, WraithDroneProps>(
    ({ size, fallback, flashMaterial, flashScale = 1 }, ref) => (
      <Suspense fallback={fallback}>
        <WraithDroneModel
          size={size}
          flashMaterial={flashMaterial}
          flashScale={flashScale}
          ref={ref}
        />
      </Suspense>
    )
  )
);

WraithDrone.displayName = "WraithDrone";

const WraithDroneModel = forwardRef<Group, WraithDroneModelProps>(
  ({ size, flashMaterial, flashScale = 1 }, ref) => {
    const gltf = useGLTF(WRAITH_MODEL_URL);
    const source = gltf.scene.getObjectByName(WRAITH_NODE);
    const drone = useMemo(
      // The body sphere has radius `size` (diameter `2*size`), so scale the
      // drone's largest span to the body's diameter to preserve the enemy
      // size.
      () =>
        source ? prepareWraith(source, size * 2, WRAITH_ROTATION_Y) : null,
      [source, size]
    );
    // The hit marker: a hidden copy of the drone. Its meshes are re-pointed at
    // the parent's per-enemy flash material (geometry is shared, so no extra
    // buffers) and scaled slightly larger so it reads as a layer around the
    // model. The parent toggles `visible` to flash it on hits.
    const flashGroup = useMemo(() => {
      if (!drone) return null;
      const clone = drone.clone(true);
      if (flashScale !== 1) {
        // Scale the whole prepared transform (recenter offset + scale) so the
        // envelope grows around the model's center. The body is recentered via
        // the group's position, so scaling only the group's scale would leave
        // the offset unscaled and shift the shell off-center by
        // (flashScale - 1) times the recenter offset.
        clone.position.multiplyScalar(flashScale);
        clone.scale.multiplyScalar(flashScale);
      }
      clone.traverse((object) => {
        if (object.type === "Mesh") (object as Mesh).material = flashMaterial;
      });
      return clone;
    }, [drone, flashScale, flashMaterial]);

    if (!drone || !flashGroup) return null;

    return (
      <>
        <primitive object={drone} />
        <primitive ref={ref} object={flashGroup} visible={false} />
      </>
    );
  }
);

WraithDroneModel.displayName = "WraithDroneModel";
