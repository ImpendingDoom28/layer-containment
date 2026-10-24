import { useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Frustum,
  Matrix4,
  Quaternion,
  Vector3,
  type Camera,
  type Group,
} from "three";

import {
  buildFrustumFromCamera,
  computeBoundingRadius,
  createFrustumCullingState,
  expandFrustum,
  isSphereVisible,
} from "../../utils/frustumCulling";

/**
 * Hysteresis margin in world units. The camera moves at 10 u/s and the fastest
 * enemies at 2.5 u/s, so the worst per-frame relative motion is well under 1
 * unit; two units of grace band gives roughly ten frames of hysteresis at 60
 * fps, which also absorbs the one-frame lag between the camera moving and the
 * culling pass reading it.
 */
export const FRUSTUM_CULLING_MARGIN = 2;

type SharedFrustum = {
  /** Exact camera view frustum, rebuilt when the camera changes. */
  show: Frustum;
  /** Camera state the `show` frustum was last built from. */
  lastPosition: Vector3;
  lastQuaternion: Quaternion;
  lastProjection: Matrix4;
  /** True until the first build, so a camera coincidentally at the default
   * transform still builds a frustum on the first frame. */
  dirty: boolean;
};

const createSharedFrustum = (): SharedFrustum => ({
  show: new Frustum(),
  lastPosition: new Vector3(),
  lastQuaternion: new Quaternion(),
  lastProjection: new Matrix4(),
  dirty: true,
});

/**
 * One exact camera view frustum per frame, shared by every culled object. It
 * is rebuilt only when the camera's transform (or projection, e.g. FOV easing)
 * changes, so per-frame work is one matrix invert at most instead of one per
 * enemy or tower. Bounded by the number of scene cameras (one per Canvas), so
 * it never grows.
 */
const sharedFrustums = new Map<Camera, SharedFrustum>();

const getSharedFrustum = (camera: Camera): SharedFrustum => {
  let shared = sharedFrustums.get(camera);
  if (!shared) {
    shared = createSharedFrustum();
    sharedFrustums.set(camera, shared);
  }
  return shared;
};

const cameraChanged = (
  camera: Camera,
  shared: SharedFrustum
): boolean =>
  shared.dirty ||
  !camera.position.equals(shared.lastPosition) ||
  !camera.quaternion.equals(shared.lastQuaternion) ||
  !camera.projectionMatrix.equals(shared.lastProjection);

/**
 * Culls an object group against the camera frustum every frame: when the
 * group's bounding sphere leaves the view (plus a hysteresis margin) the
 * group is hidden, and three.js skips its whole subtree in the render pass.
 * Toggling `visible` does not remount the group and does not affect
 * raycasting, so click and hover keep working.
 *
 * The bounding radius is measured once per group (and re-measured when the
 * group's children change, e.g. an upgrade ring appearing).
 */
export const useFrustumCulling = (
  ref: RefObject<Group | null>,
  margin = FRUSTUM_CULLING_MARGIN
): void => {
  const camera = useThree((state) => state.camera);
  const state = useMemo(() => createFrustumCullingState(), []);
  const viewProjection = useRef(new Matrix4());
  const hideFrustum = useRef(new Frustum());

  useFrame(() => {
    const object = ref.current;
    if (!object) return;

    const shared = getSharedFrustum(camera);
    // Rebuild the shared exact frustum (and this hook's expanded hide
    // frustum) only when the camera actually moved, rotated, or changed its
    // projection — idle frames skip the matrix math entirely.
    if (cameraChanged(camera, shared)) {
      buildFrustumFromCamera(camera, viewProjection.current, shared.show);
      shared.lastPosition.copy(camera.position);
      shared.lastQuaternion.copy(camera.quaternion);
      shared.lastProjection.copy(camera.projectionMatrix);
      shared.dirty = false;
      hideFrustum.current.copy(shared.show);
      expandFrustum(hideFrustum.current, margin);
    }

    // Re-measure the bounding radius only when the child set changes (an
    // upgrade ring appearing, a slow indicator toggling).
    if (!state.measured || state.childCount !== object.children.length) {
      state.measured = true;
      state.childCount = object.children.length;
      state.radius = computeBoundingRadius(object);
    }

    object.getWorldPosition(state.center);
    state.wasVisible = isSphereVisible(
      state.center,
      state.radius,
      shared.show,
      hideFrustum.current,
      state.wasVisible
    );
    if (object.visible !== state.wasVisible) {
      object.visible = state.wasVisible;
    }
  });
};
