import { FC, useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";

import type { EnemyType } from "../../../core/types/game";
import { LevelSystem } from "../../systems/LevelSystem";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import { useLevelSystem } from "../../../core/hooks/useLevelSystem";
import { EntitiesSystem } from "../../systems/EntitiesSystem";
import { useProjectileSystem } from "../../../core/hooks/useProjectileSystem";
import { useEnemySystem } from "../../../core/hooks/useEnemySystem";
import {
  enemyTypesSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useGameSystem } from "../../../core/hooks/useGameSystem";
import { getLivingEnemySnapshots } from "../../../core/ecs/selectors/enemySnapshots";
import { Path } from "../../entities/Path";
import { MainMenuCamera } from "./MainMenuCamera";
import { MAIN_MENU_ENEMY_SPAWN_CONFIG } from "./constants";
import { Ground } from "../shared/Ground";
import { Skybox } from "../shared/Skybox";
import { Light } from "../shared/Light";

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
  const gameSystem = useGameSystem();
  const levelSystem = useLevelSystem();
  const enemySystem = useEnemySystem(levelSystem);
  const { onProjectileHit, onProjectileRemove } =
    useProjectileSystem(enemySystem);

  const enemyTypes = useGameStore(enemyTypesSelector);
  const { onSpawnEffect, onEndEffect, activeEffects, onEffectComplete } =
    gameSystem;

  const { pathWaypoints, enemyWeights } = useLevelStore();
  const { addEnemy, removeEnemy } = levelSystem;
  const world = useWorld();

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
      getLivingEnemySnapshots(world).length <
        MAIN_MENU_ENEMY_SPAWN_CONFIG.maxEnemies
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

      <EntitiesSystem
        onSellTower={null}
        hoveredTile={null}
        selectedTower={null}
        shouldStopMovement={false}
        onProjectileHit={onProjectileHit}
        onProjectileRemove={onProjectileRemove}
        onEnemyReachEnd={removeEnemy}
        onSpawnEffect={onSpawnEffect}
        onEndEffect={onEndEffect}
        activeEffects={activeEffects}
        onEffectComplete={onEffectComplete}
      />
    </>
  );
};
