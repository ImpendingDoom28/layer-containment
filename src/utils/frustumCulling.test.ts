import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Sphere,
  Vector3,
} from "three";

import {
  buildFrustumFromCamera,
  captureTransformSnapshot,
  computeBoundingRadius,
  expandFrustum,
  isSphereVisible,
  isTransformSnapshotStale,
} from "./frustumCulling";

// Camera at the origin looking down -Z (three.js default orientation): the
// view frustum contains -Z in front, +Z behind, and the +x side is cut off by
// the right plane near x = 7.7 at z = -10 (for fov 75, aspect 1).
const makeCamera = () => {
  const camera = new PerspectiveCamera(75, 1, 0.1, 100);
  camera.updateMatrixWorld();
  return camera;
};

const buildShow = (camera: PerspectiveCamera) =>
  buildFrustumFromCamera(camera, new Matrix4(), new Frustum());

const buildHide = (camera: PerspectiveCamera, margin: number) => {
  const show = buildShow(camera);
  const hide = new Frustum().copy(show);
  return expandFrustum(hide, margin);
};

const sphere = (x: number, y: number, z: number, r = 0.001) =>
  new Sphere(new Vector3(x, y, z), r);

describe("buildFrustumFromCamera", () => {
  it("intersects points in front of the camera, not behind", () => {
    const show = buildShow(makeCamera());

    expect(show.intersectsSphere(sphere(0, 0, -10))).toBe(true);
    expect(show.intersectsSphere(sphere(0, 0, 5))).toBe(false);
  });
});

describe("expandFrustum", () => {
  it("widens the frustum so a slightly-outside point is contained", () => {
    const show = buildShow(makeCamera());
    const hide = new Frustum().copy(show);
    expandFrustum(hide, 2);

    // x = 7.7 is on the right plane of the show frustum at z = -10; a point
    // 0.5 past it is outside the show frustum but inside the expanded one.
    const grace = sphere(8.2, 0, -10);
    expect(show.intersectsSphere(grace)).toBe(false);
    expect(hide.intersectsSphere(grace)).toBe(true);
  });

  it("is a no-op for a non-positive margin", () => {
    const show = buildShow(makeCamera());
    const hide = new Frustum().copy(show);
    expandFrustum(hide, 0);

    const planes = hide.planes;
    expect(planes[0].constant).toBe(show.planes[0].constant);
  });
});

describe("isSphereVisible", () => {
  const camera = makeCamera();
  const show = buildShow(camera);
  const hide = buildHide(camera, 2);

  it("shows a sphere inside the frustum regardless of previous state", () => {
    expect(isSphereVisible(new Vector3(0, 0, -10), 0.001, show, hide, false)).toBe(true);
    expect(isSphereVisible(new Vector3(0, 0, -10), 0.001, show, hide, true)).toBe(true);
  });

  it("keeps a sphere in the grace band in its previous state", () => {
    const grace = new Vector3(8.2, 0, -10);
    expect(isSphereVisible(grace, 0.001, show, hide, true)).toBe(true);
    expect(isSphereVisible(grace, 0.001, show, hide, false)).toBe(false);
  });

  it("hides a sphere beyond the grace band", () => {
    expect(isSphereVisible(new Vector3(100, 0, -10), 0.001, show, hide, true)).toBe(false);
    expect(isSphereVisible(new Vector3(100, 0, -10), 0.001, show, hide, false)).toBe(false);
  });
});

describe("computeBoundingRadius", () => {
  it("is the farthest corner distance from the group origin", () => {
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(1, 1, 1)));
    // Half-diagonal of a 1x1x1 box: sqrt(3)/2 ~= 0.866.
    expect(computeBoundingRadius(group)).toBeCloseTo(0.866, 3);
  });

  it("accounts for child offsets from the group origin", () => {
    const group = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    mesh.position.set(3, 0, 0);
    group.add(mesh);
    // Farthest corner is at x = 3 + 1, distance sqrt(4^2 + 1 + 1) ~= 4.243.
    expect(computeBoundingRadius(group)).toBeCloseTo(4.2426, 3);
  });

  it("is zero for an empty group", () => {
    expect(computeBoundingRadius(new Group())).toBe(0);
  });

  it("bounds the subtree at every root orientation (caches safely across rotation)", () => {
    // The hook measures the radius once and never tracks the root's own
    // quaternion, so the cached value must stay a valid bound while the root
    // spins with the planet. Build an asymmetric "L" (two unit cubes whose
    // centers sit at distance 2 and 1 from the origin), measure at one
    // orientation, and check the cached value still covers every corner of
    // the subtree at every other orientation.
    const buildL = () => {
      const group = new Group();
      const a = new Mesh(new BoxGeometry(1, 1, 1));
      a.position.set(2, 0, 0);
      const b = new Mesh(new BoxGeometry(1, 1, 1));
      b.position.set(0, 1, 0);
      group.add(a, b);
      return group;
    };
    // All 8 corners of a unit cube centered at `center`.
    const cubeCorners = (center: Vector3) => {
      const corners: Vector3[] = [];
      for (const x of [-0.5, 0.5])
        for (const y of [-0.5, 0.5])
          for (const z of [-0.5, 0.5])
            corners.push(new Vector3(center.x + x, center.y + y, center.z + z));
      return corners;
    };

    const group = buildL();
    group.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4);
    const cachedRadius = computeBoundingRadius(group);

    for (const deg of [0, 15, 45, 90, 135]) {
      const rotated = buildL();
      rotated.quaternion.setFromAxisAngle(
        new Vector3(0, 0, 1),
        (deg * Math.PI) / 180
      );
      const q = rotated.quaternion;
      // True farthest subtree point (a cube corner) from the root origin at
      // this orientation — the value the cached radius must never undersize.
      let trueMax = 0;
      for (const corner of [
        ...cubeCorners(new Vector3(2, 0, 0)),
        ...cubeCorners(new Vector3(0, 1, 0)),
      ]) {
        trueMax = Math.max(trueMax, corner.applyQuaternion(q).length());
      }
      expect(cachedRadius).toBeGreaterThanOrEqual(trueMax - 1e-9);
    }
  });
});

describe("transform snapshot staleness", () => {
  const makeGroup = () => {
    const group = new Group();
    const inner = new Group();
    const a = new Mesh(new BoxGeometry(1, 1, 1));
    const b = new Mesh(new BoxGeometry(1, 1, 1));
    b.position.set(1, 0, 0);
    inner.add(a, b);
    group.add(inner);
    return { group, inner, a, b };
  };

  it("is not stale while descendants are at rest", () => {
    const { group } = makeGroup();
    const snapshot = captureTransformSnapshot(group);

    expect(isTransformSnapshotStale(group, snapshot)).toBe(false);
  });

  it("is stale when a descendant scales (a heal ring expanding)", () => {
    const { group, a } = makeGroup();
    const snapshot = captureTransformSnapshot(group);

    a.scale.set(2, 2, 2);
    expect(isTransformSnapshotStale(group, snapshot)).toBe(true);
  });

  it("is stale when a descendant moves or rotates", () => {
    const { group, b } = makeGroup();
    const snapshot = captureTransformSnapshot(group);

    b.position.set(1, 0.5, 0);
    expect(isTransformSnapshotStale(group, snapshot)).toBe(true);

    const { group: group2, inner: inner2 } = makeGroup();
    const snapshot2 = captureTransformSnapshot(group2);
    inner2.rotation.y = Math.PI / 2;
    expect(isTransformSnapshotStale(group2, snapshot2)).toBe(true);
  });

  it("is stale when the descendant set changes in either direction", () => {
    const { group, inner } = makeGroup();
    const snapshot = captureTransformSnapshot(group);

    inner.add(new Mesh(new BoxGeometry(1, 1, 1)));
    expect(isTransformSnapshotStale(group, snapshot)).toBe(true);

    const { group: group2, inner: inner2 } = makeGroup();
    const snapshot2 = captureTransformSnapshot(group2);
    inner2.remove(inner2.children[1]);
    expect(isTransformSnapshotStale(group2, snapshot2)).toBe(true);
  });

  it("ignores the root's own transform (position/rotation/scale)", () => {
    const { group } = makeGroup();
    const snapshot = captureTransformSnapshot(group);

    // The root moves every frame as the enemy walks; only descendants matter
    // for staleness, because the sphere center is re-read each frame.
    group.position.set(10, 20, 30);
    group.rotation.y = 1;
    group.scale.set(2, 2, 2);
    expect(isTransformSnapshotStale(group, snapshot)).toBe(false);
  });
});
