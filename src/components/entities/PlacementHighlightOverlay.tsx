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
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type { TowerType } from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import { tileToWorldCoordinate } from "../../utils/levelEditor";

const PLACEMENT_OVERLAY_Y_EPSILON = 0.016;
const PLANE_INSET = 0.98;
const OVERLAY_OPACITY = 0.27;

type PlacementHighlightOverlayProps = {
  selectedTowerType: TowerType | null;
  hoveredTile: TileData | null;
};

export const PlacementHighlightOverlay: FC<PlacementHighlightOverlayProps> = memo(
  ({ selectedTowerType, hoveredTile }) => {
    const gridSize = useLevelStore(gridSizeSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const { getTilePlacementState } = useLevelSystem();

    const validColor = useMemo(() => {
      const c = new Color(getCssColorValue("scene-hp-high"));
      c.lerp(new Color(getCssColorValue("scene-gray-600")), 0.5);
      return `#${c.getHexString()}`;
    }, []);
    const invalidColor = useMemo(() => {
      const c = new Color(getCssColorValue("scene-hp-low"));
      c.lerp(new Color(getCssColorValue("scene-gray-600")), 0.5);
      return `#${c.getHexString()}`;
    }, []);

    const overlayY = pathYOffset + PLACEMENT_OVERLAY_Y_EPSILON;
    const planeSize = tileSize * PLANE_INSET;

    const cells = useMemo(() => {
      if (!selectedTowerType) return [];

      const items: {
        key: string;
        position: [number, number, number];
        color: string;
      }[] = [];

      for (let gridX = 0; gridX < gridSize; gridX++) {
        for (let gridZ = 0; gridZ < gridSize; gridZ++) {
          if (
            hoveredTile?.gridX === gridX &&
            hoveredTile?.gridZ === gridZ
          ) {
            continue;
          }

          const placementState = getTilePlacementState(gridX, gridZ);
          const canPlace = !placementState.isBlocked;
          const wx = tileToWorldCoordinate(gridX, gridSize, tileSize);
          const wz = tileToWorldCoordinate(gridZ, gridSize, tileSize);

          items.push({
            key: `${gridX}-${gridZ}`,
            position: [wx, overlayY, wz],
            color: canPlace ? validColor : invalidColor,
          });
        }
      }

      return items;
    }, [
      selectedTowerType,
      hoveredTile,
      gridSize,
      tileSize,
      getTilePlacementState,
      overlayY,
      validColor,
      invalidColor,
    ]);

    if (!selectedTowerType || cells.length === 0) {
      return null;
    }

    return (
      <group>
        {cells.map(({ key, position, color }) => (
          <OverlayPlane
            key={key}
            position={position}
            planeSize={planeSize}
            color={color}
          />
        ))}
      </group>
    );
  }
);

PlacementHighlightOverlay.displayName = "PlacementHighlightOverlay";

type OverlayPlaneProps = {
  position: [number, number, number];
  planeSize: number;
  color: string;
};

const OverlayPlane: FC<OverlayPlaneProps> = memo(
  ({ position, planeSize, color }) => {
    const meshRef = useRef<Mesh>(null);

    useLayoutEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;
      mesh.raycast = () => null;
    }, []);

    return (
      <mesh
        ref={meshRef}
        position={position}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={OVERLAY_OPACITY}
          depthWrite={false}
          depthTest
        />
      </mesh>
    );
  }
);

OverlayPlane.displayName = "OverlayPlane";
