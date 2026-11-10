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

const X_EFFECT_DURATION = 0.5;
// The plane spans a little over one tile, giving the X room to sit clearly
// over the tile without touching the neighbouring tiles.
const PLANE_RADIUS_FRACTION = 1.3;
// The X is two diagonal strokes spanning this fraction of a tile.
const X_SPAN_FRACTION = 0.5;
// Stroke width as a fraction of the X span.
const X_STROKE_FRACTION = 0.22;
// The X's peak opacity (additive-blended, so ~1 reads as a bright red).
const X_OPACITY = 0.95;
// The X fades in over the first part of the effect and out over the last,
// holding a steady, fully-visible X in between.
const X_FADE_IN_END = 0.15;
const X_FADE_OUT_START = 0.55;
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
// The X is two rounded diagonal strokes (capsules) stamped over the tile —
// the only thing drawn. `uProgress` (0 → 1) fades it in over the first part
// of the effect and out over the last, holding a steady, fully-visible X in
// between.
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

  // X: two diagonal capsules in world units, round caps at the stroke ends.
  vec2 w = p * uRadius;
  float a = uSpan * 0.5;
  float d1 = sdSegment(w, vec2(-a, -a), vec2(a, a));
  float d2 = sdSegment(w, vec2(-a, a), vec2(a, -a));
  float xMask = 1.0 - smoothstep(uStroke * 0.4, uStroke * 0.6, min(d1, d2));

  // Fade in, hold, fade out — the X is fully visible through the middle of
  // the effect (the moment the player reads "this tile is blocked").
  float fadeIn = smoothstep(0.0, ${X_FADE_IN_END}, uProgress);
  float fadeOut = 1.0 - smoothstep(${X_FADE_OUT_START}, 1.0, uProgress);
  float alpha = xMask * min(fadeIn, fadeOut) * ${X_OPACITY} * uOpacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha);
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
 * bright red "X" stamped over the blocked tile, floating high enough to clear
 * whatever occupies it (tower, building, path, or water) so it always reads.
 * Played alongside the existing camera/HUD denial shake and noise cue.
 *
 * The X is one additive shader plane (a unit disc, laid on the planet surface
 * above the tile's top surface), animated in `useFrame` on the pause-aware
 * simulation clock — the effect freezes with the world on pause. The plane is
 * raycast-disabled and mounted only for the ~0.5 s of the effect, so it costs
 * nothing while idle. Under `prefers-reduced-motion` it holds a static pose
 * (the X still shows why the tile is blocked, nothing animates), then fades
 * out and finishes like the animated version.
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

      const progress = Math.min(elapsed / X_EFFECT_DURATION, 1);

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
