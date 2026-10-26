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
  /** World-space bounding radius, re-measured whenever a descendant transform
   * or the child set changes (a ring scaling up, a slow indicator toggling). */
  radius: number;
  /** Flat pre-order capture of every descendant's local transform (10 floats
   * each: position, quaternion, scale), taken when `radius` was last
   * measured. Compared cheaply every frame to detect staleness without
   * re-running the bounding-box walk. */
  transformSnapshot: Float64Array;
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
  transformSnapshot: new Float64Array(0),
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
 * world origin, taken to the farthest corner of the world-space bounding box.
 * The box encloses the subtree, and the squared distance to the origin is
 * convex, so the maximum over the box is at a vertex — the result is a
 * conservative (never undersized) bound.
 *
 * It is also valid under the root's *own* rotation, which is what lets the
 * hook cache it without tracking the root transform: rotating the subtree
 * spins every descendant point about the root origin, and a rotation about
 * the origin preserves each point's distance to it. So the true max distance
 * to the origin is independent of orientation, and this AABB-corner bound
 * (which is always ≥ the true max) holds at every orientation. Measuring at
 * one orientation therefore bounds all others. (Verified by
 * `frustumCulling.test.ts` across a sweep of root quaternions.) The root
 * scale is assumed to be 1, as in this scene.
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

const TRANSFORM_FLOATS_PER_NODE = 10;

/**
 * Captures the local transforms of `object`'s *descendants* (never `object`
 * itself — its position moves the whole sphere and is re-read every frame,
 * and its rotation leaves the bounding sphere intact, see
 * `computeBoundingRadius`) as a flat pre-order sequence, 10 floats per node:
 * position, quaternion, scale. Allocated only when a re-measure happens,
 * which is rare.
 */
export const captureTransformSnapshot = (object: Object3D): Float64Array => {
  const values: number[] = [];
  const walk = (o: Object3D): void => {
    const p = o.position, q = o.quaternion, s = o.scale;
    values.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z);
    for (const c of o.children) walk(c);
  };
  for (const c of object.children) walk(c);
  return new Float64Array(values);
};

/**
 * True when any descendant of `object` has changed local transform, or the
 * descendant set changed, since `snapshot` was captured. Any of those can
 * grow the bounding sphere (a heal ring scaling up, a health-bar fill
 * shrinking, a slow indicator appearing), so the cached radius must be
 * re-measured. Steady-state enemies (descendants at rest) return false in a
 * cheap value compare — no bounding-box walk.
 */
export const isTransformSnapshotStale = (
  object: Object3D,
  snapshot: Float64Array
): boolean => {
  let stale = false;
  let i = 0;
  const walk = (o: Object3D): void => {
    if (stale) return;
    if (i + TRANSFORM_FLOATS_PER_NODE > snapshot.length) {
      stale = true;
      return;
    }
    const p = o.position, q = o.quaternion, s = o.scale;
    stale =
      p.x !== snapshot[i] || p.y !== snapshot[i + 1] || p.z !== snapshot[i + 2] ||
      q.x !== snapshot[i + 3] || q.y !== snapshot[i + 4] ||
      q.z !== snapshot[i + 5] || q.w !== snapshot[i + 6] ||
      s.x !== snapshot[i + 7] || s.y !== snapshot[i + 8] || s.z !== snapshot[i + 9];
    if (stale) return;
    i += TRANSFORM_FLOATS_PER_NODE;
    for (const c of o.children) walk(c);
  };
  for (const c of object.children) walk(c);
  // Fewer live nodes than snapshotted (a child was removed).
  return stale || i !== snapshot.length;
};
