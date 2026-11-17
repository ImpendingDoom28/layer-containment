import { FC, memo } from "react";
import {
  CircleGeometry,
  Color,
  MeshBasicMaterial,
  Quaternion,
} from "three";

import { getCssColorValue } from "../../ui/lib/cssUtils";

type DeadZoneDiscProps = {
  radius: number;
  radialSegments?: number;
  opacity?: number;
  position?: [number, number, number];
  /** Absolute orientation (placement overlay); takes precedence over rotation. */
  quaternion?: Quaternion;
  /** Local orientation (selected tower, inside an already-oriented group). */
  rotation?: [number, number, number];
};

let cachedDeadZoneColor: string | null = null;

// Destructuring defaults widen array literals to `number[]`, which fails to
// assign to the tuple-typed mesh props, so the defaults live in named tuples.
// The disc lies flat on the ground plane by default (facing up, rotated -PI/2
// about X).
const DEAD_ZONE_DEFAULT_POSITION: [number, number, number] = [0, 0, 0];
const DEAD_ZONE_DEFAULT_ROTATION: [number, number, number] = [
  -Math.PI / 2,
  0,
  0,
];

/**
 * The shared "negative" tint for areas a tower can't engage: the destructive
 * red mixed toward scene gray, matching the placement overlay's
 * "can't place here" color, so a no-fire zone reads as off-limits no matter
 * which tower type shows it.
 */
export const getDeadZoneColor = (): string => {
  if (!cachedDeadZoneColor) {
    const c = new Color(getCssColorValue("scene-hp-low"));
    c.lerp(new Color(getCssColorValue("scene-gray-600")), 0.5);
    cachedDeadZoneColor = `#${c.getHexString()}`;
  }
  return cachedDeadZoneColor;
};

// At most two live instances at a time (the selected tower and the placement
// preview), so the disc geometry and material are shared per varying-prop set
// instead of allocated per mount (never disposed — the scene's lifetime).
const deadZoneDiscGeometryCache = new Map<string, CircleGeometry>();
const getDeadZoneDiscGeometry = (
  radius: number,
  radialSegments: number
): CircleGeometry => {
  const key = `${radius}|${radialSegments}`;
  const entry = deadZoneDiscGeometryCache.get(key);
  if (entry) return entry;
  const geometry = new CircleGeometry(radius, radialSegments);
  deadZoneDiscGeometryCache.set(key, geometry);
  return geometry;
};

const deadZoneDiscMaterialCache = new Map<number, MeshBasicMaterial>();
const getDeadZoneDiscMaterial = (opacity: number): MeshBasicMaterial => {
  const entry = deadZoneDiscMaterialCache.get(opacity);
  if (entry) return entry;
  const material = new MeshBasicMaterial({
    color: getDeadZoneColor(),
    transparent: true,
    opacity,
    side: 2,
    depthWrite: false,
  });
  deadZoneDiscMaterialCache.set(opacity, material);
  return material;
};

/**
 * Filled disc marking a tower's minimum-effective-range dead zone — the area
 * it refuses to shoot at (a BRL rocket needs room to arc). Rendered together
 * with the outer range ring so the playable band (between the two) reads as
 * the tower's real reach and the filled center as off-limits.
 */
export const DeadZoneDisc: FC<DeadZoneDiscProps> = memo(
  ({
    radius,
    radialSegments = 32,
    opacity = 0.4,
    position = DEAD_ZONE_DEFAULT_POSITION,
    quaternion,
    rotation,
  }) => (
    <mesh
      position={position}
      rotation={
        quaternion ? undefined : (rotation ?? DEAD_ZONE_DEFAULT_ROTATION)
      }
      quaternion={quaternion}
      geometry={getDeadZoneDiscGeometry(radius, radialSegments)}
      material={getDeadZoneDiscMaterial(opacity)}
      raycast={() => null}
    />
  )
);

DeadZoneDisc.displayName = "DeadZoneDisc";
