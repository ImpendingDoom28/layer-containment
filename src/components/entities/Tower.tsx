import { FC, useRef, useMemo, useCallback, memo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group, Object3D } from "three";
import { CylinderGeometry, MeshStandardMaterial } from "three";

import type { Tower as TowerInstance } from "../../core/types/game";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";
import { DeadZoneDisc } from "./effects/DeadZoneDisc";
import { RangeRing } from "./effects/RangeRing";
import { TowerFireFX } from "./effects/TowerFireFX";
import { TowerModel } from "./TowerModel";
import { Vector3D } from "../../core/types/utils";
import { getCssColorValue } from "../ui/lib/cssUtils";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  selectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  towerBaseRadiusSelector,
  towerHeightSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import {
  FRUSTUM_CULLING_MARGIN,
  useFrustumCulling,
} from "../../core/hooks/useFrustumCulling";

const baseMaterial = new MeshStandardMaterial({ color: "#4b5563" });
const basePreviewMaterial = new MeshStandardMaterial({
  color: "#4b5563",
  transparent: true,
  opacity: 0.5,
});

let materialsInitialized = false;
const syncSharedMaterials = () => {
  if (materialsInitialized) return;
  const color = getCssColorValue("scene-gray-600");
  baseMaterial.color.set(color);
  basePreviewMaterial.color.set(color);
  materialsInitialized = true;
};

type TowerProps = {
  tower: TowerInstance | null;
  isSelected?: boolean;
  onClick?: () => void;
  isPreview?: boolean;
  isInvalidPlacement?: boolean;
  /** Range ring and combat (when set, includes relay adjacency buffs). */
  effectiveRange?: number;
  /**
   * Reports the rotating turret node (the model's "Azimuth" part) so the
   * system can swing it toward the target; `null` on unmount or when the model
   * has no turret (relay / load-failure fallback).
   */
  onTurretNode?: (towerId: number, node: Object3D | null) => void;
};

export const Tower: FC<TowerProps> = memo(
  ({
    tower,
    onClick,
    isSelected = false,
    isPreview = false,
    isInvalidPlacement = false,
    effectiveRange,
    onTurretNode,
  }) => {
    syncSharedMaterials();
    const towerBaseRadius = useGameStore(towerBaseRadiusSelector);
    const towerHeight = useGameStore(towerHeightSelector);
    const gridSize = useLevelStore(gridSizeSelector);
    const tileSize = useGameStore(tileSizeSelector);
    // While the player is placing a tower, the model's overhanging parts (long
    // barrels on basic/laser, the wide aoe base) must not swallow the click
    // aimed at a neighbouring tile, so the tower's click handler is disabled.
    const isPlacing = useGameStore(selectedTowerTypeToPlaceSelector) !== null;
    const towerBasePosition: Vector3D = [0, towerBaseRadius, 0];
    const towerBodyPosition: Vector3D = [
      0,
      towerHeight * 0.3 + towerHeight * 0.35,
      0,
    ];

    const groupRef = useRef<Group>(null);
    // The model's rotating turret node, kept locally for the firing feedback
    // (muzzle-flash parent); the same node is reported to the system, which
    // owns its aim rotation.
    const turretNodeRef = useRef<Object3D | null>(null);
    // The barrel node inside the turret, kept locally for the firing feedback's
    // recoil punch (the barrel dips; the rest of the turret stays put).
    const barrelNodeRef = useRef<Object3D | null>(null);
    // The preview tower follows the cursor and is always inside the view, so a
    // zero margin (no grace band) is safe and keeps it from being culled.
    useFrustumCulling(groupRef, isPreview ? 0 : FRUSTUM_CULLING_MARGIN);

    // Report the model's rotating turret node to the system (it swings it
    // toward the target in its per-frame update). The preview tower is
    // decorative and never fires, so it does not register a node.
    const onModelReady = useCallback(
      (object: Object3D | null) => {
        if (isPreview || !tower) return;
        const turret =
          object != null && tower.muzzle?.turretNode != null
            ? object.getObjectByName(tower.muzzle.turretNode)
            : undefined;
        const node = turret ?? null;
        turretNodeRef.current = node;
        barrelNodeRef.current =
          node != null && tower.muzzle?.barrelNode != null
            ? node.getObjectByName(tower.muzzle.barrelNode) ?? null
            : null;
        onTurretNode?.(tower.id, node);
      },
      [isPreview, tower, onTurretNode]
    );

    // Memoize base geometry to avoid recreation on each render
    const baseGeometry = useMemo(
      () =>
        new CylinderGeometry(
          towerBaseRadius,
          towerBaseRadius * 1.2,
          towerHeight * 0.3,
          16
        ),
      [towerBaseRadius, towerHeight]
    );

    const footing = useMemo(() => {
      const r = getPlanetRadius(gridSize, tileSize);
      const { surfacePoint, normal } = flatFieldToSphereSurface(
        tower?.x ?? 0,
        tower?.z ?? 0,
        r
      );
      return {
        position: surfacePoint,
        quaternion: getSurfaceQuaternion(normal),
      };
    }, [tower?.x, tower?.z, gridSize, tileSize]);

    if (!tower) return null;

    const towerColor =
      isPreview && isInvalidPlacement
        ? getCssColorValue("destructive")
        : tower.color;
    const previewOpacity = isPreview ? 0.5 : 1;
    let previewEmissiveIntensity: number;
    if (isPreview) {
      previewEmissiveIntensity = 0.1;
    } else if (isSelected) {
      previewEmissiveIntensity = 0.5;
    } else {
      previewEmissiveIntensity = 0.2;
    }

    const topShape = tower.topShape ?? "cone";
    const bodyWidthScale = tower.bodyWidthScale ?? 1.0;
    const topScale = tower.topScale ?? 1.0;
    const bodyRadius = towerBaseRadius * 0.8 * bodyWidthScale;

    const bodyTopY =
      towerHeight * 0.3 + towerHeight * 0.35 + towerHeight * 0.35;

    let topY: number;
    let topHeight: number;
    if (topShape === "cone") {
      topHeight = towerHeight * 0.3 * topScale;
      topY = bodyTopY + topHeight / 2;
    } else if (topShape === "sphere") {
      const radius = towerBaseRadius * 0.4 * topScale;
      topY = bodyTopY + radius;
    } else if (topShape === "cylinder") {
      topHeight = towerHeight * 0.2 * topScale;
      topY = bodyTopY + topHeight / 2;
    } else if (topShape === "coil") {
      topHeight = towerHeight * 0.25 * topScale;
      topY = bodyTopY + topHeight / 2;
    } else {
      topHeight = towerHeight * 0.1 * topScale;
      topY = bodyTopY + topHeight / 2;
    }

    const towerTop = (
      <>
        {topShape === "cone" && (
          <coneGeometry
            args={[
              towerBaseRadius * 0.6 * topScale,
              towerHeight * 0.3 * topScale,
              8,
            ]}
          />
        )}
        {topShape === "sphere" && (
          <sphereGeometry args={[towerBaseRadius * 0.4 * topScale, 16, 16]} />
        )}
        {topShape === "cylinder" && (
          <cylinderGeometry
            args={[
              towerBaseRadius * 0.6 * topScale,
              towerBaseRadius * 0.6 * topScale,
              towerHeight * 0.2 * topScale,
              16,
            ]}
          />
        )}
        {topShape === "flat" && (
          <cylinderGeometry
            args={[
              towerBaseRadius * 0.8 * topScale,
              towerBaseRadius * 0.8 * topScale,
              towerHeight * 0.1 * topScale,
              16,
            ]}
          />
        )}
        {topShape === "coil" && (
          <torusKnotGeometry
            args={[
              towerBaseRadius * 0.3 * topScale,
              towerBaseRadius * 0.1 * topScale,
              64,
              8,
            ]}
          />
        )}
      </>
    );

    // The primitive base + body + top. The placement preview is the 3D model
    // itself (a translucent, colour-coded ghost — see TowerModel's "preview" /
    // "invalid" variant); this primitive only survives as the load-failure
    // fallback for the 3D model below.
    const towerBody = (
      <>
        {/* Tower base */}
        <mesh
          position={towerBasePosition}
          geometry={baseGeometry}
          material={isPreview ? basePreviewMaterial : baseMaterial}
          castShadow
          receiveShadow
        />

        {/* Tower body */}
        <mesh position={towerBodyPosition} castShadow receiveShadow>
          <cylinderGeometry
            args={[bodyRadius, bodyRadius, towerHeight * 0.7, 16]}
          />
          <meshStandardMaterial
            color={towerColor}
            emissive={towerColor}
            emissiveIntensity={previewEmissiveIntensity}
            transparent={isPreview}
            opacity={previewOpacity}
          />
        </mesh>

        {/* Tower top */}
        <mesh position={[0, topY, 0]} castShadow receiveShadow>
          {towerTop}
          <meshStandardMaterial
            color={towerColor}
            transparent={isPreview}
            opacity={previewOpacity}
          />
        </mesh>
      </>
    );

    return (
      <group
        ref={groupRef}
        userData={{ culledEntity: true }}
        position={footing.position}
        quaternion={footing.quaternion}
        onClick={
          isPreview || isPlacing
            ? undefined
            : (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onClick?.();
              }
        }
      >
        <TowerModel
          type={tower.type}
          model={tower.model}
          size={tileSize * 0.9}
          variant={isPreview ? (isInvalidPlacement ? "invalid" : "preview") : "solid"}
          fallback={towerBody}
          onModelReady={onModelReady}
        />
        {/* Firing feedback (muzzle flash + barrel recoil) is only for placed
            towers: the placement preview never fires. */}
        {!isPreview && (
          <TowerFireFX
            tower={tower}
            color={tower.color}
            turretNodeRef={turretNodeRef}
            barrelNodeRef={barrelNodeRef}
            towerHeight={towerHeight}
          />
        )}
        {/* Selection indicator */}
        {isSelected && (effectiveRange ?? tower.range) > 0.01 && (
          <RangeRing
            range={effectiveRange ?? tower.range}
            color={tower.color}
            position={[0, 0.1, 0]}
          />
        )}
        {/* Artillery dead zone: the filled disc shows the area the tower
            refuses to shoot at (enemies closer than minRange are out of reach).
            It sits under the outer range ring so the ring's gap to the disc is
            the tower's real firing band. */}
        {isSelected && (tower.minRange ?? 0) > 0.01 && (
          <DeadZoneDisc
            radius={tower.minRange ?? 0}
            color={tower.color}
            position={[0, 0.06, 0]}
            opacity={0.35}
          />
        )}
        <GUIDebugInfo entity={tower} offsetY={towerHeight + 0.3} />
      </group>
    );
  }
);

Tower.displayName = "Tower";
