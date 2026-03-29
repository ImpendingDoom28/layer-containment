/**
 * React Three Fiber Hook for Instanced Projectile Rendering
 *
 * Manages projectile rendering using drei's <Instances>/<Instance> for
 * declarative instancing (single draw call per geometry type).
 *
 * Integrates with the game's Projectile type and existing systems.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { ReactElement } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import {
  InstancedPoolStats,
  type InstancedPoolRef,
} from "../../utils/InstancedPool";
import { patchEmissiveByInstanceColor } from "../../utils/instancedEmissivePatch";
import { getCssColorValue } from "../../components/ui/lib/cssUtils";
import type { ChainAdditionalHit } from "../chainLightning";
import type { Projectile, Enemy } from "../types/game";
import { distance2D } from "../../utils/mathUtils";
import { useEntityIds } from "../contexts/EntityIdContext";
import { useInstancedEntity } from "./useInstancedEntity";
import { getShouldStopMovement } from "../getShouldStopMovement";
import { useGameStore } from "../stores/useGameStore";

const CHAIN_BOLT_RADIUS = 0.03;
const CHAIN_BOLT_LENGTH = 0.5;
const CHAIN_BOLT_EMISSIVE_INTENSITY = 2;

const tempDirection = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempUpVector = new THREE.Vector3(0, 1, 0);
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();

type VisualPoolKind = "sphere" | "beam" | "bolt";

const resolveVisualPool = (
  projectileType: Projectile["projectileType"]
): VisualPoolKind => {
  if (projectileType === "beam") return "beam";
  if (projectileType === "chain") return "bolt";
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

const applyChainBoltTransform = (
  pool: InstancedPoolRef | null,
  index: number,
  k: ChainBoltKinematics
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
};

type PooledProjectile = Projectile & {
  instanceIndex: number;
  visualPool: VisualPoolKind;
  currentX: number;
  currentY: number;
  currentZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  beamElapsedTime: number;
  beamProcessed: boolean;
  /** Remaining chain hops (primary target is separate); only used for chain bolts. */
  chainQueue?: ChainAdditionalHit[];
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
  enemiesById: Map<number, Enemy>
): boolean => {
  if (!projectile.chainQueue?.length) return false;
  const nextHop = projectile.chainQueue.shift()!;
  const nextEnemy = enemiesById.get(nextHop.enemyId);
  if (!nextEnemy || nextEnemy.health <= 0) return false;

  projectile.targetId = nextHop.enemyId;
  projectile.damage = nextHop.damage;
  const hitY = struckEnemy.size / 2;
  projectile.currentX = struckEnemy.x;
  projectile.currentY = hitY;
  projectile.currentZ = struckEnemy.z;
  projectile.startX = struckEnemy.x;
  projectile.startY = hitY;
  projectile.startZ = struckEnemy.z;
  projectile.targetX = nextEnemy.x;
  projectile.targetY = nextEnemy.size / 2;
  projectile.targetZ = nextEnemy.z;
  setBoltVelocityTowards(
    projectile,
    nextEnemy.x,
    nextEnemy.size / 2,
    nextEnemy.z
  );
  applyChainBoltTransform(boltPool, projectile.instanceIndex, {
    x: projectile.currentX,
    y: projectile.currentY,
    z: projectile.currentZ,
    vx: projectile.velocityX,
    vy: projectile.velocityY,
    vz: projectile.velocityZ,
  });
  return true;
};

type NonBeamStepContext = {
  delta: number;
  currentTime: number;
  boltPool: InstancedPoolRef | null;
  spherePool: InstancedPoolRef | null;
  enemiesById: Map<number, Enemy>;
  hitThreshold: number;
  onHit: (p: Projectile, e: Enemy, t: number) => void;
  toRemove: number[];
};

const stepNonBeamProjectile = (
  projectile: PooledProjectile,
  ctx: NonBeamStepContext
): void => {
  const {
    delta,
    currentTime,
    boltPool,
    spherePool,
    enemiesById,
    hitThreshold,
    onHit,
    toRemove,
  } = ctx;

  projectile.currentX += projectile.velocityX * delta;
  projectile.currentY += projectile.velocityY * delta;
  projectile.currentZ += projectile.velocityZ * delta;

  if (projectile.visualPool === "bolt") {
    applyChainBoltTransform(boltPool, projectile.instanceIndex, {
      x: projectile.currentX,
      y: projectile.currentY,
      z: projectile.currentZ,
      vx: projectile.velocityX,
      vy: projectile.velocityY,
      vz: projectile.velocityZ,
    });
  } else {
    spherePool?.setPosition(
      projectile.instanceIndex,
      projectile.currentX,
      projectile.currentY,
      projectile.currentZ
    );
  }

  const targetEnemy = enemiesById.get(projectile.targetId);

  if (!targetEnemy || targetEnemy.health <= 0) {
    toRemove.push(projectile.id);
    return;
  }

  const distToTarget = distance2D(
    projectile.currentX,
    projectile.currentZ,
    targetEnemy.x,
    targetEnemy.z
  );

  if (distToTarget < hitThreshold) {
    onHit(projectile, targetEnemy, currentTime);

    if (
      projectile.visualPool === "bolt" &&
      tryContinueChainBoltAfterHit(
        projectile,
        targetEnemy,
        boltPool,
        enemiesById
      )
    ) {
      return;
    }

    toRemove.push(projectile.id);
    return;
  }

  const distFromStart = distance2D(
    projectile.startX,
    projectile.startZ,
    projectile.currentX,
    projectile.currentZ
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
  enemies: Enemy[];
  onHit: (projectile: Projectile, enemy: Enemy, currentTime: number) => void;
  onRemove: (projectileId: number) => void;
};

type InstancedProjectilesReturn = {
  InstancedProjectiles: ReactElement;
  fireProjectile: (params: FireProjectileParams) => Projectile;
  clearAllProjectiles: () => void;
  getActiveProjectiles: () => PooledProjectile[];
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
    enemies,
    onHit,
    onRemove,
  } = config;

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
        <cylinderGeometry
          args={[CHAIN_BOLT_RADIUS, CHAIN_BOLT_RADIUS, 1, 8]}
        />
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

  const { pool: spherePool, InstancedEntity: InstancedSphereInstances } =
    useInstancedEntity({
      limit: maxProjectiles,
      defaultColor,
      frustumCulled: false,
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
      instancesContent: boltInstancesContent,
    });

  const projectilesRef = useRef<Map<number, PooledProjectile>>(new Map());
  const enemiesByIdRef = useRef<Map<number, Enemy>>(new Map());
  const toRemoveRef = useRef<number[]>([]);

  const { getNextProjectileId } = useEntityIds();

  useLayoutEffect(() => {
    const nextEnemiesById = new Map<number, Enemy>();
    for (const enemy of enemies) {
      nextEnemiesById.set(enemy.id, enemy);
    }

    enemiesByIdRef.current = nextEnemiesById;
  }, [enemies]);

  useEffect(() => {
    const projectilesRefCurrent = projectilesRef.current;

    return () => {
      projectilesRefCurrent.clear();
      getNextProjectileId(true);
    };
  }, [getNextProjectileId]);

  const removeProjectile = useCallback(
    (projectileId: number): void => {
      const projectile = projectilesRef.current.get(projectileId);
      if (!projectile) return;

      projectilesRef.current.delete(projectileId);

      if (projectile.visualPool === "beam") {
        beamPool?.release(projectile.instanceIndex);
      } else if (projectile.visualPool === "bolt") {
        boltPool?.release(projectile.instanceIndex);
      } else {
        spherePool?.release(projectile.instanceIndex);
      }

      onRemove(projectileId);
    },
    [beamPool, boltPool, onRemove, spherePool]
  );

  const fireProjectile = useCallback(
    (params: FireProjectileParams): Projectile => {
      const visualPool = resolveVisualPool(params.projectileType);

      let pool: InstancedPoolRef | null = null;
      if (visualPool === "beam") pool = beamPool;
      else if (visualPool === "bolt") pool = boltPool;
      else pool = spherePool;

      if (!pool) {
        console.warn("InstancedProjectiles: Pool not initialized");
        return { ...params, id: -1 };
      }

      const index = pool.acquire();
      if (index === -1) {
        return { ...params, id: -1 };
      }

      const id = getNextProjectileId();
      const color = params.color ?? defaultColor;

      const dx = params.targetX - params.startX;
      const dy = params.targetY - params.startY;
      const dz = params.targetZ - params.startZ;
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const velocityX = length > 0 ? (dx / length) * params.speed : 0;
      const velocityY = length > 0 ? (dy / length) * params.speed : 0;
      const velocityZ = length > 0 ? (dz / length) * params.speed : 0;

      const pooledProjectile: PooledProjectile = {
        ...params,
        id,
        instanceIndex: index,
        visualPool,
        currentX: params.startX,
        currentY: params.startY,
        currentZ: params.startZ,
        velocityX,
        velocityY,
        velocityZ,
        beamElapsedTime: 0,
        beamProcessed: false,
        chainQueue:
          visualPool === "bolt"
            ? [...(params.chainAdditionalHits ?? [])]
            : undefined,
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
        applyChainBoltTransform(pool, index, {
          x: params.startX,
          y: params.startY,
          z: params.startZ,
          vx: velocityX,
          vy: velocityY,
          vz: velocityZ,
        });
      } else {
        pool.setPosition(index, params.startX, params.startY, params.startZ);
        pool.setScale(index, 1, 1, 1);
      }

      pool.setColor(index, color);

      return pooledProjectile;
    },
    [beamPool, boltPool, defaultColor, getNextProjectileId, spherePool]
  );

  const updateProjectilesFrame = useCallback(
    (currentTime: number, delta: number): void => {
      const toRemove = toRemoveRef.current;
      toRemove.length = 0;

      projectilesRef.current.forEach((projectile) => {
        if (projectile.visualPool === "beam") {
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
        } else {
          stepNonBeamProjectile(projectile, {
            delta,
            currentTime,
            boltPool,
            spherePool,
            enemiesById: enemiesByIdRef.current,
            hitThreshold,
            onHit,
            toRemove,
          });
        }
      });

      for (const id of toRemove) {
        removeProjectile(id);
      }
    },
    [beamDuration, boltPool, onHit, spherePool, hitThreshold, removeProjectile]
  );

  const clearAllProjectiles = useCallback((): void => {
    projectilesRef.current.forEach((projectile) => {
      onRemove(projectile.id);
    });
    projectilesRef.current.clear();
    spherePool?.releaseAll();
    beamPool?.releaseAll();
    boltPool?.releaseAll();
  }, [beamPool, boltPool, onRemove, spherePool]);

  const getActiveProjectiles = useCallback((): PooledProjectile[] => {
    return Array.from(projectilesRef.current.values());
  }, []);

  useFrame((state, delta) => {
    const { gameStatus, isPageVisible } = useGameStore.getState();
    if (getShouldStopMovement(gameStatus, isPageVisible)) return;
    updateProjectilesFrame(state.clock.elapsedTime, delta);
  });

  const InstancedProjectiles = (
    <>
      {InstancedSphereInstances}
      {InstancedBeamInstances}
      {InstancedBoltInstances}
    </>
  );

  return {
    InstancedProjectiles,
    fireProjectile,
    clearAllProjectiles,
    getActiveProjectiles,
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
