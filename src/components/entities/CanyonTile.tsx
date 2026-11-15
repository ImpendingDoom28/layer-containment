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
  hoveredTileSelector,
  setHoveredTileSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { hashGrid2D } from "../../core/tileGridHash";
import { useWaterClock } from "../../core/contexts/WaterClockContext";
import { createWaterMaterial, WATER_AMPLITUDE } from "../../utils/waterMaterial";
import {
  sampleBasinFloorY,
  type CanyonWorldBBox,
} from "../../utils/canyonBridges";
import { freezeSubtree } from "../../utils/freezeSubtree";

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
  onClick: () => void;
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

// A handful of boulders on the floor for a rugged, eroded bed.
const buildBoulders = (
  seed: number
): Array<{ position: [number, number, number]; radius: number }> => {
  const out: Array<{ position: [number, number, number]; radius: number }> = [];
  const count = 2 + (seed % 2);
  for (let i = 0; i < count; i++) {
    const u = hashGrid2D(seed, i);
    const v = hashGrid2D(seed + 7, i);
    const x = (u - 0.5) * 0.6;
    const z = (v - 0.5) * 0.6;
    const radius = 0.05 + hashGrid2D(seed + 13, i) * 0.07;
    out.push({ position: [x, radius * 0.4, z], radius });
  }
  return out;
};

export const CanyonTile: FC<CanyonTileProps> = memo(
  ({ gridX, gridZ, gridSize, canyonBBox, isWater, onClick }) => {
    const tileSize = useGameStore(tileSizeSelector);
    const selectedTowerToPlace = useGameStore(selectedTowerTypeToPlaceSelector);

    const hoveredTile = useLevelStore(hoveredTileSelector);
    const setHoveredTile = useLevelStore(setHoveredTileSelector);

    const waterClock = useWaterClock();
    const seed = hashGrid2D(gridX, gridZ);
    const radius = getPlanetRadius(gridSize, tileSize);

    const worldX = tileToWorldCoordinate(gridX, gridSize, tileSize);
    const worldZ = tileToWorldCoordinate(gridZ, gridSize, tileSize);

    const isHovered =
      hoveredTile?.gridX === gridX &&
      hoveredTile?.gridZ === gridZ &&
      selectedTowerToPlace !== null;

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

    const boulders = useMemo(() => buildBoulders(seed), [seed]);

    // The basin floor is one shared carved bowl (CanyonBasin), so the tile
    // renders no floor of its own. The river (when the cell is water) is the
    // only persistent per-tile feature; on hover it — or, for a dry cell, a
    // thin tint slab above the bowl — marks the tile. The invisible hitbox
    // (three raycasts it regardless of visibility) carries the pointer events.
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

    // A canyon cell can never hold a tower, so the placement hover reads as
    // "cannot place".
    const hoverMaterial = useMemo(() => {
      if (!isHovered) return null;
      const color = getCssColorValue("destructive");
      return new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.35,
        roughness: 0.95,
        metalness: 0.02,
      });
    }, [isHovered]);

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

    const onPointerOver = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHoveredTile({ gridX, gridZ });
      },
      [setHoveredTile, gridX, gridZ]
    );
    const onPointerOut = useCallback(
      (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHoveredTile(null);
      },
      [setHoveredTile]
    );
    const onInnerClick = useCallback(
      (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick?.();
      },
      [onClick]
    );

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

        {/* Bedrock boulders on the floor. */}
        {boulders.map((b, i) => (
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

        {/* Invisible hitbox: three raycasts it regardless of visibility and
            R3F dispatches to handler-bearing meshes only, so it receives the
            pointer events even with the basin bowl in front of it. */}
        <mesh
          position={[0, 0.025, 0]}
          visible={false}
          onClick={onInnerClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        >
          <boxGeometry args={[tileSize, 0.1, tileSize]} />
        </mesh>
      </group>
    );
  }
);

CanyonTile.displayName = "CanyonTile";
