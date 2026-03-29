import { FC, memo, useLayoutEffect, useMemo, useRef } from "react";

import { Color, Mesh } from "three";

import { getCssColorValue } from "../ui/lib/cssUtils";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type { Tower, TowerType } from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import type { TilePlacementState } from "../../utils/tilePlacement";

const PLACEMENT_OVERLAY_Y_EPSILON = 0.018;
const PLANE_INSET = 0.98;
const OVERLAY_OPACITY_BUFF = 0.38;
const OVERLAY_OPACITY_FOOTPRINT = 0.22;

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type RelayNeighborOverlayItem = {
  key: string;
  position: [number, number, number];
  color: string;
  opacity: number;
};

type GetTilePlacementStateFn = (
  gridX: number,
  gridZ: number
) => TilePlacementState;

const buildRelayNeighborOverlayItems = ({
  sourceGridX,
  sourceGridZ,
  gridSize,
  tileSize,
  overlayY,
  towers,
  getTilePlacementState,
  buffColor,
  footprintColor,
}: {
  sourceGridX: number;
  sourceGridZ: number;
  gridSize: number;
  tileSize: number;
  overlayY: number;
  towers: Tower[];
  getTilePlacementState: GetTilePlacementStateFn;
  buffColor: string;
  footprintColor: string;
}): RelayNeighborOverlayItem[] => {
  const items: RelayNeighborOverlayItem[] = [];

  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const gridX = sourceGridX + dx;
    const gridZ = sourceGridZ + dz;
    if (gridX < 0 || gridX >= gridSize || gridZ < 0 || gridZ >= gridSize) {
      continue;
    }

    const towerOnCell = towers.find(
      (t) => t.gridX === gridX && t.gridZ === gridZ
    );
    const placementState = getTilePlacementState(gridX, gridZ);

    const wx = tileToWorldCoordinate(gridX, gridSize, tileSize);
    const wz = tileToWorldCoordinate(gridZ, gridSize, tileSize);
    const position: [number, number, number] = [wx, overlayY, wz];

    if (towerOnCell && towerOnCell.type !== "relay") {
      items.push({
        key: `relay-buff-${gridX}-${gridZ}`,
        position,
        color: buffColor,
        opacity: OVERLAY_OPACITY_BUFF,
      });
      continue;
    }

    if (towerOnCell?.type === "relay") {
      continue;
    }

    if (
      placementState.isOnPath ||
      placementState.isWater ||
      placementState.isOccupiedByBuilding
    ) {
      continue;
    }

    items.push({
      key: `relay-footprint-${gridX}-${gridZ}`,
      position,
      color: footprintColor,
      opacity: OVERLAY_OPACITY_FOOTPRINT,
    });
  }

  return items;
};

type RelayBuffPreviewOverlayProps = {
  selectedTowerType: TowerType | null;
  selectedTower: Tower | null;
  hoveredTile: TileData | null;
  hoveredTilePlacementState: TilePlacementState | null;
};

export const RelayBuffPreviewOverlay: FC<RelayBuffPreviewOverlayProps> = memo(
  ({
    selectedTowerType,
    selectedTower,
    hoveredTile,
    hoveredTilePlacementState,
  }) => {
    const gridSize = useLevelStore(gridSizeSelector);
    const towers = useLevelStore(towersSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const { getTilePlacementState } = useLevelSystem();

    const buffColor = useMemo(() => {
      const c = new Color(getCssColorValue("scene-hp-high"));
      c.lerp(new Color(getCssColorValue("primary")), 0.35);
      return `#${c.getHexString()}`;
    }, []);

    const footprintColor = useMemo(() => {
      const c = new Color(getCssColorValue("scene-hp-high"));
      c.lerp(new Color(getCssColorValue("scene-gray-600")), 0.55);
      return `#${c.getHexString()}`;
    }, []);

    const overlayY = pathYOffset + PLACEMENT_OVERLAY_Y_EPSILON;
    const planeSize = tileSize * PLANE_INSET;

    const buffCells = useMemo(() => {
      const placementRelayActive =
        selectedTowerType === "relay" &&
        hoveredTile &&
        hoveredTilePlacementState &&
        !hoveredTilePlacementState.isBlocked;

      if (placementRelayActive) {
        return buildRelayNeighborOverlayItems({
          sourceGridX: hoveredTile.gridX,
          sourceGridZ: hoveredTile.gridZ,
          gridSize,
          tileSize,
          overlayY,
          towers,
          getTilePlacementState,
          buffColor,
          footprintColor,
        });
      }

      if (selectedTower?.type === "relay") {
        return buildRelayNeighborOverlayItems({
          sourceGridX: selectedTower.gridX,
          sourceGridZ: selectedTower.gridZ,
          gridSize,
          tileSize,
          overlayY,
          towers,
          getTilePlacementState,
          buffColor,
          footprintColor,
        });
      }

      return [];
    }, [
      selectedTowerType,
      selectedTower,
      hoveredTile,
      hoveredTilePlacementState,
      gridSize,
      tileSize,
      towers,
      getTilePlacementState,
      overlayY,
      buffColor,
      footprintColor,
    ]);

    if (buffCells.length === 0) {
      return null;
    }

    return (
      <group>
        {buffCells.map(({ key, position, color, opacity }) => (
          <OverlayPlane
            key={key}
            position={position}
            planeSize={planeSize}
            color={color}
            opacity={opacity}
          />
        ))}
      </group>
    );
  }
);

RelayBuffPreviewOverlay.displayName = "RelayBuffPreviewOverlay";

type OverlayPlaneProps = {
  position: [number, number, number];
  planeSize: number;
  color: string;
  opacity: number;
};

const OverlayPlane: FC<OverlayPlaneProps> = memo(
  ({ position, planeSize, color, opacity }) => {
    const meshRef = useRef<Mesh>(null);

    useLayoutEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;
      mesh.raycast = () => null;
    }, []);

    return (
      <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          depthTest
        />
      </mesh>
    );
  }
);

OverlayPlane.displayName = "RelayBuffOverlayPlane";
