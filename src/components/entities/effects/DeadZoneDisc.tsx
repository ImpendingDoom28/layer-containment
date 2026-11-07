import { FC, memo } from "react";
import { Color, Quaternion } from "three";

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
    position = [0, 0, 0],
    quaternion,
    rotation,
  }) => (
    <mesh
      position={position}
      rotation={quaternion ? undefined : (rotation ?? [-Math.PI / 2, 0, 0])}
      quaternion={quaternion}
      raycast={() => null}
    >
      <circleGeometry args={[radius, radialSegments]} />
      <meshBasicMaterial
        color={getDeadZoneColor()}
        transparent
        opacity={opacity}
        side={2}
        depthWrite={false}
      />
    </mesh>
  )
);

DeadZoneDisc.displayName = "DeadZoneDisc";
