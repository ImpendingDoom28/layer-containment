import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import { tileToWorldCoordinate } from "./levelEditor";
import {
  GROUND_POLE_EPSILON,
  GROUND_SIZE_RADIUS_FACTOR,
  flatFieldToSphereOverlayPlanePose,
  flatFieldToSphereSurface,
  getBillboardLocalQuaternion,
  getFacingQuaternionOnSphere,
  getGridMaxTileTopWorldY,
  getPlanetRadius,
  getPlanetSphereCenter,
  getPlanetSphereMeshPositionY,
  getQuaternionForPathStrip,
  getSurfaceQuaternion,
} from "./planetSurfaceMapping";

describe("planetSurfaceMapping", () => {
  it("getPlanetRadius matches max(factor*ground, ground)", () => {
    expect(getPlanetRadius(10, 1)).toBe(10 * GROUND_SIZE_RADIUS_FACTOR);
    expect(getPlanetRadius(1, 1)).toBe(1 * GROUND_SIZE_RADIUS_FACTOR);
  });

  it("sphere center Y matches Ground mesh offset", () => {
    const r = 100;
    const c = getPlanetSphereCenter(r);
    expect(c.x).toBe(0);
    expect(c.z).toBe(0);
    expect(c.y).toBe(-r - GROUND_POLE_EPSILON);
    expect(getPlanetSphereMeshPositionY(r)).toBe(c.y);
  });

  it("flatFieldToSphereSurface places point on sphere shell", () => {
    const radius = 100;
    const center = getPlanetSphereCenter(radius);
    const { surfacePoint, normal } = flatFieldToSphereSurface(0, 0, radius);
    const delta = new Vector3().subVectors(surfacePoint, center);
    expect(delta.length()).toBeCloseTo(radius, 5);
    expect(normal.y).toBeCloseTo(1, 5);
    expect(normal.x).toBeCloseTo(0, 5);
    expect(normal.z).toBeCloseTo(0, 5);
  });

  it("is symmetric in wx and wz magnitude for equal offsets", () => {
    const radius = 200;
    const a = flatFieldToSphereSurface(5, 0, radius, undefined, new Vector3());
    const b = flatFieldToSphereSurface(0, 5, radius, undefined, new Vector3());
    expect(Math.abs(a.surfacePoint.y - b.surfacePoint.y)).toBeLessThan(1e-5);
  });

  it("getGridMaxTileTopWorldY is max of tile tops over grid", () => {
    const gridSize = 3;
    const tileSize = 1;
    const tileHeightY = 0.12;
    const radius = getPlanetRadius(gridSize, tileSize);
    let expected = -Infinity;
    for (let gx = 0; gx < gridSize; gx++) {
      for (let gz = 0; gz < gridSize; gz++) {
        const wx = tileToWorldCoordinate(gx, gridSize, tileSize);
        const wz = tileToWorldCoordinate(gz, gridSize, tileSize);
        const { surfacePoint, normal } = flatFieldToSphereSurface(
          wx,
          wz,
          radius
        );
        const topY = surfacePoint.y + normal.y * tileHeightY;
        expected = Math.max(expected, topY);
      }
    }
    expect(
      getGridMaxTileTopWorldY(gridSize, tileSize, tileHeightY, radius)
    ).toBeCloseTo(expected, 5);
  });

  it("overlay plane +Z aligns with surface normal (matches PlaneGeometry)", () => {
    const radius = 100;
    const { normal } = flatFieldToSphereSurface(3, -2, radius);
    const { quaternion } = flatFieldToSphereOverlayPlanePose(3, -2, radius, 0);
    const planeNormal = new Vector3(0, 0, 1).applyQuaternion(quaternion);
    expect(planeNormal.dot(normal)).toBeCloseTo(1, 5);
  });

  it("overlay plane tangent axes match Tile local X / -Z (no twist around normal)", () => {
    const radius = 80;
    const wx = 4.2;
    const wz = -3.1;
    const { normal } = flatFieldToSphereSurface(wx, wz, radius);
    const qTile = getSurfaceQuaternion(normal);
    const tileX = new Vector3(1, 0, 0).applyQuaternion(qTile);
    const { quaternion } = flatFieldToSphereOverlayPlanePose(wx, wz, radius, 0);
    const planeX = new Vector3(1, 0, 0).applyQuaternion(quaternion);
    const planeY = new Vector3(0, 1, 0).applyQuaternion(quaternion);
    expect(planeX.dot(tileX)).toBeCloseTo(1, 5);
    expect(planeX.dot(normal)).toBeCloseTo(0, 5);
    expect(planeY.dot(normal)).toBeCloseTo(0, 5);
    expect(new Vector3().crossVectors(planeX, planeY).dot(normal)).toBeCloseTo(
      1,
      5
    );
  });

  it("reuses out vectors when provided", () => {
    const radius = 50;
    const outP = new Vector3();
    const outN = new Vector3();
    const r = flatFieldToSphereSurface(2, 3, radius, outP, outN);
    expect(r.surfacePoint).toBe(outP);
    expect(r.normal).toBe(outN);
  });

  it("getFacingQuaternionOnSphere points local +x along the flat direction", () => {
    const radius = 100;
    const wx = 4.2;
    const wz = -3.1;
    const { normal } = flatFieldToSphereSurface(wx, wz, radius);
    const out = new Quaternion();
    getFacingQuaternionOnSphere(1, 0.5, normal, new Matrix4(), out);

    const forward = new Vector3(1, 0, 0).applyQuaternion(out);
    const flatDir = new Vector3(1, 0, 0.5);
    const expected = flatDir
      .clone()
      .addScaledVector(normal, -normal.dot(flatDir))
      .normalize();
    expect(forward.dot(expected)).toBeCloseTo(1, 5);

    // Local +y is the surface normal and the basis is right-handed.
    const up = new Vector3(0, 1, 0).applyQuaternion(out);
    expect(up.dot(normal)).toBeCloseTo(1, 5);
    const right = new Vector3(0, 0, 1).applyQuaternion(out);
    expect(
      right.dot(new Vector3().crossVectors(expected, normal).normalize())
    ).toBeCloseTo(1, 5);
  });

  it("getFacingQuaternionOnSphere matches getQuaternionForPathStrip", () => {
    const radius = 80;
    const wx = 3.3;
    const wz = -2.2;
    const dirX = 0.6;
    const dirZ = -0.8;
    const { normal } = flatFieldToSphereSurface(wx, wz, radius);
    const a = new Quaternion();
    getFacingQuaternionOnSphere(dirX, dirZ, normal, new Matrix4(), a);
    const b = getQuaternionForPathStrip(
      wx,
      wz,
      dirX,
      dirZ,
      radius,
      new Quaternion()
    );
    expect(a.dot(b)).toBeCloseTo(1, 5);
  });

  it("getFacingQuaternionOnSphere falls back to the +x tangent for a zero direction", () => {
    const radius = 100;
    const wx = 5;
    const wz = 5;
    const { normal } = flatFieldToSphereSurface(wx, wz, radius);
    const out = new Quaternion();
    getFacingQuaternionOnSphere(0, 0, normal, new Matrix4(), out);
    const forward = new Vector3(1, 0, 0).applyQuaternion(out);
    expect(forward.dot(normal)).toBeCloseTo(0, 5);
    expect(forward.length()).toBeCloseTo(1, 5);
  });

  it("getBillboardLocalQuaternion orients a child face-on to the camera", () => {
    // A parent group with an arbitrary rotation (as the enemy group gets).
    const parent = new Quaternion().setFromEuler(new Euler(0.3, 0.7, -0.2));
    // A camera world quaternion distinct from the parent's.
    const camera = new Quaternion().setFromEuler(new Euler(-0.15, 0.4, 0.1));

    const local = getBillboardLocalQuaternion(parent, camera, new Quaternion());

    // The bar's world rotation (parent * local) must equal the camera's.
    const barWorld = parent.clone().multiply(local);
    expect(barWorld.dot(camera)).toBeCloseTo(1, 5);
  });

  it("getBillboardLocalQuaternion is stable across frames (no drift)", () => {
    const parent = new Quaternion().setFromEuler(new Euler(0.3, 0.7, -0.2));
    const camera = new Quaternion().setFromEuler(new Euler(-0.15, 0.4, 0.1));
    const prior = new Quaternion();
    const out = new Quaternion();

    // With a fixed parent and camera, the bar's world rotation is the camera
    // on every frame, regardless of the arbitrary rotation it held before —
    // so it cannot accumulate per-frame error the way the old feedback-based
    // math did. Each frame the bar "held" a different prior local rotation.
    for (let frame = 0; frame < 5; frame++) {
      prior.set(frame, frame * 0.1, frame * 0.2, 1).normalize();
      out.copy(prior); // bar held `prior` from last frame
      getBillboardLocalQuaternion(parent, camera, out);
      const barWorld = parent.clone().multiply(out);
      expect(barWorld.dot(camera)).toBeCloseTo(1, 5);
    }
  });
});
