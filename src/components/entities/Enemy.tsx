import {
  FC,
  useRef,
  useEffect,
  useState,
  useMemo,
  memo,
  useCallback,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { Quaternion, Vector3, type Group, type Mesh } from "three";
import type { Entity } from "koota";
import { useActions, useTrait } from "koota/react";

import {
  getPositionAlongMultiplePaths,
  isAtPathEnd,
} from "../../utils/pathUtils";
import { getCssColorValue } from "../ui/lib/cssUtils";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";
import { getShouldStopMovement } from "../../core/getShouldStopMovement";
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
import {
  createPauseClock,
  getEffectiveGameTime,
  stepPauseClock,
} from "../../utils/pauseClock";
import { enemyActions } from "../../core/ecs/actions/enemyActions";
import { EnemyState } from "../../core/ecs/traits/enemy";
import { MedicHealBurstEffect } from "./effects/MedicHealBurstEffect";
import { SlowEffect } from "./effects/SlowEffect";
import { UpgradeEffect } from "./effects/UpgradeEffect";

type EnemyProps = {
  entity: Entity;
  onReachEnd: ((enemyId: number) => void) | null;
  onSpawnEffect:
    | ((position: [number, number, number], color: string) => void)
    | null;
  onEndEffect:
    | ((position: [number, number, number], color: string) => void)
    | null;
  debug?: boolean;
};

export const Enemy: FC<EnemyProps> = memo(
  ({ entity, onReachEnd, onSpawnEffect, onEndEffect, debug = false }) => {
    const enemy = useTrait(entity, EnemyState);
    const actions = useActions(enemyActions);

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

    const shouldStopMovement = useGameStore((s) =>
      getShouldStopMovement(s.gameStatus, s.isPageVisible)
    );
    const shouldStopRef = useRef(shouldStopMovement);
    shouldStopRef.current = shouldStopMovement;

    const meshRef = useRef<Group>(null);
    const upgradeFirstRingRef = useRef<Mesh>(null);
    const hasTriggeredSpawnEffect = useRef(false);
    const hasReachedEnd = useRef(false);
    const [isSlowed, setIsSlowed] = useState(false);
    const isSlowedRef = useRef(false);
    const pauseClockRef = useRef(createPauseClock());
    const previousShouldStopMovementRef = useRef<boolean>(shouldStopMovement);

    useEffect(() => {
      if (!enemy) return;

      if (
        !hasTriggeredSpawnEffect.current &&
        onSpawnEffect &&
        enemy.pathProgress < 0.01
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
    }, [enemy, onSpawnEffect, pathWaypoints, radius]);

    useFrame((state, delta) => {
      const live = entity.get(EnemyState);
      if (!live || live.health <= 0) return;

      const now = state.clock.elapsedTime;

      const wasPaused = previousShouldStopMovementRef.current;
      const isPaused = shouldStopRef.current;

      stepPauseClock(pauseClockRef.current, now, isPaused, wasPaused);
      previousShouldStopMovementRef.current = isPaused;

      const adjustedTime = getEffectiveGameTime(now, pauseClockRef.current);

      if (
        !isPaused &&
        live.upgrades.length > 0 &&
        upgradeFirstRingRef.current
      ) {
        const time = state.clock.elapsedTime;
        upgradeFirstRingRef.current.rotation.y = time * 1.5;
        const pulse = Math.sin(time * 2) * 0.05 + 1;
        const baseRadius = live.size * 1.1;
        upgradeFirstRingRef.current.scale.setScalar(baseRadius * pulse);
      }

      if (isPaused) {
        const currentlySlowed =
          live.slowUntil > 0 &&
          live.slowUntil > adjustedTime &&
          live.slowMultiplier < 1;
        if (isSlowedRef.current !== currentlySlowed) {
          isSlowedRef.current = currentlySlowed;
          setIsSlowed(currentlySlowed);
        }
        return;
      }

      let effectiveSpeed = live.speed;

      const currentlySlowed =
        live.slowUntil > 0 &&
        live.slowUntil > adjustedTime &&
        live.slowMultiplier < 1;
      if (isSlowedRef.current !== currentlySlowed) {
        isSlowedRef.current = currentlySlowed;
        setIsSlowed(currentlySlowed);
      }

      if (currentlySlowed) {
        effectiveSpeed *= live.slowMultiplier;
      } else if (live.slowMultiplier < 1) {
        actions.updateEnemy(live.id, { slowMultiplier: 1, slowUntil: 0 });
      }

      const progressDelta = (effectiveSpeed * delta) / 20;
      const newProgress = live.pathProgress + progressDelta;

      if (isAtPathEnd(newProgress)) {
        if (!hasReachedEnd.current && onEndEffect) {
          const endPosition = getPositionAlongMultiplePaths(
            pathWaypoints,
            live.pathIndex,
            1
          );
          flatFieldToSphereSurface(
            endPosition.x,
            endPosition.z,
            radius,
            scratchSurface.current,
            scratchNormal.current
          );
          scratchGroupPos.current
            .copy(scratchSurface.current)
            .addScaledVector(scratchNormal.current, endPosition.y + 0.1);
          onEndEffect(
            [
              scratchGroupPos.current.x,
              scratchGroupPos.current.y,
              scratchGroupPos.current.z,
            ],
            live.color
          );
          hasReachedEnd.current = true;
        }
        onReachEnd?.(live.id);
        return;
      }

      const position = getPositionAlongMultiplePaths(
        pathWaypoints,
        live.pathIndex,
        newProgress
      );

      if (meshRef.current) {
        const footing = applySphereFooting(
          position.x,
          position.z,
          position.y,
          live.size / 2
        );
        meshRef.current.position.copy(footing.position);
        meshRef.current.quaternion.copy(footing.quaternion);
      }

      if (
        live.regeneration &&
        live.regeneration > 0 &&
        live.health < live.maxHealth
      ) {
        const healAmount = live.regeneration * delta;
        const newHealth = Math.min(live.maxHealth, live.health + healAmount);
        actions.updateEnemy(live.id, {
          pathProgress: newProgress,
          x: position.x,
          z: position.z,
          health: newHealth,
        });
      } else {
        actions.updateEnemy(live.id, {
          pathProgress: newProgress,
          x: position.x,
          z: position.z,
        });
      }
    });

    const initialFooting = useMemo(() => {
      if (!enemy) {
        return {
          position: new Vector3(),
          quaternion: new Quaternion(),
        };
      }

      const pos = getPositionAlongMultiplePaths(
        pathWaypoints,
        enemy.pathIndex,
        enemy.pathProgress
      );
      const r = getPlanetRadius(gridSize, tileSize);
      const { surfacePoint, normal } = flatFieldToSphereSurface(
        pos.x,
        pos.z,
        r
      );
      const p = surfacePoint
        .clone()
        .addScaledVector(normal, pos.y + enemy.size / 2);
      return { position: p, quaternion: getSurfaceQuaternion(normal) };
    }, [enemy, pathWaypoints, gridSize, tileSize]);

    if (!enemy || enemy.health <= 0) return null;

    const healthPercent = enemy.health / enemy.maxHealth;

    return (
      <group
        ref={meshRef}
        position={initialFooting.position}
        quaternion={initialFooting.quaternion}
      >
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
