import { AudioListenerSync } from "@webgamedevkit/audio-engine/r3f";

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
  gridOffsetSelector,
  gridSizeSelector,
  pathWaypointsSelector,
  useLevelStore,
  watersSelector,
} from "../../../core/stores/useLevelStore";
import {
  pathWidthSelector,
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useTileOccupancyMasks } from "../../../core/hooks/utils/useTileOccupancyMasks";
import { Ground } from "../shared/Ground";
import { HorizonFog } from "../shared/HorizonFog";
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
  const gridOffset = useLevelStore(gridOffsetSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathWidth = useGameStore(pathWidthSelector);

  const occupancy = useTileOccupancyMasks({
    gridSize,
    gridOffset,
    tileSize,
    pathWaypoints,
    pathWidth,
    waters,
  });

  return (
    <>
      <Skybox />
      <Light />
      <Ground />
      <HorizonFog />

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

      <Grid placeTower={placeTower} occupancy={occupancy} />

      <PlanetTileDecorations occupancy={occupancy} />

      <PlacementHighlightOverlay />

      <PlacementDenialRipple />

      <RelayBuffPreviewOverlay selectedTower={selectedTower} />

      <EntitiesSystem onSellTower={onSellTower} selectedTower={selectedTower} />

      <CombatJuice />
    </>
  );
};
