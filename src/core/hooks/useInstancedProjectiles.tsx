/**
 * React Three Fiber Hook for Instanced Projectile Rendering
 *
 * Manages projectile rendering using R3F's instancedMesh for maximum
 * performance (single draw call for sphere projectiles, one for beams).
 *
 * Integrates with the game's Projectile type and existing systems.
 */

import { FC, useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import {
  createPoolController,
  InstancedPoolRef,
  InstancedPoolStats,
} from "../../utils/InstancedPool";
import { getCssColorValue } from "../../components/ui/lib/cssUtils";
import type { Projectile, Enemy } from "../types/game";
import { distance2D } from "../../utils/mathUtils";
import { useNextId } from "./utils/useNextId";

// Reusable objects to avoid GC pressure in fireProjectile
const tempDirection = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();
const tempUpVector = new THREE.Vector3(0, 1, 0);
const tempPosition = new THREE.Vector3();
const tempScale = new THREE.Vector3();

type PooledProjectile = Projectile & {
  instanceIndex: number;
  isBeam: boolean;
  currentX: number;
  currentY: number;
  currentZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  beamElapsedTime: number;
  beamProcessed: boolean;
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
  isPaused: boolean;
};

type InstancedProjectilesReturn = {
  InstancedProjectiles: FC;
  fireProjectile: (params: FireProjectileParams) => Projectile;
  clearAllProjectiles: () => void;
  getActiveProjectiles: () => PooledProjectile[];
  getStats: () => {
    spheres: InstancedPoolStats | null;
    beams: InstancedPoolStats | null;
  };
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
    isPaused,
  } = config;

  const sphereMeshRef =
    useRef<
      THREE.InstancedMesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>
    >(null);
  const beamMeshRef =
    useRef<
      THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>
    >(null);
  const spherePoolRef = useRef<InstancedPoolRef | null>(null);
  const beamPoolRef = useRef<InstancedPoolRef | null>(null);
  const projectilesRef = useRef<Map<number, PooledProjectile>>(new Map());
  const isInitializedRef = useRef(false);
  const enemiesByIdRef = useRef<Map<number, Enemy>>(new Map());
  // Reusable array to avoid GC pressure in updateProjectilesFrame
  const toRemoveRef = useRef<number[]>([]);

  const getNextProjectileId = useNextId();

  useEffect(() => {
    const nextEnemiesById = new Map<number, Enemy>();
    for (const enemy of enemies) {
      nextEnemiesById.set(enemy.id, enemy);
    }

    enemiesByIdRef.current = nextEnemiesById;
  }, [enemies]);

  const initializePools = useCallback(() => {
    if (isInitializedRef.current) return;

    if (sphereMeshRef.current) {
      spherePoolRef.current = createPoolController(
        sphereMeshRef,
        maxProjectiles
      );

      const mesh = sphereMeshRef.current;
      const tempMatrix = new THREE.Matrix4();
      const hiddenPos = new THREE.Vector3(0, -10000, 0);
      const defaultQuat = new THREE.Quaternion();
      const zeroScale = new THREE.Vector3(0, 0, 0);
      tempMatrix.compose(hiddenPos, defaultQuat, zeroScale);

      for (let i = 0; i < maxProjectiles; i++) {
        mesh.setMatrixAt(i, tempMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = 0;
    }

    if (beamMeshRef.current) {
      beamPoolRef.current = createPoolController(beamMeshRef, maxBeams);

      const mesh = beamMeshRef.current;
      const tempMatrix = new THREE.Matrix4();
      const hiddenPos = new THREE.Vector3(0, -10000, 0);
      const defaultQuat = new THREE.Quaternion();
      const zeroScale = new THREE.Vector3(0, 0, 0);
      tempMatrix.compose(hiddenPos, defaultQuat, zeroScale);

      for (let i = 0; i < maxBeams; i++) {
        mesh.setMatrixAt(i, tempMatrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = 0;
    }

    isInitializedRef.current = true;
  }, [maxProjectiles, maxBeams]);

  useEffect(() => {
    const projectilesRefCurrent = projectilesRef.current;

    return () => {
      projectilesRefCurrent.clear();
      isInitializedRef.current = false;
      getNextProjectileId(true);
    };
  }, [getNextProjectileId]);

  const removeProjectile = useCallback(
    (projectileId: number): void => {
      const projectile = projectilesRef.current.get(projectileId);
      if (!projectile) return;

      projectilesRef.current.delete(projectileId);

      if (projectile.isBeam) {
        beamPoolRef.current?.release(projectile.instanceIndex);
      } else {
        spherePoolRef.current?.release(projectile.instanceIndex);
      }

      onRemove(projectileId);
    },
    [onRemove]
  );

  const fireProjectile = useCallback(
    (params: FireProjectileParams): Projectile => {
      const isBeam = params.projectileType === "beam";
      const pool = isBeam ? beamPoolRef.current : spherePoolRef.current;

      if (!pool) {
        console.warn("InstancedProjectiles: Pool not initialized");
        return { ...params, id: -1 };
      }

      const index = pool.acquire();
      if (index === -1) {
        console.warn("InstancedProjectiles: Pool exhausted");
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
        isBeam,
        currentX: params.startX,
        currentY: params.startY,
        currentZ: params.startZ,
        velocityX,
        velocityY,
        velocityZ,
        beamElapsedTime: 0,
        beamProcessed: false,
      };

      projectilesRef.current.set(id, pooledProjectile);

      if (isBeam) {
        const midX = (params.startX + params.targetX) / 2;
        const midY = (params.startY + params.targetY) / 2;
        const midZ = (params.startZ + params.targetZ) / 2;

        tempDirection.set(dx, dy, dz).normalize();
        tempQuaternion.setFromUnitVectors(tempUpVector, tempDirection);
        tempPosition.set(midX, midY, midZ);
        tempScale.set(1, length, 1);

        pool.setTransform(index, tempPosition, tempQuaternion, tempScale);
      } else {
        pool.setPosition(index, params.startX, params.startY, params.startZ);
        pool.setScale(index, 1, 1, 1);
      }

      pool.setColor(index, color);

      return pooledProjectile;
    },
    [defaultColor, getNextProjectileId]
  );

  const updateProjectilesFrame = useCallback(
    (currentTime: number, delta: number): void => {
      if (isPaused) return;

      const toRemove = toRemoveRef.current;
      toRemove.length = 0;

      projectilesRef.current.forEach((projectile) => {
        if (projectile.isBeam) {
          if (
            !projectile.beamProcessed &&
            projectile.pierceEnemyIds &&
            projectile.pierceEnemyIds.length > 0
          ) {
            projectile.beamProcessed = true;

            projectile.pierceEnemyIds.forEach((enemyId) => {
              const enemy = enemiesByIdRef.current.get(enemyId);
              if (enemy) {
                if (enemy.health > 0) {
                  onHit(projectile, enemy, currentTime);
                }
              }
            });
          }

          projectile.beamElapsedTime += delta;
          if (projectile.beamElapsedTime >= beamDuration) {
            toRemove.push(projectile.id);
          }
        } else {
          projectile.currentX += projectile.velocityX * delta;
          projectile.currentY += projectile.velocityY * delta;
          projectile.currentZ += projectile.velocityZ * delta;

          spherePoolRef.current?.setPosition(
            projectile.instanceIndex,
            projectile.currentX,
            projectile.currentY,
            projectile.currentZ
          );

          const targetEnemy = enemiesByIdRef.current.get(projectile.targetId);

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
        }
      });

      for (const id of toRemove) {
        removeProjectile(id);
      }
    },
    [isPaused, beamDuration, hitThreshold, onHit, removeProjectile]
  );

  const clearAllProjectiles = useCallback((): void => {
    projectilesRef.current.forEach((projectile) => {
      onRemove(projectile.id);
    });
    projectilesRef.current.clear();
    spherePoolRef.current?.releaseAll();
    beamPoolRef.current?.releaseAll();
  }, [onRemove]);

  const getActiveProjectiles = useCallback((): PooledProjectile[] => {
    return Array.from(projectilesRef.current.values());
  }, []);

  const getStats = useCallback(
    () => ({
      spheres: spherePoolRef.current?.getStats() ?? null,
      beams: beamPoolRef.current?.getStats() ?? null,
    }),
    []
  );

  // Declared here because it's used only here
  const InstancedProjectiles: FC = useMemo(() => {
    const Component: FC = () => {
      useEffect(() => {
        initializePools();
      }, []);

      useFrame((state, delta) => {
        updateProjectilesFrame(state.clock.elapsedTime, delta);
      });

      return (
        <>
          <instancedMesh
            ref={sphereMeshRef}
            args={[undefined, undefined, maxProjectiles]}
            frustumCulled={false}
          >
            <sphereGeometry args={[projectileSize, 8, 8]} />
            <meshStandardMaterial
              color={defaultColor}
              emissive={defaultColor}
              emissiveIntensity={emissiveIntensity}
              toneMapped={false}
            />
          </instancedMesh>

          <instancedMesh
            ref={beamMeshRef}
            args={[undefined, undefined, maxBeams]}
            frustumCulled={false}
          >
            <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
            <meshStandardMaterial
              color={defaultColor}
              emissive={defaultColor}
              emissiveIntensity={beamEmissiveIntensity}
              transparent
              opacity={0.9}
              toneMapped={false}
            />
          </instancedMesh>
        </>
      );
    };

    Component.displayName = "InstancedProjectiles";
    return Component;
  }, [
    maxProjectiles,
    maxBeams,
    projectileSize,
    defaultColor,
    emissiveIntensity,
    beamEmissiveIntensity,
    initializePools,
    updateProjectilesFrame,
  ]);

  return {
    InstancedProjectiles,
    fireProjectile,
    clearAllProjectiles,
    getActiveProjectiles,
    getStats,
  };
};

export type {
  InstancedProjectilesConfig,
  InstancedProjectilesReturn,
  FireProjectileParams,
  PooledProjectile,
  InstancedPoolStats,
};
