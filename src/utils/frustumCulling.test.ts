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
  computeBoundingRadius,
  expandFrustum,
  isSphereVisible,
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
});
