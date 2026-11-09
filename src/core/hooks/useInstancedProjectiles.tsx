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

const CHAIN_BOLT_RADIUS = 0.03;
const CHAIN_BOLT_LENGTH = 0.5;
const CHAIN_BOLT_EMISSIVE_INTENSITY = 2;
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
const CHAIN_LIGHT_AHEAD_OFFSET = 0.05;
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

type ChainBoltKinematics = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
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
      const lead = CHAIN_BOLT_LENGTH * 0.5 + CHAIN_LIGHT_AHEAD_OFFSET;
      light.position.set(
        x + direction.x * lead,
        y + direction.y * lead + CHAIN_LIGHT_Y_OFFSET,
        z + direction.z * lead
      );
    },
  };
};

const applyChainBoltTransform = (
  pool: InstancedPoolRef | null,
  index: number,
  k: ChainBoltKinematics,
  lightPool: ChainLightPool | null = null,
  lightIndex: number = -1
): void => {
  if (!pool) return;

  const speed = Math.sqrt(k.vx * k.vx + k.vy * k.vy + k.vz * k.vz);
  if (speed > 1e-6) {
    tempDirection.set(k.vx / speed, k.vy / speed, k.vz / speed);
  } else {
    tempDirection.set(0, 1, 0);
  }
  tempQuaternion.setFromUnitVectors(tempUpVector, tempDirection);
  tempPosition.set(
    k.x + tempDirection.x * (CHAIN_BOLT_LENGTH * 0.5),
    k.y + tempDirection.y * (CHAIN_BOLT_LENGTH * 0.5),
    k.z + tempDirection.z * (CHAIN_BOLT_LENGTH * 0.5)
  );
  tempScale.set(1, CHAIN_BOLT_LENGTH, 1);
  pool.setTransform(index, tempPosition, tempQuaternion, tempScale);
  lightPool?.setLightPose(lightIndex, k.x, k.y, k.z, tempDirection);
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
  boltPool: InstancedPoolRef | null,
  lightPool: ChainLightPool | null,
  enemiesById: Map<number, Enemy>
): boolean => {
  if (!projectile.chainQueue?.length) return false;
  const nextHop = projectile.chainQueue.shift()!;
  const nextEnemy = enemiesById.get(nextHop.enemyId);
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
  applyChainBoltTransform(
    boltPool,
    projectile.instanceIndex,
    {
      x: projectile.currentX,
      y: projectile.currentY,
      z: projectile.currentZ,
      vx: projectile.velocityX,
      vy: projectile.velocityY,
      vz: projectile.velocityZ,
    },
    lightPool,
    projectile.lightIndex
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
  boltPool: InstancedPoolRef | null;
  lightPool: ChainLightPool | null;
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
    boltPool,
    lightPool,
    trailPool,
    projectileSize,
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
      // displacement — the trail streak's length is proportional to it, so a
      // displacement (scaled by delta) would always yield the minimum streak.
      projectile.velocityX = (dx / distance) * projectile.speed;
      projectile.velocityY = (dy / distance) * projectile.speed;
      projectile.velocityZ = (dz / distance) * projectile.speed;
    }
  }

  applyChainBoltTransform(
    boltPool,
    projectile.instanceIndex,
    {
      x: projectile.currentX,
      y: projectile.currentY,
      z: projectile.currentZ,
      vx: projectile.velocityX,
      vy: projectile.velocityY,
      vz: projectile.velocityZ,
    },
    lightPool,
    projectile.lightIndex
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
};

const stepNonBeamProjectile = (
  projectile: PooledProjectile,
  ctx: NonBeamStepContext
): void => {
  const {
    delta,
    currentTime,
    boltPool,
    lightPool,
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
      tryContinueChainBoltAfterHit(
        projectile,
        pendingTarget,
        boltPool,
        lightPool,
        enemiesById
      )
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

      if (
        tryContinueChainBoltAfterHit(
          projectile,
          targetEnemy,
          boltPool,
          lightPool,
          enemiesById
        )
      ) {
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

  const boltInstancesContent = useMemo(
    () => (
      <>
        <cylinderGeometry args={[CHAIN_BOLT_RADIUS, CHAIN_BOLT_RADIUS, 1, 8]} />
        <meshStandardMaterial
          color={defaultColor}
          emissive={defaultColor}
          emissiveIntensity={CHAIN_BOLT_EMISSIVE_INTENSITY}
          transparent
          opacity={0.92}
          toneMapped={false}
          onBeforeCompile={patchEmissiveByInstanceColor}
        />
      </>
    ),
    [defaultColor]
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

  const { pool: boltPool, InstancedEntity: InstancedBoltInstances } =
    useInstancedEntity({
      limit: maxProjectiles,
      defaultColor,
      frustumCulled: false,
      castShadow: true,
      instancesContent: boltInstancesContent,
    });

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
      bolt: boltPool,
      sphere: spherePool,
      rocket: rocketPool,
      trail: trailPool,
    }),
    [beamPool, boltPool, spherePool, rocketPool, trailPool]
  );

  const removeProjectile = useCallback(
    (projectileId: number): void => {
      const projectile = projectilesRef.current.get(projectileId);
      if (!projectile) return;

      projectilesRef.current.delete(projectileId);

      const visualPool = pools[projectile.visualPool];
      if (visualPool) visualPool.release(projectile.instanceIndex);

      if (projectile.trailInstanceIndex >= 0) {
        pools.trail?.release(projectile.trailInstanceIndex);
      }

      if (projectile.lightIndex >= 0) {
        chainLightPool.release(projectile.lightIndex);
      }

      onRemove(projectileId);
    },
    [chainLightPool, pools, onRemove]
  );

  const fireProjectile = useCallback(
    (params: FireProjectileParams): Projectile => {
      const visualPool = resolveVisualPool(params.projectileType);

      const pool = pools[visualPool];
      if (!pool) return { ...params, id: -1 };

      const index = pool.acquire();
      if (index === -1) return { ...params, id: -1 };

      // The single/AoE spheres, the BRL rockets, and the chain bolts get a
      // pooled trail slot; a full trail pool (or reduced motion) degrades
      // gracefully to the plain body.
      const wantTrail =
        (visualPool === "sphere" ||
          visualPool === "rocket" ||
          visualPool === "bolt") &&
        !reducedMotion;
      const trailPool = wantTrail ? pools.trail : null;
      const trailIndex = trailPool ? trailPool.acquire() : -1;

      // A chain bolt grabs its carried light slot; a full light pool (rare —
      // only under a heavy chain volley) degrades gracefully to an unlit bolt.
      const lightIndex =
        visualPool === "bolt" ? chainLightPool.acquire(params.color ?? defaultColor) : -1;

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

        pool.setTransform(index, tempPosition, tempQuaternion, tempScale);
      } else if (visualPool === "bolt") {
        applyChainBoltTransform(
          pool,
          index,
          {
            x: params.startX,
            y: params.startY,
            z: params.startZ,
            vx: velocityX,
            vy: velocityY,
            vz: velocityZ,
          },
          chainLightPool,
          lightIndex
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
        pool.setTransform(index, tempPosition, tempQuaternion, tempScale);
      } else {
        pool.setPosition(index, params.startX, params.startY, params.startZ);
        pool.setScale(index, 1, 1, 1);
      }

      pool.setColor(index, color);

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
            boltPool,
            lightPool: chainLightPool,
            spherePool,
            rocketPool,
            trailPool,
            projectileSize,
            enemiesById: enemiesByIdRef.current,
            hitThreshold,
            onHit,
            toRemove,
            canHit,
          });
        }
      });

      for (const id of toRemove) {
        removeProjectile(id);
      }
    },
    [
      beamDuration,
      boltPool,
      chainLightPool,
      onHit,
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
  }, [chainLightPool, pools, onRemove]);

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
      {InstancedBoltInstances}
      {InstancedRocketInstances}
      {reducedMotion ? null : InstancedTrailInstances}
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
