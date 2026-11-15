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

// Golden angle (radians): spreading the spikes by it (phyllotaxis) gives the
// "random" scatter without an RNG — deterministic per range, no two adjacent
// spikes share a bearing, and every mount of the same range looks identical.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const stripAlpha = (value: number): number => value - Math.floor(value);

type StripSpec = {
  theta: number;
  halfWidth: number;
  height: number;
  opacity: number;
  /** Per-spike phase (radians) so the traveling wave never reads as uniform. */
  phase: number;
};

// The spike count tracks the range so a bigger ring reads as a denser crest
// line (a 3-unit ring is a sparse few spikes, a 5-unit BRL ring a fuller
// wave), clamped so it stays cheap.
const getStripCount = (range: number): number =>
  Math.max(12, Math.min(24, Math.round(range * 4)));

const buildStripSpecs = (range: number): StripSpec[] => {
  const count = getStripCount(range);
  const specs: StripSpec[] = [];
  for (let i = 0; i < count; i += 1) {
    specs.push({
      // The per-range offset scatters the pattern differently per tower type.
      theta: (i * GOLDEN_ANGLE + range * 1.7) % (Math.PI * 2),
      // The base width matches the ring's band (range * 0.005 — the ring's
      // 1.5% inner-radius fraction) so each spike reads as the stripe itself
      // growing into a crest.
      halfWidth: (range * 0.005) / 2,
      // A short crest line (0.18–0.75 units), like the lip of a breaking
      // wave rather than a tall curtain.
      height: 0.18 + 0.57 * stripAlpha(i * 0.75471 + range * 0.2113),
      opacity: 0.3 + 0.45 * stripAlpha(i * 0.42701 + range * 0.5719),
      phase: Math.PI * 2 * stripAlpha(i * 0.31416 + range * 0.9317),
    });
  }
  return specs;
};

/**
 * One quad per spike (4 vertices, 2 triangles): a thin vertical ribbon
 * standing on the ring line (y = 0 at the local origin, radius in the XZ
 * plane). The per-vertex colour carries white + the spike's alpha, fading to
 * 0 at the top. The top vertices start at the spike's max height and are
 * animated per frame (a traveling wave around the ring — the crest swells and
 * recedes like water, see `useFrame` below); the base vertices never move.
 */
const buildRangeFadeWallGeometry = (
  range: number,
  specs: StripSpec[]
): BufferGeometry => {
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
    // RGBA vertex colours: solid white at the base (the main stripe),
    // fully transparent at the top — the fade from the stripe to the crest.
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

type WallEntry = {
  geometry: BufferGeometry;
  specs: StripSpec[];
};

// One entry per distinct range (a handful in practice: the tower ranges plus
// relay-buffed variants) — shared by every wall of that range, so the
// per-frame cost is a single additive draw (plus one tiny buffer update for
// the wave).
const wallCache = new Map<number, WallEntry>();

const getWallEntry = (range: number): WallEntry => {
  const key = Math.round(range * 100) / 100;
  let entry = wallCache.get(key);
  if (!entry) {
    const specs = buildStripSpecs(key);
    entry = { specs, geometry: buildRangeFadeWallGeometry(key, specs) };
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

// The traveling crest: how fast the swell moves around the ring (radians of
// phase per second of render time) and the phase step between adjacent spikes
// (together they make the crest travel the ring in a few seconds).
const WAVE_SPEED = 1.4;
const WAVE_SPACING = 0.27;
// How low a crest dips at the trough (fraction of the spike's max height) —
// the spikes never fully flatten, so the wave keeps a visible lip.
const MIN_HEIGHT_FACTOR = 0.45;
// The resting height under `prefers-reduced-motion` (a still, gently raised
// crest instead of the traveling swell).
const STATIC_HEIGHT_FACTOR = 0.72;

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
 * The animated light wall around the range ring: thin white spikes rising
 * from the ring line and fading to transparent at their tops, at scattered
 * bearings (deterministic per range — see the golden-angle spread above). The
 * spikes swell and recede on a traveling wave so the wall reads as a wave of
 * water crested around the ring — the crest line flows around the ring, each
 * spike phased against its neighbours. The wave is driven by the simulation
 * clock (like the other tower FX), so the crest freezes with the world on
 * pause (easing in/out with the pause dilation); it is frozen to a still
 * crest under `prefers-reduced-motion`.
 * Shared by the selected tower's range indicator and the placement preview.
 */
export const RangeFadeWall: FC<RangeFadeWallProps> = memo(
  ({ range, position = DEFAULT_POSITION, quaternion, rotation }) => {
    const reducedMotion = useReducedMotion();
    const { getSimulationTime } = useSimulationClock();
    const entry = useMemo(() => getWallEntry(range), [range]);
    const meshRef = useRef<Mesh>(null);

    // The wave mutates the shared geometry's top-vertex Y in place (a ~few
    // dozen floats per frame — no React state, no allocations). Two walls of
    // the same range share the buffer and both write the same values.
    useFrame((state) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const positions = entry.geometry.getAttribute(
        "position"
      ) as BufferAttribute;
      const { specs } = entry;
      if (reducedMotion) {
        for (let i = 0; i < specs.length; i += 1) {
          const y = specs[i].height * STATIC_HEIGHT_FACTOR;
          positions.setY(i * 4 + 2, y);
          positions.setY(i * 4 + 3, y);
        }
        positions.needsUpdate = true;
        return;
      }
      // Driven by the simulation clock, so the crest freezes with the world
      // on pause (like the other tower FX).
      const t = getSimulationTime(state.clock.elapsedTime) * WAVE_SPEED;
      for (let i = 0; i < specs.length; i += 1) {
        const swell =
          0.5 - 0.5 * Math.cos(t - i * WAVE_SPACING + specs[i].phase);
        const y =
          specs[i].height *
          (MIN_HEIGHT_FACTOR + (1 - MIN_HEIGHT_FACTOR) * swell);
        positions.setY(i * 4 + 2, y);
        positions.setY(i * 4 + 3, y);
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
