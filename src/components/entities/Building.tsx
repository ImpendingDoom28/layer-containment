import { FC, memo } from "react";

import {
  type BufferGeometry,
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
} from "three";

import type { Building as BuildingInstance } from "../../core/types/game";
import { GUIDebugInfo } from "../gui/GUIDebugInfo";

type BuildingProps = {
  building: BuildingInstance;
};

// One material per building colour and one geometry per (shape, dimension)
// set, shared across all buildings of a level instead of one pair per mesh
// (same lifetime as the tower body material cache; never disposed).
const buildingMaterialCache = new Map<string, MeshStandardMaterial>();
const getBuildingMaterial = (color: string): MeshStandardMaterial => {
  const entry = buildingMaterialCache.get(color);
  if (entry) return entry;
  const material = new MeshStandardMaterial({ color });
  buildingMaterialCache.set(color, material);
  return material;
};

const buildingGeometryCache = new Map<string, BufferGeometry>();
const getBuildingGeometry = (building: BuildingInstance): BufferGeometry => {
  const key = `${building.shape}|${building.width}x${building.depth}x${building.height}`;
  const entry = buildingGeometryCache.get(key);
  if (entry) return entry;
  const geometry =
    building.shape === "box"
      ? new BoxGeometry(building.width, building.height, building.depth)
      : new CylinderGeometry(
          building.width / 2,
          building.width / 2,
          building.height,
          16
        );
  buildingGeometryCache.set(key, geometry);
  return geometry;
};

export const Building: FC<BuildingProps> = memo(({ building }) => {
  const yPosition = building.height / 2;

  return (
    <group position={[building.x, 0, building.z]}>
      <mesh
        position={[0, yPosition, 0]}
        geometry={getBuildingGeometry(building)}
        material={getBuildingMaterial(building.color)}
        castShadow
        receiveShadow
      />
      <GUIDebugInfo entity={building} offsetY={building.height + 0.3} />
    </group>
  );
});

Building.displayName = "Building";
