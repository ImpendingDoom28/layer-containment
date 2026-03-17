import { FC, Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { Stats } from "@react-three/drei";

import { GameScene } from "../scenes/game/GameScene";
import { MainMenuScene } from "../scenes/mainMenu/MainMenuScene";
import { HUDTowerShop } from "../hud/HUDTowerShop";
import { HUDGameStats } from "../hud/HUDGameStats";
import { HUDGameOver } from "../hud/HUDGameOver";
import { HUDMainMenu } from "../hud/HUDMainMenu";
import { HUDGameMenu } from "../hud/HUDGameMenu";
import { HUDUpgradePanel } from "../hud/HUDUpgradePanel";
import { HUDLoading } from "../hud/HUDLoading";
import { KeyboardHandlingSystem } from "../systems/KeyboardHandlingSystem";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { useEnemySystem } from "../../core/hooks/useEnemySystem";
import { useProjectileSystem } from "../../core/hooks/useProjectileSystem";
import { useWaveSystem } from "../../core/hooks/useWaveSystem";
import { useAudioSystem } from "../../core/hooks/useAudioSystem";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import { useUpgradesSystem } from "../../core/hooks/useUpgradesSystem";
import type { Tower } from "../../core/types/game";

type GamePageProps = {
  onOpenLevelEditor: () => void;
};

const canvasStyle = { width: "100%", height: "100%" };
const canvasGl = { antialias: true };

export const GamePage: FC<GamePageProps> = ({ onOpenLevelEditor }) => {
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
    placeTower,
    sellTower,
    currentWave,
    resetState: resetLevelState,
    isLevelConfigLoaded,
  } = levelSystem;

  const { onEnemyReachEnd, onEnemyUpdate } = enemySystem;

  const { onProjectileHit, onProjectileRemove } = projectileSystem;

  const { showUpgradePanel, onConfirmUpgrades, onSkipUpgrades } =
    upgradesSystem;

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

      <Canvas style={canvasStyle} gl={canvasGl}>
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
        <HUDMainMenu onPlay={startGame} onOpenLevelEditor={onOpenLevelEditor} />
      )}

      {isGameReady && !isMenu && (
        <>
          {!shouldDisableControls && (
            <>
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

              {showUpgradePanel && (
                <HUDUpgradePanel
                  onConfirm={onConfirmUpgrades}
                  onSkip={onSkipUpgrades}
                />
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
            onRestart={onRestart}
            onGoToMainMenu={onGoToMainMenu}
          />
        </>
      )}
    </div>
  );
};
