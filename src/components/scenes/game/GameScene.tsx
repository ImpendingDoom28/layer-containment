import { useMemo } from "react";
import { AudioListenerSync } from "@webgamedevkit/audio-engine/r3f";

import { Bridge } from "../../entities/Bridge";
import { CanyonBasin } from "../../entities/CanyonBasin";
import { Grid } from "../../entities/Grid";
import { PlanetTileDecorations } from "../../entities/PlanetTileDecorations";
import { PlacementDenialRipple } from "../../entities/PlacementDenialRipple";
import { PlacementHighlightOverlay } from "../../entities/PlacementHighlightOverlay";
import { RelayBuffPreviewOverlay } from "../../entities/RelayBuffPreviewOverlay";
import { Path } from "../../entities/Path";
import { GameCamera } from "./GameCamera";
import type {
  Tower as TowerInstance,
  GameStatus,
  TowerType,
} from "../../../core/types/game";
import { EntitiesSystem } from "../../systems/EntitiesSystem";
import { CombatJuice } from "../../entities/effects/CombatJuice";
import {
  canyonsSelector,
  gridOffsetSelector,
  gridSizeSelector,
  pathWaypointsSelector,
  useLevelStore,
  watersSelector,
} from "../../../core/stores/useLevelStore";
import {
  pathWidthSelector,
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useTileOccupancyMasks } from "../../../core/hooks/utils/useTileOccupancyMasks";
import {
  BRIDGE_ELEVATION,
  getCanyonWorldBBox,
  getBridgeTiles,
} from "../../../utils/canyonBridges";
import { Ground } from "../shared/Ground";
import { Light } from "../shared/Light";
import { Skybox } from "../shared/Skybox";

type GameSceneProps = {
  placeTower: (gridX: number, gridZ: number, towerType: TowerType) => void;
  selectedTower: TowerInstance | null;
  shouldStopCamera: boolean;
  gameStatus: GameStatus;
  onSellTower: (towerId: number) => void;
};

export const GameScene: React.FC<GameSceneProps> = ({
  placeTower,
  selectedTower,
  shouldStopCamera,
  gameStatus,
  onSellTower,
}) => {
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const waters = useLevelStore(watersSelector);
  const canyons = useLevelStore(canyonsSelector);
  const gridOffset = useLevelStore(gridOffsetSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathWidth = useGameStore(pathWidthSelector);
  const pathYOffset = useGameStore(pathYOffsetSelector);

  const occupancy = useTileOccupancyMasks({
    gridSize,
    gridOffset,
    tileSize,
    pathWaypoints,
    pathWidth,
    waters,
    canyons,
  });

  // The canyon's world bbox drives the basin (carved bowl + the cut in the
  // ground sphere), the tiles' floor position, and the bridge piers.
  const canyonBBox = useMemo(
    () =>
      canyons.length === 0
        ? null
        : getCanyonWorldBBox(canyons, gridSize, tileSize),
    [canyons, gridSize, tileSize]
  );

  // Bridge tiles per path, memoized so unrelated re-renders reuse the same
  // arrays and the `Bridge` memo holds (its geometry would otherwise re-merge).
  const bridgeTilesByPath = useMemo(
    () =>
      canyons.length === 0
        ? []
        : pathWaypoints.map((path) =>
            getBridgeTiles(path, canyons, gridSize, tileSize)
          ),
    [pathWaypoints, canyons, gridSize, tileSize]
  );

  return (
    <>
      <Skybox />
      <Light />
      <Ground />
      <CanyonBasin />

      <GameCamera
        movementSpeed={10}
        rotationSensitivity={0.002}
        shouldStopCamera={shouldStopCamera}
        paused={gameStatus === "paused"}
      />

      <AudioListenerSync />

      {pathWaypoints.map((_, index) => (
        <Path key={index} pathIndex={index} />
      ))}

      <Grid placeTower={placeTower} occupancy={occupancy} canyonBBox={canyonBBox} />

      {/* Bridge support structure (rails + piers) over each path that crosses
          a canyon. The deck itself is the elevated path strip rendered by
          `Path`, so the bridge draws only the raised-walkway framing. */}
      {bridgeTilesByPath.map((bridgeTiles, index) =>
        bridgeTiles.length === 0 ? null : (
          <Bridge
            key={`bridge-${index}`}
            tiles={bridgeTiles}
            deckHeight={BRIDGE_ELEVATION}
            pathYOffset={pathYOffset}
            pathWidth={pathWidth}
            tileSize={tileSize}
            gridSize={gridSize}
            canyonBBox={canyonBBox}
          />
        )
      )}

      <PlanetTileDecorations occupancy={occupancy} />

      <PlacementHighlightOverlay />

      <PlacementDenialRipple />

      <RelayBuffPreviewOverlay selectedTower={selectedTower} />

      <EntitiesSystem onSellTower={onSellTower} selectedTower={selectedTower} />

      <CombatJuice />
    </>
  );
};
