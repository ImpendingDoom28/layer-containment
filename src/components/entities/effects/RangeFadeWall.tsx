import { FC, memo, useMemo } from "react";

import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Quaternion,
} from "three";

const DEFAULT_POSITION: [number, number, number] = [0, 0, 0];

// Golden angle (radians): spreading the strips by it (phyllotaxis) gives the
// "random" scatter without an RNG — deterministic per range, no two adjacent
// strips share a bearing, and every mount of the same range looks identical.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const stripAlpha = (value: number): number => value - Math.floor(value);

type StripSpec = {
  theta: number;
  halfWidth: number;
  height: number;
  opacity: number;
};

// The strip count tracks the range so a bigger ring reads as a denser wall
// (a 3-unit slow-tower ring is a sparse few flares, a 5-unit BRL ring a
// fuller curtain), clamped so it stays cheap.
const getStripCount = (range: number): number =>
  Math.max(8, Math.min(16, Math.round(range * 3)));

const buildStripSpecs = (range: number): StripSpec[] => {
  const count = getStripCount(range);
  const specs: StripSpec[] = [];
  for (let i = 0; i < count; i++) {
    specs.push({
      // The per-range offset scatters the pattern differently per tower type.
      theta: (i * GOLDEN_ANGLE + range * 1.7) % (Math.PI * 2),
      halfWidth: (0.05 + 0.05 * stripAlpha(i * 0.61803 + range * 0.35)) / 2,
      height: 0.6 + 0.9 * stripAlpha(i * 0.75471 + range * 0.2113),
      opacity: 0.3 + 0.5 * stripAlpha(i * 0.42701 + range * 0.5719),
    });
  }
  return specs;
};

/**
 * One quad per strip (4 vertices, 2 triangles): a thin vertical ribbon standing
 * on the ring line (y = 0 at the local origin, radius in the XZ plane). The
 * per-vertex colour carries white + the strip's alpha, fading to 0 at the top —
 * the "light wall" that rises off the range ring and melts out upward, like
 * the `swift` upgrade's fading speed straps.
 */
const buildRangeFadeWallGeometry = (range: number): BufferGeometry => {
  const specs = buildStripSpecs(range);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  specs.forEach((spec, i) => {
    const sin = Math.sin(spec.theta);
    const cos = Math.cos(spec.theta);
    const innerR = range - spec.halfWidth;
    const outerR = range + spec.halfWidth;
    // 0: base/inner, 1: base/outer, 2: top/outer, 3: top/inner.
    positions.push(
      cos * innerR,
      0,
      sin * innerR,
      cos * outerR,
      0,
      sin * outerR,
      cos * outerR,
      spec.height,
      sin * outerR,
      cos * innerR,
      spec.height,
      sin * innerR
    );
    // RGBA vertex colours: solid white at the base (the main ring line),
    // fully transparent at the top — the fade from the stripe to the top.
    colors.push(
      1,
      1,
      1,
      spec.opacity,
      1,
      1,
      1,
      spec.opacity,
      1,
      1,
      1,
      0,
      1,
      1,
      1,
      0
    );
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  // The 4-item colour attribute enables the alpha-vertex-colour shader path.
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return geometry;
};

// One geometry per distinct range (a handful in practice: the tower ranges
// plus relay-buffed variants) — shared by every wall of that range, so the
// per-frame cost is a single additive draw.
const wallGeometryCache = new Map<number, BufferGeometry>();

const getWallGeometry = (range: number): BufferGeometry => {
  const key = Math.round(range * 100) / 100;
  let geometry = wallGeometryCache.get(key);
  if (!geometry) {
    geometry = buildRangeFadeWallGeometry(key);
    wallGeometryCache.set(key, geometry);
  }
  return geometry;
};

// All walls are white, so one shared additive material: the per-vertex alpha
// carries the strip fade, the material stays static (no per-frame writes).
const wallMaterial = new MeshBasicMaterial({
  color: "#ffffff",
  vertexColors: true,
  transparent: true,
  blending: AdditiveBlending,
  side: DoubleSide,
  depthWrite: false,
});

type RangeFadeWallProps = {
  range: number;
  position?: [number, number, number];
  /** Absolute orientation (placement overlay); takes precedence over rotation. */
  quaternion?: Quaternion;
  /** Local orientation (selected tower, inside an already-oriented group). */
  rotation?: [number, number, number];
};

/**
 * The randomized light wall around the range ring: thin white strips rising
 * from the ring line and fading to transparent at their tops, at scattered
 * bearings (deterministic per range — see the golden-angle spread above).
 * Shared by the selected tower's range indicator and the placement preview.
 * Purely view-side: no animation, no per-frame state, skipped like its ring
 * when the range is ~0.
 */
export const RangeFadeWall: FC<RangeFadeWallProps> = memo(
  ({ range, position = DEFAULT_POSITION, quaternion, rotation }) => {
    const geometry = useMemo(() => getWallGeometry(range), [range]);
    return (
      <group
        position={position}
        quaternion={quaternion}
        rotation={quaternion ? undefined : rotation}
      >
        <mesh
          geometry={geometry}
          material={wallMaterial}
          raycast={() => null}
        />
      </group>
    );
  }
);

RangeFadeWall.displayName = "RangeFadeWall";
