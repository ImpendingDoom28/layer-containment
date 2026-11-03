import { FC, memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  PointsMaterial,
  type Points as ThreePoints,
} from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "../../../utils/planetSurfaceMapping";
import { getCssColorValue } from "../../ui/lib/cssUtils";

const DUST_COUNT = 400;
const DUST_MIN_LIFT = 0.2;
const DUST_MAX_LIFT = 3.6;
const DUST_MIN_SPEED = 0.25;
const DUST_MAX_SPEED = 0.6;
const DUST_SIZE = 0.09;
const DUST_OPACITY = 0.45;
const DUST_MAX_SWAY = 0.15;

type DustCloud = {
  geometry: BufferGeometry;
  material: PointsMaterial;
  base: Float32Array;
  lift: Float32Array;
  drift: Float32Array;
  speed: Float32Array;
  baseLift: Float32Array;
  swayAmp: Float32Array;
  swaySpeed: Float32Array;
  phase: Float32Array;
  wrapHalf: number;
};

/**
 * A single `THREE.Points` cloud of ~400 specks drifting very slowly across the
 * field, a short distance above the planet surface. It is the "the world has
 * air in it" trick: between waves and during the build phase, when nothing
 * else moves, the drifting dust is what reads as alive.
 *
 * Cost is one draw call plus a per-frame walk over 400 points (a few sine
 * waves each), and the per-point data is precomputed typed arrays, so there
 * is no GC pressure in the frame loop. Points drift along a fixed direction
 * and wrap around the field edges, so the cloud is seamless and steady-state.
 * The additive, `toneMapped: false` specks pick up the scene's bloom where
 * they cross bright emissives.
 *
 * The drift eases to a stop with the rest of the world through the
 * simulation clock's time scale, and the whole cloud is skipped under
 * `prefers-reduced-motion`.
 */
export const AmbientDust: FC = memo(() => {
  const reducedMotion = useReducedMotion();
  const { getTimeScale } = useSimulationClock();

  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathYOffset = useGameStore(pathYOffsetSelector);

  const timeRef = useRef(0);
  const pointsRef = useRef<ThreePoints>(null);

  const cloud = useMemo((): DustCloud | null => {
    if (gridSize === 0 || tileSize === 0) return null;

    const radius = getPlanetRadius(gridSize, tileSize);
    const half = (gridSize * tileSize) / 2;

    // Near the board's edge the surface normal tilts outward, so a speck
    // lifted `h` above its base surface point overhangs the field by up to
    // `h * half/radius`. Wrap a bit inside the edge so the cloud stays over
    // the board (the specks drift in flat space; the lift is a fixed vector
    // from the base point, so the overhang is constant per speck).
    const maxLift = pathYOffset + DUST_MAX_LIFT + DUST_MAX_SWAY;
    const wrapHalf = Math.max(half * 0.5, half - maxLift * (half / radius));

    const base = new Float32Array(DUST_COUNT * 3);
    const lift = new Float32Array(DUST_COUNT * 3);
    const drift = new Float32Array(DUST_COUNT * 2);
    const speed = new Float32Array(DUST_COUNT);
    const baseLift = new Float32Array(DUST_COUNT);
    const swayAmp = new Float32Array(DUST_COUNT);
    const swaySpeed = new Float32Array(DUST_COUNT);
    const phase = new Float32Array(DUST_COUNT);

    for (let i = 0; i < DUST_COUNT; i += 1) {
      const wx = (Math.random() * 2 - 1) * wrapHalf;
      const wz = (Math.random() * 2 - 1) * wrapHalf;
      const { surfacePoint, normal } = flatFieldToSphereSurface(wx, wz, radius);

      base[i * 3] = surfacePoint.x;
      base[i * 3 + 1] = surfacePoint.y;
      base[i * 3 + 2] = surfacePoint.z;
      lift[i * 3] = normal.x;
      lift[i * 3 + 1] = normal.y;
      lift[i * 3 + 2] = normal.z;

      const angle = Math.random() * Math.PI * 2;
      drift[i * 2] = Math.cos(angle);
      drift[i * 2 + 1] = Math.sin(angle);

      speed[i] =
        DUST_MIN_SPEED + Math.random() * (DUST_MAX_SPEED - DUST_MIN_SPEED);
      baseLift[i] =
        pathYOffset +
        DUST_MIN_LIFT +
        Math.random() * (DUST_MAX_LIFT - DUST_MIN_LIFT);
      swayAmp[i] = 0.05 + Math.random() * 0.1;
      swaySpeed[i] = 0.2 + Math.random() * 0.4;
      phase[i] = Math.random() * Math.PI * 2;
    }

    // Seed the attribute with the t=0 state (drift distance 0, sway at its
    // initial phase) so the first frame shows a distributed cloud and the
    // per-frame motion stays continuous from the start.
    const positions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i += 1) {
      const i3 = i * 3;
      const liftHeight =
        baseLift[i] + Math.sin(phase[i]) * swayAmp[i];
      positions[i3] = base[i3] + lift[i3] * liftHeight;
      positions[i3 + 1] = base[i3 + 1] + lift[i3 + 1] * liftHeight;
      positions[i3 + 2] = base[i3 + 2] + lift[i3 + 2] * liftHeight;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));

    const material = new PointsMaterial({
      color: getCssColorValue("scene-portal-glow"),
      size: DUST_SIZE,
      sizeAttenuation: true,
      transparent: true,
      opacity: DUST_OPACITY,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    return {
      geometry,
      material,
      base,
      lift,
      drift,
      speed,
      baseLift,
      swayAmp,
      swaySpeed,
      phase,
      wrapHalf,
    };
  }, [gridSize, tileSize, pathYOffset]);

  // Per-level geometry/material: dispose the outgoing ones on level change
  // and on unmount.
  useEffect(
    () => () => {
      if (cloud) {
        cloud.geometry.dispose();
        cloud.material.dispose();
      }
    },
    [cloud]
  );

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points || !cloud) return;

    const scaledDelta = delta * getTimeScale();
    // While the world is stopped (paused, game over) the time scale is 0:
    // skip the per-point walk and the attribute upload entirely.
    if (scaledDelta === 0) return;

    timeRef.current += scaledDelta;
    const t = timeRef.current;
    const { wrapHalf } = cloud;
    const twoHalf = wrapHalf * 2;
    const attr = cloud.geometry.attributes.position as BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < DUST_COUNT; i += 1) {
      const i3 = i * 3;
      // No modulo here: the raw drift distance keeps diagonal motion
      // continuous across wraps — each axis wraps at the field edge below,
      // which is the only place a point may re-enter.
      const s = cloud.speed[i] * t;
      let x = cloud.base[i3] + cloud.drift[i * 2] * s;
      let z = cloud.base[i3 + 2] + cloud.drift[i * 2 + 1] * s;
      // Loop the point back to the near edge once it drifts past the far
      // edge; the field is a box, so each axis wraps independently.
      x = ((x + wrapHalf) % twoHalf + twoHalf) % twoHalf - wrapHalf;
      z = ((z + wrapHalf) % twoHalf + twoHalf) % twoHalf - wrapHalf;
      const liftHeight =
        cloud.baseLift[i] +
        Math.sin(t * cloud.swaySpeed[i] + cloud.phase[i]) * cloud.swayAmp[i];

      arr[i3] = x + cloud.lift[i3] * liftHeight;
      arr[i3 + 1] = cloud.base[i3 + 1] + cloud.lift[i3 + 1] * liftHeight;
      arr[i3 + 2] = z + cloud.lift[i3 + 2] * liftHeight;
    }
    attr.needsUpdate = true;
  });

  if (reducedMotion || !cloud) return null;

  return (
    <points
      name="ambient-dust"
      ref={(el) => {
        pointsRef.current = el;
        // The cloud is purely decorative: never let it intercept the scene's
        // pointer raycasts (a point in front of a tile would otherwise cost a
        // per-pointermove raycast and could shadow tile clicks).
        if (el) el.raycast = () => null;
      }}
      geometry={cloud.geometry}
      material={cloud.material}
      frustumCulled={false}
    />
  );
});

AmbientDust.displayName = "AmbientDust";
