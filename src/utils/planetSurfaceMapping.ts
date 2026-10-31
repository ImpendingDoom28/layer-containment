import { Matrix4, Quaternion, Vector3 } from "three";

import { tileToWorldCoordinate } from "./levelEditor";

export const GROUND_SIZE_RADIUS_FACTOR = 20;
export const GROUND_POLE_EPSILON = -0.2;

export const getPlanetRadius = (gridSize: number, tileSize: number): number => {
  const groundSize = gridSize * tileSize;
  return Math.max(groundSize * GROUND_SIZE_RADIUS_FACTOR, groundSize);
};

export const getPlanetSphereCenter = (radius: number): Vector3 => {
  return new Vector3(0, -radius - GROUND_POLE_EPSILON, 0);
};

export const getPlanetSphereMeshPositionY = (radius: number): number => {
  return -radius - GROUND_POLE_EPSILON;
};

type FlatFieldToSphereResult = {
  surfacePoint: Vector3;
  normal: Vector3;
};

const scratchDirection = new Vector3();
const scratchForward = new Vector3();
const scratchRight = new Vector3();

export const flatFieldToSphereSurface = (
  worldX: number,
  worldZ: number,
  radius: number,
  outSurfacePoint?: Vector3,
  outNormal?: Vector3
): FlatFieldToSphereResult => {
  const center = getPlanetSphereCenter(radius);
  const northPoleY = center.y + radius;
  const qx = worldX;
  const qy = northPoleY;
  const qz = worldZ;

  scratchDirection.set(qx - center.x, qy - center.y, qz - center.z);
  const len = scratchDirection.length();
  if (len < 1e-12) {
    scratchDirection.set(0, 1, 0);
  } else {
    scratchDirection.multiplyScalar(1 / len);
  }

  const normal = outNormal ?? new Vector3();
  normal.copy(scratchDirection);

  const surfacePoint = outSurfacePoint ?? new Vector3();
  surfacePoint.copy(center).addScaledVector(normal, radius);

  return { surfacePoint, normal };
};

export const getSurfaceQuaternion = (
  normal: Vector3,
  out?: Quaternion
): Quaternion => {
  const quat = out ?? new Quaternion();
  return quat.setFromUnitVectors(new Vector3(0, 1, 0), normal);
};

export const flatFieldToSphereTileMeshCenter = (
  worldX: number,
  worldZ: number,
  radius: number,
  halfHeightY: number,
  out?: Vector3
): Vector3 => {
  const { surfacePoint, normal } = flatFieldToSphereSurface(
    worldX,
    worldZ,
    radius
  );
  const result = out ?? new Vector3();
  return result.copy(surfacePoint).addScaledVector(normal, halfHeightY);
};

export const flatCombatPointToWorldPosition = (
  flatX: number,
  flatZ: number,
  offsetAlongNormal: number,
  radius: number,
  out?: Vector3
): Vector3 => {
  const { surfacePoint, normal } = flatFieldToSphereSurface(
    flatX,
    flatZ,
    radius
  );
  const result = out ?? new Vector3();
  return result.copy(surfacePoint).addScaledVector(normal, offsetAlongNormal);
};

export const getGridMaxTileTopWorldY = (
  gridSize: number,
  tileSize: number,
  tileHeightY: number,
  radius: number
): number => {
  let maxY = -Infinity;
  for (let gridX = 0; gridX < gridSize; gridX++) {
    for (let gridZ = 0; gridZ < gridSize; gridZ++) {
      const wx = tileToWorldCoordinate(gridX, gridSize, tileSize);
      const wz = tileToWorldCoordinate(gridZ, gridSize, tileSize);
      const { surfacePoint, normal } = flatFieldToSphereSurface(wx, wz, radius);
      const topY = surfacePoint.y + normal.y * tileHeightY;
      maxY = Math.max(maxY, topY);
    }
  }
  return maxY;
};

export const flatFieldToSphereTilePose = (
  worldX: number,
  worldZ: number,
  radius: number,
  halfHeightY: number
): { position: Vector3; quaternion: Quaternion } => {
  const { surfacePoint, normal } = flatFieldToSphereSurface(
    worldX,
    worldZ,
    radius
  );
  const position = new Vector3()
    .copy(surfacePoint)
    .addScaledVector(normal, halfHeightY);
  const quaternion = getSurfaceQuaternion(normal);
  return { position, quaternion };
};

export const getQuaternionForPathStrip = (
  worldX: number,
  worldZ: number,
  flatDirX: number,
  flatDirZ: number,
  radius: number,
  out?: Quaternion
): Quaternion => {
  const { normal } = flatFieldToSphereSurface(worldX, worldZ, radius);
  const { forward, right } = getFlatTangentBasisOnSphere(
    worldX,
    worldZ,
    flatDirX,
    flatDirZ,
    radius
  );
  const m = new Matrix4();
  m.makeBasis(forward, normal, right);
  return (out ?? new Quaternion()).setFromRotationMatrix(m);
};

/**
 * Orientation for a group whose local +x axis should point along the flat
 * direction `flatDirX`/`flatDirZ` tangent to the planet surface at `normal`,
 * with the local +y axis as that normal. Same basis convention as
 * `getQuaternionForPathStrip`, but built from a precomputed normal and
 * reusing a caller-provided matrix, so it is allocation-free for per-frame
 * use (the Enemy render component orients each enemy this way).
 */
export const getFacingQuaternionOnSphere = (
  flatDirX: number,
  flatDirZ: number,
  normal: Vector3,
  matrix: Matrix4,
  out: Quaternion
): Quaternion => {
  const dx = Math.hypot(flatDirX, flatDirZ) < 1e-12 ? 1 : flatDirX;
  const dz = Math.hypot(flatDirX, flatDirZ) < 1e-12 ? 0 : flatDirZ;

  const forward = scratchForward.set(dx, 0, dz);
  forward.addScaledVector(normal, -normal.dot(forward));
  if (forward.lengthSq() < 1e-12) {
    forward.set(1, 0, 0);
    forward.addScaledVector(normal, -normal.dot(forward));
  }
  forward.normalize();

  const right = scratchRight.crossVectors(forward, normal).normalize();

  matrix.makeBasis(forward, normal, right);
  return out.setFromRotationMatrix(matrix);
};

/**
 * Local quaternion for a child (e.g. the enemy health bar) that should face
 * the camera: childWorldQ must equal cameraWorldQ, and childWorldQ =
 * parentWorldQ * localQ, so localQ = parentWorldQ^-1 * cameraWorldQ.
 * Allocation-free per-frame use via caller-provided `out`.
 */
export const getBillboardLocalQuaternion = (
  parentWorldQuat: Quaternion,
  cameraWorldQuat: Quaternion,
  out: Quaternion
): Quaternion => {
  return out.copy(parentWorldQuat).invert().multiply(cameraWorldQuat);
};

export const flatFieldToSphereOverlayPlanePose = (
  worldX: number,
  worldZ: number,
  radius: number,
  heightAlongNormal: number
): { position: Vector3; quaternion: Quaternion } => {
  const { surfacePoint, normal } = flatFieldToSphereSurface(
    worldX,
    worldZ,
    radius
  );
  const position = surfacePoint
    .clone()
    .addScaledVector(normal, heightAlongNormal);
  const qTile = getSurfaceQuaternion(normal);
  const tileX = new Vector3(1, 0, 0).applyQuaternion(qTile);
  const tileZ = new Vector3(0, 0, 1).applyQuaternion(qTile);
  const basis = new Matrix4();
  basis.makeBasis(tileX, tileZ.clone().negate(), normal);
  const quaternion = new Quaternion().setFromRotationMatrix(basis);
  return { position, quaternion };
};

export const getFlatTangentBasisOnSphere = (
  worldX: number,
  worldZ: number,
  flatDirX: number,
  flatDirZ: number,
  radius: number,
  outForward?: Vector3,
  outRight?: Vector3
): { forward: Vector3; right: Vector3 } => {
  const { normal } = flatFieldToSphereSurface(worldX, worldZ, radius);
  const flatLen = Math.hypot(flatDirX, flatDirZ);
  const dx = flatLen < 1e-12 ? 1 : flatDirX / flatLen;
  const dz = flatLen < 1e-12 ? 0 : flatDirZ / flatLen;

  const forward = outForward ?? new Vector3();
  forward.set(dx, 0, dz);
  forward.addScaledVector(normal, -normal.dot(forward));
  if (forward.lengthSq() < 1e-12) {
    forward.set(1, 0, 0);
    forward.addScaledVector(normal, -normal.dot(forward));
  }
  forward.normalize();

  const right = outRight ?? new Vector3();
  right.crossVectors(forward, normal).normalize();

  return { forward, right };
};
