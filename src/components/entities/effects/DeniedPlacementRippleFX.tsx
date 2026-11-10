import { FC, memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  type Group,
} from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import { getCssColorValue } from "../../ui/lib/cssUtils";

const RIPPLE_DURATION = 0.5;
// The plane (and the ring's outer edge) sweeps out to a little over one
// tile: enough room for the ring to carry the X beyond the tile edge without
// touching the neighbouring tiles' hover tints.
const PLANE_RADIUS_FRACTION = 1.3;
// The X is two diagonal strokes spanning this fraction of a tile.
const X_SPAN_FRACTION = 0.5;
// Stroke width as a fraction of the X span.
const X_STROKE_FRACTION = 0.22;
// The X's peak opacity (additive-blended, so ~1 reads as a bright red).
const X_OPACITY = 0.95;
// The ring's peak opacity (a faint ripple of displaced air — the ground
// shows through).
const RING_OPACITY = 0.5;
// The progress window over which the X dissolves after the ring passes it.
const X_FADE_START = 0.3;
const X_FADE_END = 0.9;
// The ring band's width (fraction of the plane radius) and its fade as it
// spreads.
const RING_BAND = 0.12;
const RING_FADE_POWER = 1.5;
// The ripple's start radius (fraction of the plane radius) — it begins at
// the tile centre, not at zero, so the first frame already reads as a ring.
const RING_START_FRACTION = 0.2;
// Reduced motion: the static pose is held this long (simulation time) before
// fading out, so the effect still finishes and unmounts.
const REDUCED_MOTION_HOLD_SEC = 0.8;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A unit disc in local space, oriented to the surface normal by the group.
// One shader draws both layers of the effect from `uProgress` (0 → 1):
// - the ripple: a band whose centre sweeps out from the tile centre (0.2 of
//   the plane radius) to the plane's edge, fading as it expands — the "outward
//   once" propagation;
// - the X: two rounded diagonal strokes (capsules) stamped over the tile,
//   bright at the start and dissolving as the ring sweeps past it.
const FRAGMENT_SHADER = /* glsl */ `
uniform float uProgress;
uniform float uRadius;
uniform float uSpan;
uniform float uStroke;
uniform vec3 uColor;
uniform float uOpacity;

varying vec2 vUv;

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  // Local plane units: [-1, 1] across the plane, i.e. |p| * uRadius in world.
  vec2 p = (vUv - 0.5) * 2.0;

  // Ripple: ease-out sweep out to the edge, fading as it spreads.
  float ease = 1.0 - pow(1.0 - uProgress, 3.0);
  float ringRadius = mix(${RING_START_FRACTION}, 1.0, ease);
  float ringBand = 1.0 - smoothstep(0.0, ${RING_BAND}, abs(length(p) - ringRadius));
  float ringAlpha = ringBand * pow(1.0 - uProgress, ${RING_FADE_POWER}) * ${RING_OPACITY};

  // X: two diagonal capsules in world units, round caps at the stroke ends.
  vec2 w = p * uRadius;
  float a = uSpan * 0.5;
  float d1 = sdSegment(w, vec2(-a, -a), vec2(a, a));
  float d2 = sdSegment(w, vec2(-a, a), vec2(a, -a));
  float xMask = 1.0 - smoothstep(uStroke * 0.4, uStroke * 0.6, min(d1, d2));
  // The X holds while the ring is close, then dissolves as it sweeps past.
  float xFade = 1.0 - smoothstep(${X_FADE_START}, ${X_FADE_END}, uProgress);
  float xAlpha = xMask * xFade * ${X_OPACITY};

  float alpha = max(ringAlpha, xAlpha) * uOpacity;
  if (alpha < 0.003) discard;
  // The X shifts from the scene's red toward a deeper red as it dissolves.
  vec3 color = mix(uColor, uColor * vec3(0.6, 0.15, 0.2), uProgress);
  gl_FragColor = vec4(color, alpha);
}
`;

const getRippleColor = (): string => {
  if (typeof document === "undefined") return "#ef4444";
  // The scene red token; fall back to the hard-coded red when the style has
  // not been applied yet (e.g. tests without a styled document).
  return getCssColorValue("scene-hp-low") || "#ef4444";
};

type DeniedPlacementRippleFXProps = {
  /** World-space point on the planet surface over the blocked tile. */
  position: [number, number, number];
  /** Orientation of the plane (the grid-aligned surface pose of the tile). */
  quaternion: Quaternion;
  /** The tile size in world units (the effect's reference scale). */
  tileSize: number;
  onComplete?: () => void;
};

/**
 * One-shot "why is this blocked" feedback on a denied tower placement: a
 * bright red "X" stamped over the blocked tile, with a ripple band that
 * propagates outward from it once and dissipates. Played alongside the
 * existing camera/HUD denial shake and noise cue.
 *
 * The ring and the X are one additive shader plane (a unit disc, laid on the
 * planet surface over the tile), animated in `useFrame` on the pause-aware
 * simulation clock — the effect freezes with the world on pause. The plane is
 * raycast-disabled and mounted only for the ~0.5 s of the effect, so it costs
 * nothing while idle. Under `prefers-reduced-motion` it holds a static
 * mid-dissolve pose (the X still shows why the tile is blocked, nothing
 * animates), then fades out and finishes like the animated version.
 */
export const DeniedPlacementRippleFX: FC<DeniedPlacementRippleFXProps> = memo(
  ({ position, quaternion, tileSize, onComplete }) => {
    const { getSimulationTime } = useSimulationClock();
    const reducedMotion = useReducedMotion();

    const groupRef = useRef<Group>(null);
    const startTimeRef = useRef<number | null>(null);
    const doneRef = useRef(false);

    const radius = tileSize * PLANE_RADIUS_FRACTION;
    const span = tileSize * X_SPAN_FRACTION;
    const stroke = span * X_STROKE_FRACTION;

    useLayoutEffect(() => {
      groupRef.current?.quaternion.copy(quaternion);
    }, [quaternion]);

    const geometry = useMemo(() => new PlaneGeometry(2 * radius, 2 * radius), [
      radius,
    ]);
    const material = useMemo(() => {
      return new ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uProgress: { value: 0 },
          uRadius: { value: radius },
          uSpan: { value: span },
          uStroke: { value: stroke },
          uColor: { value: new Color(getRippleColor()) },
          uOpacity: { value: 0 },
        },
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      });
    }, [radius, span, stroke]);

    useLayoutEffect(
      () => () => {
        geometry.dispose();
        material.dispose();
      },
      [geometry, material]
    );

    useFrame((state) => {
      if (doneRef.current) return;
      const simTime = getSimulationTime(state.clock.elapsedTime);

      startTimeRef.current ??= simTime;
      const elapsed = simTime - startTimeRef.current;

      if (reducedMotion) {
        // Static mid-dissolve pose: the X shows, nothing animates; it is
        // held, then fades out and the effect finishes like the animated one.
        material.uniforms["uProgress"].value = 0.45;
        if (elapsed < REDUCED_MOTION_HOLD_SEC) {
          material.uniforms["uOpacity"].value = 1;
          return;
        }
        material.uniforms["uOpacity"].value = 0;
        doneRef.current = true;
        onComplete?.();
        return;
      }

      const progress = Math.min(elapsed / RIPPLE_DURATION, 1);

      material.uniforms["uProgress"].value = progress;
      material.uniforms["uOpacity"].value = 1;

      if (progress >= 1) {
        doneRef.current = true;
        material.uniforms["uOpacity"].value = 0;
        onComplete?.();
      }
    });

    return (
      <group ref={groupRef} position={position}>
        <mesh
          geometry={geometry}
          material={material}
          raycast={() => null}
          renderOrder={1}
        />
      </group>
    );
  }
);

DeniedPlacementRippleFX.displayName = "DeniedPlacementRippleFX";
