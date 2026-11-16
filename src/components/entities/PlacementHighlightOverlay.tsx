import { FC, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  type BufferGeometry,
  Color,
  Matrix4,
  MeshBasicMaterial,
  type Group,
  type Quaternion,
  Vector3,
  PlaneGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { getCssColorValue } from "../ui/lib/cssUtils";
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
  tileBlockageSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { getTilePlacementState } from "../../utils/tilePlacement";
import { getEffectiveTowerCombatStats } from "../../core/relayBuffs";
import type { Tower } from "../../core/types/game";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { DeadZoneDisc } from "./effects/DeadZoneDisc";
import { RangeFadeWall } from "./effects/RangeFadeWall";
import { RangeRing } from "./effects/RangeRing";
import {
  flatFieldToSphereOverlayPlanePose,
  flatFieldToSphereSurface,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import { freezeSubtree } from "../../utils/freezeSubtree";

const PLACEMENT_OVERLAY_Y_EPSILON = 0.016;
const PLANE_INSET = 0.98;
const OVERLAY_OPACITY = 0.27;

// The cell tints are one merged plane each (the whole grid draws as two
// meshes); the unit plane scales to the cell size inside the merge.
const unitPlane = new PlaneGeometry(1, 1);
const scratchMatrix = new Matrix4();
const scratchScale = new Vector3(1, 1, 1);

type OverlayCell = {
  key: string;
  position: Vector3;
  quaternion: Quaternion;
  canPlace: boolean;
};

export const PlacementHighlightOverlay: FC = memo(() => {
  const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
  const towerTypes = useGameStore(towerTypesSelector);
  const pathYOffset = useGameStore(pathYOffsetSelector);
  const tileSize = useGameStore(tileSizeSelector);

  const gridSize = useLevelStore(gridSizeSelector);
  const towers = useLevelStore(towersSelector);
  const hoveredTile = useLevelStore(hoveredTileSelector);

  const tileBlockage = useLevelStore(tileBlockageSelector);

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

  const materials = useMemo(
    () => ({
      valid: new MeshBasicMaterial({
        color: validColor,
        transparent: true,
        opacity: OVERLAY_OPACITY,
        depthWrite: false,
        depthTest: true,
      }),
      invalid: new MeshBasicMaterial({
        color: invalidColor,
        transparent: true,
        opacity: OVERLAY_OPACITY,
        depthWrite: false,
        depthTest: true,
      }),
    }),
    [validColor, invalidColor]
  );

  const planetRadius = useMemo(
    () => getPlanetRadius(gridSize, tileSize),
    [gridSize, tileSize]
  );

  const heightAlongNormal = pathYOffset + PLACEMENT_OVERLAY_Y_EPSILON;
  const planeSize = tileSize * PLANE_INSET;

  const cells = useMemo<OverlayCell[]>(() => {
    if (!selectedTowerType) return [];

    const items: OverlayCell[] = [];

    for (let gridX = 0; gridX < gridSize; gridX++) {
      for (let gridZ = 0; gridZ < gridSize; gridZ++) {
        if (hoveredTile?.gridX === gridX && hoveredTile?.gridZ === gridZ) {
          continue;
        }

        // Static blockage is precomputed per level load, so this whole grid
        // pass is O(1) mask lookups plus one tower scan per tile.
        const placementState = getTilePlacementState({
          gridX,
          gridZ,
          blockage: tileBlockage,
          towers,
        });
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
          canPlace,
        });
      }
    }

    return items;
  }, [
    selectedTowerType,
    hoveredTile,
    gridSize,
    tileSize,
    tileBlockage,
    towers,
    planetRadius,
    heightAlongNormal,
  ]);

  // The per-tile planes are static once the grid pass runs, so they bake into
  // one geometry per tint: the whole board is two draw calls instead of one
  // mesh per cell (the hover cell is excluded, so the merge re-runs on every
  // hover move — the same cost `Bridge` pays when its inputs change).
  const merged = useMemo(() => {
    const validParts: BufferGeometry[] = [];
    const invalidParts: BufferGeometry[] = [];
    for (const cell of cells) {
      const geometry = unitPlane.clone();
      scratchScale.setScalar(planeSize);
      scratchMatrix.compose(cell.position, cell.quaternion, scratchScale);
      geometry.applyMatrix4(scratchMatrix);
      (cell.canPlace ? validParts : invalidParts).push(geometry);
    }

    const merge = (parts: BufferGeometry[]): BufferGeometry | null => {
      if (parts.length === 0) return null;
      const g = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      return g;
    };

    return { valid: merge(validParts), invalid: merge(invalidParts) };
  }, [cells, planeSize]);

  // Stable for the component's lifetime: dispose only on unmount, not when
  // the geometry is rebuilt.
  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials]
  );

  useEffect(
    () => () => {
      merged.valid?.dispose();
      merged.invalid?.dispose();
    },
    [merged]
  );

  // Freeze only the merged cells: `freezeSubtree` also disables world-matrix
  // updates of every descendant, and the range preview (the animated light
  // wall in particular) must keep updating its matrix on every hover move.
  const cellsRef = useRef<Group>(null);
  useLayoutEffect(() => {
    if (cellsRef.current) freezeSubtree(cellsRef.current);
  }, [merged]);

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

    // The ring lies in the plane's local XY (its geometry's face normal is
    // local +Z), so it keeps the plane quaternion. The light wall builds its
    // base circle in the local XZ plane and extends the strips along local
    // +Y, so it needs the surface quaternion (local +Y = surface normal)
    // instead — passing the plane quaternion would tilt the wall's base
    // circle perpendicular to the ring and make the strips extend sideways.
    const { normal } = flatFieldToSphereSurface(wx, wz, planetRadius);
    const wallQuaternion = getSurfaceQuaternion(normal);
    // Sit the wall's base a hair below the ring along the surface normal so
    // the two don't z-fight at the shared ring line (flat world: -0.08 in Y).
    const wallPosition: [number, number, number] = [
      position.x - normal.x * 0.08,
      position.y - normal.y * 0.08,
      position.z - normal.z * 0.08,
    ];

    const minRange = towerTypes[selectedTowerType].minRange;
    return {
      position: [position.x, position.y, position.z] as [
        number,
        number,
        number,
      ],
      quaternion,
      wallPosition,
      wallQuaternion,
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
      {/* The per-tile tints: the only static subtree, so it is what gets
          frozen (the range preview below must keep updating per hover move). */}
      <group ref={cellsRef}>
        {merged.valid && (
          <mesh
            geometry={merged.valid}
            material={materials.valid}
            raycast={() => null}
          />
        )}
        {merged.invalid && (
          <mesh
            geometry={merged.invalid}
            material={materials.invalid}
            raycast={() => null}
          />
        )}
      </group>
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
            position={rangeRing.wallPosition}
            quaternion={rangeRing.wallQuaternion}
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
