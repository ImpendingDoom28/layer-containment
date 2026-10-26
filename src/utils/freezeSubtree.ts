import type { Object3D } from "three";

const freezeObject = (object: Object3D): void => {
  object.matrixAutoUpdate = false;
  object.matrixWorldAutoUpdate = false;
  object.updateMatrix();
  if (object.parent) {
    object.matrixWorld.multiplyMatrices(
      object.parent.matrixWorld,
      object.matrix
    );
  } else {
    object.matrixWorld.copy(object.matrix);
  }
};

/**
 * Freezes a static scene-graph subtree so three.js skips the per-frame local
 * matrix compose and world matrix multiply for every node in it. The renderer
 * otherwise force-recomputes the world matrix of every node each frame (the
 * scene root re-runs `updateMatrixWorld()` and `force=true` propagates to all
 * descendants), even when the node's transform never changes.
 *
 * `Object3D.traverse` is parent-first, so each node's world matrix is computed
 * from its already-frozen parent. `updateWorldMatrix(true, false)` runs first
 * so the ancestor chain above the subtree is current before we freeze against
 * it. Call again whenever a transform in the subtree changes (e.g. a level
 * switch) to re-bake the matrices.
 */
export const freezeSubtree = (root: Object3D): void => {
  root.updateWorldMatrix(true, false);
  root.traverse(freezeObject);
};
