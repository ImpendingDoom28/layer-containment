import { FC, memo, useMemo, useRef } from "react";

import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Quaternion,
  type BufferAttribute,
  type Mesh,
} from "three";

import { useReducedMotion } from "../../../core/hooks/useReducedMotion";
import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";

const DEFAULT_POSITION: [number, number, number] = [0, 0, 0];
const TAU = Math.PI * 2;

const stripAlpha = (value: number): number => value - Math.floor(value);

// The band is one quad per segment of the ring circumference, sharing its
// top corners with the neighbouring segments — a single connected surface
// (the "wave") instead of separate stripes. The segment count tracks the
// circumference so the wave's resolution stays roughly constant across ranges,
// clamped to keep the buffer and the per-frame update cheap.
const SEGMENT_ARC = 0.08;
const MIN_SEGMENTS = 128;
const MAX_SEGMENTS = 256;

const getSegmentCount = (range: number): number =>
  Math.min(
    MAX_SEGMENTS,
    Math.max(MIN_SEGMENTS, Math.round((TAU * range) / SEGMENT_ARC))
  );

// The traveling swell: the sum of two counter-rotating sine components (a
// slow 3-crest swell plus a faster 7-crest ripple), sharpened to crest-like
// peaks. Deterministic per range (the phases and the per-range rotation
// scatter vary by range) — no RNG, so every wall of the same range looks
// identical.
const WAVE_BASE = 0.12;
const WAVE_A1 = 0.45;
const WAVE_K1 = 3;
const WAVE_S1 = 1.2;
const WAVE_A2 = 0.18;
const WAVE_K2 = 7;
const WAVE_S2 = 2.1;

const swell = (x: number): number => {
  const s = 0.5 + 0.5 * Math.sin(x);
  return s * s * s; // pointy crests, soft troughs
};

const waveHeight = (
  theta: number,
  t: number,
  phase1: number,
  phase2: number
): number =>
  WAVE_BASE +
  WAVE_A1 * swell(theta * WAVE_K1 - t * WAVE_S1 + phase1) +
  WAVE_A2 * swell(theta * WAVE_K2 + t * WAVE_S2 + phase2);

type SegmentSpec = {
  thetaA: number;
  thetaB: number;
  baseAlpha: number;
};

const buildSegmentSpecs = (range: number): SegmentSpec[] => {
  const count = getSegmentCount(range);
  const delta = TAU / count;
  const rotation = range * 0.35;
  const specs: SegmentSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    specs.push({
      thetaA: rotation + i * delta,
      thetaB: rotation + (i + 1) * delta,
      // A subtle per-segment shimmer in the base band (no two neighbours the
      // same) so the water surface doesn't read as a flat stripe.
      baseAlpha: 0.38 + 0.18 * stripAlpha(i * 0.31416 + range * 0.5719),
    });
  }
  return specs;
};

/**
 * One quad per segment (4 vertices, 2 triangles): the quad stands on the
 * ring line (y = 0 at the local origin, the ring's radius in the XZ plane)
 * and reaches up to the swell height at each edge angle — adjacent segments
 * share their top corner, so the top edge is a continuous wavy line. The
 * per-vertex colour carries white + the band's alpha, fading to 0 at the
 * top. The top vertices start at the t = 0 swell and are animated per frame
 * (the swell travels around the ring, see `useFrame` below); the base
 * vertices never move.
 */
const buildRangeFadeWallGeometry = (
  range: number,
  specs: SegmentSpec[],
  phase1: number,
  phase2: number
): BufferGeometry => {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  specs.forEach((spec, i) => {
    const ca = Math.cos(spec.thetaA);
    const sa = Math.sin(spec.thetaA);
    const cb = Math.cos(spec.thetaB);
    const sb = Math.sin(spec.thetaB);
    const hA = waveHeight(spec.thetaA, 0, phase1, phase2);
    const hB = waveHeight(spec.thetaB, 0, phase1, phase2);
    // 0: base/left, 1: base/right, 2: top/right, 3: top/left.
    positions.push(
      ca * range,
      0,
      sa * range,
      cb * range,
      0,
      sb * range,
      cb * range,
      hB,
      sb * range,
      ca * range,
      hA,
      sa * range
    );
    // RGBA vertex colours: solid white at the base (the water surface at the
    // ring line), fully transparent at the top — the fade to the crest.
    colors.push(
      1,
      1,
      1,
      spec.baseAlpha,
      1,
      1,
      1,
      spec.baseAlpha,
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

type WallEntry = {
  geometry: BufferGeometry;
  segments: SegmentSpec[];
  phase1: number;
  phase2: number;
};

// One entry per distinct range (a handful in practice: the tower ranges plus
// relay-buffed variants) — shared by every wall of that range, so the per-
// frame cost is a single additive draw plus one small buffer update for the
// swell.
const wallCache = new Map<number, WallEntry>();

const getWallEntry = (range: number): WallEntry => {
  const key = Math.round(range * 100) / 100;
  let entry = wallCache.get(key);
  if (!entry) {
    const segments = buildSegmentSpecs(key);
    const phase1 = key * 1.7;
    const phase2 = key * 0.9317 + 2.1;
    entry = {
      segments,
      phase1,
      phase2,
      geometry: buildRangeFadeWallGeometry(key, segments, phase1, phase2),
    };
    wallCache.set(key, entry);
  }
  return entry;
};

// All walls are white, so one shared additive material: the per-vertex alpha
// carries the crest fade, the material stays static (no per-frame writes).
let wallMaterial: MeshBasicMaterial | null = null;
const getWallMaterial = (): MeshBasicMaterial => {
  if (!wallMaterial) {
    wallMaterial = new MeshBasicMaterial({
      color: "#ffffff",
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      side: DoubleSide,
      depthWrite: false,
    });
  }
  return wallMaterial;
};

// A hidden stand-in quad (never drawn) that keeps the wall's material program
// — additive MeshBasicMaterial with 4-component (alpha) vertex colours —
// mounted for the whole session. A wall only appears on a selection or a
// placement, so without this the first tower selection would pay a one-time
// shader-compile stall on its impact frame. The scene's ShaderReadyGate
// (gl.compileAsync walks the full graph, including hidden objects) compiles it
// during the loading screen, so the first selection renders hitch-free (the
// same pattern as DustBurstPrewarm). The quad is tiny; its 4-item colour
// attribute is what selects the alpha-vertex-colour program variant.
let prewarmGeometry: BufferGeometry | null = null;
const getPrewarmGeometry = (): BufferGeometry => {
  if (!prewarmGeometry) {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3)
    );
    geometry.setAttribute(
      "color",
      new Float32BufferAttribute(
        [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0],
        4
      )
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    prewarmGeometry = geometry;
  }
  return prewarmGeometry;
};

/**
 * Keeps the range wall's shader program compiled during the loading screen
 * (see `getPrewarmGeometry`). Mount once per scene, next to the wall.
 */
export const RangeFadeWallPrewarm: FC = () => {
  const geometry = useMemo(() => getPrewarmGeometry(), []);
  const material = useMemo(() => getWallMaterial(), []);
  return (
    <group visible={false}>
      <mesh geometry={geometry} material={material} raycast={() => null} />
    </group>
  );
};

RangeFadeWallPrewarm.displayName = "RangeFadeWallPrewarm";

type RangeFadeWallProps = {
  range: number;
  position?: [number, number, number];
  /** Absolute orientation (placement overlay); takes precedence over rotation. */
  quaternion?: Quaternion;
  /** Local orientation (selected tower, inside an already-oriented group). */
  rotation?: [number, number, number];
};

/**
 * The animated light wall around the range ring: a continuous white band
 * following the ring line, whose top edge is a traveling swell — the sum of
 * two counter-rotating sine components (see the constants above), so the
 * crests read as a connected wave of water around the tower rather than
 * separate stripes. The band fades from a solid white base (at the ring
 * line) to transparent at the crest. The swell moves in `useFrame` on the
 * simulation clock (like the other tower FX): it freezes with the world on
 * pause and is frozen to a still crest under `prefers-reduced-motion`.
 * Shared by the selected tower's range indicator and the placement preview.
 */
export const RangeFadeWall: FC<RangeFadeWallProps> = memo(
  ({ range, position = DEFAULT_POSITION, quaternion, rotation }) => {
    const reducedMotion = useReducedMotion();
    const { getSimulationTime } = useSimulationClock();
    const entry = useMemo(() => getWallEntry(range), [range]);
    const meshRef = useRef<Mesh>(null);

    // The swell mutates the shared geometry's top-vertex Y in place (a few
    // hundred floats per frame — no React state, no allocations). Two walls
    // of the same range share the buffer and both write the same values.
    useFrame((state) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const positions = entry.geometry.getAttribute(
        "position"
      ) as BufferAttribute;
      const { segments, phase1, phase2 } = entry;
      const t = reducedMotion ? 0 : getSimulationTime(state.clock.elapsedTime);
      for (let i = 0; i < segments.length; i += 1) {
        positions.setY(
          i * 4 + 2,
          waveHeight(segments[i].thetaB, t, phase1, phase2)
        );
        positions.setY(
          i * 4 + 3,
          waveHeight(segments[i].thetaA, t, phase1, phase2)
        );
      }
      positions.needsUpdate = true;
    });

    return (
      <group
        position={position}
        quaternion={quaternion}
        rotation={quaternion ? undefined : rotation}
      >
        <mesh
          ref={meshRef}
          geometry={entry.geometry}
          material={getWallMaterial()}
          raycast={() => null}
        />
      </group>
    );
  }
);

RangeFadeWall.displayName = "RangeFadeWall";
