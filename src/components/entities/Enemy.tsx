import { FC, useRef, useEffect, useState, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import type { Group } from "three";

import {
  getPositionAlongMultiplePaths,
  isAtPathEnd,
} from "../../utils/pathUtils";
import { getCssColorValue } from "../ui/lib/cssUtils";
import type { Enemy as EnemyInstance } from "../../core/types/game";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";
import {
  pathWaypointsSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { UpgradeEffect } from "./effects/UpgradeEffect";
import { SlowEffect } from "./effects/SlowEffect";

type EnemyProps = {
  enemy: EnemyInstance;
  shouldStopMovement: boolean;
  onReachEnd: ((enemyId: number) => void) | null;
  onUpdate: ((enemyId: number, updates: Partial<EnemyInstance>) => void) | null;
  onSpawnEffect:
    | ((position: [number, number, number], color: string) => void)
    | null;
  onEndEffect:
    | ((position: [number, number, number], color: string) => void)
    | null;
  debug?: boolean;
};

export const Enemy: FC<EnemyProps> = memo(
  ({
    enemy,
    onReachEnd,
    onUpdate,
    onSpawnEffect,
    onEndEffect,
    shouldStopMovement,
    debug = false,
  }) => {
    const pathWaypoints = useLevelStore(pathWaypointsSelector);

    const meshRef = useRef<Group>(null);
    const hasTriggeredSpawnEffect = useRef(false);
    const hasReachedEnd = useRef(false);
    const [isSlowed, setIsSlowed] = useState(false);
    const isSlowedRef = useRef(false);
    const pauseDurationRef = useRef<number>(0);
    const lastPausedTimeRef = useRef<number | null>(null);
    const previousShouldStopMovementRef = useRef<boolean>(shouldStopMovement);

    // Trigger spawn effect when enemy first appears
    useEffect(() => {
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
        onSpawnEffect(
          [spawnPosition.x, spawnPosition.y + 0.1, spawnPosition.z],
          enemy.color
        );
        hasTriggeredSpawnEffect.current = true;
      }
    }, [enemy, onSpawnEffect, pathWaypoints]);

    useFrame((state, delta) => {
      if (!enemy || enemy.health <= 0) return;

      const now = state.clock.elapsedTime;

      // Track pause duration to adjust slow effect timing
      const wasPaused = previousShouldStopMovementRef.current;
      const isPaused = shouldStopMovement;

      if (!wasPaused && isPaused) {
        // Just paused - record the pause start time
        lastPausedTimeRef.current = now;
      } else if (wasPaused && !isPaused && lastPausedTimeRef.current !== null) {
        // Just unpaused - add the pause duration to total
        const pauseDuration = now - lastPausedTimeRef.current;
        pauseDurationRef.current += pauseDuration;
        lastPausedTimeRef.current = null;
      }

      previousShouldStopMovementRef.current = isPaused;

      if (shouldStopMovement) {
        // Still check slow effect even when paused, but don't update movement
        // Account for current pause duration if still paused
        const currentPauseDuration =
          lastPausedTimeRef.current !== null
            ? now - lastPausedTimeRef.current
            : 0;
        const adjustedTime =
          now - pauseDurationRef.current - currentPauseDuration;
        const currentlySlowed =
          enemy.slowUntil > 0 &&
          enemy.slowUntil > adjustedTime &&
          enemy.slowMultiplier < 1;
        // Only trigger React update if value changed
        if (isSlowedRef.current !== currentlySlowed) {
          isSlowedRef.current = currentlySlowed;
          setIsSlowed(currentlySlowed);
        }
        return;
      }

      // Calculate effective speed (accounting for slow debuff)
      let effectiveSpeed = enemy.speed;

      // Check if slow debuff is still active
      // slowUntil is stored as elapsed time when debuff expires
      // Subtract pause duration to account for time spent paused
      const adjustedTime = now - pauseDurationRef.current;
      const currentlySlowed =
        enemy.slowUntil > 0 &&
        enemy.slowUntil > adjustedTime &&
        enemy.slowMultiplier < 1;
      // Only trigger React update if value changed
      if (isSlowedRef.current !== currentlySlowed) {
        isSlowedRef.current = currentlySlowed;
        setIsSlowed(currentlySlowed);
      }

      if (currentlySlowed) {
        effectiveSpeed *= enemy.slowMultiplier;
      } else if (enemy.slowMultiplier < 1) {
        onUpdate?.(enemy.id, { slowMultiplier: 1, slowUntil: 0 });
      }

      // Update path progress
      const progressDelta = (effectiveSpeed * delta) / 20; // Adjust divisor for path length scaling
      const newProgress = enemy.pathProgress + progressDelta;

      // Check if reached end
      if (isAtPathEnd(newProgress)) {
        if (!hasReachedEnd.current && onEndEffect) {
          const endPosition = getPositionAlongMultiplePaths(
            pathWaypoints,
            enemy.pathIndex,
            1
          );
          onEndEffect(
            [endPosition.x, endPosition.y + 0.1, endPosition.z],
            enemy.color
          );
          hasReachedEnd.current = true;
        }
        onReachEnd?.(enemy.id);
        return;
      }

      // Get position along path
      const position = getPositionAlongMultiplePaths(
        pathWaypoints,
        enemy.pathIndex,
        newProgress
      );

      // Update enemy position
      if (meshRef.current) {
        meshRef.current.position.set(
          position.x,
          position.y + enemy.size / 2,
          position.z
        );
      }

      // Apply regeneration if enemy has it
      if (
        enemy.regeneration &&
        enemy.regeneration > 0 &&
        enemy.health < enemy.maxHealth
      ) {
        const healAmount = enemy.regeneration * delta;
        const newHealth = Math.min(enemy.maxHealth, enemy.health + healAmount);
        onUpdate?.(enemy.id, {
          pathProgress: newProgress,
          x: position.x,
          z: position.z,
          health: newHealth,
        });
      } else {
        // Update enemy state
        onUpdate?.(enemy.id, {
          pathProgress: newProgress,
          x: position.x,
          z: position.z,
        });
      }
    });

    // Get initial position from enemy state
    const initialPosition = useMemo(
      () =>
        getPositionAlongMultiplePaths(
          pathWaypoints,
          enemy.pathIndex,
          enemy.pathProgress
        ),
      [enemy.pathProgress, enemy.pathIndex, pathWaypoints]
    );

    if (!enemy || enemy.health <= 0) return null;

    // Calculate health percentage for visual
    const healthPercent = enemy.health / enemy.maxHealth;

    return (
      <group
        ref={meshRef}
        position={[
          initialPosition.x,
          initialPosition.y + enemy.size / 2,
          initialPosition.z,
        ]}
      >
        {/* Upgrade indicators */}
        {enemy.upgrades && enemy.upgrades.length > 0 && (
          <UpgradeEffect
            enemySize={enemy.size}
            upgrades={enemy.upgrades}
            shouldStopMovement={shouldStopMovement}
          />
        )}

        {/* Slow effect indicator */}
        {isSlowed && (
          <SlowEffect
            enemySize={enemy.size}
            shouldStopMovement={shouldStopMovement}
          />
        )}

        {/* Enemy body */}
        <mesh position={[0, enemy.size / 2, 0]}>
          <sphereGeometry args={[enemy.size, 16, 16]} />
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
