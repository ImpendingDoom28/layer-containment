import { useCallback, useState } from "react";

import type { PlayableLevelId } from "../../../constants/playableLevels";
import { Grid } from "../../entities/Grid";
import { Path } from "../../entities/Path";
import { GameCamera } from "./GameCamera";
import type {
  Tower as TowerInstance,
  Enemy as EnemyInstance,
  Projectile as ProjectileInstance,
  TowerType,
  GameStatus,
  ActiveEffect,
} from "../../../core/types/game";
import { WaveLoopSystem } from "../../systems/WaveLoopSystem";
import { WaveSystem } from "../../../core/hooks/useWaveSystem";
import { TileData } from "../../../core/types/utils";
import { EntitiesSystem } from "../../systems/EntitiesSystem";
import { LevelSystem } from "../../systems/LevelSystem";
import {
  pathWaypointsSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import { Ground } from "../shared/Ground";
import { Skybox } from "../shared/Skybox";
import { Light } from "../shared/Light";

type GameSceneProps = {
  activeEffects: ActiveEffect[];
  onSpawnEffect: (position: [number, number, number], color: string) => void;
  onEndEffect: (position: [number, number, number], color: string) => void;
  onEffectComplete: (effectId: number) => void;
  selectedTowerType: TowerType | null;
  selectedTower: TowerInstance | null;
  shouldDisableControls: boolean;
  shouldStopMovement: boolean;
  gameStatus: GameStatus;
  waveSystem: WaveSystem;
  money: number;
  timeUntilNextWave: number | null;
  onTileClick: (gridX: number, gridZ: number) => void;
  onTowerClick: (tower: TowerInstance) => void;
  onEnemyReachEnd: (enemyId: number) => void;
  onEnemyUpdate: (enemyId: number, updates: Partial<EnemyInstance>) => void;
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
  activeEffects,
  onSpawnEffect,
  onEndEffect,
  onEffectComplete,
  selectedTowerType,
  selectedTower,
  shouldDisableControls,
  shouldStopMovement,
  waveSystem,
  timeUntilNextWave,
  onTileClick,
  onTowerClick,
  onEnemyReachEnd,
  onEnemyUpdate,
  onProjectileHit,
  onProjectileRemove,
  onSellTower,
  playableLevelId,
}) => {
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
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

      {pathWaypoints.map((_, index) => (
        <Path
          key={index}
          timeUntilNextWave={timeUntilNextWave}
          pathIndex={index}
        />
      ))}

      <Grid
        hoveredTile={hoveredTile}
        onTileClick={onTileClick}
        onTileHover={handleTileHover}
        setHoveredTile={setHoveredTile}
        onTileHoverEnd={handleTileHoverEnd}
        selectedTowerType={selectedTowerType}
      />

      <EntitiesSystem
        onTowerClick={onTowerClick}
        onEnemyReachEnd={onEnemyReachEnd}
        onEnemyUpdate={onEnemyUpdate}
        onProjectileHit={onProjectileHit}
        onProjectileRemove={onProjectileRemove}
        onSellTower={onSellTower}
        hoveredTile={hoveredTile}
        selectedTowerType={selectedTowerType}
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
