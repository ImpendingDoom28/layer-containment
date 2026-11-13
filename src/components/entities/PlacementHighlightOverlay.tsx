import { FC, memo, useLayoutEffect, useMemo, useRef } from "react";

import { Color, Mesh, Quaternion, Vector3 } from "three";

import { getCssColorValue } from "../ui/lib/cssUtils";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import {
  pathYOffsetSelector,
  selectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  hoveredTileSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { getEffectiveTowerCombatStats } from "../../core/relayBuffs";
import type { Tower } from "../../core/types/game";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { DeadZoneDisc } from "./effects/DeadZoneDisc";
import { RangeFadeWall } from "./effects/RangeFadeWall";
import { RangeRing } from "./effects/RangeRing";
import {
  flatFieldToSphereOverlayPlanePose,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";

const PLACEMENT_OVERLAY_Y_EPSILON = 0.016;
const PLANE_INSET = 0.98;
const OVERLAY_OPACITY = 0.27;

export const PlacementHighlightOverlay: FC = memo(() => {
    const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
    const towerTypes = useGameStore(towerTypesSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const tileSize = useGameStore(tileSizeSelector);

    const gridSize = useLevelStore(gridSizeSelector);
    const towers = useLevelStore(towersSelector);
    const hoveredTile = useLevelStore(hoveredTileSelector);

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

    const planetRadius = useMemo(
      () => getPlanetRadius(gridSize, tileSize),
      [gridSize, tileSize]
    );

    const heightAlongNormal = pathYOffset + PLACEMENT_OVERLAY_Y_EPSILON;
    const planeSize = tileSize * PLANE_INSET;

    const cells = useMemo(() => {
      if (!selectedTowerType) return [];

      const items: {
        key: string;
        position: Vector3;
        quaternion: Quaternion;
        color: string;
      }[] = [];

      for (let gridX = 0; gridX < gridSize; gridX++) {
        for (let gridZ = 0; gridZ < gridSize; gridZ++) {
          if (hoveredTile?.gridX === gridX && hoveredTile?.gridZ === gridZ) {
            continue;
          }

          const placementState = getTilePlacementState(gridX, gridZ);
          const canPlace = !placementState.isBlocked;
          const wx = tileToWorldCoordinate(gridX, gridSize, tileSize);
          const wz = tileToWorldCoordinate(gridZ, gridSize, tileSize);

          const { position, quaternion } = flatFieldToSphereOverlayPlanePose(
            wx,
            wz,
            planetRadius,
            heightAlongNormal
          );

          items.push({
            key: `${gridX}-${gridZ}`,
            position,
            quaternion,
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
      planetRadius,
      heightAlongNormal,
      validColor,
      invalidColor,
    ]);

    // Range disc for the tile under the cursor while placing a tower, so the
    // player sees the combat reach before committing. Reuses the selected
    // tower's range ring component and the same effective-range calculation
    // (so an adjacent relay's range buff is reflected in the preview).
    const rangeRing = useMemo(() => {
      if (!selectedTowerType || !hoveredTile || !towerTypes) return null;

      const wx = tileToWorldCoordinate(hoveredTile.gridX, gridSize, tileSize);
      const wz = tileToWorldCoordinate(hoveredTile.gridZ, gridSize, tileSize);

      const candidate: Tower = {
        ...towerTypes[selectedTowerType],
        id: -1,
        type: selectedTowerType,
        lastFireTime: 0,
        gridX: hoveredTile.gridX,
        gridZ: hoveredTile.gridZ,
        x: wx,
        z: wz,
      };
      const range = getEffectiveTowerCombatStats(
        candidate,
        [...towers, candidate],
        towerTypes
      ).range;
      if (!range || range <= 0.01) return null;

      const { position, quaternion } = flatFieldToSphereOverlayPlanePose(
        wx,
        wz,
        planetRadius,
        pathYOffset + PLACEMENT_OVERLAY_Y_EPSILON + 0.004
      );

      const minRange = towerTypes[selectedTowerType].minRange;
      return {
        position: [position.x, position.y, position.z] as [
          number,
          number,
          number,
        ],
        quaternion,
        range,
        minRange,
      };
    }, [
      selectedTowerType,
      hoveredTile,
      towerTypes,
      towers,
      gridSize,
      tileSize,
      planetRadius,
      pathYOffset,
    ]);

    if (!selectedTowerType || cells.length === 0) {
      return null;
    }

    return (
      <group>
        {cells.map(({ key, position, quaternion, color }) => (
          <OverlayPlane
            key={key}
            position={position}
            quaternion={quaternion}
            planeSize={planeSize}
            color={color}
          />
        ))}
        {/* The reach preview is the same thin white max-radius stripe as the
            selected tower (plus the light wall rising off it): the tile's
            buildability is already carried by the per-tile overlay tints and
            the ghost model, so the ring itself stays colour-neutral. */}
        {rangeRing && (
          <>
            <RangeRing
              range={rangeRing.range}
              position={rangeRing.position}
              quaternion={rangeRing.quaternion}
            />
            <RangeFadeWall
              range={rangeRing.range}
              position={[
                rangeRing.position[0],
                rangeRing.position[1] - 0.08,
                rangeRing.position[2],
              ]}
              quaternion={rangeRing.quaternion}
            />
          </>
        )}
        {rangeRing && (rangeRing.minRange ?? 0) > 0.01 && (
          <DeadZoneDisc
            radius={rangeRing.minRange ?? 0}
            position={rangeRing.position}
            quaternion={rangeRing.quaternion}
            radialSegments={48}
          />
        )}
      </group>
    );
  });

PlacementHighlightOverlay.displayName = "PlacementHighlightOverlay";

type OverlayPlaneProps = {
  position: Vector3;
  quaternion: Quaternion;
  planeSize: number;
  color: string;
};

const OverlayPlane: FC<OverlayPlaneProps> = memo(
  ({ position, quaternion, planeSize, color }) => {
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
          opacity={OVERLAY_OPACITY}
          depthWrite={false}
          depthTest
        />
      </mesh>
    );
  }
);

OverlayPlane.displayName = "OverlayPlane";
