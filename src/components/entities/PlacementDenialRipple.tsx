import { memo, useEffect, useState } from "react";

import {
  flatFieldToSphereOverlayPlanePose,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../../core/types/enums/events";
import type { UiActionDeniedData } from "../../core/types/game";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { useNextId } from "../../core/hooks/utils/useNextId";
import { DeniedPlacementRippleFX } from "./effects/DeniedPlacementRippleFX";

// A handful of overlapping denials is the real-world ceiling (a player
// clicking blocked tiles); cap the live list just in case.
const MAX_ACTIVE_RIPPLES = 4;
// Just above the placement highlight plane (pathYOffset + 0.016), so the
// ripple reads on top of the tile's hover tint.
const RIPPLE_OFFSET_ABOVE_TILE_TOP = 0.02;

type DeniedPlacementRipple = {
  id: number;
  position: [number, number, number];
  quaternion: ReturnType<
    typeof flatFieldToSphereOverlayPlanePose
  >["quaternion"];
};

/**
 * Plays the blocked-tile denial ripple in the scene: when a tower placement is
 * denied with `blocked_tile` (the event carries the tile's flat-field
 * position), a red "X" with an outward ripple is stamped on the tile for the
 * duration of the effect. Purely view-side (subscribes to the
 * `UI_ACTION_DENIED` event the HUD shake and camera shake already listen to),
 * one-shot, and capped by `MAX_ACTIVE_RIPPLES`.
 */
export const PlacementDenialRipple = memo(() => {
  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathYOffset = useGameStore(pathYOffsetSelector);
  const { getNextId } = useNextId();

  const [ripples, setRipples] = useState<DeniedPlacementRipple[]>([]);
  const planetRadius = getPlanetRadius(gridSize, tileSize);

  useEffect(() => {
    const onDenied = (data: UiActionDeniedData | undefined) => {
      if (!data || data.reason !== "blocked_tile" || !data.worldPosition) {
        return;
      }
      const { position, quaternion } = flatFieldToSphereOverlayPlanePose(
        data.worldPosition.x,
        data.worldPosition.z,
        planetRadius,
        pathYOffset + RIPPLE_OFFSET_ABOVE_TILE_TOP
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
  }, [planetRadius, pathYOffset, getNextId]);

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
