import { FC, memo, useCallback, useMemo } from "react";

import type { ThreeEvent } from "@react-three/fiber";

import { getCssColorValue } from "../ui/lib/cssUtils";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { tileToWorldCoordinate } from "../../utils/levelEditor";

type TileProps = {
  gridX: number;
  gridZ: number;
  isWater: boolean;
  isHovered: boolean;
  canPlace: boolean;
  onClick: () => void;
  onHover?: (gridX: number, gridZ: number) => void;
  onHoverEnd?: () => void;
};

export const Tile: FC<TileProps> = memo(
  ({
    gridX,
    gridZ,
    isWater,
    isHovered,
    canPlace,
    onClick,
    onHover,
    onHoverEnd,
  }) => {
    const tileSize = useGameStore(tileSizeSelector);
    const gridSize = useLevelStore(gridSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);

    const TILE_POSITION:
      | [
          width?: number | undefined,
          height?: number | undefined,
          depth?: number | undefined,
          widthSegments?: number | undefined,
          heightSegments?: number | undefined,
          depthSegments?: number | undefined,
        ]
      | undefined = [tileSize, pathYOffset, tileSize];
    const position = useMemo<[number, number, number]>(
      () => [
        tileToWorldCoordinate(gridX, gridSize, tileSize),
        0,
        tileToWorldCoordinate(gridZ, gridSize, tileSize),
      ],
      [gridX, gridZ, gridSize, tileSize]
    );

    const materialProps = useMemo(() => {
      if (isWater) {
        const base = getCssColorValue("scene-water");
        const emissiveHue = getCssColorValue("scene-water-emissive");
        if (isHovered && canPlace) {
          return {
            color: getCssColorValue("primary"),
            emissive: getCssColorValue("primary"),
            emissiveIntensity: 0.35,
            metalness: 0.35,
            roughness: 0.22,
          };
        }
        if (isHovered && !canPlace) {
          return {
            color: getCssColorValue("destructive"),
            emissive: getCssColorValue("destructive"),
            emissiveIntensity: 0.35,
            metalness: 0.35,
            roughness: 0.22,
          };
        }
        return {
          color: base,
          emissive: emissiveHue,
          emissiveIntensity: 0.12,
          metalness: 0.28,
          roughness: 0.18,
        };
      }

      if (isHovered && canPlace) {
        const c = getCssColorValue("primary");
        return {
          color: c,
          emissive: c,
          emissiveIntensity: 0.45,
          metalness: 0.05,
          roughness: 0.75,
        };
      }
      if (isHovered && !canPlace) {
        const c = getCssColorValue("destructive");
        return {
          color: c,
          emissive: c,
          emissiveIntensity: 0.45,
          metalness: 0.05,
          roughness: 0.75,
        };
      }
      const land = getCssColorValue("scene-gray-700");
      return {
        color: land,
        emissive: getCssColorValue("scene-black"),
        emissiveIntensity: 0,
        metalness: 0.05,
        roughness: 0.88,
      };
    }, [isWater, isHovered, canPlace]);

    const onInnerPointerOver = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover?.(gridX, gridZ);
      },
      [onHover, gridX, gridZ]
    );

    const onInnerPointerOut = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHoverEnd?.();
      },
      [onHoverEnd]
    );

    const onInnerClick = useCallback(
      (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
      },
      [onClick]
    );

    return (
      <mesh
        position={position}
        onClick={onInnerClick}
        onPointerOver={onInnerPointerOver}
        onPointerOut={onInnerPointerOut}
      >
        <boxGeometry args={TILE_POSITION} />
        <meshStandardMaterial
          transparent={false}
          opacity={1}
          color={materialProps.color}
          emissive={materialProps.emissive}
          emissiveIntensity={materialProps.emissiveIntensity}
          metalness={materialProps.metalness}
          roughness={materialProps.roughness}
        />
      </mesh>
    );
  }
);

Tile.displayName = "Tile";
