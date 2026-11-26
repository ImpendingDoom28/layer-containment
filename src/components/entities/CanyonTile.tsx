import {
  FC,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { MeshStandardMaterial, Vector3, type Group } from "three";

import {
  flatFieldToSphereSurface,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { getCssColorValue } from "../ui/lib/cssUtils";
import {
  selectedTowerTypeToPlaceSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  createTileHoveredSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  createEditorTileHoveredSelector,
  useLevelEditorStore,
} from "../../core/stores/useLevelEditorStore";
import { useWaterClock } from "../../core/contexts/WaterClockContext";
import { createWaterMaterial, WATER_AMPLITUDE } from "../../utils/waterMaterial";
import {
  sampleBasinFloorY,
  type CanyonWorldBBox,
} from "../../utils/canyonBridges";
import { freezeSubtree } from "../../utils/freezeSubtree";
import { getCanyonTileBoulderLayout } from "../../utils/canyonBoulders";

type CanyonTileProps = {
  gridX: number;
  gridZ: number;
  gridSize: number;
  /** The canyon's world bbox; the tile's features sit at the basin floor —
      the planet surface lowered by the full depth. Present whenever this is a
      canyon tile. */
  canyonBBox: CanyonWorldBBox;
  /** True when this canyon cell also holds a water body (a river in the
      gorge); the basin floor then shows the animated water surface. */
  isWater: boolean;
  /** The board's pointer input now arrives through the shared pick surface
      (see `BoardPickSurface`). In the editor (this is true) the tile
      resolves hover from the editor store; in the game it tracks the game
      store's hover. */
  editorMode?: boolean;
  /** Optional manual hover override. */
  isHovered?: boolean;
  /** The editor's placement tint; true = the hovered action is allowed here
      (primary tint), false/omitted = destructive "cannot place" tint. */
  canPlace?: boolean;
  /** Both scenes bake this tile's boulders into the scene-level
        `CanyonBoulders`, so the tile skips them by default; pass true to
        render its own copies (e.g. a standalone preview without the bake). */
  showBoulders?: boolean;
};

// The river (water) surface sits a little above the basin floor so its top
// face reads as water in the bowl; the slab's bottom drops below the floor so
// it seats in the bed without a coplanar seam.
const RIVER_HALF_HEIGHT = 0.03;
const RIVER_CENTER_Y = RIVER_HALF_HEIGHT - 0.02;
// Local Y of the river's top face (what the water material's mask displaces):
// half the slab height, since the box is centered on the mesh origin.
const RIVER_TOP_Y = RIVER_HALF_HEIGHT;
// Subdivide the river's top face so the vertex swell has vertices to ripple —
// a plain box's 4 top corners could only tilt (see `Tile`).
const RIVER_TOP_SEGMENTS = 8;

export const CanyonTile: FC<CanyonTileProps> = memo(
  ({
    gridX,
    gridZ,
    gridSize,
    canyonBBox,
    isWater,
    isHovered: isHoveredProp,
    editorMode = false,
    canPlace = false,
    showBoulders = false,
  }) => {
    const tileSize = useGameStore(tileSizeSelector);
    const selectedTowerToPlace = useGameStore(selectedTowerTypeToPlaceSelector);

    // The tile tracks its hover through a per-tile primitive flag — the
    // editor store's in the editor, the game store's in the game — so only
    // the hovered tile re-renders on pointer moves.
    const isGameTileHovered = useLevelStore(
      createTileHoveredSelector(gridX, gridZ)
    );
    const isEditorTileHovered = useLevelEditorStore(
      createEditorTileHoveredSelector(gridX, gridZ)
    );
    const isTileHovered = editorMode ? isEditorTileHovered : isGameTileHovered;

    const waterClock = useWaterClock();
    const radius = getPlanetRadius(gridSize, tileSize);

    const worldX = tileToWorldCoordinate(gridX, gridSize, tileSize);
    const worldZ = tileToWorldCoordinate(gridZ, gridSize, tileSize);

    // The tile tints from its own per-tile flag: the editor only when the
    // active tool can act on the cell (`canPlace` is the scene's
    // `canHighlightEditorAction`), the game only while a tower type is
    // selected for placement.
    const isHovered =
      isHoveredProp ??
      (editorMode
        ? isTileHovered && canPlace
        : isTileHovered && selectedTowerToPlace !== null);

    // The tile's features sit at the basin floor — the planet surface at this
    // tile lowered by the full depth, so the canyon reads as a bowl you can
    // look down into. The group's local origin is that floor point; local Y+
    // is toward the surface (up).
    const pose = useMemo(() => {
      const floorY = sampleBasinFloorY(worldX, worldZ, canyonBBox, radius);
      const { normal } = flatFieldToSphereSurface(worldX, worldZ, radius);
      return {
        position: new Vector3(worldX, floorY, worldZ),
        quaternion: getSurfaceQuaternion(normal),
      };
    }, [worldX, worldZ, canyonBBox, radius]);

    const boulders = showBoulders
      ? getCanyonTileBoulderLayout(gridX, gridZ)
      : null;

    // The basin floor is one shared carved bowl (CanyonBasin), so the tile
    // renders no floor of its own. The river (when the cell is water) is the
    // only persistent per-tile feature; on hover it — or, for a dry cell, a
    // thin tint slab above the bowl — marks the tile.
    const isAnimatedRiver = isWater && !isHovered;
    const riverMaterial = useMemo(() => {
      if (!isAnimatedRiver) return null;
      // The visible surface is this tile, so it carries its own animated ripple
      // (a per-tile instance, disposed below) — a cached shared body material
      // must not be disposed here. The top face sits at local y = RIVER_TOP_Y.
      return createWaterMaterial({
        color: getCssColorValue("scene-water"),
        time: waterClock.time,
        glow: getCssColorValue("scene-water-emissive"),
        amplitude: WATER_AMPLITUDE,
        topY: RIVER_TOP_Y,
      });
    }, [isAnimatedRiver, waterClock]);

    // The hover slab marks the placement action on the basin floor: the
    // allowed-action tint when the active tool can act on this cell, the
    // "cannot place" tint otherwise (game tower placement always falls here).
    const hoverMaterial = useMemo(() => {
      if (!isHovered) return null;
      const color = getCssColorValue(canPlace ? "primary" : "destructive");
      return new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.95,
        metalness: 0.02,
      });
    }, [isHovered, canPlace]);

    const boulderMaterial = useMemo(
      () =>
        new MeshStandardMaterial({
          color: getCssColorValue("scene-regolith-rock"),
          roughness: 0.95,
          metalness: 0.02,
        }),
      []
    );

    useEffect(
      () => () => {
        if (riverMaterial) riverMaterial.dispose();
      },
      [riverMaterial]
    );
    useEffect(
      () => () => {
        if (hoverMaterial) hoverMaterial.dispose();
      },
      [hoverMaterial]
    );
    useEffect(() => () => boulderMaterial.dispose(), [boulderMaterial]);

    const groupRef = useRef<Group>(null);
    useLayoutEffect(() => {
      if (groupRef.current) freezeSubtree(groupRef.current);
    }, [pose, isWater, isHovered]);

    return (
      <group ref={groupRef} position={pose.position} quaternion={pose.quaternion}>
        {/* River in the gorge (animated water), seated in the basin floor. On
            hover the slab shows the placement tint instead (the two are
            mutually exclusive, so exactly one renders). */}
        {isWater && riverMaterial && (
          <mesh
            position={[0, RIVER_CENTER_Y, 0]}
            material={riverMaterial}
            receiveShadow
          >
            <boxGeometry
              args={[
                tileSize,
                RIVER_HALF_HEIGHT * 2,
                tileSize,
                RIVER_TOP_SEGMENTS,
                1,
                RIVER_TOP_SEGMENTS,
              ]}
            />
          </mesh>
        )}
        {isWater && hoverMaterial && (
          <mesh
            position={[0, RIVER_CENTER_Y, 0]}
            material={hoverMaterial}
            receiveShadow
          >
            <boxGeometry args={[tileSize, RIVER_HALF_HEIGHT * 2, tileSize]} />
          </mesh>
        )}

        {/* Bedrock boulders on the floor (the scene-level `CanyonBoulders`
            bake renders them when mounted). */}
        {boulders?.map((b, i) => (
          <mesh
            key={`b-${i}`}
            position={b.position}
            material={boulderMaterial}
            castShadow
          >
            <dodecahedronGeometry args={[b.radius, 0]} />
          </mesh>
        ))}

        {/* Hover tint for a dry cell, floating just above the shared bowl. */}
        {!isWater && hoverMaterial && (
          <mesh
            position={[0, 0.006, 0]}
            material={hoverMaterial}
            receiveShadow
          >
            <boxGeometry args={[tileSize, 0.012, tileSize]} />
          </mesh>
        )}
      </group>
    );
  }
);

CanyonTile.displayName = "CanyonTile";
