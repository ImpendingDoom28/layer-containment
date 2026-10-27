import { FC, useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { useActions } from "koota/react";

import type { EnemyType } from "../../../core/types/game";
import { LevelSystem } from "../../systems/LevelSystem";
import {
  gridOffsetSelector,
  gridSizeSelector,
  useLevelStore,
  watersSelector,
} from "../../../core/stores/useLevelStore";
import { useLevelSystem } from "../../../core/hooks/useLevelSystem";
import { EntitiesSystem } from "../../systems/EntitiesSystem";
import { useProjectileSystem } from "../../../core/hooks/useProjectileSystem";
import { useEnemyActions } from "../../../core/hooks/useEnemyActions";
import { useGameSystem } from "../../../core/hooks/useGameSystem";
import {
  enemyTypesSelector,
  pathWidthSelector,
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { enemyActions } from "../../../core/ecs/actions/enemyActions";
import { Path } from "../../entities/Path";
import { Grid } from "../../entities/Grid";
import { PlanetTileDecorations } from "../../entities/PlanetTileDecorations";
import { CombatJuice } from "../../entities/effects/CombatJuice";
import { MainMenuCamera } from "./MainMenuCamera";
import { MAIN_MENU_ENEMY_SPAWN_CONFIG } from "./constants";
import { Ground } from "../shared/Ground";
import { Skybox } from "../shared/Skybox";
import { Light } from "../shared/Light";
import { useTileOccupancyMasks } from "../../../core/hooks/utils/useTileOccupancyMasks";

// The menu's tiles are purely visual; stable no-ops keep the memoized
// `Grid` from re-rendering every time an ambient kill updates the stores.
const noopPlaceTower = () => undefined;
const noopSetHoveredTile = () => undefined;

const selectWeightedEnemyType = (
  enemyWeights: Record<EnemyType, number> | null
): EnemyType => {
  if (!enemyWeights) return "basic";

  const totalWeight = Object.values(enemyWeights).reduce(
    (sum, weight) => sum + weight,
    0
  );
  const random = Math.random() * totalWeight;

  let cumulativeWeight = 0;
  for (const [type, weight] of Object.entries(enemyWeights) as [
    EnemyType,
    number,
  ][]) {
    cumulativeWeight += weight;
    if (random < cumulativeWeight) {
      return type;
    }
  }

  return "basic";
};

export const MainMenuScene: FC = () => {
  // Loads the game config and wires the game store; the scene no longer
  // consumes its effect callbacks (those are now ECS entities), but the
  // config-loading side effect is still required for `addEnemy` and the
  // level to initialize.
  useGameSystem();
  const levelSystem = useLevelSystem();
  const enemySystem = useEnemyActions();
  const { onProjectileHit, onProjectileRemove } =
    useProjectileSystem(enemySystem);

  const enemyTypes = useGameStore(enemyTypesSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathWidth = useGameStore(pathWidthSelector);

  const { pathWaypoints, enemyWeights } = useLevelStore();
  const gridSize = useLevelStore(gridSizeSelector);
  const gridOffset = useLevelStore(gridOffsetSelector);
  const waters = useLevelStore(watersSelector);
  const { addEnemy } = levelSystem;
  const { getLivingEnemyCount } = useActions(enemyActions);

  const occupancy = useTileOccupancyMasks({
    gridSize,
    gridOffset,
    tileSize,
    pathWaypoints,
    pathWidth,
    waters,
  });

  const lastSpawnTime = useRef(0);
  const clockRef = useRef(0);

  const spawnEnemy = useCallback(
    (enemyWeights: Record<EnemyType, number> | null) => {
      const enemyType = selectWeightedEnemyType(enemyWeights);
      const enemyConfig = enemyTypes?.[enemyType];
      if (!enemyConfig) return;

      addEnemy(enemyType);
    },
    [addEnemy, enemyTypes]
  );

  // TODO: This should be handled by the wave system, or enemy system
  useFrame((state) => {
    clockRef.current = state.clock.elapsedTime;

    const timeSinceLastSpawn = clockRef.current - lastSpawnTime.current;
    const spawnInterval =
      MAIN_MENU_ENEMY_SPAWN_CONFIG.spawnIntervalMin +
      Math.random() *
        (MAIN_MENU_ENEMY_SPAWN_CONFIG.spawnIntervalMax -
          MAIN_MENU_ENEMY_SPAWN_CONFIG.spawnIntervalMin);

    if (
      timeSinceLastSpawn >= spawnInterval &&
      getLivingEnemyCount() < MAIN_MENU_ENEMY_SPAWN_CONFIG.maxEnemies
    ) {
      spawnEnemy(enemyWeights);
      lastSpawnTime.current = clockRef.current;
    }
  });

  return (
    <>
      <LevelSystem levelName="level_main" />

      <Skybox />
      <Light />
      <Ground />

      <MainMenuCamera />

      {pathWaypoints.map((_, index) => (
        <Path key={index} pathIndex={index} />
      ))}

      {/* Same planet tiles as the in-game scene: the main menu shows the
          level board itself (land tiles with the regolith shader and the
          rock props) behind the ambient enemies. Tower placement is
          impossible in the menu, so the tiles are purely visual and get
          no-op interaction wiring. */}
      <Grid
        placeTower={noopPlaceTower}
        hoveredTile={null}
        setHoveredTile={noopSetHoveredTile}
        occupancy={occupancy}
      />

      <PlanetTileDecorations occupancy={occupancy} />

      <EntitiesSystem
        onSellTower={null}
        hoveredTile={null}
        selectedTower={null}
        shouldStopMovement={false}
        onProjectileHit={onProjectileHit}
        onProjectileRemove={onProjectileRemove}
        onEnemyReachEnd={enemySystem.onEnemyReachEnd}
      />

      {/* Death burst on `ENEMY_KILLED`; menu kills are settled by the shared
          EnemyDeathSystem so the event fires here too. No reward float: the
          menu has no gold display. */}
      <CombatJuice shouldStopMovement={false} showRewardText={false} />
    </>
  );
};
