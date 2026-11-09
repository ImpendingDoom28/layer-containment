import { FC, memo, useLayoutEffect, useMemo, useRef } from "react";

import { Color, Mesh, Quaternion, Vector3 } from "three";

import { getCssColorValue } from "../ui/lib/cssUtils";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import {
  pathYOffsetSelector,
  selectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  hoveredTileSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type { Tower } from "../../core/types/game";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import {
  flatFieldToSphereOverlayPlanePose,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
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
  position: Vector3;
  quaternion: Quaternion;
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
  planetRadius,
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
  planetRadius: number;
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
    const { position, quaternion } = flatFieldToSphereOverlayPlanePose(
      wx,
      wz,
      planetRadius,
      overlayY
    );

    if (towerOnCell && towerOnCell.type !== "relay") {
      items.push({
        key: `relay-buff-${gridX}-${gridZ}`,
        position,
        quaternion,
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
      quaternion,
      color: footprintColor,
      opacity: OVERLAY_OPACITY_FOOTPRINT,
    });
  }

  return items;
};

type RelayBuffPreviewOverlayProps = {
  selectedTower: Tower | null;
};

export const RelayBuffPreviewOverlay: FC<RelayBuffPreviewOverlayProps> = memo(
  ({ selectedTower }) => {
    const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const tileSize = useGameStore(tileSizeSelector);

    const gridSize = useLevelStore(gridSizeSelector);
    const towers = useLevelStore(towersSelector);
    const hoveredTile = useLevelStore(hoveredTileSelector);

    const { getTilePlacementState } = useLevelSystem();

    const hoveredTilePlacementState =
      hoveredTile !== null
        ? getTilePlacementState(hoveredTile.gridX, hoveredTile.gridZ)
        : null;

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
    const planetRadius = useMemo(
      () => getPlanetRadius(gridSize, tileSize),
      [gridSize, tileSize]
    );

    const buffCells = useMemo(() => {
      const relayHoverPreview =
        hoveredTile !== null &&
        hoveredTilePlacementState !== null &&
        !hoveredTilePlacementState.isBlocked &&
        (selectedTowerType === "relay" || selectedTower?.type === "relay");

      if (relayHoverPreview && hoveredTile !== null) {
        return buildRelayNeighborOverlayItems({
          sourceGridX: hoveredTile.gridX,
          sourceGridZ: hoveredTile.gridZ,
          gridSize,
          tileSize,
          overlayY,
          planetRadius,
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
          planetRadius,
          towers,
          getTilePlacementState,
          buffColor,
          footprintColor,
        });
      }

      return [];
    }, [
      selectedTower,
      selectedTowerType,
      hoveredTile,
      hoveredTilePlacementState,
      gridSize,
      tileSize,
      towers,
      getTilePlacementState,
      overlayY,
      planetRadius,
      buffColor,
      footprintColor,
    ]);

    if (buffCells.length === 0) {
      return null;
    }

    return (
      <group>
        {buffCells.map(({ key, position, quaternion, color, opacity }) => (
          <OverlayPlane
            key={key}
            position={position}
            quaternion={quaternion}
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
  position: Vector3;
  quaternion: Quaternion;
  planeSize: number;
  color: string;
  opacity: number;
};

const OverlayPlane: FC<OverlayPlaneProps> = memo(
  ({ position, quaternion, planeSize, color, opacity }) => {
    const meshRef = useRef<Mesh>(null);

    useLayoutEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;
      mesh.raycast = () => null;
    }, []);

    return (
      <mesh ref={meshRef} position={position} quaternion={quaternion}>
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
