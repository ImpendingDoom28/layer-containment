import { FC, useRef, useMemo, memo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";
import { CylinderGeometry, MeshStandardMaterial } from "three";

import type { Tower as TowerInstance } from "../../core/types/game";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";
import { Vector3D } from "../../core/types/utils";
import { getCssColorValue } from "../ui/lib/cssUtils";
import { useGameStore } from "../../core/stores/useGameStore";

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
};

export const Tower: FC<TowerProps> = memo(
  ({
    tower,
    onClick,
    isSelected = false,
    isPreview = false,
    isInvalidPlacement = false,
  }) => {
    syncSharedMaterials();
    const { towerBaseRadius, towerHeight } = useGameStore();
    const towerBasePosition: Vector3D = [0, towerBaseRadius, 0];
    const towerBodyPosition: Vector3D = [
      0,
      towerHeight * 0.3 + towerHeight * 0.35,
      0,
    ];

    const groupRef = useRef<Group>(null);

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

    return (
      <group
        ref={groupRef}
        position={[tower.x, 0, tower.z]}
        onClick={
          isPreview
            ? undefined
            : (e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onClick?.();
              }
        }
      >
        {/* Tower base */}
        <mesh
          position={towerBasePosition}
          geometry={baseGeometry}
          material={isPreview ? basePreviewMaterial : baseMaterial}
        />

        {/* Tower body */}
        <mesh position={towerBodyPosition}>
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
        <mesh position={[0, topY, 0]}>
          {towerTop}
          <meshStandardMaterial
            color={towerColor}
            transparent={isPreview}
            opacity={previewOpacity}
          />
        </mesh>
        {/* Selection indicator */}
        {isSelected && (
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[tower.range * 0.9, tower.range, 32]} />
            <meshStandardMaterial
              color={tower.color}
              transparent
              opacity={0.3}
              side={2}
            />
          </mesh>
        )}
        <GUIDebugInfo entity={tower} offsetY={towerHeight + 0.3} />
      </group>
    );
  }
);

Tower.displayName = "Tower";
