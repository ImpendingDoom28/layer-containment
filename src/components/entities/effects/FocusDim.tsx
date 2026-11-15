import { FC, useEffect, useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector3,
} from "three";

import { getEffectiveTowerCombatStats } from "../../../core/relayBuffs";
import {
  selectedTowerSelector,
  tileSizeSelector,
  towerTypesSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import {
  gridSizeSelector,
  towersSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "../../../utils/planetSurfaceMapping";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";

// A single fullscreen triangle (in clip space) that covers the whole viewport.
// Its vertex shader writes clip positions directly, so the camera's transform
// is irrelevant — it always fills the screen.
const FULLSCREEN_TRIANGLE_POSITIONS = [-1, -1, 0, 3, -1, 0, -1, 3, 0] as const;

// How dark the out-of-range area gets (0 = none, 1 = fully black). Kept low so
// the board is "gently" dimmed, not blacked out — the eye is pulled to the
// selection without losing the rest of the field.
const DIM_STRENGTH = 0.35;
// Exponential fade rate (1/s) for the dim in/out.
const FADE_RATE = 8;
const FADE_EPSILON = 0.002;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    // The attribute is already a clip-space position, so its xy is the NDC xy
    // (w = 1). The fragment shader uses that to reconstruct the camera ray.
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Reconstructs the world-space ray through the fragment and tests it against
// the selected tower's range circle (a flat disc on the surface tangent plane:
// center + normal + radius). Fragments whose ray leaves the disc are dimmed
// with a soft edge straddling the disc boundary; the rest stay untouched.
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vNdc;

  uniform mat4 uInvProjection;
  uniform mat4 uViewToWorld;
  uniform vec3 uCenter;
  uniform vec3 uNormal;
  uniform float uRadius;
  uniform float uSoftness;
  uniform float uStrength;
  uniform float uFade;

  void main() {
    if (uFade <= 0.001) {
      discard;
    }

    // Direction of the camera ray through this fragment (world space).
    vec4 viewNear = uInvProjection * vec4(vNdc.x, vNdc.y, -1.0, 1.0);
    vec4 viewFar = uInvProjection * vec4(vNdc.x, vNdc.y, 1.0, 1.0);
    vec3 dirView = viewFar.xyz / viewFar.w - viewNear.xyz / viewNear.w;
    vec3 dir = normalize((uViewToWorld * vec4(dirView, 0.0)).xyz);

    // Intersect the ray with the disc's plane.
    float denom = dot(dir, uNormal);
    float alpha;
    if (abs(denom) > 1e-6) {
      float t = dot(uCenter - cameraPosition, uNormal) / denom;
      if (t > 0.0) {
        vec3 hit = cameraPosition + dir * t;
        float d = distance(hit, uCenter);
        // Soft edge centred on the disc boundary (radius): 1 well inside,
        // 0 well outside, smoothed across the softness band.
        float e = clamp((uRadius - d) / max(uSoftness, 1e-6) + 0.5, 0.0, 1.0);
        float mask = e * e * (3.0 - 2.0 * e);
        alpha = uStrength * (1.0 - mask) * uFade;
      } else {
        // Plane behind the camera (looking away from the field): out of range.
        alpha = uStrength * uFade;
      }
    } else {
      // Ray parallel to the disc plane: out of range.
      alpha = uStrength * uFade;
    }

    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`;

/**
 * Focus dim for the selected tower.
 *
 * When a placed tower is selected (the tower info panel), everything outside
 * that tower's range is gently darkened by a fullscreen overlay, so the eye is
 * pulled to the selection instead of scanning the whole board. The mask is the
 * tower's *real* range circle (center + surface tangent normal + effective
 * range, i.e. the same disc the range ring draws), tested per fragment against
 * the camera ray — so it tracks the range ring exactly and stays correct at
 * any camera tilt.
 *
 * Purely view-side: it reads `selectedTower` from the game store, animates a
 * fade in `useFrame` (freezing-free — it is not tied to the simulation clock),
 * and does not touch the simulation. It is skipped under `prefers-reduced-motion`
 * (the dim snaps on/off instead of fading).
 */
export const FocusDim: FC = () => {
  const selectedTower = useGameStore(selectedTowerSelector);
  const towerTypes = useGameStore(towerTypesSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const towers = useLevelStore(towersSelector);
  const reducedMotion = useReducedMotion();

  const meshRef = useRef<Mesh>(null);
  const fadeRef = useRef(0);

  // Created once; the shader's per-frame uniforms (matrices, fade) are mutated
  // in `useFrame`, and the disc uniforms are re-set when the selection changes.
  const { geometry, material } = useMemo(() => {
    const geo = new BufferGeometry();
    geo.setAttribute(
      "position",
      new Float32BufferAttribute(FULLSCREEN_TRIANGLE_POSITIONS, 3)
    );
    const mat = new ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvProjection: { value: new Matrix4() },
        uViewToWorld: { value: new Matrix4() },
        uCenter: { value: new Vector3() },
        uNormal: { value: new Vector3(0, 1, 0) },
        uRadius: { value: 0 },
        uSoftness: { value: 0.5 },
        uStrength: { value: DIM_STRENGTH },
        uFade: { value: 0 },
      },
    });
    return { geometry: geo, material: mat };
  }, []);

  // Dispose the imperative geometry/material on unmount (R3F only auto-disposes
  // JSX-declared objects).
  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  // Re-set the disc (center / normal / radius) when the selected tower — or the
  // level geometry / relay buffs that shape its effective range — changes.
  useEffect(() => {
    if (!selectedTower || !gridSize || !tileSize) return;
    const radius = getPlanetRadius(gridSize, tileSize);
    const { surfacePoint, normal } = flatFieldToSphereSurface(
      selectedTower.x,
      selectedTower.z,
      radius
    );
    const effectiveRange = getEffectiveTowerCombatStats(
      selectedTower,
      towers,
      towerTypes ?? {}
    ).range;
    const uniforms = material.uniforms;
    (uniforms["uCenter"].value as Vector3).copy(surfacePoint);
    (uniforms["uNormal"].value as Vector3).copy(normal);
    uniforms["uRadius"].value = effectiveRange;
    uniforms["uSoftness"].value = Math.max(0.3, effectiveRange * 0.15);
  }, [selectedTower, towers, towerTypes, gridSize, tileSize, material]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const uniforms = material.uniforms;

    // Drive the fade toward "selected ? 1 : 0" on the render clock (the dim is
    // view feedback, not simulation, so it animates even while paused).
    const hasSelection = useGameStore.getState().selectedTower != null;
    const target = hasSelection ? 1 : 0;
    let fade = fadeRef.current;
    if (reducedMotion) {
      fade = target;
    } else {
      const dt = Math.min(delta, 0.05);
      fade += (target - fade) * (1 - Math.exp(-FADE_RATE * dt));
      if (Math.abs(target - fade) < FADE_EPSILON) fade = target;
    }
    fadeRef.current = fade;

    // Keep the per-frame camera matrices fresh so the ray test tracks a moving
    // camera exactly.
    const camera = state.camera;
    (uniforms["uInvProjection"].value as Matrix4)
      .copy(camera.projectionMatrix)
      .invert();
    (uniforms["uViewToWorld"].value as Matrix4).copy(camera.matrixWorld);

    uniforms["uFade"].value = fade;
    // Skip the fullscreen draw entirely once the dim has faded out.
    mesh.visible = fade > 0.001;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={999}
      raycast={() => null}
    />
  );
};

FocusDim.displayName = "FocusDim";
