import {
  FC,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import type { ThreeEvent } from "@react-three/fiber";
import { Mesh, MeshStandardMaterial } from "three";

import {
  flatFieldToSphereTilePose,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";

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
import { hashGrid2D } from "../../core/tileGridHash";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { createPlanetTileMaterial } from "../../utils/planetTileMaterial";
import { freezeSubtree } from "../../utils/freezeSubtree";

type PlacementHoverKey = "idle" | "canPlace" | "cannotPlace";

type TileProps = {
  gridX: number;
  gridZ: number;
  isWater: boolean;
  isOnPath: boolean;
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
    isOnPath,
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
    const planetPose = useMemo(
      () =>
        flatFieldToSphereTilePose(
          tileToWorldCoordinate(gridX, gridSize, tileSize),
          tileToWorldCoordinate(gridZ, gridSize, tileSize),
          getPlanetRadius(gridSize, tileSize),
          pathYOffset / 2
        ),
      [gridX, gridZ, gridSize, tileSize, pathYOffset]
    );

    const meshRef = useRef<Mesh>(null);
    useLayoutEffect(() => {
      if (meshRef.current) freezeSubtree(meshRef.current);
    }, [planetPose]);

    const placementHoverKey = useMemo<PlacementHoverKey>(() => {
      if (!isHovered) return "idle";
      return canPlace ? "canPlace" : "cannotPlace";
    }, [isHovered, canPlace]);

    const material = useMemo(() => {
      if (isWater) {
        const base = getCssColorValue("scene-water");
        const emissiveHue = getCssColorValue("scene-water-emissive");
        if (placementHoverKey === "canPlace") {
          return new MeshStandardMaterial({
            color: getCssColorValue("primary"),
            emissive: getCssColorValue("primary"),
            emissiveIntensity: 0.35,
            metalness: 0.35,
            roughness: 0.22,
          });
        }
        if (placementHoverKey === "cannotPlace") {
          return new MeshStandardMaterial({
            color: getCssColorValue("destructive"),
            emissive: getCssColorValue("destructive"),
            emissiveIntensity: 0.35,
            metalness: 0.35,
            roughness: 0.22,
          });
        }
        return new MeshStandardMaterial({
          color: base,
          emissive: emissiveHue,
          emissiveIntensity: 0.12,
          metalness: 0.28,
          roughness: 0.18,
        });
      }

      if (placementHoverKey === "canPlace") {
        const c = getCssColorValue("primary");
        return new MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.45,
          metalness: 0.05,
          roughness: 0.75,
        });
      }
      if (placementHoverKey === "cannotPlace") {
        const c = getCssColorValue("destructive");
        return new MeshStandardMaterial({
          color: c,
          emissive: c,
          emissiveIntensity: 0.45,
          metalness: 0.05,
          roughness: 0.75,
        });
      }

      const land = getCssColorValue("scene-gray-700");
      const baseLand = {
        emissive: getCssColorValue("scene-black"),
        emissiveIntensity: 0,
        metalness: 0.05,
        roughness: 0.88,
      };

      if (!isOnPath) {
        return createPlanetTileMaterial({
          baseColor: land,
          ...baseLand,
          tileSeed: hashGrid2D(gridX, gridZ),
          tileHalfHeight: pathYOffset / 2,
          regolithHighlight: getCssColorValue("scene-regolith-highlight"),
          regolithShadow: getCssColorValue("scene-regolith-shadow"),
        });
      }

      return new MeshStandardMaterial({
        color: land,
        ...baseLand,
      });
    }, [isWater, isOnPath, placementHoverKey, gridX, gridZ, pathYOffset]);

    useEffect(
      () => () => {
        material.dispose();
      },
      [material]
    );

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
        ref={meshRef}
        position={planetPose.position}
        quaternion={planetPose.quaternion}
        material={material}
        onClick={onInnerClick}
        onPointerOver={onInnerPointerOver}
        onPointerOut={onInnerPointerOut}
      >
        <boxGeometry args={TILE_POSITION} />
      </mesh>
    );
  }
);

Tile.displayName = "Tile";
