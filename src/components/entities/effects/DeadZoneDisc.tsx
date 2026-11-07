import { FC, memo } from "react";
import { Quaternion } from "three";

type DeadZoneDiscProps = {
  radius: number;
  color: string;
  radialSegments?: number;
  opacity?: number;
  position?: [number, number, number];
  /** Absolute orientation (placement overlay); takes precedence over rotation. */
  quaternion?: Quaternion;
  /** Local orientation (selected tower, inside an already-oriented group). */
  rotation?: [number, number, number];
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
    color,
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
        color={color}
        transparent
        opacity={opacity}
        side={2}
        depthWrite={false}
      />
    </mesh>
  )
);

DeadZoneDisc.displayName = "DeadZoneDisc";
