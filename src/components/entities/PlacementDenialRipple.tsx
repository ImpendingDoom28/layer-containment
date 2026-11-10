import { memo, useEffect, useState } from "react";

import {
  flatFieldToSphereOverlayPlanePose,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../../core/types/enums/events";
import type {
  Building,
  PathWaypoint,
  Tower,
  UiActionDeniedData,
} from "../../core/types/game";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  towerHeightSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  buildingsSelector,
  gridSizeSelector,
  pathWaypointsSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { useNextId } from "../../core/hooks/utils/useNextId";
import { DeniedPlacementRippleFX } from "./effects/DeniedPlacementRippleFX";

// A handful of overlapping denials is the real-world ceiling (a player
// clicking blocked tiles); cap the live list just in case.
const MAX_ACTIVE_RIPPLES = 4;
// The X floats this far above the top of whatever occupies the tile, so it
// clears towers, buildings, portals, and the base (each rises `height` above
// the ground, i.e. `height − pathYOffset` above the tile's top surface) and
// never z-fights the tile.
const X_CLEARANCE_ABOVE_TOP = 0.3;
// The portal is a vertical ring structure at the first waypoint: its outer
// ring (radius 0.4 + tube 0.04) reaches ~0.86 above the ground, and the
// Reinforcements tier indicators (radius 0.52) push it to ~1.08 at tier 3.
// Use the tier-3 height so the X clears the portal in every state.
const PORTAL_TOP_HEIGHT = 1.08;
// The base (EndBuilding) is the `Player_Base` GLB (1.8 × 1.6 × 1.75 at rest)
// scaled to 0.75, so ~1.2 above the ground at the last waypoint.
const BASE_TOP_HEIGHT = 1.2;

type GridAndSize = { gridSize: number; tileSize: number };
type BlockedOccupants = {
  towers: Tower[];
  buildings: Building[];
  towerHeight: number;
  pathYOffset: number;
  pathWaypoints: PathWaypoint[][];
};

// The event carries the tile's flat-field position, not its grid cell, so
// recover the cell (the inverse of `tileToWorldCoordinate`).
const gridFromWorld = (
  worldX: number,
  worldZ: number,
  { gridSize, tileSize }: GridAndSize
): { gridX: number; gridZ: number } => {
  const offset = -(gridSize * tileSize) / 2;
  return {
    gridX: Math.round(worldX - offset - tileSize / 2),
    gridZ: Math.round(worldZ - offset - tileSize / 2),
  };
};

// A waypoint's grid cell (path waypoints are authored on the grid, so the
// rounding recovers the tile the portal / base actually sits on).
const gridFromWaypoint = (
  waypoint: PathWaypoint,
  { gridSize, tileSize }: GridAndSize
): { gridX: number; gridZ: number } => {
  const offset = -(gridSize * tileSize) / 2;
  return {
    gridX: Math.round(waypoint.x - offset - tileSize / 2),
    gridZ: Math.round(waypoint.z - offset - tileSize / 2),
  };
};

// Height (along the surface normal) of the tallest thing on the tile,
// measured from the tile's top surface: 0 for a bare blocked tile (path,
// water), `towerHeight − pathYOffset` for a tower, the building's height for a
// building, the portal's height for a spawn portal, and the base's height for
// the path end. The X floats `X_CLEARANCE_ABOVE_TOP` above it.
const blockedTileTopHeight = (
  gridX: number,
  gridZ: number,
  { towers, buildings, towerHeight, pathYOffset, pathWaypoints }: BlockedOccupants,
  { gridSize, tileSize }: GridAndSize
): number => {
  let top = 0;
  if (towers.some((tower) => tower.gridX === gridX && tower.gridZ === gridZ)) {
    top = Math.max(top, towerHeight - pathYOffset);
  }
  for (const building of buildings) {
    if (building.gridX === gridX && building.gridZ === gridZ) {
      top = Math.max(top, building.height - pathYOffset);
    }
  }
  for (const path of pathWaypoints) {
    if (path.length === 0) continue;
    const portalCell = gridFromWaypoint(path[0], { gridSize, tileSize });
    const baseCell = gridFromWaypoint(path[path.length - 1], { gridSize, tileSize });
    if (
      portalCell.gridX === gridX &&
      portalCell.gridZ === gridZ
    ) {
      top = Math.max(top, PORTAL_TOP_HEIGHT - pathYOffset);
    }
    if (baseCell.gridX === gridX && baseCell.gridZ === gridZ) {
      top = Math.max(top, BASE_TOP_HEIGHT - pathYOffset);
    }
  }
  return top + X_CLEARANCE_ABOVE_TOP;
};

type DeniedPlacementRipple = {
  id: number;
  position: [number, number, number];
  quaternion: ReturnType<
    typeof flatFieldToSphereOverlayPlanePose
  >["quaternion"];
};

/**
 * Plays the blocked-tile denial "X" in the scene: when a tower placement is
 * denied with `blocked_tile` (the event carries the tile's flat-field
 * position), a bright red "X" is stamped above the tile — lifted to clear
 * whatever occupies it (a tower, a building, a spawn portal, the base, the
 * path, or water) so the player always sees it. Purely view-side (subscribes
 * to the `UI_ACTION_DENIED` event the HUD shake and camera shake already
 * listen to), one-shot, and capped by `MAX_ACTIVE_RIPPLES`.
 */
export const PlacementDenialRipple = memo(() => {
  const gridSize = useLevelStore(gridSizeSelector);
  const towers = useLevelStore(towersSelector);
  const buildings = useLevelStore(buildingsSelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const pathYOffset = useGameStore(pathYOffsetSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const towerHeight = useGameStore(towerHeightSelector);
  const { getNextId } = useNextId();

  const [ripples, setRipples] = useState<DeniedPlacementRipple[]>([]);
  const planetRadius = getPlanetRadius(gridSize, tileSize);

  useEffect(() => {
    const onDenied = (data: UiActionDeniedData | undefined) => {
      if (!data || data.reason !== "blocked_tile" || !data.worldPosition) {
        return;
      }
      const { gridX, gridZ } = gridFromWorld(
        data.worldPosition.x,
        data.worldPosition.z,
        { gridSize, tileSize }
      );
      const { position, quaternion } = flatFieldToSphereOverlayPlanePose(
        data.worldPosition.x,
        data.worldPosition.z,
        planetRadius,
        pathYOffset +
          blockedTileTopHeight(
            gridX,
            gridZ,
            { towers, buildings, towerHeight, pathYOffset, pathWaypoints },
            { gridSize, tileSize }
          )
      );

      setRipples((prev) => [
        ...prev.slice(-(MAX_ACTIVE_RIPPLES - 1)),
        {
          id: getNextId(),
          position: [position.x, position.y, position.z],
          quaternion,
        },
      ]);
    };

    gameEvents.on(GameEvent.UI_ACTION_DENIED, onDenied);
    return () => {
      gameEvents.off(GameEvent.UI_ACTION_DENIED, onDenied);
    };
  }, [
    planetRadius,
    pathYOffset,
    gridSize,
    tileSize,
    towers,
    buildings,
    pathWaypoints,
    towerHeight,
    getNextId,
  ]);

  const onRippleComplete = (id: number) => {
    setRipples((prev) => prev.filter((ripple) => ripple.id !== id));
  };

  if (ripples.length === 0) {
    return null;
  }

  return (
    <>
      {ripples.map((ripple) => (
        <DeniedPlacementRippleFX
          key={ripple.id}
          position={ripple.position}
          quaternion={ripple.quaternion}
          tileSize={tileSize}
          onComplete={() => onRippleComplete(ripple.id)}
        />
      ))}
    </>
  );
});

PlacementDenialRipple.displayName = "PlacementDenialRipple";
