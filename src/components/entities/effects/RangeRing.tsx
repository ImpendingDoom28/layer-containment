import { FC, memo } from "react";
import { Quaternion } from "three";

const DEFAULT_POSITION: [number, number, number] = [0, 0, 0];

type RangeRingProps = {
  range: number;
  color?: string;
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
 * hovered-tile range preview while placing. The default is the thin white
 * max-radius stripe (paired with `RangeFadeWall`'s rising light wall); the
 * `color` / `opacity` props still let callers override it.
 */
export const RangeRing: FC<RangeRingProps> = memo(
  ({
    range,
    color = "#ffffff",
    // Thin band: only 4% of the range wide, so it reads as a crisp stripe
    // at the max radius rather than a filled band.
    innerRadiusFraction = 0.96,
    radialSegments = 64,
    opacity = 0.9,
    position = DEFAULT_POSITION,
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
