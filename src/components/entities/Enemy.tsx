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
import {
  BoxGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import type { Entity } from "koota";
import { useActions } from "koota/react";

import { effectActions } from "../../core/ecs/actions/effectActions";
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
  getBillboardLocalQuaternion,
  getFacingQuaternionOnSphere,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import { useFrustumCulling } from "../../core/hooks/useFrustumCulling";
import { EnemyMotion, EnemyState } from "../../core/ecs/traits/enemy";
import { FacingDirection } from "../../core/ecs/traits/facing";
import { EnemySlow } from "../../core/ecs/traits/slow";
import { Position } from "../../core/ecs/traits/position";
import type {
  GetSimulationTime,
  GetTimeScale,
} from "../../core/hooks/useSimulationClock";
import { MedicHealBurstEffect } from "./effects/MedicHealBurstEffect";
import { SlowEffect } from "./effects/SlowEffect";
import { UpgradeEffect } from "./effects/UpgradeEffect";

type EnemyProps = {
  entity: Entity;
  getSimulationTime: GetSimulationTime;
  getTimeScale: GetTimeScale;
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
  ({ entity, getSimulationTime, getTimeScale, debug = false }) => {
    // Read the cold state once at mount: every field the JSX uses
    // (size, color, upgrades, healPulse, maxHealth) is set at spawn and never
    // mutated afterwards — only health changes over the enemy's lifetime, and
    // that is handled imperatively in useFrame below instead of through a
    // `useTrait` re-render on every hit.
    const [snapshot] = useState(() => entity.get(EnemyState));

    const actions = useActions(effectActions);

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
    // Allocation-free scratch for the facing quaternion (local +x along the
    // stored facing, +y the surface normal — same basis as the path strips).
    const scratchFacingQuat = useRef(new Quaternion());
    const scratchFacingMatrix = useRef(new Matrix4());
    // The health bar is billboarded by hand in the same frame the group
    // rotates (drei's Billboard reads the parent's matrix one frame stale,
    // which shows as a lagging bar during turns).
    const scratchCameraQuat = useRef(new Quaternion());
    const scratchBillboardQuat = useRef(new Quaternion());

    const applySphereFooting = useCallback(
      (
        worldX: number,
        worldZ: number,
        pathY: number,
        halfHeight: number,
        facing?: { x: number; z: number }
      ) => {
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
        if (facing) {
          getFacingQuaternionOnSphere(
            facing.x,
            facing.z,
            scratchNormal.current,
            scratchFacingMatrix.current,
            scratchFacingQuat.current
          );
        }
        return {
          position: scratchGroupPos.current,
          quaternion: facing ? scratchFacingQuat.current : scratchQuat.current,
        };
      },
      [radius]
    );

    const meshRef = useRef<Group>(null);
    useFrustumCulling(meshRef);
    const healthBarRef = useRef<Group>(null);
    const fillBarRef = useRef<Mesh>(null);
    const flashMeshRef = useRef<Mesh>(null);
    const healthTierRef = useRef<HealthTier>("high");
    const hasTriggeredSpawnEffect = useRef(false);
    const [isSlowed, setIsSlowed] = useState(false);
    const isSlowedRef = useRef(false);
    const prevHealthRef = useRef(snapshot?.health ?? 0);
    const hitFlashRef = useRef(0);

    // Per-enemy material for the hit-flash overlay: the body itself shares a
    // cached material per color, so a flash must live on its own mesh to avoid
    // lighting every same-colored enemy at once.
    const flashMaterial = useMemo(
      () =>
        new MeshStandardMaterial({
          color: getCssColorValue("scene-white"),
          emissive: getCssColorValue("scene-white"),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      []
    );
    useEffect(() => () => flashMaterial.dispose(), [flashMaterial]);

    const size = snapshot?.size ?? 0;

    useEffect(() => {
      if (!snapshot) return;

      const motionData = entity.get(EnemyMotion);
      if (
        !hasTriggeredSpawnEffect.current &&
        motionData &&
        motionData.pathProgress < 0.01
      ) {
        const spawnPosition = getPositionAlongMultiplePaths(
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
        actions.requestSpawnEffect(
          [
            scratchGroupPos.current.x,
            scratchGroupPos.current.y,
            scratchGroupPos.current.z,
          ],
          snapshot.color,
          "spawn"
        );
        hasTriggeredSpawnEffect.current = true;
      }
    }, [snapshot, entity, actions, pathWaypoints, radius]);

    useLayoutEffect(() => {
      const live = entity.get(EnemyState);
      const pos = entity.get(Position);
      if (!meshRef.current || !live || !pos || live.health <= 0) return;
      const facing = entity.get(FacingDirection);
      const footing = applySphereFooting(
        pos.x,
        pos.z,
        pos.y,
        live.size / 2,
        facing
      );
      meshRef.current.position.copy(footing.position);
      // The group starts exactly at the target orientation — the smooth
      // slerp in useFrame is only needed once the facing changes.
      meshRef.current.quaternion.copy(footing.quaternion);
      if (healthBarRef.current) {
        healthBarRef.current.quaternion.identity();
      }
    }, [entity, applySphereFooting]);

    useFrame((state, delta) => {
      const live = entity.get(EnemyState);
      const pos = entity.get(Position);
      if (!live || !pos || live.health <= 0) return;

      // The movement system already advanced the position and facing; this
      // frame just mirrors both onto the mesh (allocation-free via scratch
      // vectors). The group's local +x axis points along the path.
      if (meshRef.current) {
        const facing = entity.get(FacingDirection);
        const footing = applySphereFooting(
          pos.x,
          pos.z,
          pos.y,
          live.size / 2,
          facing
        );
        meshRef.current.position.copy(footing.position);
        // Smooth the rotation toward the new facing so corner turns read as
        // a gradual turn instead of an instant snap (the same ease the old
        // UpgradeEffect travel-direction smoothing gave).
        meshRef.current.quaternion.slerpQuaternions(
          meshRef.current.quaternion,
          footing.quaternion,
          Math.min(1, delta * getTimeScale() * 8)
        );

        // Billboard the health bar against the camera in this same frame,
        // so it never lags the group's rotation by a frame (drei's Billboard
        // reads the parent's world quaternion one frame stale).
        const bar = healthBarRef.current;
        if (bar) {
          // Face the bar on the camera: barWorldQ must equal cameraWorldQ, and
          // barWorldQ = groupWorldQ * barLocalQ, so barLocalQ =
          // groupWorldQ^-1 * cameraWorldQ. We derive it from the group's
          // quaternion (already slerped this frame) rather than the bar's own
          // world quaternion, which would fold the bar's previous rotation back
          // in and never converge — that caused the per-frame jitter.
          state.camera.getWorldQuaternion(scratchCameraQuat.current);
          meshRef.current.getWorldQuaternion(scratchBillboardQuat.current);
          getBillboardLocalQuaternion(
            scratchBillboardQuat.current,
            scratchCameraQuat.current,
            bar.quaternion
          );
        }
      }

      // Emissive hit-flash: a drop in health bumps a decaying flash rendered by
      // a slightly larger, transparent white overlay mesh around the body.
      if (live.health < prevHealthRef.current - 1e-6) {
        hitFlashRef.current = Math.min(
          1,
          hitFlashRef.current + 0.7 + (prevHealthRef.current - live.health) / 25
        );
      }
      prevHealthRef.current = live.health;

      const flashMesh = flashMeshRef.current;
      if (flashMesh) {
        const flashMaterial = flashMesh.material as MeshStandardMaterial;
        if (hitFlashRef.current > 0.004) {
          flashMaterial.opacity = hitFlashRef.current * 0.85;
          flashMesh.visible = true;
          hitFlashRef.current = Math.max(
            0,
            hitFlashRef.current - delta * getTimeScale() * 5
          );
        } else if (flashMesh.visible) {
          flashMaterial.opacity = 0;
          flashMesh.visible = false;
        }
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
      <group ref={meshRef} userData={{ culledEntity: true }}>
        {/* Upgrade indicators: one glyph per pick (1 pick = 1 glyph) */}
        {(snapshot.upgradeStacks?.length ?? 0) > 0 && (
          <UpgradeEffect
            enemySize={size}
            upgradeStacks={snapshot.upgradeStacks!}
            getTimeScale={getTimeScale}
          />
        )}

        {/* Slow effect indicator */}
        {isSlowed && (
          <SlowEffect enemySize={size} getTimeScale={getTimeScale} />
        )}

        {snapshot.healPulse && (
          <MedicHealBurstEffect
            entity={entity}
            healPulse={snapshot.healPulse}
            getTimeScale={getTimeScale}
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

        {/* Hit-flash overlay: transparent white shell that lights up on damage */}
        <mesh
          ref={flashMeshRef}
          visible={false}
          position={[0, size / 2, 0]}
          scale={[size * 1.12, size * 1.12, size * 1.12]}
          geometry={sharedUnitSphere}
          material={flashMaterial}
        />

        {/* Health bar - faces the camera, billboarded by hand in useFrame so
            it never lags the group's rotation by a frame */}
        <group ref={healthBarRef} position={[0, size + 0.3, 0]}>
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

        {/* Debug info */}
        {debug && <GUIDebugInfo entity={entity} offsetY={size + 0.7} />}
      </group>
    );
  }
);

Enemy.displayName = "Enemy";
