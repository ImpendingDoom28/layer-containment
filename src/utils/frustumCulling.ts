import {
  Box3,
  Frustum,
  Matrix4,
  Sphere,
  Vector3,
  type Camera,
  type Object3D,
} from "three";

/**
 * Reusable per-frame frustum culling for a group of objects.
 *
 * three.js already culls each `Mesh` individually, but `projectObject` still
 * walks every object in a `<group>` (layer test + bounding-sphere cull test +
 * render-list bookkeeping) before deciding. Culling the whole group at once
 * replaces that per-object walk with a single O(1) bounding-sphere test: when
 * a group's world-space bounding sphere leaves the frustum we set
 * `group.visible = false` and three.js skips the entire subtree in the render
 * pass. Toggling `visible` does not remount anything (no buffer churn, no
 * material recompile) and does not affect raycasting — three tests `layers`,
 * not `visible`, during intersection, so hover and click keep working.
 *
 * A `margin` (world units) gives hysteresis so fast units do not pop at the
 * view edge: an object shows the instant its sphere enters the frustum, and
 * keeps rendering a short `margin` distance past the edge before hiding.
 */

/**
 * Per-object culling state owned by a single `useFrustumCulling` hook.
 * Allocated once per culled object and reused every frame (no per-frame GC).
 */
export type FrustumCullingState = {
  /** Previous frame's visibility, used for hysteresis. */
  wasVisible: boolean;
  /** True once the bounding radius has been measured. */
  measured: boolean;
  /** World-space bounding radius, measured when the child set changes. */
  radius: number;
  /** Child count the radius was measured for (triggers a re-measure). */
  childCount: number;
  /** Reused world-space center of the object's bounding sphere. */
  center: Vector3;
  /** Reused "hide" frustum (show frustum expanded by the margin). */
  hideFrustum: Frustum;
  /** Version of the shared frustum this `hideFrustum` was built from. */
  hideVersion: number;
  /** Margin `hideFrustum` was expanded by (NaN until the first build). */
  hideMargin: number;
};

const _testSphere = new Sphere(new Vector3(), 0);

export const createFrustumCullingState = (): FrustumCullingState => ({
  wasVisible: true,
  measured: false,
  radius: 0,
  childCount: -1,
  center: new Vector3(),
  hideFrustum: new Frustum(),
  hideVersion: -1,
  hideMargin: Number.NaN,
});

/**
 * Build the camera's exact view frustum into `out` from its
 * view-projection matrix (projectionMatrix * matrixWorldInverse).
 * Updates the camera's world matrix (and therefore `matrixWorldInverse`)
 * first, so the result is correct even when called before the renderer's own
 * matrix update. Returns `out`.
 */
export const buildFrustumFromCamera = (
  camera: Camera,
  viewProjection: Matrix4,
  out: Frustum
): Frustum => {
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  out.setFromProjectionMatrix(viewProjection);
  return out;
};

/**
 * Expand `frustum` in place by `margin` (world units) by pushing each of its
 * six planes outward. Used to build the "hide" threshold for hysteresis.
 * Returns `frustum`.
 */
export const expandFrustum = (frustum: Frustum, margin: number): Frustum => {
  if (margin <= 0) return frustum;
  const planes = frustum.planes;
  for (let i = 0; i < planes.length; i++) {
    planes[i].constant += margin;
  }
  return frustum;
};

/**
 * Hysteresis visibility test for a bounding sphere at `center` with `radius`.
 *  - visible if it intersects `showFrustum` (the exact camera frustum);
 *  - keep the previous state if it is within the `hideFrustum` (the exact
 *    frustum expanded by the margin) — the grace band;
 *  - otherwise hidden.
 * Returns the new visibility (the caller stores it for the next frame).
 */
export const isSphereVisible = (
  center: Vector3,
  radius: number,
  showFrustum: Frustum,
  hideFrustum: Frustum,
  wasVisible: boolean
): boolean => {
  _testSphere.center.copy(center);
  _testSphere.radius = radius;
  if (showFrustum.intersectsSphere(_testSphere)) return true;
  if (hideFrustum.intersectsSphere(_testSphere)) return wasVisible;
  return false;
};

/**
 * World-space bounding radius of `object`'s subtree, measured from `object`'s
 * world origin. The scale is 1 in this scene and rotation preserves distances,
 * so the value is orientation-independent and valid at any point on the planet.
 * Computed once per object (first frame) and cached by the hook.
 */
export const computeBoundingRadius = (object: Object3D): number => {
  object.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) return 0;
  const origin = object.getWorldPosition(new Vector3());
  let maxDist = 0;
  const corner = new Vector3();
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        corner.set(x, y, z);
        maxDist = Math.max(maxDist, corner.distanceTo(origin));
      }
    }
  }
  return maxDist;
};
