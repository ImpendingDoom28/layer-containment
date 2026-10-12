import {
  FC,
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useMemo,
  memo,
  useCallback,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { Quaternion, Vector3, type Group, type Mesh } from "three";
import type { Entity } from "koota";
import { useTrait } from "koota/react";

import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import { getCssColorValue } from "../ui/lib/cssUtils";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";
import {
  gridSizeSelector,
  pathWaypointsSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { tileSizeSelector, useGameStore } from "../../core/stores/useGameStore";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import { EnemyMotion, EnemyState } from "../../core/ecs/traits/enemy";
import { EnemySlow } from "../../core/ecs/traits/slow";
import { Position } from "../../core/ecs/traits/position";
import type { GetSimulationTime } from "../../core/hooks/useSimulationClock";
import { MedicHealBurstEffect } from "./effects/MedicHealBurstEffect";
import { SlowEffect } from "./effects/SlowEffect";
import { UpgradeEffect } from "./effects/UpgradeEffect";

type EnemyProps = {
  entity: Entity;
  getSimulationTime: GetSimulationTime;
  shouldStopMovement: boolean;
  onSpawnEffect:
    ((position: [number, number, number], color: string) => void) | null;
  debug?: boolean;
};

export const Enemy: FC<EnemyProps> = memo(
  ({
    entity,
    getSimulationTime,
    shouldStopMovement,
    onSpawnEffect,
    debug = false,
  }) => {
    const enemy = useTrait(entity, EnemyState);

    const pathWaypoints = useLevelStore(pathWaypointsSelector);
    const gridSize = useLevelStore(gridSizeSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const radius = useMemo(
      () => getPlanetRadius(gridSize, tileSize),
      [gridSize, tileSize]
    );

    const scratchSurface = useRef(new Vector3());
    const scratchNormal = useRef(new Vector3());
    const scratchGroupPos = useRef(new Vector3());
    const scratchQuat = useRef(new Quaternion());

    const applySphereFooting = useCallback(
      (worldX: number, worldZ: number, pathY: number, halfHeight: number) => {
        flatFieldToSphereSurface(
          worldX,
          worldZ,
          radius,
          scratchSurface.current,
          scratchNormal.current
        );
        scratchGroupPos.current
          .copy(scratchSurface.current)
          .addScaledVector(scratchNormal.current, pathY + halfHeight);
        getSurfaceQuaternion(scratchNormal.current, scratchQuat.current);
        return {
          position: scratchGroupPos.current,
          quaternion: scratchQuat.current,
        };
      },
      [radius]
    );

    const meshRef = useRef<Group>(null);
    const upgradeFirstRingRef = useRef<Mesh>(null);
    const hasTriggeredSpawnEffect = useRef(false);
    const [isSlowed, setIsSlowed] = useState(false);
    const isSlowedRef = useRef(false);

    useEffect(() => {
      if (!enemy) return;

      const motionData = entity.get(EnemyMotion);
      if (
        !hasTriggeredSpawnEffect.current &&
        onSpawnEffect &&
        motionData &&
        motionData.pathProgress < 0.01
      ) {
        const spawnPosition = getPositionAlongMultiplePaths(
          pathWaypoints,
          enemy.pathIndex,
          0
        );
        flatFieldToSphereSurface(
          spawnPosition.x,
          spawnPosition.z,
          radius,
          scratchSurface.current,
          scratchNormal.current
        );
        scratchGroupPos.current
          .copy(scratchSurface.current)
          .addScaledVector(scratchNormal.current, spawnPosition.y + 0.1);
        onSpawnEffect(
          [
            scratchGroupPos.current.x,
            scratchGroupPos.current.y,
            scratchGroupPos.current.z,
          ],
          enemy.color
        );
        hasTriggeredSpawnEffect.current = true;
      }
    }, [enemy, entity, onSpawnEffect, pathWaypoints, radius]);

    useLayoutEffect(() => {
      const live = entity.get(EnemyState);
      const pos = entity.get(Position);
      if (!meshRef.current || !live || !pos || live.health <= 0) return;
      const footing = applySphereFooting(pos.x, pos.z, pos.y, live.size / 2);
      meshRef.current.position.copy(footing.position);
      meshRef.current.quaternion.copy(footing.quaternion);
    }, [entity, applySphereFooting]);

    useFrame((state) => {
      const live = entity.get(EnemyState);
      const pos = entity.get(Position);
      if (!live || !pos || live.health <= 0) return;

      // The movement system already advanced the position; this frame just
      // mirrors it onto the mesh (allocation-free via scratch vectors).
      if (meshRef.current) {
        const footing = applySphereFooting(pos.x, pos.z, pos.y, live.size / 2);
        meshRef.current.position.copy(footing.position);
        meshRef.current.quaternion.copy(footing.quaternion);
      }

      const now = state.clock.elapsedTime;
      const adjustedTime = getSimulationTime(now);

      if (
        !shouldStopMovement &&
        live.upgrades.length > 0 &&
        upgradeFirstRingRef.current
      ) {
        const time = state.clock.elapsedTime;
        upgradeFirstRingRef.current.rotation.y = time * 1.5;
        const pulse = Math.sin(time * 2) * 0.05 + 1;
        const baseRadius = live.size * 1.1;
        upgradeFirstRingRef.current.scale.setScalar(baseRadius * pulse);
      }

      // The enemy carries the EnemySlow trait only while a slow is in effect
      // (the ApplySlowSystem adds/removes it), so absence means full speed.
      const slow = entity.get(EnemySlow);
      const currentlySlowed =
        !!slow && slow.until > adjustedTime && slow.multiplier < 1;
      if (isSlowedRef.current !== currentlySlowed) {
        isSlowedRef.current = currentlySlowed;
        setIsSlowed(currentlySlowed);
      }
    });

    if (!enemy || enemy.health <= 0) return null;

    const healthPercent = enemy.health / enemy.maxHealth;

    return (
      <group ref={meshRef}>
        {/* Upgrade indicators */}
        {enemy.upgrades.length > 0 &&
          (enemy.upgradeIndicatorColors?.length ?? 0) > 0 && (
            <UpgradeEffect
              enemySize={enemy.size}
              indicatorColors={enemy.upgradeIndicatorColors!}
              firstRingRef={upgradeFirstRingRef}
            />
          )}

        {/* Slow effect indicator */}
        {isSlowed && (
          <SlowEffect
            enemySize={enemy.size}
            shouldStopMovement={shouldStopMovement}
          />
        )}

        {enemy.healPulse && (
          <MedicHealBurstEffect
            entity={entity}
            healPulse={enemy.healPulse}
            shouldStopMovement={shouldStopMovement}
            color={enemy.color}
          />
        )}

        {/* Enemy body */}
        <mesh position={[0, enemy.size / 2, 0]}>
          <sphereGeometry args={[enemy.size, 12, 12]} />
          <meshStandardMaterial
            color={enemy.color}
            emissive={enemy.color}
            emissiveIntensity={0.2}
          />
        </mesh>

        {/* Health bar - always faces camera */}
        <Billboard position={[0, enemy.size + 0.3, 0]}>
          <group>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[enemy.size * 2, 0.1, 0.05]} />
              <meshStandardMaterial color={getCssColorValue("scene-black")} />
            </mesh>
            <mesh position={[-(enemy.size * (1 - healthPercent)), 0, 0.01]}>
              <boxGeometry
                args={[enemy.size * 2 * healthPercent, 0.08, 0.06]}
              />
              <meshStandardMaterial
                color={
                  healthPercent > 0.5
                    ? getCssColorValue("scene-hp-high")
                    : healthPercent > 0.25
                      ? getCssColorValue("scene-hp-medium")
                      : getCssColorValue("scene-hp-low")
                }
              />
            </mesh>
          </group>
        </Billboard>

        {/* Debug info */}
        {debug && <GUIDebugInfo entity={enemy} offsetY={enemy.size + 0.7} />}
      </group>
    );
  }
);

Enemy.displayName = "Enemy";
