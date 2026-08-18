import { useCallback, useState } from "react";
import { AudioListenerSync } from "@webgamedevkit/audio-engine/r3f";

import type { PlayableLevelId } from "../../../constants/playableLevels";
import { Grid } from "../../entities/Grid";
import { PlanetTileDecorations } from "../../entities/PlanetTileDecorations";
import { PlacementHighlightOverlay } from "../../entities/PlacementHighlightOverlay";
import { RelayBuffPreviewOverlay } from "../../entities/RelayBuffPreviewOverlay";
import { Path } from "../../entities/Path";
import { GameCamera } from "./GameCamera";
import type {
  Tower as TowerInstance,
  Enemy as EnemyInstance,
  Projectile as ProjectileInstance,
  GameStatus,
  ActiveEffect,
  TowerType,
} from "../../../core/types/game";
import { WaveLoopSystem } from "../../systems/WaveLoopSystem";
import { WaveSystem } from "../../../core/hooks/useWaveSystem";
import { TileData } from "../../../core/types/utils";
import { EntitiesSystem } from "../../systems/EntitiesSystem";
import { LevelSystem } from "../../systems/LevelSystem";
import {
  pathWaypointsSelector,
  towersSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import { Ground } from "../shared/Ground";
import { Light } from "../shared/Light";
import { Skybox } from "../shared/Skybox";

type GameSceneProps = {
  placeTower: (gridX: number, gridZ: number, towerType: TowerType) => void;
  activeEffects: ActiveEffect[];
  onSpawnEffect: (position: [number, number, number], color: string) => void;
  onEndEffect: (position: [number, number, number], color: string) => void;
  onEffectComplete: (effectId: number) => void;
  selectedTower: TowerInstance | null;
  shouldDisableControls: boolean;
  shouldStopMovement: boolean;
  gameStatus: GameStatus;
  waveSystem: WaveSystem;
  money: number;
  onEnemyReachEnd: (enemyId: number) => void;
  onProjectileHit: (
    projectile: ProjectileInstance,
    targetEnemy: EnemyInstance,
    currentTime: number
  ) => void;
  onProjectileRemove: (projectileId: number) => void;
  onSellTower: (towerId: number) => void;
  playableLevelId: PlayableLevelId;
};

export const GameScene: React.FC<GameSceneProps> = ({
  placeTower,
  activeEffects,
  onSpawnEffect,
  onEndEffect,
  onEffectComplete,
  selectedTower,
  shouldDisableControls,
  shouldStopMovement,
  waveSystem,
  onEnemyReachEnd,
  onProjectileHit,
  onProjectileRemove,
  onSellTower,
  playableLevelId,
}) => {
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const towers = useLevelStore(towersSelector);
  const [hoveredTile, setHoveredTile] = useState<TileData | null>(null);

  const handleTileHover = useCallback(
    (gridX: number, gridZ: number) => {
      setHoveredTile({ gridX, gridZ });
    },
    [setHoveredTile]
  );

  const handleTileHoverEnd = useCallback(() => {
    setHoveredTile(null);
  }, [setHoveredTile]);

  return (
    <>
      <LevelSystem levelName={playableLevelId} />

      <Skybox />
      <Light />
      <Ground />

      <GameCamera
        movementSpeed={10}
        rotationSensitivity={0.002}
        shouldDisableControls={shouldDisableControls}
      />

      <AudioListenerSync />

      {pathWaypoints.map((_, index) => (
        <Path key={index} pathIndex={index} />
      ))}

      <Grid
        placeTower={placeTower}
        hoveredTile={hoveredTile}
        onTileHover={handleTileHover}
        setHoveredTile={setHoveredTile}
        onTileHoverEnd={handleTileHoverEnd}
      />

      <PlanetTileDecorations pathWaypoints={pathWaypoints} towers={towers} />

      <PlacementHighlightOverlay hoveredTile={hoveredTile} />

      <RelayBuffPreviewOverlay
        hoveredTile={hoveredTile}
        selectedTower={selectedTower}
      />

      <EntitiesSystem
        onEnemyReachEnd={onEnemyReachEnd}
        onProjectileHit={onProjectileHit}
        onProjectileRemove={onProjectileRemove}
        onSellTower={onSellTower}
        hoveredTile={hoveredTile}
        selectedTower={selectedTower}
        onSpawnEffect={onSpawnEffect}
        onEndEffect={onEndEffect}
        shouldStopMovement={shouldStopMovement}
        activeEffects={activeEffects}
        onEffectComplete={onEffectComplete}
      />

      <WaveLoopSystem waveSystem={waveSystem} />
    </>
  );
};
