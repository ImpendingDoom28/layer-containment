import { FC, useRef, useEffect } from "react";
import { MeshStandardMaterialProps, useFrame } from "@react-three/fiber";
import type { Mesh, Group } from "three";

import { distance2D, normalize } from "../../utils/mathUtils";
import { getCssColorValue } from "../ui/lib/cssUtils";
import type {
  Projectile as ProjectileInstance,
  Enemy,
} from "../../core/types/game";
import type { Velocity } from "../../core/types/utils";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";
import {
  debugSelector,
  projectileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";

type ProjectileProps = {
  projectile: ProjectileInstance;
  enemies: Enemy[];
  onHit: (
    projectile: ProjectileInstance,
    targetEnemy: Enemy,
    currentTime: number
  ) => void;
  onRemove: (projectileId: number) => void;
  shouldStopProjectile: boolean;
};

export const Projectile: FC<ProjectileProps> = ({
  projectile,
  enemies,
  onHit,
  onRemove,
  shouldStopProjectile,
}) => {
  const projectileSize = useGameStore(projectileSizeSelector);
  const meshRef = useRef<Mesh>(null);
  const debugGroupRef = useRef<Group>(null);
  const velocityRef = useRef<Velocity | null>(null);
  const beamProcessedRef = useRef<number | null>(null);
  const beamElapsedTimeRef = useRef<number>(0);
  const enemiesByIdRef = useRef<Map<number, Enemy>>(new Map());
  const debug = useGameStore(debugSelector);
  const beamDuration = 0.15;
  const isBeam = projectile.projectileType === "beam";

  // Keep the current enemy index updated without re-running frame logic
  useEffect(() => {
    const nextEnemiesById = new Map<number, Enemy>();
    for (const enemy of enemies) {
      nextEnemiesById.set(enemy.id, enemy);
    }

    enemiesByIdRef.current = nextEnemiesById;
  }, [enemies]);

  // Handle beam instant hit - only process once per projectile ID
  useEffect(() => {
    if (
      isBeam &&
      projectile.pierceEnemyIds &&
      projectile.pierceEnemyIds.length > 0 &&
      beamProcessedRef.current !== projectile.id
    ) {
      beamProcessedRef.current = projectile.id;

      // Use the indexed ref so the one-time beam pass does not resubscribe
      projectile.pierceEnemyIds.forEach((enemyId) => {
        const enemy = enemiesByIdRef.current.get(enemyId);
        if (enemy) {
          if (enemy.health > 0) {
            onHit(projectile, enemy, 0);
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBeam, projectile.id, projectile.pierceEnemyIds]);

  // Initialize velocity on first frame
  useFrame(() => {
    if (!velocityRef.current && projectile && !isBeam) {
      const dx = projectile.targetX - projectile.startX;
      const dy = projectile.targetY - projectile.startY;
      const dz = projectile.targetZ - projectile.startZ;
      const dir = normalize(dx, dy, dz);
      velocityRef.current = {
        x: dir.x * projectile.speed,
        y: dir.y * projectile.speed,
        z: dir.z * projectile.speed,
      };
    }
  });

  useFrame((state, delta) => {
    if (!projectile) return;

    if (isBeam) {
      if (meshRef.current) {
        const dx = projectile.targetX - projectile.startX;
        const dy = projectile.targetY - projectile.startY;
        const dz = projectile.targetZ - projectile.startZ;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const midX = (projectile.startX + projectile.targetX) / 2;
        const midY = (projectile.startY + projectile.targetY) / 2;
        const midZ = (projectile.startZ + projectile.targetZ) / 2;

        meshRef.current.position.set(midX, midY, midZ);
        meshRef.current.scale.y = length;

        if (length > 0) {
          meshRef.current.lookAt(
            projectile.targetX,
            projectile.targetY,
            projectile.targetZ
          );
          meshRef.current.rotateX(Math.PI / 2);
        }
      }

      // Track elapsed game time (only when not paused)
      if (!shouldStopProjectile) {
        beamElapsedTimeRef.current += delta;
        // Check if beam duration has elapsed
        if (beamElapsedTimeRef.current >= beamDuration) {
          onRemove(projectile.id);
        }
      }
      return;
    }

    if (!meshRef.current || !velocityRef.current) return;

    if (shouldStopProjectile) return;

    const currentTime = state.clock.elapsedTime;

    const newX = meshRef.current.position.x + velocityRef.current.x * delta;
    const newY = meshRef.current.position.y + velocityRef.current.y * delta;
    const newZ = meshRef.current.position.z + velocityRef.current.z * delta;

    meshRef.current.position.set(newX, newY, newZ);

    if (debug && debugGroupRef.current) {
      debugGroupRef.current.position.set(newX, newY, newZ);
    }

    // Check collision with target enemy (use ref to avoid stale closure)
    const targetEnemy = enemiesByIdRef.current.get(projectile.targetId);

    if (!targetEnemy || targetEnemy.health <= 0) {
      onRemove(projectile.id);
      return;
    }

    // Check if projectile reached target
    const distToTarget = distance2D(newX, newZ, targetEnemy.x, targetEnemy.z);

    if (distToTarget < 0.3) {
      // Hit threshold
      // Handle hit
      onHit(projectile, targetEnemy, currentTime);
      onRemove(projectile.id);
      return;
    }

    // Check if projectile went too far (missed)
    const distFromStart = distance2D(
      projectile.startX,
      projectile.startZ,
      newX,
      newZ
    );

    if (distFromStart > projectile.range * 1.5) {
      onRemove(projectile.id);
    }
  });

  if (!projectile) return null;

  let projectilePosition: [number, number, number] = [
    projectile.startX,
    projectile.startY,
    projectile.startZ,
  ];
  const fallbackColor = getCssColorValue("scene-white");
  const projectileMaterialProps: MeshStandardMaterialProps = {
    color: projectile.color || fallbackColor,
    emissive: projectile.color || fallbackColor,
    emissiveIntensity: 0.8,
  };
  const debugInfoOffsetY = projectileSize + 0.3;

  if (isBeam) {
    const midX = (projectile.startX + projectile.targetX) / 2;
    const midY = (projectile.startY + projectile.targetY) / 2;
    const midZ = (projectile.startZ + projectile.targetZ) / 2;

    projectilePosition = [midX, midY, midZ];
    projectileMaterialProps.emissiveIntensity = 1.5;
    projectileMaterialProps.transparent = true;
    projectileMaterialProps.opacity = 0.9;
  }

  return (
    <>
      <mesh ref={meshRef} position={projectilePosition}>
        {isBeam ? (
          <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
        ) : (
          <sphereGeometry args={[projectileSize, 8, 8]} />
        )}
        <meshStandardMaterial {...projectileMaterialProps} />
      </mesh>
      <group ref={debugGroupRef} position={projectilePosition}>
        <GUIDebugInfo entity={projectile} offsetY={debugInfoOffsetY} />
      </group>
    </>
  );
};
