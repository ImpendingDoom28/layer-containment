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
import {
  BoxGeometry,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import type { Entity } from "koota";

import { getPositionAlongMultiplePathsFast } from "../../utils/pathIndex";
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

// Shared, never-disposed resources: the body is a unit sphere scaled per
// enemy, the health bar a unit box, and materials are cached per color/tier.
// The previous per-enemy geometry + per-render JSX args allocated new GPU
// buffers on every health change, which at peak waves (183 concurrent
// enemies under fire) was the last significant per-frame cost.
const sharedUnitSphere = new SphereGeometry(1, 12, 12);
const sharedUnitBox = new BoxGeometry(1, 1, 1);
const sharedBlackBarMaterial = new MeshStandardMaterial({
  color: getCssColorValue("scene-black"),
});

const enemyBodyMaterialCache = new Map<string, MeshStandardMaterial>();
const getEnemyBodyMaterial = (color: string): MeshStandardMaterial => {
  let material = enemyBodyMaterialCache.get(color);
  if (!material) {
    material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.2,
    });
    enemyBodyMaterialCache.set(color, material);
  }
  return material;
};

const healthTierMaterials = {
  high: new MeshStandardMaterial({ color: getCssColorValue("scene-hp-high") }),
  medium: new MeshStandardMaterial({
    color: getCssColorValue("scene-hp-medium"),
  }),
  low: new MeshStandardMaterial({ color: getCssColorValue("scene-hp-low") }),
} as const;

const HEALTH_TIER_ORDER = ["low", "medium", "high"] as const;
type HealthTier = (typeof HEALTH_TIER_ORDER)[number];

const getHealthTier = (percent: number): HealthTier =>
  percent > 0.5 ? "high" : percent > 0.25 ? "medium" : "low";

export const Enemy: FC<EnemyProps> = memo(
  ({
    entity,
    getSimulationTime,
    shouldStopMovement,
    onSpawnEffect,
    debug = false,
  }) => {
    // Read the cold state once at mount: every field the JSX uses
    // (size, color, upgrades, healPulse, maxHealth) is set at spawn and never
    // mutated afterwards — only health changes over the enemy's lifetime, and
    // that is handled imperatively in useFrame below instead of through a
    // `useTrait` re-render on every hit.
    const [snapshot] = useState(() => entity.get(EnemyState));

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
    const fillBarRef = useRef<Mesh>(null);
    const healthTierRef = useRef<HealthTier>("high");
    const upgradeFirstRingRef = useRef<Mesh>(null);
    const hasTriggeredSpawnEffect = useRef(false);
    const [isSlowed, setIsSlowed] = useState(false);
    const isSlowedRef = useRef(false);

    const size = snapshot?.size ?? 0;

    useEffect(() => {
      if (!snapshot) return;

      const motionData = entity.get(EnemyMotion);
      if (
        !hasTriggeredSpawnEffect.current &&
        onSpawnEffect &&
        motionData &&
        motionData.pathProgress < 0.01
      ) {
        const spawnPosition = getPositionAlongMultiplePathsFast(
          pathWaypoints,
          snapshot.pathIndex,
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
          snapshot.color
        );
        hasTriggeredSpawnEffect.current = true;
      }
    }, [snapshot, entity, onSpawnEffect, pathWaypoints, radius]);

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

      // Imperative health bar: scale the shared unit box instead of
      // re-rendering JSX with new geometry args on every hit.
      const fillBar = fillBarRef.current;
      if (fillBar) {
        const percent = Math.max(0, Math.min(1, live.health / live.maxHealth));
        fillBar.scale.set(size * 2 * percent, 0.08, 0.06);
        fillBar.position.set(-size * (1 - percent), 0, 0.01);
        const tier = getHealthTier(percent);
        if (healthTierRef.current !== tier) {
          healthTierRef.current = tier;
          fillBar.material = healthTierMaterials[tier];
        }
      }

      const now = state.clock.elapsedTime;
      const adjustedTime = getSimulationTime(now);

      if (
        !shouldStopMovement &&
        (snapshot?.upgrades.length ?? 0) > 0 &&
        upgradeFirstRingRef.current
      ) {
        const time = state.clock.elapsedTime;
        upgradeFirstRingRef.current.rotation.y = time * 1.5;
        const pulse = Math.sin(time * 2) * 0.05 + 1;
        const baseRadius = size * 1.1;
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

    if (!snapshot) return null;

    return (
      <group ref={meshRef}>
        {/* Upgrade indicators */}
        {snapshot.upgrades.length > 0 &&
          (snapshot.upgradeIndicatorColors?.length ?? 0) > 0 && (
            <UpgradeEffect
              enemySize={size}
              indicatorColors={snapshot.upgradeIndicatorColors!}
              firstRingRef={upgradeFirstRingRef}
            />
          )}

        {/* Slow effect indicator */}
        {isSlowed && (
          <SlowEffect
            enemySize={size}
            shouldStopMovement={shouldStopMovement}
          />
        )}

        {snapshot.healPulse && (
          <MedicHealBurstEffect
            entity={entity}
            healPulse={snapshot.healPulse}
            shouldStopMovement={shouldStopMovement}
            color={snapshot.color}
          />
        )}

        {/* Enemy body */}
        <mesh
          position={[0, size / 2, 0]}
          scale={[size, size, size]}
          geometry={sharedUnitSphere}
          material={getEnemyBodyMaterial(snapshot.color)}
        />

        {/* Health bar - always faces camera */}
        <Billboard position={[0, size + 0.3, 0]}>
          <group>
            <mesh
              position={[0, 0, 0]}
              geometry={sharedUnitBox}
              material={sharedBlackBarMaterial}
              scale={[size * 2, 0.1, 0.05]}
            />
            <mesh
              ref={fillBarRef}
              geometry={sharedUnitBox}
              material={healthTierMaterials.high}
              scale={[size * 2, 0.08, 0.06]}
              position={[0, 0, 0.01]}
            />
          </group>
        </Billboard>

        {/* Debug info */}
        {debug && <GUIDebugInfo entity={entity} offsetY={size + 0.7} />}
      </group>
    );
  }
);

Enemy.displayName = "Enemy";
