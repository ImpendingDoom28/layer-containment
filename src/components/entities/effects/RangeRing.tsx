import { FC, memo } from "react";
import { MeshBasicMaterial, Quaternion, RingGeometry } from "three";

const DEFAULT_POSITION: [number, number, number] = [0, 0, 0];

// At most two live instances at a time (the selected tower and the placement
// preview), so the ring geometry and material are shared per varying-prop set
// instead of allocated per mount (never disposed — the scene's lifetime).
const rangeRingGeometryCache = new Map<string, RingGeometry>();
const getRangeRingGeometry = (
  range: number,
  innerRadiusFraction: number,
  radialSegments: number
): RingGeometry => {
  const key = `${range}|${innerRadiusFraction}|${radialSegments}`;
  const entry = rangeRingGeometryCache.get(key);
  if (entry) return entry;
  const geometry = new RingGeometry(
    range * innerRadiusFraction,
    range,
    radialSegments
  );
  rangeRingGeometryCache.set(key, geometry);
  return geometry;
};

const rangeRingMaterialCache = new Map<string, MeshBasicMaterial>();
const getRangeRingMaterial = (
  color: string,
  opacity: number
): MeshBasicMaterial => {
  const key = `${color}|${opacity}`;
  const entry = rangeRingMaterialCache.get(key);
  if (entry) return entry;
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: 2,
    depthWrite: false,
  });
  rangeRingMaterialCache.set(key, material);
  return material;
};

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
    // Crisp stripe: only 0.5% of the range wide — the same width as the
    // `RangeFadeWall` spikes (range * 0.005) — so the ring reads as the
    // base line the wave rises out of, not a filled band.
    innerRadiusFraction = 0.995,
    radialSegments = 128,
    opacity = 0.9,
    position = DEFAULT_POSITION,
    quaternion,
    rotation,
  }) => (
    <mesh
      position={position}
      rotation={quaternion ? undefined : (rotation ?? [-Math.PI / 2, 0, 0])}
      quaternion={quaternion}
      geometry={getRangeRingGeometry(range, innerRadiusFraction, radialSegments)}
      material={getRangeRingMaterial(color, opacity)}
      raycast={() => null}
    />
  )
);

RangeRing.displayName = "RangeRing";
