import { FC, memo } from "react";
import { Quaternion } from "three";

type RangeRingProps = {
  range: number;
  color: string;
  innerRadiusFraction?: number;
  radialSegments?: number;
  opacity?: number;
  position?: [number, number, number];
  /** Absolute orientation (placement overlay); takes precedence over rotation. */
  quaternion?: Quaternion;
  /** Local orientation (selected tower, inside an already-oriented group). */
  rotation?: [number, number, number];
};

/**
 * Circular ring marker shared by the selected tower's range indicator and the
 * hovered-tile range preview while placing.
 */
export const RangeRing: FC<RangeRingProps> = memo(
  ({
    range,
    color,
    innerRadiusFraction = 0.9,
    radialSegments = 32,
    opacity = 0.3,
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
      <ringGeometry args={[range * innerRadiusFraction, range, radialSegments]} />
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

RangeRing.displayName = "RangeRing";
