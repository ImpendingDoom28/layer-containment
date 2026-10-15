import { FC, Suspense, useCallback, useEffect, useMemo, useState } from "react";

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
import { HUDControlsIntroModal } from "../hud/HUDControlsIntroModal";
import { HUDUpgradePanel } from "../hud/HUDUpgradePanel";
import { HUDPauseOverlay } from "../hud/HUDPauseOverlay";
import { HUDLoading } from "../hud/HUDLoading";
import { KeyboardHandlingSystem } from "../systems/KeyboardHandlingSystem";
import { ShaderReadyGate } from "../systems/ShaderReadyGate";
import { BackgroundGameLoopSystem } from "../systems/BackgroundGameLoopSystem";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../constants/canvas";
import {
  PLAYABLE_LEVEL_IDS,
  type PlayableLevelId,
} from "../../constants/playableLevels";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { useBaseHealth } from "../../core/hooks/useBaseHealth";
import { useEnemyActions } from "../../core/hooks/useEnemyActions";
import { useProjectileSystem } from "../../core/hooks/useProjectileSystem";
import { useWaveSystem } from "../../core/hooks/useWaveSystem";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import { useUpgradesSystem } from "../../core/hooks/useUpgradesSystem";
import { useHeldClose } from "../../core/hooks/useHeldClose";
import { useMenuParallax } from "../../core/hooks/useMenuParallax";
import {
  hasSeenControlsIntro,
  markControlsIntroSeen,
} from "../../core/hasSeenControlsIntro";
import { PageWrapper } from "./PageWrapper";

type GamePageProps = {
  onOpenLevelEditor: () => void;
};

export const GamePage: FC<GamePageProps> = ({ onOpenLevelEditor }) => {
  const [activePlayableLevel, setActivePlayableLevel] =
    useState<PlayableLevelId>(PLAYABLE_LEVEL_IDS[0]);
  const [areShadersReady, setAreShadersReady] = useState(false);

  useMenuParallax();

  const gameSystem = useGameSystem();
  const levelSystem = useLevelSystem();
  const baseHealth = useBaseHealth();

  const enemyActions = useEnemyActions();
  const projectileSystem = useProjectileSystem(enemyActions);
  const waveSystem = useWaveSystem(gameSystem);
  const upgradesSystem = useUpgradesSystem();

  const {
    shouldDisableControls,
    gameStatus,
    selectedTower,
    startGame,
    goToMainMenu,
    closeGameMenu,
    activeEffects,
    onSpawnEffect,
    onEndEffect,
    onEffectComplete,
    shouldStopMovement,
    shouldLockCamera,
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

  const { onEnemyReachEnd } = enemyActions;

  const { onProjectileHit, onProjectileRemove } = projectileSystem;

  const { showUpgradePanel, onEnemyUpgradePick } = upgradesSystem;
  const gameMenuClose = useHeldClose();

  const { getRemainingEnemiesInWave, startWave } = waveSystem;

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

  const [controlsIntroOpen, setControlsIntroOpen] = useState(false);

  // Show the controls intro when a run starts on the player's first visit.
  // It only ever shows once: closing it remembers itself in localStorage.
  useEffect(() => {
    if (gameStatus !== "playing") return;

    if (!hasSeenControlsIntro()) {
      setControlsIntroOpen(true);
    }
  }, [gameStatus]);

  const closeControlsIntro = useCallback(() => {
    markControlsIntroSeen();
    setControlsIntroOpen(false);
  }, []);

  const shaderGateKey = useMemo(() => {
    if (!isGameConfigLoaded) {
      return null;
    }
    if (isMenu) {
      return "menu";
    }
    if (!isLevelConfigLoaded) {
      return null;
    }
    return `game-${activePlayableLevel}`;
  }, [activePlayableLevel, isGameConfigLoaded, isLevelConfigLoaded, isMenu]);

  const isGameReady =
    isGameConfigLoaded && (isMenu || isLevelConfigLoaded) && areShadersReady;

  const loadingMessage = (() => {
    if (!isGameConfigLoaded) {
      return "Loading game...";
    }
    if (!isMenu && !isLevelConfigLoaded) {
      return "Loading level...";
    }
    return "Preparing graphics...";
  })();

  return (
    <PageWrapper>
      {!isGameReady && <HUDLoading message={loadingMessage} />}

      <Canvas
        data-testid="game-canvas"
        style={GAME_CANVAS_STYLE}
        gl={GAME_CANVAS_GL}
      >
        <BackgroundGameLoopSystem />

        {shaderGateKey !== null && (
          <ShaderReadyGate
            key={shaderGateKey}
            compileKey={shaderGateKey}
            onReadyChange={setAreShadersReady}
          />
        )}

        <Suspense fallback={<HUDLoading message={loadingMessage} />}>
          {isGameConfigLoaded && isMenu && <MainMenuScene />}
          {isGameConfigLoaded && !isMenu && (
            <GameScene
              placeTower={placeTower}
              onSpawnEffect={onSpawnEffect}
              onEndEffect={onEndEffect}
              onEffectComplete={onEffectComplete}
              selectedTower={selectedTower}
              money={money}
              activeEffects={activeEffects}
              gameStatus={gameStatus}
              waveSystem={waveSystem}
              onEnemyReachEnd={onEnemyReachEnd}
              onProjectileHit={onProjectileHit}
              onProjectileRemove={onProjectileRemove}
              onSellTower={sellTower}
              shouldDisableControls={shouldDisableControls}
              shouldStopMovement={shouldStopMovement}
              // The camera stays controllable while paused so the held frame
              // can be inspected from any angle; only menu, intro, and
              // tab-hidden states lock it.
              shouldStopCamera={shouldLockCamera || controlsIntroOpen}
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

          <KeyboardHandlingSystem onGameMenuEscape={gameMenuClose.startClose} />
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
          <HUDPauseOverlay gameStatus={gameStatus} />

          {(shouldDisableControls ? gameMenuClose.closing : true) && (
            <>
              <div
                className={cn(
                  showUpgradePanel && "pointer-events-none opacity-40"
                )}
              >
                <HUDTowerShop money={money} />

                <HUDGameStats
                  money={money}
                  health={baseHealth}
                  currentWave={currentWave}
                  remainingEnemies={remainingEnemies}
                  gameStatus={gameStatus}
                  onStartWave={startWave}
                />
              </div>

              {showUpgradePanel && (
                <HUDUpgradePanel onEnemyUpgradePick={onEnemyUpgradePick} />
              )}
            </>
          )}

          <HUDGameMenu
            gameStatus={gameStatus}
            close={gameMenuClose}
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

      <HUDControlsIntroModal
        open={controlsIntroOpen}
        onClose={closeControlsIntro}
      />
    </PageWrapper>
  );
};
