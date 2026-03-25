import { FC, Suspense, useCallback, useState } from "react";

import { cn } from "../ui/lib/twUtils";
import { Canvas } from "@react-three/fiber";
import { Stats } from "@react-three/drei";

import { GameScene } from "../scenes/game/GameScene";
import { MainMenuScene } from "../scenes/mainMenu/MainMenuScene";
import { HUDTowerShop } from "../hud/HUDTowerShop";
import { HUDGameStats } from "../hud/HUDGameStats";
import { HUDGameOver } from "../hud/HUDGameOver";
import { HUDMainMenu } from "../hud/main/HUDMainMenu";
import { HUDGameMenu } from "../hud/HUDGameMenu";
import { HUDUpgradePanel } from "../hud/HUDUpgradePanel";
import { HUDLoading } from "../hud/HUDLoading";
import { KeyboardHandlingSystem } from "../systems/KeyboardHandlingSystem";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../constants/canvas";
import {
  PLAYABLE_LEVEL_IDS,
  type PlayableLevelId,
} from "../../constants/playableLevels";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { useEnemySystem } from "../../core/hooks/useEnemySystem";
import { useProjectileSystem } from "../../core/hooks/useProjectileSystem";
import { useWaveSystem } from "../../core/hooks/useWaveSystem";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import { useUpgradesSystem } from "../../core/hooks/useUpgradesSystem";
import type { Tower } from "../../core/types/game";

type GamePageProps = {
  onOpenLevelEditor: () => void;
};

export const GamePage: FC<GamePageProps> = ({ onOpenLevelEditor }) => {
  const [activePlayableLevel, setActivePlayableLevel] =
    useState<PlayableLevelId>(PLAYABLE_LEVEL_IDS[0]);

  const gameSystem = useGameSystem();
  const levelSystem = useLevelSystem();

  const enemySystem = useEnemySystem(levelSystem);
  const projectileSystem = useProjectileSystem(enemySystem);
  const waveSystem = useWaveSystem(gameSystem);
  const upgradesSystem = useUpgradesSystem(waveSystem);

  const {
    health,
    shouldDisableControls,
    gameStatus,
    selectedTowerType,
    selectedTower,
    setSelectedTowerType,
    setSelectedTower,
    startGame,
    goToMainMenu,
    closeGameMenu,
    activeEffects,
    onSpawnEffect,
    onEndEffect,
    onEffectComplete,
    shouldStopMovement,
    debug,
    isGameConfigLoaded,
  } = gameSystem;

  const {
    money,
    enemiesKilled,
    placeTower,
    sellTower,
    currentWave,
    resetState: resetLevelState,
    isLevelConfigLoaded,
  } = levelSystem;

  const { onEnemyReachEnd, onEnemyUpdate } = enemySystem;

  const { onProjectileHit, onProjectileRemove } = projectileSystem;

  const { showUpgradePanel, onEnemyUpgradePick } = upgradesSystem;

  const {
    getRemainingEnemiesInWave,
    timeUntilNextWave,
    startNextWaveEarly,
    startFirstWave,
  } = waveSystem;

  const onTileClick = useCallback(
    (gridX: number, gridZ: number) => {
      if (
        selectedTowerType &&
        (gameStatus === "playing" || gameStatus === "paused")
      ) {
        placeTower(gridX, gridZ, selectedTowerType);
      } else if (selectedTower) {
        setSelectedTower(null);
      }
    },
    [selectedTowerType, gameStatus, selectedTower, placeTower, setSelectedTower]
  );

  const onTowerClick = useCallback(
    (tower: Tower) => {
      if (selectedTower?.id === tower.id) {
        setSelectedTower(null);
      } else {
        setSelectedTower(tower);
        setSelectedTowerType(null);
      }
    },
    [selectedTower, setSelectedTower, setSelectedTowerType]
  );

  const onDeselectTower = useCallback(() => {
    setSelectedTowerType(null);
  }, [setSelectedTowerType]);

  const onStartGameWithLevel = useCallback(
    async (level: PlayableLevelId) => {
      setActivePlayableLevel(level);
      await startGame();
    },
    [startGame]
  );

  const onRestart = useCallback(() => {
    startGame();
    resetLevelState();
  }, [startGame, resetLevelState]);

  const onGoToMainMenu = useCallback(() => {
    goToMainMenu();
    resetLevelState();
  }, [goToMainMenu, resetLevelState]);

  const remainingEnemies = getRemainingEnemiesInWave();
  const isMenu = gameStatus === "menu";

  const isGameReady = isGameConfigLoaded && (isMenu || isLevelConfigLoaded);

  return (
    <div className="relative w-screen h-screen bg-gray-900">
      {!isGameReady && (
        <HUDLoading
          message={isGameConfigLoaded ? "Loading level..." : "Loading game..."}
        />
      )}

      <Canvas
        data-testid="game-canvas"
        style={GAME_CANVAS_STYLE}
        gl={GAME_CANVAS_GL}
      >
        <Suspense fallback={null}>
          {isGameConfigLoaded && isMenu && <MainMenuScene />}
          {isGameConfigLoaded && !isMenu && (
            <GameScene
              onSpawnEffect={onSpawnEffect}
              onEndEffect={onEndEffect}
              onEffectComplete={onEffectComplete}
              selectedTowerType={selectedTowerType}
              selectedTower={selectedTower}
              money={money}
              activeEffects={activeEffects}
              gameStatus={gameStatus}
              waveSystem={waveSystem}
              timeUntilNextWave={timeUntilNextWave}
              onTileClick={onTileClick}
              onTowerClick={onTowerClick}
              onEnemyReachEnd={onEnemyReachEnd}
              onEnemyUpdate={onEnemyUpdate}
              onProjectileHit={onProjectileHit}
              onProjectileRemove={onProjectileRemove}
              onSellTower={sellTower}
              shouldDisableControls={shouldDisableControls}
              shouldStopMovement={shouldStopMovement}
              playableLevelId={activePlayableLevel}
            />
          )}

          {debug && (
            <>
              <Stats showPanel={0} className="top-[calc(100%-48px)]!" />
              <Stats
                showPanel={1}
                className="top-[calc(100%-48px)]! bottom-0! left-20!"
              />
              <Stats
                showPanel={2}
                className="top-[calc(100%-48px)]! left-40!"
              />
            </>
          )}
          <KeyboardHandlingSystem />
        </Suspense>
      </Canvas>

      {isGameReady && isMenu && (
        <HUDMainMenu
          onStartGameWithLevel={onStartGameWithLevel}
          onOpenLevelEditor={onOpenLevelEditor}
        />
      )}

      {isGameReady && !isMenu && (
        <>
          {!shouldDisableControls && (
            <>
              <div
                className={cn(
                  showUpgradePanel && "pointer-events-none opacity-40"
                )}
              >
                <HUDTowerShop
                  selectedTowerType={selectedTowerType}
                  money={money}
                  onSelectTower={setSelectedTowerType}
                  onDeselectTower={onDeselectTower}
                />

                <HUDGameStats
                  money={money}
                  health={health}
                  currentWave={currentWave}
                  remainingEnemies={remainingEnemies}
                  gameStatus={gameStatus}
                  timeUntilNextWave={timeUntilNextWave}
                  onStartWaveEarly={startNextWaveEarly}
                  onStartFirstWave={startFirstWave}
                />
              </div>

              {showUpgradePanel && (
                <HUDUpgradePanel onEnemyUpgradePick={onEnemyUpgradePick} />
              )}
            </>
          )}

          <HUDGameMenu
            gameStatus={gameStatus}
            onResume={closeGameMenu}
            onRestart={onRestart}
            onGoToMainMenu={onGoToMainMenu}
          />

          <HUDGameOver
            gameStatus={gameStatus}
            currentWave={currentWave}
            money={money}
            enemiesKilled={enemiesKilled}
            onRestart={onRestart}
            onGoToMainMenu={onGoToMainMenu}
          />
        </>
      )}
    </div>
  );
};
