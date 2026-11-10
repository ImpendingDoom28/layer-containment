/**
 * React Three Fiber Hook for Instanced Projectile Rendering
 *
 * Manages projectile rendering using drei's <Instances>/<Instance> for
 * declarative instancing (single draw call per geometry type).
 *
 * Integrates with the game's Projectile type and existing systems.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactElement } from "react";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  InstancedPoolStats,
  type InstancedPoolRef,
} from "../../utils/InstancedPool";
import { patchEmissiveByInstanceColor } from "../../utils/instancedEmissivePatch";
import { patchInstancedTrailFade } from "../../utils/instancedTrailFadePatch";
import { getCssColorValue } from "../../components/ui/lib/cssUtils";
import type { ChainAdditionalHit } from "../chainLightning";
import type { Projectile, Enemy } from "../types/game";
import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import {
  flatCombatPointToWorldPosition,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import { useEntityIds } from "../contexts/EntityIdContext";
import { useInstancedEntity } from "./useInstancedEntity";
import { useReducedMotion } from "./useReducedMotion";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import type { SimulationFrame } from "../session/types";
import { world } from "../ecs/world";
import { refreshEnemyRegistry } from "../ecs/selectors/enemySnapshots";

// The arc-lightning channel: a jagged, branching lightning leader (like a
// real bolt) drawn as a fat line — a bright core plus a wide additive glow —
// that stretches from the muzzle (or, on a chain hop, the previously struck
// enemy) to the bolt's head. The channel's jitter is re-rolled every
// simulation frame, so the lightning crackles and re-jumps as it creeps, and
// each chain hop re-anchors the tail on the struck enemy, reading as a jump.
const ARC_MAIN_SEGMENTS = 18;
const ARC_BRANCH_COUNT = 4;
const ARC_BRANCH_SEGMENTS = 4;
const ARC_TOTAL_SEGMENTS =
  ARC_MAIN_SEGMENTS + ARC_BRANCH_COUNT * ARC_BRANCH_SEGMENTS;
// The fixed arc pool is sized for a heavy chain volley: each in-flight bolt
// holds one arc, and the fire rate (2s) keeps the concurrent count well under
// this even when several chain towers volley together.
const CHAIN_ARC_POOL_SIZE = 8;
// The carried light rides a small lead ahead of the bolt head along the travel
// direction (the glow leads the strike point and washes over the enemy the
// arc is about to hit).
const CHAIN_LIGHT_HEAD_LEAD = 0.25;
// The chain bolt's slow drift ("arc lightning"): the bolt chases a point that
// lags the enemy by this many world units along its own travel direction, so
// it creeps after its target instead of zipping to it in an instant. The
// existing hit threshold (plus this lag) keeps the strike distance sane: the
// bolt never sits more than the lag away from a living target.
const CHAIN_LAG = 0.4;
// The small light the bolt carries with it: it rides the bolt's head and
// projects the tower's color onto nearby enemies (a real PointLight that
// washes over the models it passes). The falloff is tuned so the glow reaches
// roughly 1.5 world units from the bolt.
const CHAIN_LIGHT_INTENSITY = 1.6;
const CHAIN_LIGHT_DISTANCE = 3.2;
const CHAIN_LIGHT_DECAY = 2;
// The carried light's rest pose: a small offset ahead of the bolt head along
// the travel direction (so the glow leads the strike point and washes over
// the enemy the bolt is about to hit), plus a fixed lift off the ground.
const CHAIN_LIGHT_Y_OFFSET = 0.08;
// A fixed, small pool of the carried lights: the concurrent count of chain
// bolts is well below this (fire rate 2s, ~0.5s flight), and keeping the pool
// a constant size in the scene (idle lights at zero intensity, moved off-board)
// means the scene's light count — and therefore the compiled shader programs —
// never change when the first bolt fires or the last one lands. The size is
// deliberately small because every *mounted* PointLight (even an idle one at
// zero intensity) adds to every material's per-fragment light cost; a larger
// pool noticeably slows software-rendered (SwiftShader) CI e2e. A full pool
// degrades gracefully to an unlit bolt.
const CHAIN_LIGHT_POOL_SIZE = 2;

/**
 * The BRL rocket: a short body with a conical nose and two small fins, built
 * once from primitives so every rocket in flight shares a single geometry
 * (and material). The model is authored along the local +Y axis with its base
 * at the origin, so pointing +Y at the velocity orients the nose along the
 * flight path. One instance matrix carries position, the velocity-aligned
 * rotation, and a uniform length scale, so the pool's `setTransform` drives it
 * with the same call a sphere uses.
 */
const ROCKET_BODY_RADIUS = 0.05;
const ROCKET_BODY_LENGTH = 0.18;
const ROCKET_NOSE_LENGTH = 0.12;
const ROCKET_FIN_LENGTH = 0.1;
const ROCKET_FIN_THICKNESS = 0.012;
const ROCKET_EMISSIVE_INTENSITY = 2;
const ROCKET_REFERENCE_SPEED = 10;

const buildRocketGeometry = (): THREE.BufferGeometry => {
  const body = new THREE.CylinderGeometry(
    ROCKET_BODY_RADIUS,
    ROCKET_BODY_RADIUS,
    ROCKET_BODY_LENGTH,
    8
  );
  body.translate(0, ROCKET_BODY_LENGTH * 0.5, 0);
  const nose = new THREE.ConeGeometry(
    ROCKET_BODY_RADIUS,
    ROCKET_NOSE_LENGTH,
    8
  );
  nose.translate(0, ROCKET_BODY_LENGTH + ROCKET_NOSE_LENGTH * 0.5, 0);
  const finLeft = new THREE.BoxGeometry(
    ROCKET_FIN_THICKNESS,
    ROCKET_FIN_LENGTH,
    ROCKET_BODY_RADIUS * 1.4
  );
  finLeft.translate(-ROCKET_BODY_RADIUS - ROCKET_FIN_THICKNESS * 0.5, ROCKET_BODY_LENGTH * 0.5, 0);
  const finRight = finLeft.clone().translate(ROCKET_BODY_RADIUS + ROCKET_FIN_THICKNESS, 0, 0);
  const merged = mergeGeometries([body, nose, finLeft, finRight], false);
  if (!merged) throw new Error("Failed to merge rocket geometry");
  return merged;
};

/**
 * Trails for the travelling single/AoE spheres: a short fading streak behind
 * each in-flight projectile makes shots read faster and fills the field with
 * motion. One pooled instanced slot per projectile (a stretched, motion-
 * oriented sphere) carries it — the per-instance color tints the streak with
 * the tower color and `patchInstancedTrailFade` fades it from the head to a
 * transparent tail along the travel direction.
 */
const TRAIL_LENGTH_FACTOR = 0.22;
const TRAIL_MAX_LENGTH = 0.8;
const TRAIL_MIN_LENGTH = 0.08;
const TRAIL_WIDTH_FACTOR = 0.4;
const TRAIL_MIN_WIDTH = 0.05;
const TRAIL_EMISSIVE_INTENSITY = 1.4;

const tempDirection = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempUpVector = new THREE.Vector3(0, 1, 0);
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();
const scratchTargetWorld = new THREE.Vector3();
const scratchStruckWorld = new THREE.Vector3();
const scratchNextWorld = new THREE.Vector3();
const trailScratchPosition = new THREE.Vector3();

type VisualPoolKind = "sphere" | "beam" | "bolt" | "rocket";

const resolveVisualPool = (
  projectileType: Projectile["projectileType"]
): VisualPoolKind => {
  if (projectileType === "beam") return "beam";
  if (projectileType === "chain") return "bolt";
  if (projectileType === "rocket") return "rocket";
  return "sphere";
};

/**
 * A fixed pool of the small lights the chain bolts carry (real
 * `THREE.PointLight`s — drei's `<Instances>` can only instance meshes, so the
 * light is a real light object that is created once, moved per frame, and
 * toggled on/off rather than mounted/unmounted). Keeping the pool a constant
 * size in the scene (idle lights at zero intensity, parked off-board) means
 * the scene's light count — and therefore the compiled shader programs —
 * never change when the first bolt fires or the last one lands: no shader
 * recompile hitch. The lights are rendered by the hook's returned element via
 * `<primitive>`, so they live in the same scene as the game.
 */
export type ChainLightPool = {
  /** The pool's light objects (rendered into the scene by the hook). */
  lights: THREE.PointLight[];
  /** Grab a free light, tinted with the bolt's color; returns its index or -1 when the pool is full (the bolt then flies unlit). */
  acquire: (color: string) => number;
  /** Park a light off-board at zero intensity and return it to the pool. */
  release: (index: number) => void;
  /** Park every in-use light (a run ended mid-flight) and return them to the pool. */
  releaseAll: () => void;
  /** Move an in-use light to the bolt head plus a small lead offset. */
  setLightPose: (
    index: number,
    x: number,
    y: number,
    z: number,
    direction: THREE.Vector3
  ) => void;
};

const createChainLightPool = (size: number): ChainLightPool => {
  const lights: THREE.PointLight[] = [];
  const free: number[] = [];
  const used = new Set<number>();

  for (let i = 0; i < size; i++) {
    const light = new THREE.PointLight(
      new THREE.Color("#ffffff"),
      CHAIN_LIGHT_INTENSITY,
      CHAIN_LIGHT_DISTANCE,
      CHAIN_LIGHT_DECAY
    );
    light.intensity = 0;
    light.position.set(0, -10000, 0);
    lights.push(light);
    free.push(i);
  }

  const park = (index: number): void => {
    const light = lights[index];
    light.intensity = 0;
    light.position.set(0, -10000, 0);
  };

  return {
    lights,
    acquire: (color) => {
      const index = free.pop();
      if (index === undefined) return -1;
      used.add(index);
      lights[index].color.set(color);
      lights[index].intensity = CHAIN_LIGHT_INTENSITY;
      return index;
    },
    release: (index) => {
      if (!used.has(index)) return;
      used.delete(index);
      park(index);
      free.push(index);
    },
    releaseAll: () => {
      for (const index of used) {
        used.delete(index);
        park(index);
        free.push(index);
      }
    },
    setLightPose: (index, x, y, z, direction) => {
      const light = lights[index];
      if (!light || !used.has(index)) return;
      const lead = CHAIN_LIGHT_HEAD_LEAD;
      light.position.set(
        x + direction.x * lead,
        y + direction.y * lead + CHAIN_LIGHT_Y_OFFSET,
        z + direction.z * lead
      );
    },
  };
};

// One segment of the arc channel: a pair of endpoints in interleaved form —
// the exact layout LineSegmentsGeometry stores — so the per-frame update can
// write straight into the geometry's instance buffers without reallocation.
type ChainArcSegment = {
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
};

type ChainArcPoolItem = {
  root: THREE.Object3D;
  core: ChainArcSegment[];
  glow: ChainArcSegment[];
  color: THREE.Color;
  /** True on the frame after a tail re-anchor, so the arc flicks wide once. */
  hopFlash: number;
  /** The arc channel's tail: the muzzle, or the enemy struck on the last hop. */
  sourceX: number;
  sourceY: number;
  sourceZ: number;
  /** The arc channel's head: the bolt's live world position. */
  headX: number;
  headY: number;
  headZ: number;
};

/**
 * A fixed pool of the jagged lightning arcs the chain bolts ride. Each arc is
 * a pair of fat `LineSegments2` passes (a bright core plus a wide additive
 * glow) whose segment endpoints are re-rolled every simulation frame, so the
 * channel crackles like a live bolt. The tail re-anchors to the previously
 * struck enemy on every chain hop — the arc visibly re-jumps from one enemy
 * to the next. A constant-size pool (idle arcs parked off-board at zero
 * scale) keeps the scene's object and shader-program count stable.
 */
type ChainArcPool = {
  items: ChainArcPoolItem[];
  coreGeometries: LineSegmentsGeometry[];
  glowGeometries: LineSegmentsGeometry[];
  free: number[];
  used: Set<number>;
  acquire: (color: string) => number;
  release: (index: number) => void;
  releaseAll: () => void;
};

const ARC_CORE_WIDTH = 0.055;
const ARC_GLOW_WIDTH = 0.18;
const ARC_CORE_OPACITY = 0.95;
const ARC_GLOW_OPACITY = 0.26;
// How often (in sim frames) the channel's jitter is re-rolled: high enough to
// read as live crackle, low enough that it is not pure noise at 60 fps.
const ARC_FLICKER_HZ = 24;
// The main channel's wobble amplitude (world units) around its straight
// centerline, scaled down toward the channel's ends.
const ARC_WOBBLE = 0.16;
const ARC_TAIL_LIFT = 0.04;
const ARC_BRANCH_STEP_MIN = 0.1;
const ARC_BRANCH_STEP_MAX = 0.24;
const ARC_BRANCH_UPLIFT = 0.3;
const ARC_HOP_FLASH_FRAMES = 6;

const createChainArcPool = (
  size: number,
  defaultColor: string
): ChainArcPool => {
  const emptyGeometry = (segments: number): LineSegmentsGeometry => {
    // `setPositions`/`setColors` wrap a passed Float32Array without copying,
    // so the two must be distinct arrays — otherwise the position and color
    // buffers are the same memory and every color write clobbers the
    // endpoints (the whole arc collapses to a point near the origin).
    const positions = new Float32Array(segments * 6);
    const colors = new Float32Array(segments * 6);
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.setColors(colors);
    // The arcs wander everywhere on the board, so keep them out of the
    // frustum culling entirely.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-1e5, -1e5, -1e5),
      new THREE.Vector3(1e5, 1e5, 1e5)
    );
    return geometry;
  };

  const coreMaterial = new LineMaterial({
    color: defaultColor,
    linewidth: ARC_CORE_WIDTH,
    worldUnits: true,
    transparent: true,
    opacity: ARC_CORE_OPACITY,
    vertexColors: true,
    depthWrite: false,
    toneMapped: false,
  });
  const glowMaterial = new LineMaterial({
    color: defaultColor,
    linewidth: ARC_GLOW_WIDTH,
    worldUnits: true,
    transparent: true,
    opacity: ARC_GLOW_OPACITY,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  // LineMaterial samples the world space, so no resolution uniform is needed.
  // (worldUnits: true is the default; set explicitly for clarity.)
  // Each arc owns its own core + glow geometry (a pair of small
  // instanced-interleaved buffers). They cannot be shared: `LineSegments2`
  // draws every instance of a geometry, so a shared geometry would render all
  // arcs as the same 34 segments (whichever was written last) and a fresh,
  // still-zero-length arc would collapse the whole shared line to nothing —
  // while the independent `PointLight` kept following. Per-arc geometries also
  // carry each arc's own per-vertex color.
  const coreGeometries: LineSegmentsGeometry[] = [];
  const glowGeometries: LineSegmentsGeometry[] = [];

  const items: ChainArcPoolItem[] = [];
  for (let i = 0; i < size; i += 1) {
    const coreGeometry = emptyGeometry(ARC_TOTAL_SEGMENTS);
    const glowGeometry = emptyGeometry(ARC_TOTAL_SEGMENTS);
    coreGeometries.push(coreGeometry);
    glowGeometries.push(glowGeometry);
    const root = new THREE.Object3D();
    root.position.set(0, -10000, 0);
    root.scale.set(0, 0, 0);
    const core = new LineSegments2(coreGeometry, coreMaterial);
    core.frustumCulled = false;
    core.renderOrder = 5;
    const glow = new LineSegments2(glowGeometry, glowMaterial);
    glow.frustumCulled = false;
    glow.renderOrder = 5;
    root.add(core, glow);
    items.push({
      root,
      core: Array.from({ length: ARC_TOTAL_SEGMENTS }, () => ({
        x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0,
      })),
      glow: Array.from({ length: ARC_TOTAL_SEGMENTS }, () => ({
        x1: 0, y1: 0, z1: 0, x2: 0, y2: 0, z2: 0,
      })),
      color: new THREE.Color(defaultColor),
      hopFlash: 0,
      sourceX: 0, sourceY: 0, sourceZ: 0,
      headX: 0, headY: 0, headZ: 0,
    });
  }

  const free: number[] = items.map((_, index) => index);
  const used = new Set<number>();

  // `visible = false` fully skips the object in the render pass (no draw
  // call), which scale-0 alone would not — so idle arcs cost nothing even
  // though the pool is always mounted (it also renders on the main menu,
  // which mounts the projectile scene).
  const hideItem = (index: number): void => {
    const item = items[index];
    item.root.visible = false;
    item.root.position.set(0, -10000, 0);
    item.root.scale.set(0, 0, 0);
  };

  return {
    items,
    coreGeometries,
    glowGeometries,
    free,
    used,
    acquire: (color) => {
      const index = free.pop();
      if (index === undefined) return -1;
      used.add(index);
      const item = items[index];
      item.color.set(color);
      item.hopFlash = 0;
      item.root.visible = true;
      item.root.position.set(0, 0, 0);
      item.root.scale.set(1, 1, 1);
      return index;
    },
    release: (index) => {
      if (!used.has(index)) return;
      used.delete(index);
      free.push(index);
      hideItem(index);
    },
    releaseAll: () => {
      for (const index of Array.from(used)) {
        used.delete(index);
        free.push(index);
        hideItem(index);
      }
    },
  };
};

/**
 * Re-rolls the arc's endpoints: the channel runs from `source` (the muzzle,
 * or the enemy struck on the last hop) to `head` (the bolt's head), with a
 * per-frame jitter that makes the lightning crackle. Side branches peel off
 * random main-channel vertices and wander outward a short way — the "tree"
 * silhouette of a real bolt. Both the core and the glow pass receive the same
 * endpoints (the glow is drawn wider and dimmer). The frame index drives a
 * deterministic pseudo-random sequence so every segment shares one wobble
 * state per re-roll.
 */
const writeArcSegments = (
  item: ChainArcPoolItem,
  time: number
): void => {
  const { sourceX, sourceY, sourceZ, headX, headY, headZ } = item;
  const dx = headX - sourceX;
  const dy = headY - sourceY;
  const dz = headZ - sourceZ;
  const length = Math.hypot(dx, dy, dz) || 1;
  const dirX = dx / length;
  const dirY = dy / length;
  const dirZ = dz / length;

  // Two orthonormal vectors perpendicular to the travel direction for the
  // wobble: the cross product with the up axis (a horizontal perpendicular)
  // and its cross with the travel direction, falling back to a fixed axis
  // when the channel runs vertically.
  let px = -dirZ;
  let py = 0;
  let pz = dirX;
  const pLen = Math.hypot(px, py, pz);
  if (pLen > 1e-6) {
    px /= pLen; py /= pLen; pz /= pLen;
  } else {
    px = 1; py = 0; pz = 0;
  }
  const qx = dirY * pz - dirZ * py;
  const qy = dirZ * px - dirX * pz;
  const qz = dirX * py - dirY * px;

  let seed = (Math.floor(time * ARC_FLICKER_HZ) * 2654435761) >>> 0;
  if (seed === 0) seed = 0x9e3779b9;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  // A hop right after the tail re-anchored: flick the wobble wide once so the
  // jump reads as a snap of the arc, then let it settle back to normal.
  const flash = item.hopFlash > 0 ? 1 + 0.6 * (item.hopFlash / ARC_HOP_FLASH_FRAMES) : 1;
  if (item.hopFlash > 0) item.hopFlash -= 1;

  const vertexCount = ARC_MAIN_SEGMENTS + 1;
  const vx = new Array<number>(vertexCount);
  const vy = new Array<number>(vertexCount);
  const vz = new Array<number>(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    const t = i / ARC_MAIN_SEGMENTS;
    // The wobble tapers to zero at both ends, so the channel stays anchored
    // to its source and head no matter how it crackles.
    const taper = Math.sin(t * Math.PI);
    const wobble = ARC_WOBBLE * taper * flash;
    const ox = (rand() - 0.5) * 2 * wobble;
    const oy = (rand() - 0.5) * 2 * wobble * 0.45;
    const oz = (rand() - 0.5) * 2 * wobble;
    vx[i] = sourceX + dx * t + px * ox + qx * oz;
    vy[i] = sourceY + dy * t + py * oy + qy * oz + (i === 0 ? ARC_TAIL_LIFT : 0);
    vz[i] = sourceZ + dz * t + pz * ox + qz * oz;
  }
  // The head is snapped exactly onto the bolt head so the strike point is
  // always the channel's tip.
  vx[vertexCount - 1] = headX;
  vy[vertexCount - 1] = headY;
  vz[vertexCount - 1] = headZ;

  for (let i = 0; i < ARC_MAIN_SEGMENTS; i += 1) {
    const seg = item.core[i];
    seg.x1 = vx[i]; seg.y1 = vy[i]; seg.z1 = vz[i];
    seg.x2 = vx[i + 1]; seg.y2 = vy[i + 1]; seg.z2 = vz[i + 1];
    const g = item.glow[i];
    g.x1 = seg.x1; g.y1 = seg.y1; g.z1 = seg.z1;
    g.x2 = seg.x2; g.y2 = seg.y2; g.z2 = seg.z2;
  }

  // Side branches: peel off random main vertices and step outward along a
  // mostly-perpendicular (and slightly upward) direction that re-jitters per
  // frame, so the little forks flicker like real lightning.
  const branchStart = ARC_MAIN_SEGMENTS;
  for (let b = 0; b < ARC_BRANCH_COUNT; b += 1) {
    const base = 1 + Math.floor(rand() * (ARC_MAIN_SEGMENTS - 1));
    let bdx =
      px * (rand() - 0.5) * 2 + qx * (rand() - 0.5) * 2 + dirX * 0.1;
    let bdy =
      py * (rand() - 0.5) * 2 + qy * (rand() - 0.5) * 2 + ARC_BRANCH_UPLIFT;
    let bdz =
      pz * (rand() - 0.5) * 2 + qz * (rand() - 0.5) * 2 + dirZ * 0.1;
    const bLen = Math.hypot(bdx, bdy, bdz) || 1;
    bdx /= bLen; bdy /= bLen; bdz /= bLen;
    const stepLen =
      (ARC_BRANCH_STEP_MIN +
        rand() * (ARC_BRANCH_STEP_MAX - ARC_BRANCH_STEP_MIN)) *
      flash;
    let bx = vx[base];
    let by = vy[base];
    let bz = vz[base];
    for (let s = 0; s < ARC_BRANCH_SEGMENTS; s += 1) {
      const idx = branchStart + b * ARC_BRANCH_SEGMENTS + s;
      const nx = bx + bdx * stepLen * (1 - s * 0.15);
      const ny = by + bdy * stepLen * (1 - s * 0.15);
      const nz = bz + bdz * stepLen * (1 - s * 0.15);
      const seg = item.core[idx];
      seg.x1 = bx; seg.y1 = by; seg.z1 = bz;
      seg.x2 = nx; seg.y2 = ny; seg.z2 = nz;
      const g = item.glow[idx];
      g.x1 = seg.x1; g.y1 = seg.y1; g.z1 = seg.z1;
      g.x2 = seg.x2; g.y2 = seg.y2; g.z2 = seg.z2;
      bx = nx; by = ny; bz = nz;
    }
  }
};

/**
 * Pushes an arc's segments into the LineSegmentsGeometries' instance buffers
 * (positions and per-segment colors), marking them for upload. Colors run
 * from the dimmer source color at the tail to the full bolt color at the
 * head, so the channel reads as a hot tip trailing a faded root.
 */
const syncArcBuffers = (
  item: ChainArcPoolItem,
  coreGeometry: THREE.InstancedBufferGeometry | null,
  glowGeometry: THREE.InstancedBufferGeometry | null
): void => {
  const write = (
    geometry: THREE.InstancedBufferGeometry | null,
    segments: ChainArcSegment[]
  ): void => {
    if (!geometry) return;
    const start = geometry.getAttribute("instanceStart") as
      | THREE.InterleavedBufferAttribute
      | undefined;
    const end = geometry.getAttribute("instanceEnd") as
      | THREE.InterleavedBufferAttribute
      | undefined;
    const cStart = geometry.getAttribute("instanceColorStart") as
      | THREE.InterleavedBufferAttribute
      | undefined;
    const cEnd = geometry.getAttribute("instanceColorEnd") as
      | THREE.InterleavedBufferAttribute
      | undefined;
    if (!start || !end || !cStart || !cEnd) return;
    // instanceStart (offset 0) and instanceEnd (offset 3) share one
    // stride-6 interleaved buffer, so the per-segment layout is
    // [startX, startY, startZ, endX, endY, endZ] in a single array. Write each
    // half to its own 3 slots (the shared buffer, not two separate arrays).
    const posArr = start.array as Float32Array;
    const colArr = cStart.array as Float32Array;
    const tailDim = 0.35;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const t = (i + 1) / ARC_TOTAL_SEGMENTS;
      const mix = tailDim + (1 - tailDim) * t;
      const r = item.color.r * mix;
      const g = item.color.g * mix;
      const b = item.color.b * mix;
      const bo = 6 * i;
      posArr[bo] = seg.x1;
      posArr[bo + 1] = seg.y1;
      posArr[bo + 2] = seg.z1;
      posArr[bo + 3] = seg.x2;
      posArr[bo + 4] = seg.y2;
      posArr[bo + 5] = seg.z2;
      colArr[bo] = r;
      colArr[bo + 1] = g;
      colArr[bo + 2] = b;
      colArr[bo + 3] = r;
      colArr[bo + 4] = g;
      colArr[bo + 5] = b;
    }
    start.needsUpdate = true;
    end.needsUpdate = true;
    cStart.needsUpdate = true;
    cEnd.needsUpdate = true;
  };
  write(coreGeometry, item.core);
  write(glowGeometry, item.glow);
};

/**
 * Per-frame arc update: re-roll the jittered endpoints from the stored
 * tail/head pose and upload them into the geometry buffers.
 */
const updateChainArc = (
  pool: ChainArcPool | null,
  index: number,
  time: number,
  reducedMotion: boolean
): void => {
  if (!pool || index < 0 || !pool.used.has(index)) return;
  const item = pool.items[index];
  // Under reduced motion the channel still tracks the bolt's head (it is the
  // projectile's body, not decoration), but the per-frame jitter is held to a
  // fixed, per-arc seed so the bolt reads as a still line instead of crackling.
  const jitterTime = reducedMotion ? index * 7.13 + 1.7 : time;
  writeArcSegments(item, jitterTime);
  syncArcBuffers(
    item,
    pool.coreGeometries[index],
    pool.glowGeometries[index]
  );
};

/** Re-anchor the arc's tail on a chain hop and flag the flick. */
const reanchorChainArcTail = (
  pool: ChainArcPool | null,
  index: number,
  x: number,
  y: number,
  z: number
): void => {
  if (!pool || index < 0 || !pool.used.has(index)) return;
  const item = pool.items[index];
  item.sourceX = x;
  item.sourceY = y;
  item.sourceZ = z;
  item.hopFlash = ARC_HOP_FLASH_FRAMES;
};

const applyChainBoltPose = (
  projectile: PooledProjectile,
  ctx: NonBeamStepContext
): void => {
  const item =
    projectile.arcIndex >= 0 && ctx.arcPool
      ? ctx.arcPool.items[projectile.arcIndex]
      : null;
  if (item) {
    item.headX = projectile.currentX;
    item.headY = projectile.currentY;
    item.headZ = projectile.currentZ;
  }
  const speed = Math.hypot(
    projectile.velocityX,
    projectile.velocityY,
    projectile.velocityZ
  );
  if (speed > 1e-6) {
    tempDirection.set(
      projectile.velocityX / speed,
      projectile.velocityY / speed,
      projectile.velocityZ / speed
    );
  } else {
    tempDirection.set(0, 1, 0);
  }
  ctx.lightPool?.setLightPose(
    projectile.lightIndex,
    projectile.currentX,
    projectile.currentY,
    projectile.currentZ,
    tempDirection
  );
};

type PooledProjectile = Projectile & {
  instanceIndex: number;
  /**
   * Slot of the trail streak in the trail pool; -1 when there is none (beams,
   * and trails disabled by reduced motion).
   */
  trailInstanceIndex: number;
  /** Slot of the bolt's carried point light in the light pool; -1 for non-bolts. */
  lightIndex: number;
  /** Slot of the bolt's lightning arc in the arc pool; -1 for non-bolts. */
  arcIndex: number;
  visualPool: VisualPoolKind;
  currentX: number;
  currentY: number;
  currentZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  beamElapsedTime: number;
  beamProcessed: boolean;
  /**
   * Set when the projectile crosses the hit threshold while paused (hits
   * deferred). It is held at the strike point — no further movement or
   * range expiry — until movement resumes, so the deferred hit is always
   * settled exactly once instead of being lost to overshoot or cleanup.
   */
  pendingHit: boolean;
  /** Remaining chain hops (primary target is separate); only used for chain bolts. */
  chainQueue?: ChainAdditionalHit[];
  /**
   * BRL rocket arc state: elapsed flight time, total flight time, and the
   * lobe height above the straight launch→target line. Only used for rockets.
   */
  arcT: number;
  arcFlightTime: number;
  arcHeight: number;
};

const setBoltVelocityTowards = (
  projectile: PooledProjectile,
  endX: number,
  endY: number,
  endZ: number
): void => {
  const dx = endX - projectile.currentX;
  const dy = endY - projectile.currentY;
  const dz = endZ - projectile.currentZ;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length > 1e-6) {
    projectile.velocityX = (dx / length) * projectile.speed;
    projectile.velocityY = (dy / length) * projectile.speed;
    projectile.velocityZ = (dz / length) * projectile.speed;
  } else {
    projectile.velocityX = 0;
    projectile.velocityY = 0;
    projectile.velocityZ = 0;
  }
};

const tryContinueChainBoltAfterHit = (
  projectile: PooledProjectile,
  struckEnemy: Enemy,
  ctx: NonBeamStepContext
): boolean => {
  if (!projectile.chainQueue?.length) return false;
  const nextHop = projectile.chainQueue.shift()!;
  const nextEnemy = ctx.enemiesById.get(nextHop.enemyId);
  if (!nextEnemy || nextEnemy.health <= 0) return false;

  const gridSize = useLevelStore.getState().gridSize;
  const pathWaypoints = useLevelStore.getState().pathWaypoints;
  const { tileSize } = useGameStore.getState();
  const planetRadius = getPlanetRadius(gridSize, tileSize);

  const struckPath = getPositionAlongMultiplePaths(
    pathWaypoints,
    struckEnemy.pathIndex,
    struckEnemy.pathProgress
  );
  flatCombatPointToWorldPosition(
    struckEnemy.x,
    struckEnemy.z,
    struckPath.y + struckEnemy.size,
    planetRadius,
    scratchStruckWorld
  );

  projectile.targetId = nextHop.enemyId;
  projectile.damage = nextHop.damage;
  projectile.currentX = scratchStruckWorld.x;
  projectile.currentY = scratchStruckWorld.y;
  projectile.currentZ = scratchStruckWorld.z;
  projectile.startX = scratchStruckWorld.x;
  projectile.startY = scratchStruckWorld.y;
  projectile.startZ = scratchStruckWorld.z;

  const nextPath = getPositionAlongMultiplePaths(
    pathWaypoints,
    nextEnemy.pathIndex,
    nextEnemy.pathProgress
  );
  flatCombatPointToWorldPosition(
    nextEnemy.x,
    nextEnemy.z,
    nextPath.y + nextEnemy.size,
    planetRadius,
    scratchNextWorld
  );
  projectile.targetX = scratchNextWorld.x;
  projectile.targetY = scratchNextWorld.y;
  projectile.targetZ = scratchNextWorld.z;
  setBoltVelocityTowards(
    projectile,
    scratchNextWorld.x,
    scratchNextWorld.y,
    scratchNextWorld.z
  );
  // The bolt now rides the next enemy: re-anchor the arc's tail on the enemy
  // just struck so the channel visibly re-jumps, and pose the carried light.
  reanchorChainArcTail(
    ctx.arcPool,
    projectile.arcIndex,
    projectile.currentX,
    projectile.currentY,
    projectile.currentZ
  );
  applyChainBoltPose(projectile, ctx);
  // Re-roll the channel on this same frame so the hop reads as an instant
  // re-jump (tail and head meet on the struck enemy, then the flick carries
  // the new channel to the next target).
  updateChainArc(
    ctx.arcPool,
    projectile.arcIndex,
    ctx.currentTime,
    ctx.reducedMotion
  );
  return true;
};

export type TrailPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  length: number;
  width: number;
};

/**
 * Pose for a projectile's trail streak: a capsule stretched along the travel
 * direction whose +Y head sits at the projectile position (the -Y tail trails
 * behind it). Returns null for standing-still projectiles, which have no
 * streak. Reuses the module's scratch vectors, so the pose must be consumed
 * before the next call.
 */
export const computeTrailPose = (
  x: number,
  y: number,
  z: number,
  velocityX: number,
  velocityY: number,
  velocityZ: number,
  projectileSize: number
): TrailPose | null => {
  const speed = Math.hypot(velocityX, velocityY, velocityZ);
  if (speed < 1e-6) return null;

  const length = Math.min(
    TRAIL_MAX_LENGTH,
    Math.max(TRAIL_MIN_LENGTH, speed * TRAIL_LENGTH_FACTOR)
  );
  const width = Math.max(TRAIL_MIN_WIDTH, projectileSize * TRAIL_WIDTH_FACTOR);

  tempDirection.set(velocityX / speed, velocityY / speed, velocityZ / speed);
  tempQuaternion.setFromUnitVectors(tempUpVector, tempDirection);
  trailScratchPosition.set(
    x - tempDirection.x * (length * 0.5),
    y - tempDirection.y * (length * 0.5),
    z - tempDirection.z * (length * 0.5)
  );
  tempScale.set(width, length, width);

  return {
    position: trailScratchPosition,
    quaternion: tempQuaternion,
    scale: tempScale,
    length,
    width,
  };
};

type NonBeamStepContext = {
  delta: number;
  currentTime: number;
  lightPool: ChainLightPool | null;
  arcPool: ChainArcPool | null;
  spherePool: InstancedPoolRef | null;
  rocketPool: InstancedPoolRef | null;
  trailPool: InstancedPoolRef | null;
  projectileSize: number;
  enemiesById: Map<number, Enemy>;
  hitThreshold: number;
  onHit: (p: Projectile, e: Enemy, t: number) => void;
  toRemove: number[];
  /**
   * When false (movement stopped), the projectile keeps drifting but cannot
   * resolve its hit yet — it strikes on the first resumable frame.
   */
  canHit: boolean;
  /** Honors `prefers-reduced-motion`: the arc's flicker is frozen to a still line. */
  reducedMotion: boolean;
};

/**
 * Arc-lightning chase for chain bolts: the bolt keeps a CHAIN_LAG gap between
 * itself and its target, re-aiming every frame at the *current* target world
 * position. It therefore creeps after a moving enemy at its own (slow)
 * projectile speed instead of zipping to where the enemy was when it fired —
 * the "arc" that shoots a slowly drifting bolt at the enemy. The gap bounds
 * the strike distance: the bolt can never sit more than CHAIN_LAG beyond the
 * hit threshold from a living target, so every strike lands cleanly.
 */
const stepChainBoltHoming = (
  projectile: PooledProjectile,
  ctx: NonBeamStepContext
): void => {
  const {
    delta,
    enemiesById,
    hitThreshold,
    toRemove,
  } = ctx;

  const targetEnemy = enemiesById.get(projectile.targetId);
  if (!targetEnemy || targetEnemy.health <= 0) {
    toRemove.push(projectile.id);
    return;
  }

  const gridSize = useLevelStore.getState().gridSize;
  const pathWaypoints = useLevelStore.getState().pathWaypoints;
  const { tileSize } = useGameStore.getState();
  const planetRadius = getPlanetRadius(gridSize, tileSize);
  const pathPos = getPositionAlongMultiplePaths(
    pathWaypoints,
    targetEnemy.pathIndex,
    targetEnemy.pathProgress
  );
  flatCombatPointToWorldPosition(
    targetEnemy.x,
    targetEnemy.z,
    pathPos.y + targetEnemy.size,
    planetRadius,
    scratchTargetWorld
  );

  const dx = scratchTargetWorld.x - projectile.currentX;
  const dy = scratchTargetWorld.y - projectile.currentY;
  const dz = scratchTargetWorld.z - projectile.currentZ;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance > 1e-6) {
    // The kept gap is clamped below the hit threshold (a small enemy has a
    // small threshold), so the bolt always ends up inside it.
    const gap = Math.min(CHAIN_LAG, hitThreshold * 0.75);
    // Re-aim every frame toward the gap point, so the bolt closes in at its
    // own speed (the slow `projectileSpeed` from the tower config).
    const closeBy = projectile.speed * delta;
    if (closeBy >= distance) {
      // The frame's step reaches the target: park exactly on it and let the
      // distance-threshold check settle the hit below.
      projectile.currentX = scratchTargetWorld.x;
      projectile.currentY = scratchTargetWorld.y;
      projectile.currentZ = scratchTargetWorld.z;
      projectile.velocityX = (dx / distance) * projectile.speed;
      projectile.velocityY = (dy / distance) * projectile.speed;
      projectile.velocityZ = (dz / distance) * projectile.speed;
    } else {
      // Keep the gap: stop short of the target.
      const travel = Math.max(0, Math.min(distance - gap, closeBy));
      const s = travel / distance;
      projectile.currentX += dx * s;
      projectile.currentY += dy * s;
      projectile.currentZ += dz * s;
      // Store the real velocity (speed along the aim), not the frame
      // displacement.
      projectile.velocityX = (dx / distance) * projectile.speed;
      projectile.velocityY = (dy / distance) * projectile.speed;
      projectile.velocityZ = (dz / distance) * projectile.speed;
    }
  }

  applyChainBoltPose(projectile, ctx);
};

const stepNonBeamProjectile = (
  projectile: PooledProjectile,
  ctx: NonBeamStepContext
): void => {
  const {
    delta,
    currentTime,
    spherePool,
    rocketPool,
    trailPool,
    projectileSize,
    enemiesById,
    hitThreshold,
    onHit,
    toRemove,
    canHit,
  } = ctx;

  // A projectile that crossed the hit threshold while paused is held at its
  // strike point: no movement, no range expiry — only settlement once hits
  // are live again (or cleanup if its target died in the meantime).
  if (projectile.pendingHit) {
    const pendingTarget = enemiesById.get(projectile.targetId);
    if (!pendingTarget || pendingTarget.health <= 0) {
      toRemove.push(projectile.id);
      return;
    }
    if (!canHit) return;

    onHit(projectile, pendingTarget, currentTime);

    if (
      projectile.visualPool === "bolt" &&
      tryContinueChainBoltAfterHit(projectile, pendingTarget, ctx)
    ) {
      projectile.pendingHit = false;
      return;
    }

    toRemove.push(projectile.id);
    return;
  }

  if (projectile.visualPool === "bolt") {
    // Arc lightning: the bolt chases its target instead of flying the
    // launch-time vector, so a moving enemy is actually hit (the old
    // straight-line flight would pass it by). The chase re-aims at the
    // target's live world position every frame and keeps a CHAIN_LAG gap.
    stepChainBoltHoming(projectile, ctx);

    // Crack the arc channel: re-roll the jittered endpoints from the bolt's
    // fresh head pose (the tail is the muzzle, or the last struck enemy).
    updateChainArc(
      ctx.arcPool,
      projectile.arcIndex,
      ctx.currentTime,
      ctx.reducedMotion
    );

    const targetEnemy = enemiesById.get(projectile.targetId);
    if (!targetEnemy || targetEnemy.health <= 0) {
      toRemove.push(projectile.id);
      return;
    }

    const gridSize = useLevelStore.getState().gridSize;
    const pathWaypoints = useLevelStore.getState().pathWaypoints;
    const { tileSize } = useGameStore.getState();
    const planetRadius = getPlanetRadius(gridSize, tileSize);
    const pathPos = getPositionAlongMultiplePaths(
      pathWaypoints,
      targetEnemy.pathIndex,
      targetEnemy.pathProgress
    );
    flatCombatPointToWorldPosition(
      targetEnemy.x,
      targetEnemy.z,
      pathPos.y + targetEnemy.size,
      planetRadius,
      scratchTargetWorld
    );
    const distToTarget = Math.hypot(
      projectile.currentX - scratchTargetWorld.x,
      projectile.currentY - scratchTargetWorld.y,
      projectile.currentZ - scratchTargetWorld.z
    );

    if (distToTarget < hitThreshold) {
      if (!canHit) {
        projectile.pendingHit = true;
        return;
      }

      onHit(projectile, targetEnemy, currentTime);

      if (tryContinueChainBoltAfterHit(projectile, targetEnemy, ctx)) {
        return;
      }

      toRemove.push(projectile.id);
      return;
    }

    const distFromStart = Math.hypot(
      projectile.currentX - projectile.startX,
      projectile.currentY - projectile.startY,
      projectile.currentZ - projectile.startZ
    );
    if (distFromStart > projectile.range * 1.5) {
      toRemove.push(projectile.id);
    }
    return;
  }

  if (projectile.visualPool === "rocket") {
    // BRL rocket: a ballistic arc. The horizontal position eases from the
    // launch tube toward the target's *current* position (the rocket homes,
    // so it lands on a moving enemy), and the height rides a parabolic lobe —
    // rising to `arcHeight` at the midpoint and falling back to the target's
    // height at the end. Sampling by normalized flight time makes the arc
    // deterministic (no integration drift) and it always ends at the target,
    // where the hit threshold settles the impact.
    const targetEnemy = enemiesById.get(projectile.targetId);
    if (!targetEnemy || targetEnemy.health <= 0) {
      toRemove.push(projectile.id);
      return;
    }

    const gridSize = useLevelStore.getState().gridSize;
    const pathWaypoints = useLevelStore.getState().pathWaypoints;
    const { tileSize } = useGameStore.getState();
    const planetRadius = getPlanetRadius(gridSize, tileSize);
    const pathPos = getPositionAlongMultiplePaths(
      pathWaypoints,
      targetEnemy.pathIndex,
      targetEnemy.pathProgress
    );
    flatCombatPointToWorldPosition(
      targetEnemy.x,
      targetEnemy.z,
      pathPos.y + targetEnemy.size,
      planetRadius,
      scratchTargetWorld
    );

    const prevX = projectile.currentX;
    const prevY = projectile.currentY;
    const prevZ = projectile.currentZ;

    projectile.arcT = Math.min(
      projectile.arcT + delta,
      projectile.arcFlightTime
    );
    const u =
      projectile.arcFlightTime > 0
        ? projectile.arcT / projectile.arcFlightTime
        : 1;
    // Linear homing on the horizontal plane…
    projectile.currentX = projectile.startX + (scratchTargetWorld.x - projectile.startX) * u;
    projectile.currentZ = projectile.startZ + (scratchTargetWorld.z - projectile.startZ) * u;
    // …with the vertical offset on a parabolic lobe (0 at launch, peak at
    // u = 0.5, back to 0 at impact) so the rocket climbs and then drops in on
    // the target.
    const lobe = 4 * u * (1 - u);
    projectile.currentY =
      projectile.startY + (scratchTargetWorld.y - projectile.startY) * u +
      projectile.arcHeight * lobe;

    // Velocity for orientation and the trail (finite difference; the nose
    // points along the travel, so the rocket tilts over its apex and
    // nose-dives into the impact).
    if (delta > 1e-6) {
      projectile.velocityX = (projectile.currentX - prevX) / delta;
      projectile.velocityY = (projectile.currentY - prevY) / delta;
      projectile.velocityZ = (projectile.currentZ - prevZ) / delta;
    }

    const speed = Math.hypot(
      projectile.velocityX,
      projectile.velocityY,
      projectile.velocityZ
    );
    if (speed > 1e-6) {
      tempDirection.set(
        projectile.velocityX / speed,
        projectile.velocityY / speed,
        projectile.velocityZ / speed
      );
      tempQuaternion.setFromUnitVectors(tempUpVector, tempDirection);
      tempPosition.set(
        projectile.currentX,
        projectile.currentY,
        projectile.currentZ
      );
      rocketPool?.setTransform(
        projectile.instanceIndex,
        tempPosition,
        tempQuaternion,
        tempScale.set(1, 1, 1)
      );
    }

    if (projectile.trailInstanceIndex >= 0 && trailPool) {
      const pose = computeTrailPose(
        projectile.currentX,
        projectile.currentY,
        projectile.currentZ,
        projectile.velocityX,
        projectile.velocityY,
        projectile.velocityZ,
        projectileSize
      );
      if (pose) {
        trailPool.setTransform(
          projectile.trailInstanceIndex,
          pose.position,
          pose.quaternion,
          pose.scale
        );
      }
    }

    // The arc is homing, so when the flight time is up the rocket sits
    // exactly on the target: settle the hit here (the horizontal homing
    // replaces the distance-threshold check straight projectiles use).
    if (u >= 1) {
      if (!canHit) {
        projectile.pendingHit = true;
        return;
      }
      onHit(projectile, targetEnemy, currentTime);
      toRemove.push(projectile.id);
    }
    return;
  }

  projectile.currentX += projectile.velocityX * delta;
  projectile.currentY += projectile.velocityY * delta;
  projectile.currentZ += projectile.velocityZ * delta;

  // Bolts are handled above (arc-lightning chase), so the straight-line
  // movement that remains is the sphere pool's.
  spherePool?.setPosition(
    projectile.instanceIndex,
    projectile.currentX,
    projectile.currentY,
    projectile.currentZ
  );

  if (projectile.trailInstanceIndex >= 0 && trailPool) {
    const pose = computeTrailPose(
      projectile.currentX,
      projectile.currentY,
      projectile.currentZ,
      projectile.velocityX,
      projectile.velocityY,
      projectile.velocityZ,
      projectileSize
    );
    if (pose) {
      trailPool.setTransform(
        projectile.trailInstanceIndex,
        pose.position,
        pose.quaternion,
        pose.scale
      );
    }
  }

  const targetEnemy = enemiesById.get(projectile.targetId);

  if (!targetEnemy || targetEnemy.health <= 0) {
    toRemove.push(projectile.id);
    return;
  }

  const gridSize = useLevelStore.getState().gridSize;
  const pathWaypoints = useLevelStore.getState().pathWaypoints;
  const { tileSize } = useGameStore.getState();
  const planetRadius = getPlanetRadius(gridSize, tileSize);
  const pathPos = getPositionAlongMultiplePaths(
    pathWaypoints,
    targetEnemy.pathIndex,
    targetEnemy.pathProgress
  );
  flatCombatPointToWorldPosition(
    targetEnemy.x,
    targetEnemy.z,
    pathPos.y + targetEnemy.size,
    planetRadius,
    scratchTargetWorld
  );
  const distToTarget = Math.hypot(
    projectile.currentX - scratchTargetWorld.x,
    projectile.currentY - scratchTargetWorld.y,
    projectile.currentZ - scratchTargetWorld.z
  );

  if (distToTarget < hitThreshold) {
    // Deferred hit while paused: the projectile has arrived but deals no
    // damage until movement resumes, mirroring the enemy end-of-path gate.
    // The flag holds it at this strike point (no further movement or range
    // expiry), so the settlement is guaranteed on the first resumable frame.
    if (!canHit) {
      projectile.pendingHit = true;
      return;
    }

    onHit(projectile, targetEnemy, currentTime);
    toRemove.push(projectile.id);
    return;
  }

  const distFromStart = Math.hypot(
    projectile.currentX - projectile.startX,
    projectile.currentY - projectile.startY,
    projectile.currentZ - projectile.startZ
  );

  if (distFromStart > projectile.range * 1.5) {
    toRemove.push(projectile.id);
  }
};

const processBeamProjectileHits = (
  projectile: PooledProjectile,
  enemiesById: Map<number, Enemy>,
  onHit: (p: Projectile, e: Enemy, t: number) => void,
  currentTime: number
): void => {
  if (projectile.beamProcessed) return;
  const pierceIds = projectile.pierceEnemyIds;
  if (!pierceIds?.length) return;
  projectile.beamProcessed = true;
  for (const enemyId of pierceIds) {
    const enemy = enemiesById.get(enemyId);
    if (enemy && enemy.health > 0) {
      onHit(projectile, enemy, currentTime);
    }
  }
};

type FireProjectileParams = Omit<Projectile, "id">;

type InstancedProjectilesConfig = {
  maxProjectiles?: number;
  maxBeams?: number;
  projectileSize?: number;
  defaultColor?: string;
  emissiveIntensity?: number;
  beamEmissiveIntensity?: number;
  hitThreshold?: number;
  beamDuration?: number;
  onHit: (projectile: Projectile, enemy: Enemy, currentTime: number) => void;
  onRemove: (projectileId: number) => void;
};

type InstancedProjectilesReturn = {
  InstancedProjectiles: ReactElement;
  fireProjectile: (params: FireProjectileParams) => Projectile;
  updateProjectiles: (frame: SimulationFrame) => void;
  clearAllProjectiles: () => void;
  getActiveProjectiles: () => PooledProjectile[];
  /** Pool stats of the trail streaks, or null when trails are disabled. */
  getTrailPoolStats: () => InstancedPoolStats | null;
};

export const useInstancedProjectiles = (
  config: InstancedProjectilesConfig
): InstancedProjectilesReturn => {
  const {
    maxProjectiles = 500,
    maxBeams = 50,
    projectileSize = 0.1,
    defaultColor = getCssColorValue("scene-white"),
    emissiveIntensity = 0.8,
    beamEmissiveIntensity = 1.5,
    hitThreshold = 0.3,
    beamDuration = 0.15,
    onHit,
    onRemove,
  } = config;

  // The trail is decorative motion; honor `prefers-reduced-motion` and skip
  // it entirely (no trail pool, no per-frame streak work).
  const reducedMotion = useReducedMotion();

  const sphereInstancesContent = useMemo(
    () => (
      <>
        <sphereGeometry args={[projectileSize, 8, 8]} />
        <meshStandardMaterial
          color={defaultColor}
          emissive={defaultColor}
          emissiveIntensity={emissiveIntensity}
          toneMapped={false}
          onBeforeCompile={patchEmissiveByInstanceColor}
        />
      </>
    ),
    [defaultColor, emissiveIntensity, projectileSize]
  );

  const beamInstancesContent = useMemo(
    () => (
      <>
        <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
        <meshStandardMaterial
          color={defaultColor}
          emissive={defaultColor}
          emissiveIntensity={beamEmissiveIntensity}
          transparent
          opacity={0.9}
          toneMapped={false}
          onBeforeCompile={patchEmissiveByInstanceColor}
        />
      </>
    ),
    [beamEmissiveIntensity, defaultColor]
  );



  // Solid projectiles cast shadows onto the ground/path below them. Beams are
  // instant light effects (no travel to shadow) and trails are additive glow,
  // so neither gets castShadow.
  const { pool: spherePool, InstancedEntity: InstancedSphereInstances } =
    useInstancedEntity({
      limit: maxProjectiles,
      defaultColor,
      frustumCulled: false,
      castShadow: true,
      instancesContent: sphereInstancesContent,
    });

  const { pool: beamPool, InstancedEntity: InstancedBeamInstances } =
    useInstancedEntity({
      limit: maxBeams,
      defaultColor,
      frustumCulled: false,
      instancesContent: beamInstancesContent,
    });

  // The jagged lightning arcs the chain bolts ride: a fixed pool of paired
  // fat-line objects (bright core + wide additive glow) whose endpoints are
  // re-rolled every frame. Each arc owns its small core + glow geometry (they
  // cannot be shared — a shared geometry renders all arcs identically); the
  // two LineMaterials are shared. Geometries and materials live until unmount;
  // idle arcs are hidden (visible=false) so they cost no draw calls and the
  // pool's shader-program count stays constant.
  const chainArcPool = useMemo(
    () => createChainArcPool(CHAIN_ARC_POOL_SIZE, defaultColor),
    [defaultColor]
  );
  useEffect(
    () => () => {
      chainArcPool.coreGeometries.forEach((g) => g?.dispose());
      chainArcPool.glowGeometries.forEach((g) => g?.dispose());
      chainArcPool.items.forEach((item) => {
        item.root.removeFromParent();
      });
      const first = chainArcPool.items[0];
      if (first) {
        const core = first.root.children[0] as THREE.Object3D | undefined;
        const glow = first.root.children[1] as THREE.Object3D | undefined;
        (core as { material?: THREE.Material } | undefined)?.material?.dispose();
        (glow as { material?: THREE.Material } | undefined)?.material?.dispose();
      }
    },
    [chainArcPool]
  );

  // One shared rocket body (body + nose + fins merged) for every in-flight
  // BRL rocket; the material tints each instance with the tower color, like
  // the other solid projectiles.
  const rocketGeometry = useMemo(() => buildRocketGeometry(), []);
  useEffect(() => () => rocketGeometry.dispose(), [rocketGeometry]);

  const rocketInstancesContent = useMemo(
    () => (
      <>
        <primitive object={rocketGeometry} attach="geometry" />
        <meshStandardMaterial
          color={defaultColor}
          emissive={defaultColor}
          emissiveIntensity={ROCKET_EMISSIVE_INTENSITY}
          toneMapped={false}
          onBeforeCompile={patchEmissiveByInstanceColor}
        />
      </>
    ),
    [defaultColor, rocketGeometry]
  );

  const { pool: rocketPool, InstancedEntity: InstancedRocketInstances } =
    useInstancedEntity({
      limit: maxProjectiles,
      defaultColor,
      frustumCulled: false,
      castShadow: true,
      instancesContent: rocketInstancesContent,
    });

  const trailInstancesContent = useMemo(
    () => (
      <>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshStandardMaterial
          color={defaultColor}
          emissive={defaultColor}
          emissiveIntensity={TRAIL_EMISSIVE_INTENSITY}
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          onBeforeCompile={(shader) => {
            patchEmissiveByInstanceColor(shader);
            patchInstancedTrailFade(shader);
          }}
        />
      </>
    ),
    [defaultColor]
  );

  // The pool is created once at its first limit, so it is always full
  // capacity: if reduced motion is on at mount, the slots stay reserved and
  // the `wantTrail` guard keeps them from being acquired (and the instances
  // stay unrendered) until the preference is switched off — no remount
  // needed.
  const { pool: trailPool, InstancedEntity: InstancedTrailInstances } =
    useInstancedEntity({
      limit: maxProjectiles,
      defaultColor,
      frustumCulled: false,
      instancesContent: trailInstancesContent,
    });

  // The small light each chain bolt carries: a real THREE.PointLight (drei
  // can't instance lights, so these are plain light objects in a fixed pool —
  // created once, moved per frame, intensity-toggled on acquire/release). The
  // fixed size keeps the scene's light count constant, so no shader program
  // is (re)compiled while bolts come and go.
  const chainLightPool = useMemo(
    () => createChainLightPool(CHAIN_LIGHT_POOL_SIZE),
    []
  );

  const projectilesRef = useRef<Map<number, PooledProjectile>>(new Map());
  const enemiesByIdRef = useRef<Map<number, Enemy>>(new Map());
  const toRemoveRef = useRef<number[]>([]);

  const { getNextProjectileId } = useEntityIds();

  useEffect(() => {
    const projectilesRefCurrent = projectilesRef.current;

    return () => {
      projectilesRefCurrent.clear();
      getNextProjectileId(true);
    };
  }, [getNextProjectileId]);

  const pools = useMemo(
    () => ({
      beam: beamPool,
      sphere: spherePool,
      rocket: rocketPool,
      trail: trailPool,
    }),
    [beamPool, spherePool, rocketPool, trailPool]
  );

  const removeProjectile = useCallback(
    (projectileId: number): void => {
      const projectile = projectilesRef.current.get(projectileId);
      if (!projectile) return;

      projectilesRef.current.delete(projectileId);

      // Chain bolts no longer occupy an instanced mesh slot (their visual is
      // the pooled lightning arc), so only the other pool kinds release here.
      if (projectile.visualPool !== "bolt") {
        pools[projectile.visualPool]?.release(projectile.instanceIndex);
      }

      if (projectile.trailInstanceIndex >= 0) {
        pools.trail?.release(projectile.trailInstanceIndex);
      }

      if (projectile.lightIndex >= 0) {
        chainLightPool.release(projectile.lightIndex);
      }

      if (projectile.arcIndex >= 0) {
        chainArcPool.release(projectile.arcIndex);
      }

      onRemove(projectileId);
    },
    [chainArcPool, chainLightPool, pools, onRemove]
  );

  const fireProjectile = useCallback(
    (params: FireProjectileParams): Projectile => {
      const visualPool = resolveVisualPool(params.projectileType);

      // Chain bolts have no instanced mesh slot — their body is the pooled
      // lightning arc (plus the carried light) — so they skip the pool
      // acquire/release below.
      const pool = visualPool === "bolt" ? null : pools[visualPool];
      const index = pool ? pool.acquire() : -1;
      if (pool && index === -1) return { ...params, id: -1 };

      // The single/AoE spheres and the BRL rockets get a pooled trail slot; a
      // full trail pool (or reduced motion) degrades gracefully to the plain
      // body. Chain bolts get no streak — their jagged, flickering arc is the
      // motion.
      const wantTrail =
        (visualPool === "sphere" || visualPool === "rocket") && !reducedMotion;
      const trailPool = wantTrail ? pools.trail : null;
      const trailIndex = trailPool ? trailPool.acquire() : -1;

      // A chain bolt grabs its carried light slot; a full light pool (rare —
      // only under a heavy chain volley) degrades gracefully to an unlit bolt.
      const lightIndex =
        visualPool === "bolt" ? chainLightPool.acquire(params.color ?? defaultColor) : -1;

      // …and its lightning arc: the visible bolt. A full arc pool (only under
      // a very heavy chain volley) degrades gracefully to a headless bolt —
      // it still flies, homes, and hits, just without the visible channel.
      const arcIndex =
        visualPool === "bolt" ? chainArcPool.acquire(params.color ?? defaultColor) : -1;

      const id = getNextProjectileId();
      const color = params.color ?? defaultColor;

      const dx = params.targetX - params.startX;
      const dy = params.targetY - params.startY;
      const dz = params.targetZ - params.startZ;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

      let velocityX = length > 0 ? (dx / length) * params.speed : 0;
      let velocityY = length > 0 ? (dy / length) * params.speed : 0;
      let velocityZ = length > 0 ? (dz / length) * params.speed : 0;

      // BRL rocket: a ballistic arc instead of a straight shot. The rocket
      // rides a parabolic lobe — rising then falling, peaking at `arcHeight`
      // above the launch plane — and homes on the target's current position,
      // so it leaves the tube, climbs, and drops onto a moving target. The
      // lobe is sampled by normalized flight time (see the step) rather than
      // integrated, so it is deterministic and never overshoots. The launch
      // velocity (the lobe's slope at u = 0, i.e. `dx/dt = dx/flightTime`,
      // `dy/dt = dy/flightTime + 4·arcHeight/flightTime`) is used to point the
      // nose on the very first frame, before the step's finite difference
      // takes over.
      const rocketHDist = Math.hypot(dx, dz);
      const rocketArcHeight = Math.max(0.9, rocketHDist * 0.18);
      // The distance-based flight time was tuned assuming a nominal rocket
      // speed of 10, so scale it by ROCKET_REFERENCE_SPEED/speed to let the
      // configured projectileSpeed control how long the arc takes (lower speed
      // = slower artillery).
      const rocketFlightTime =
        (0.35 + Math.min(0.5, rocketHDist * 0.075)) *
        (ROCKET_REFERENCE_SPEED / Math.max(0.1, params.speed));
      if (visualPool === "rocket") {
        velocityX = dx / rocketFlightTime;
        velocityY = dy / rocketFlightTime + (4 * rocketArcHeight) / rocketFlightTime;
        velocityZ = dz / rocketFlightTime;
      }

      const pooledProjectile: PooledProjectile = {
        ...params,
        id,
        instanceIndex: index,
        trailInstanceIndex: wantTrail && trailIndex !== -1 ? trailIndex : -1,
        lightIndex,
        arcIndex,
        visualPool,
        currentX: params.startX,
        currentY: params.startY,
        currentZ: params.startZ,
        velocityX,
        velocityY,
        velocityZ,
        beamElapsedTime: 0,
        beamProcessed: false,
        pendingHit: false,
        chainQueue:
          visualPool === "bolt"
            ? [...(params.chainAdditionalHits ?? [])]
            : undefined,
        arcT: 0,
        arcFlightTime: rocketFlightTime,
        arcHeight: rocketArcHeight,
      };

      projectilesRef.current.set(id, pooledProjectile);

      if (visualPool === "beam") {
        const midX = (params.startX + params.targetX) / 2;
        const midY = (params.startY + params.targetY) / 2;
        const midZ = (params.startZ + params.targetZ) / 2;

        tempDirection.set(dx, dy, dz).normalize();
        tempQuaternion.setFromUnitVectors(tempUpVector, tempDirection);
        tempPosition.set(midX, midY, midZ);
        tempScale.set(1, length, 1);

        pool?.setTransform(index, tempPosition, tempQuaternion, tempScale);
      } else if (visualPool === "bolt") {
        // The arc channel starts at the muzzle; the head is the bolt itself.
        if (arcIndex >= 0) {
          const item = chainArcPool.items[arcIndex];
          item.sourceX = params.startX;
          item.sourceY = params.startY;
          item.sourceZ = params.startZ;
          item.headX = params.startX;
          item.headY = params.startY;
          item.headZ = params.startZ;
          item.hopFlash = ARC_HOP_FLASH_FRAMES;
        }
        const speed0 = Math.hypot(velocityX, velocityY, velocityZ);
        if (speed0 > 1e-6) {
          tempDirection.set(
            velocityX / speed0,
            velocityY / speed0,
            velocityZ / speed0
          );
        } else {
          tempDirection.set(0, 1, 0);
        }
        chainLightPool.setLightPose(
          lightIndex,
          params.startX,
          params.startY,
          params.startZ,
          tempDirection
        );
      } else if (visualPool === "rocket") {
        // Point the nose at the launch velocity (strongly upward at first).
        const speed0 = Math.hypot(velocityX, velocityY, velocityZ);
        if (speed0 > 1e-6) {
          tempDirection.set(velocityX / speed0, velocityY / speed0, velocityZ / speed0);
        } else {
          tempDirection.set(0, 1, 0);
        }
        tempQuaternion.setFromUnitVectors(tempUpVector, tempDirection);
        tempPosition.set(params.startX, params.startY, params.startZ);
        tempScale.set(1, 1, 1);
        pool?.setTransform(index, tempPosition, tempQuaternion, tempScale);
      } else {
        pool?.setPosition(index, params.startX, params.startY, params.startZ);
        pool?.setScale(index, 1, 1, 1);
      }

      pool?.setColor(index, color);

      if (pooledProjectile.trailInstanceIndex >= 0 && trailPool) {
        const pose = computeTrailPose(
          params.startX,
          params.startY,
          params.startZ,
          velocityX,
          velocityY,
          velocityZ,
          projectileSize
        );
        if (pose) {
          trailPool.setTransform(
            pooledProjectile.trailInstanceIndex,
            pose.position,
            pose.quaternion,
            pose.scale
          );
        }
        trailPool.setColor(pooledProjectile.trailInstanceIndex, color);
      }

      return pooledProjectile;
    },
    [
      chainArcPool,
      chainLightPool,
      defaultColor,
      getNextProjectileId,
      pools,
      projectileSize,
      reducedMotion,
    ]
  );

  const updateProjectilesFrame = useCallback(
    (currentTime: number, delta: number, canHit: boolean): void => {
      const toRemove = toRemoveRef.current;
      toRemove.length = 0;

      projectilesRef.current.forEach((projectile) => {
        if (projectile.visualPool === "beam") {
          // Beams are instant lines whose damage is settled the frame they
          // are fired, so they hard-freeze with the pause clock rather than
          // dilating (only projectiles that travel toward a target slow in).
          if (canHit) {
            processBeamProjectileHits(
              projectile,
              enemiesByIdRef.current,
              onHit,
              currentTime
            );
            projectile.beamElapsedTime += delta;
            if (projectile.beamElapsedTime >= beamDuration) {
              toRemove.push(projectile.id);
            }
          }
        } else {
          stepNonBeamProjectile(projectile, {
            delta,
            currentTime,
            lightPool: chainLightPool,
            arcPool: chainArcPool,
            spherePool,
            rocketPool,
            trailPool,
            projectileSize,
            enemiesById: enemiesByIdRef.current,
            hitThreshold,
            onHit,
            toRemove,
            canHit,
            reducedMotion,
          });
        }
      });

      for (const id of toRemove) {
        removeProjectile(id);
      }
    },
    [
      beamDuration,
      chainArcPool,
      chainLightPool,
      onHit,
      reducedMotion,
      rocketPool,
      spherePool,
      trailPool,
      projectileSize,
      hitThreshold,
      removeProjectile,
    ]
  );

  const clearAllProjectiles = useCallback((): void => {
    projectilesRef.current.forEach((projectile) => {
      onRemove(projectile.id);
    });
    projectilesRef.current.clear();
    Object.values(pools).forEach((pool) => pool?.releaseAll());
    chainLightPool.releaseAll();
    chainArcPool.releaseAll();
  }, [chainArcPool, chainLightPool, pools, onRemove]);

  const getActiveProjectiles = useCallback((): PooledProjectile[] => {
    return Array.from(projectilesRef.current.values());
  }, []);

  const getTrailPoolStats = useCallback((): InstancedPoolStats | null => {
    return trailPool ? trailPool.getStats() : null;
  }, [trailPool]);

  const updateProjectiles = useCallback(
    (frame: SimulationFrame) => {
      enemiesByIdRef.current = refreshEnemyRegistry(world);
      updateProjectilesFrame(
        frame.simulationTimeSeconds,
        frame.deltaSeconds,
        frame.canResolveGameplay
      );
    },
    [updateProjectilesFrame]
  );

  const InstancedProjectiles = (
    <>
      {InstancedSphereInstances}
      {InstancedBeamInstances}
      {InstancedRocketInstances}
      {reducedMotion ? null : InstancedTrailInstances}
      {chainArcPool.items.map((item, index) => (
        <primitive key={`chain-arc-${index}`} object={item.root} />
      ))}
      {chainLightPool.lights.map((light, index) => (
        <primitive key={`chain-light-${index}`} object={light} />
      ))}
    </>
  );

  return {
    InstancedProjectiles,
    fireProjectile,
    updateProjectiles,
    clearAllProjectiles,
    getActiveProjectiles,
    getTrailPoolStats,
  };
};

export type {
  InstancedProjectilesConfig,
  InstancedProjectilesReturn,
  FireProjectileParams,
  PooledProjectile,
  InstancedPoolStats,
  VisualPoolKind,
};
