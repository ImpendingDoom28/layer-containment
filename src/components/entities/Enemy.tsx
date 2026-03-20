import { FC, useRef, useEffect, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import type { Group, Mesh } from "three";

import {
  getPositionAlongMultiplePaths,
  isAtPathEnd,
} from "../../utils/pathUtils";
import { getCssColorValue } from "../ui/lib/cssUtils";
import type {
  Enemy as EnemyInstance,
  EnemyUpgradeId,
} from "../../core/types/game";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";
import {
  pathWaypointsSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  enemyUpgradesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";

type UpgradeIndicatorProps = {
  enemySize: number;
  upgrades: EnemyUpgradeId[];
  shouldStopMovement: boolean;
};

const UpgradeIndicator: FC<UpgradeIndicatorProps> = ({
  enemySize,
  upgrades,
  shouldStopMovement,
}) => {
  const enemyUpgrades = useGameStore(enemyUpgradesSelector);
  const ringRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (shouldStopMovement) return;
    const time = state.clock.elapsedTime;

    if (ringRef.current) {
      ringRef.current.rotation.y = time * 1.5;
      const pulse = Math.sin(time * 2) * 0.05 + 1;
      ringRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  if (!enemyUpgrades || upgrades.length === 0) return null;

  // Get the primary upgrade color (first upgrade)
  const primaryUpgrade = enemyUpgrades[upgrades[0]];
  const primaryColor = primaryUpgrade?.indicatorColor ?? getCssColorValue("scene-white");

  return (
    <group position={[0, enemySize * 0.3, 0]}>
      {/* Ring for each upgrade, stacked vertically */}
      {upgrades.map((upgradeId, index) => {
        const upgrade = enemyUpgrades[upgradeId];
        if (!upgrade) return null;

        return (
          <mesh
            key={upgradeId}
            ref={index === 0 ? ringRef : undefined}
            position={[0, index * 0.15, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <torusGeometry
              args={[enemySize * (1.1 + index * 0.15), 0.02, 8, 24]}
            />
            <meshStandardMaterial
              color={upgrade.indicatorColor}
              emissive={upgrade.indicatorColor}
              emissiveIntensity={0.5}
              transparent
              opacity={0.7}
            />
          </mesh>
        );
      })}

      {/* Central glow effect */}
      <pointLight
        color={primaryColor}
        intensity={0.3}
        distance={enemySize * 2}
        decay={2}
      />
    </group>
  );
};

type SlowEffectProps = {
  enemySize: number;
  shouldStopMovement: boolean;
};

const SlowEffect: FC<SlowEffectProps> = ({ enemySize, shouldStopMovement }) => {
  const ringRef = useRef<Mesh>(null);
  const particlesRef = useRef<(Mesh | null)[]>([]);

  useFrame((state) => {
    if (shouldStopMovement) return;

    const time = state.clock.elapsedTime;

    // Animate rotating ring
    if (ringRef.current) {
      ringRef.current.rotation.y = time * 2;
      const pulse = Math.sin(time * 3) * 0.1 + 1;
      ringRef.current.scale.set(pulse, pulse, pulse);
    }

    // Animate floating particles
    particlesRef.current.forEach((particle, index) => {
      if (!particle) return;
      const angle = (index / particlesRef.current.length) * Math.PI * 2 + time;
      const radius = enemySize * 1.3;
      particle.position.x = Math.cos(angle) * radius;
      particle.position.z = Math.sin(angle) * radius;
      particle.position.y = Math.sin(time * 2 + index) * 0.2;
    });
  });

  useEffect(() => {
    particlesRef.current = Array.from({ length: 6 }, () => null);
  }, []);

  const slowColor = getCssColorValue("scene-slow");

  return (
    <group position={[0, enemySize / 2, 0]}>
      {/* Rotating ring around enemy */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[enemySize * 1.25, 0.03, 8, 32]} />
        <meshStandardMaterial
          color={slowColor}
          emissive={slowColor}
          emissiveIntensity={0.3}
          transparent
          opacity={0.5}
        />
      </mesh>

      {/* Floating particles */}
      {particlesRef.current.map((_, index) => (
        <mesh
          key={`slow-particle-${index}`}
          ref={(el) => {
            if (el) particlesRef.current[index] = el;
          }}
        >
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial
            color={slowColor}
            emissive={slowColor}
            emissiveIntensity={1}
            transparent
            opacity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
};

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

export const Enemy: FC<EnemyProps> = ({
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
        <UpgradeIndicator
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
            <boxGeometry args={[enemy.size * 2 * healthPercent, 0.08, 0.06]} />
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
};
