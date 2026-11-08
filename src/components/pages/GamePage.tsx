import { FC, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../ui/lib/twUtils";
import { Canvas } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { useWorld } from "koota/react";

import { GameScene } from "../scenes/game/GameScene";
import { MainMenuScene } from "../scenes/mainMenu/MainMenuScene";
import { HUDTowerShop } from "../hud/HUDTowerShop";
import { HudAnimationSystem } from "../hud/HudAnimationSystem";
import { HUDGameStats } from "../hud/HUDGameStats";
import { HUDBossBar } from "../hud/HUDBossBar";
import { HUDBossWaveBanner } from "../hud/HUDBossWaveBanner";
import { HUDGameOver } from "../hud/HUDGameOver";
import { HUDMainMenu } from "../hud/main/HUDMainMenu";
import { HUDGameMenu } from "../hud/HUDGameMenu";
import { HUDControlsIntroModal } from "../hud/HUDControlsIntroModal";
import { HUDUpgradePanel } from "../hud/HUDUpgradePanel";
import { HUDPauseOverlay } from "../hud/HUDPauseOverlay";
import { HUDBaseDamageFlash } from "../hud/HUDBaseDamageFlash";
import { HUDMobileControls } from "../hud/HUDMobileControls";
import { HUDLoading } from "../hud/HUDLoading";
import { KeyboardHandlingSystem } from "../systems/KeyboardHandlingSystem";
import { PostFX } from "../scenes/shared/PostFX";
import { ShaderReadyGate } from "../systems/ShaderReadyGate";
import { BackgroundGameLoopSystem } from "../systems/BackgroundGameLoopSystem";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../constants/canvas";
import {
  PLAYABLE_LEVEL_IDS,
  type PlayableLevelId,
} from "../../constants/playableLevels";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { useBaseHealth } from "../../core/hooks/useBaseHealth";
import { useLevelSystem } from "../../core/hooks/useLevelSystem";
import { useUpgradesSystem } from "../../core/hooks/useUpgradesSystem";
import { useHeldClose } from "../../core/hooks/useHeldClose";
import { useLoadingTransition } from "../../core/hooks/useLoadingTransition";
import { useMenuParallax } from "../../core/hooks/useMenuParallax";
import {
  hasSeenControlsIntro,
  markControlsIntroSeen,
} from "../../core/hasSeenControlsIntro";
import { PageWrapper } from "./PageWrapper";
import { getAreModelsLoaded } from "../../constants/models";

import { getRunStats } from "../../core/ecs/selectors/runStats";
import { SimulationClockProvider } from "../../core/contexts/SimulationClockContext";
import {
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { WaterClockProvider } from "../../core/contexts/WaterClockContext";
import { useEntityIds } from "../../core/contexts/EntityIdContext";
import { createGameSession } from "../../core/session/gameSession";
import { GameSessionSystem } from "../systems/GameSessionSystem";

type GamePageProps = {
  onOpenLevelEditor: () => void;
  onOpenTestingLevel: () => void;
};

export const GamePage: FC<GamePageProps> = ({
  onOpenLevelEditor,
  onOpenTestingLevel,
}) => {
  const { t } = useTranslation();
  const [activePlayableLevel, setActivePlayableLevel] =
    useState<PlayableLevelId>(PLAYABLE_LEVEL_IDS[0]);
  const [areShadersReady, setAreShadersReady] = useState(false);
  const [areModelsReady, setAreModelsReady] = useState(false);

  useMenuParallax();

  // The tower model URLs live in the game config (`towerTypes.<type>.model`),
  // which loads asynchronously, so they are only known once the config has
  // loaded. The loading screen waits for the models (the first visible frame
  // must be a fully-populated scene, not an empty board that fills in as the
  // models stream in): once `towerTypes` is available, kick off and await the
  // loads. The enemy models are already preloaded at boot (see
  // constants/models); the tower loads start here. `getAreModelsLoaded`
  // is a session singleton, so this resolves exactly once.
  const towerTypes = useGameStore(towerTypesSelector);
  useEffect(() => {
    if (!towerTypes) return;
    let active = true;
    const towerModelUrls = Object.values(towerTypes).map(
      (tower) => tower.model.url
    );
    getAreModelsLoaded(towerModelUrls).then(() => {
      if (active) setAreModelsReady(true);
    });
    return () => {
      active = false;
    };
  }, [towerTypes]);

  const gameSystem = useGameSystem();
  const levelSystem = useLevelSystem();
  const baseHealth = useBaseHealth();
  const upgradesSystem = useUpgradesSystem();
  const world = useWorld();
  const entityIds = useEntityIds();
  const session = useMemo(
    () => createGameSession({ world, ...entityIds }),
    [world, entityIds]
  );

  // A start in flight when the page unmounts would otherwise resolve late and
  // mutate the shared world/stores from another route; invalidating it here
  // drops the stale load instead.
  useEffect(() => session.dispose, [session]);

  const {
    shouldDisableControls,
    gameStatus,
    selectedTower,
    openGameMenu,
    closeGameMenu,
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
    isLevelConfigLoaded,
  } = levelSystem;

  const { showUpgradePanel, onEnemyUpgradePick } = upgradesSystem;
  const gameMenuClose = useHeldClose();

  const { getRemainingEnemiesInWave, startWave } = session;

  const onStartGameWithLevel = useCallback(
    async (level: PlayableLevelId) => {
      // Commit the active level only once the run has actually started; a
      // failed load must not desync the picker from the session's level.
      try {
        await session.startRun(level);
        setActivePlayableLevel(level);
      } catch (error) {
        console.error(`Failed to start level "${level}".`, error);
      }
    },
    [session]
  );

  const onRestart = useCallback(() => {
    session.restartRun().catch((error) => {
      console.error("Failed to restart the run.", error);
    });
  }, [session]);

  const onGoToMainMenu = useCallback(() => {
    session.endRun();
  }, [session]);

  const nextLevelId =
    PLAYABLE_LEVEL_IDS[PLAYABLE_LEVEL_IDS.indexOf(activePlayableLevel) + 1] ??
    null;

  const onStartNextLevel = useCallback(() => {
    if (nextLevelId) void onStartGameWithLevel(nextLevelId);
  }, [nextLevelId, onStartGameWithLevel]);

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
    !session.isRunStarting &&
    isGameConfigLoaded &&
    (isMenu || isLevelConfigLoaded) &&
    areShadersReady &&
    areModelsReady;

  // Loading stays mounted while its text slides out; only the finished
  // animation (or the reduced-motion path) unmounts it.
  const {
    isShowing: isShowingLoading,
    isClosing: isClosingLoading,
    onExited: handleLoadingExited,
  } = useLoadingTransition(isGameReady);

  const loadingMessage = (() => {
    if (!isGameConfigLoaded) {
      return t("common.loadingGame");
    }
    if (!isMenu && !isLevelConfigLoaded) {
      return t("common.loadingLevel");
    }
    if (!areModelsReady) {
      return t("common.loadingModels");
    }
    return t("common.preparingGraphics");
  })();

  return (
    <PageWrapper>
      {isShowingLoading && (
        <HUDLoading
          message={loadingMessage}
          closing={isClosingLoading}
          onExited={handleLoadingExited}
        />
      )}

      <Canvas
        data-testid="game-canvas"
        style={GAME_CANVAS_STYLE}
        gl={GAME_CANVAS_GL}
      >
        <SimulationClockProvider>
          <WaterClockProvider>
            <BackgroundGameLoopSystem />

            {shaderGateKey !== null && (
              <ShaderReadyGate
                key={shaderGateKey}
                compileKey={shaderGateKey}
                onReadyChange={setAreShadersReady}
              />
            )}

            <GameSessionSystem session={session}>
              <Suspense fallback={<HUDLoading message={loadingMessage} />}>
                {isGameConfigLoaded && isMenu && <MainMenuScene />}
                {isGameConfigLoaded && !isMenu && (
                  <GameScene
                    placeTower={placeTower}
                    selectedTower={selectedTower}
                    gameStatus={gameStatus}
                    onSellTower={sellTower}
                    // The camera stays controllable while paused so the held frame
                    // can be inspected from any angle; only menu, intro, and
                    // tab-hidden states lock it.
                    shouldStopCamera={shouldLockCamera || controlsIntroOpen}
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

                <KeyboardHandlingSystem
                  onGameMenuEscape={gameMenuClose.startClose}
                />
              </Suspense>
            </GameSessionSystem>

            <PostFX />
          </WaterClockProvider>
        </SimulationClockProvider>
      </Canvas>

      {isGameReady && isMenu && (
        <HUDMainMenu
          onStartGameWithLevel={onStartGameWithLevel}
          onOpenLevelEditor={onOpenLevelEditor}
          onOpenTestingLevel={onOpenTestingLevel}
        />
      )}

      {isGameReady && !isMenu && (
        <>
          <HUDPauseOverlay gameStatus={gameStatus} />

          {/* Red-tinted vignette flash when the base takes damage (paired
              with the base-damage camera punch). Self-gates on health drops. */}
          <HUDBaseDamageFlash />

          <HudAnimationSystem />

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
                  onOpenGameMenu={openGameMenu}
                />

                {/* Big boss bar for the level boss (waves 4, 8, 12, ...).
                    Self-gates on the active `IsBoss` entity. */}
                <HUDBossBar />

                {/* One-shot "BOSS WAVE" flash on boss-wave start. Self-gates
                    on the WAVE_STARTED event + the level boss. */}
                <HUDBossWaveBanner />

                {/* Mobile scheme: on-screen D-pad for camera moves (no WASD
                    on touch screens). Self-gates on viewport + scheme. */}
                <HUDMobileControls />
              </div>

              {/*
                Rendered unconditionally so the panel can play its exit
                animation; it self-gates via the upgrade store and returns
                null when the gate is closed and no exit is in flight.
              */}
              <HUDUpgradePanel onEnemyUpgradePick={onEnemyUpgradePick} />
            </>
          )}

          <HUDGameMenu
            gameStatus={gameStatus}
            close={gameMenuClose}
            onResume={closeGameMenu}
            onRestart={onRestart}
            onGoToMainMenu={onGoToMainMenu}
          />
        </>
      )}

      {/*
        Rendered outside the !isMenu branch so a run that ends with a
        "menu" status (e.g. going to the main menu from the game-over
        screen) doesn't unmount it before the exit animation finishes; it
        self-gates on gameStatus and returns null otherwise.
      */}
      <HUDGameOver
        gameStatus={gameStatus}
        currentWave={currentWave}
        money={money}
        enemiesKilled={enemiesKilled}
        stats={getRunStats(world)}
        onRestart={onRestart}
        onGoToMainMenu={onGoToMainMenu}
        // Offered only on a win, when a next level exists (the modal hides it
        // on a defeat or the final level).
        onNextLevel={nextLevelId ? onStartNextLevel : undefined}
      />

      <HUDControlsIntroModal
        open={controlsIntroOpen}
        onClose={closeControlsIntro}
      />
    </PageWrapper>
  );
};
