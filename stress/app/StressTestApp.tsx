/**
 * Dedicated performance stress-test harness.
 *
 * This entry (served via `stress/index.stress.html` /
 * `stress/vite.config.ts`) boots the full game scene on the generated
 * "stress" level:
 *
 *   - 64x64 grid (4096 shader-compiled tiles)
 *   - 4 portals: one serpentine path per 32x32 quadrant (4 end buildings)
 *   - 150 pre-placed towers of all 6 types (incl. relay / chain / laser)
 *   - 500 one-tile animated water bodies (two shades, shared materials)
 *   - 20 waves, ~4,260 enemies total (all 5 enemy types, incl. splitter)
 *
 * To maximize GPU/CPU stress, the camera is pinned at the far end of the map
 * so the entire board renders in a single frame, and the scene only mounts
 * after every 3D model has loaded (no primitive fallbacks are ever shown).
 *
 * The run is fully unattended:
 *   - base health is set very high so the run never ends from leaks
 *   - enemy upgrade gates auto-pick the first option
 *   - the next wave auto-starts as soon as it is ready
 *   - when the run is won it restarts, looping forever
 *
 * A DOM overlay (top-left) shows live FPS, draw calls, triangles, wave and
 * entity counts; drei's three-panel Stats sits along the bottom.
 *
 * Nothing in this folder is imported by the default `index.html` entry, so
 * the normal `vite build` never bundles the stress-test code.
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { useActions, useWorld, WorldProvider } from "koota/react";

import { GameScene } from "../../src/components/scenes/game/GameScene";
import { ShaderReadyGate } from "../../src/components/systems/ShaderReadyGate";
import { GameSessionSystem } from "../../src/components/systems/GameSessionSystem";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../src/constants/canvas";
import { getAreModelsLoaded } from "../../src/constants/models";
import { worldBaseActions } from "../../src/core/ecs/actions/baseActions";
import {
  EntityIdProvider,
  useEntityIds,
} from "../../src/core/contexts/EntityIdContext";
import { SimulationClockProvider } from "../../src/core/contexts/SimulationClockContext";
import { WaterClockProvider } from "../../src/core/contexts/WaterClockContext";
import { world } from "../../src/core/ecs/world";
import { useGameSystem } from "../../src/core/hooks/useGameSystem";
import { useLevelSystem } from "../../src/core/hooks/useLevelSystem";
import { createGameSession } from "../../src/core/session/gameSession";
import {
  towerTypesSelector,
  useGameStore,
} from "../../src/core/stores/useGameStore";
import { useLevelStore } from "../../src/core/stores/useLevelStore";

import { settleModelStatuses } from "./modelSettlement";
import { StressOverlay } from "./components/StressOverlay";
import { StressStatsCollector } from "./components/StressStatsCollector";
import { FrameStats } from "./types/frameStats";
import { StressCameraRig } from "./components/StressCameraRig";
import { StressAutoDriver } from "./components/StressAutoDriver";
import { StressDebugBridge } from "./components/StressDebugBridge";

const STRESS_LEVEL_ID = "stress" as const;
const STRESS_BASE_HEALTH = 1_000_000;

/**
 * How long to keep waiting for models to settle *after* the shared load
 * promise resolves (which itself caps at 15s). A load still in flight when the
 * promise hits its cap is not a fallback yet — the scene keeps rendering it in.
 * Only a model that is still pending when this extra window closes (a stalled
 * download) or that settled to an error marks the run invalid.
 */
const MODEL_SETTLE_EXTRA_MS = 60_000;
/** Poll interval for the model-settlement check. */
const MODEL_SETTLE_POLL_MS = 250;

const createFrameStats = (): FrameStats => ({
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
  programs: 0,
  frameCount: 0,
  frameTime: 0,
  windowFps: 0,
  windowFrameMs: 0,
  windowDrawCalls: 0,
  windowTriangles: 0,
  windowPrograms: 0,
  windowElapsed: 0,
  windowFrames: 0,
  windowTime: 0,
  windowCallSum: 0,
  windowTriSum: 0,
  windowProgSum: 0,
  windowDone: false,
  modelsSettled: false,
  runValid: true,
});

const resetMetricsWindow = (s: FrameStats) => {
  s.windowFps = 0;
  s.windowFrameMs = 0;
  s.windowDrawCalls = 0;
  s.windowTriangles = 0;
  s.windowPrograms = 0;
  s.windowElapsed = 0;
  s.windowFrames = 0;
  s.windowTime = 0;
  s.windowCallSum = 0;
  s.windowTriSum = 0;
  s.windowProgSum = 0;
  s.windowDone = false;
};

const StressTestGame = () => {
  const [runCount, setRunCount] = useState(0);
  const [areShadersReady, setAreShadersReady] = useState(false);
  // The heavy scene must not render before every 3D model (all 5 enemy types,
  // the base, and all 6 tower types from the game config) has loaded: while a
  // GLB is still streaming, `ModelLoader` shows a primitive placeholder. Gating
  // on `getAreModelsLoaded` (the same mechanism `GamePage` uses) means the first
  // rendered frame is a fully-populated scene with no fallback primitives.
  const [areModelsReady, setAreModelsReady] = useState(false);
  const statsRef = useRef<FrameStats>(createFrameStats());
  const startedRef = useRef(false);
  // Mirrors areShadersReady in a ref so the frame loop (collector) can tell
  // when the heavy scene is actually rendering and start averaging.
  const readyRef = useRef(false);
  // Mirrors `runValid` (all models actually finished loading) so the collector
  // can skip the average window for an invalid run.
  const runValidRef = useRef(true);

  const handleReadyChange = useCallback((ready: boolean) => {
    readyRef.current = ready;
    setAreShadersReady(ready);
  }, []);

  // The tower model URLs live in the game config (`towerTypes.<type>.model`),
  // which loads asynchronously, so they are only known once the config has
  // loaded. The enemy + base models are preloaded at boot (see
  // constants/models); the tower loads start here. `getAreModelsLoaded` is a
  // session singleton, so this resolves exactly once.
  const towerTypes = useGameStore(towerTypesSelector);
  useEffect(() => {
    if (!towerTypes) return;
    let active = true;
    const towerModelUrls = Object.values(towerTypes).map(
      (tower) => tower.model.url
    );
    getAreModelsLoaded(towerModelUrls).then(async () => {
      if (!active) return;
      // The shared promise can resolve at its 15s cap while a model is still
      // streaming (and `GamePage` keeps rendering on placeholders in that
      // case), so the stress harness keeps checking the actual cache entries
      // until every model has settled — loaded or failed — and only then
      // mounts the scene and opens the metrics window. A run that settles on
      // primitive fallbacks is not a valid baseline, so its window is
      // skipped (reported MODELS invalid).
      const valid = await settleModelStatuses(
        towerModelUrls,
        MODEL_SETTLE_EXTRA_MS,
        MODEL_SETTLE_POLL_MS
      );
      if (!active) return;
      setAreModelsReady(true);
      statsRef.current.modelsSettled = true;
      runValidRef.current = valid;
      statsRef.current.runValid = valid;
    });
    return () => {
      active = false;
    };
  }, [towerTypes]);

  const { gameStatus, isGameConfigLoaded, selectedTower } = useGameSystem();
  const { sellTower, isLevelConfigLoaded } = useLevelSystem();

  const world = useWorld();
  const entityIds = useEntityIds();
  const session = useMemo(
    () => createGameSession({ world, ...entityIds }),
    [world, entityIds]
  );
  useEffect(() => session.dispose, [session]);

  const { spawnBase } = useActions(worldBaseActions);

  // The stress level is fully pre-built and placement is disabled, so this is
  // a stable no-op. It must be referentially stable: StressTestGame re-renders
  // on every enemy kill/spawn (money / activeEffects subscriptions), and an
  // inline `() => {}` here would give `Grid` a new prop each time, defeating
  // its memo and re-rendering all 4096 tile meshes per kill.
  const onPlaceTowerNoop = useCallback(() => {
    /* stress level is fully pre-built; placement is disabled */
  }, []);

  const beginRun = useCallback(() => {
    // startRun clears the run state and spawns the base with the level's own
    // starting health; bump it to the stress value afterwards so the run never
    // ends from leaks.
    void session
      .startRun(STRESS_LEVEL_ID)
      .then(() => {
        spawnBase(STRESS_BASE_HEALTH);
      })
      .catch((error) => {
        console.error("Failed to start the stress run.", error);
      });
  }, [session, spawnBase]);

  // Start the unattended run once the game config is loaded.
  useEffect(() => {
    if (!isGameConfigLoaded || startedRef.current) return;
    startedRef.current = true;
    beginRun();
  }, [isGameConfigLoaded, beginRun]);

  const restart = useCallback(() => {
    void session
      .restartRun()
      .then(() => {
        // `restartRun` resolves without starting a run when `currentLevelId`
        // is null (e.g. after a failed initial start); only restore the 1M HP
        // base once a run is actually active.
        if (!useLevelStore.getState().isLevelConfigLoaded) return;
        spawnBase(STRESS_BASE_HEALTH);
      })
      .catch((error) => {
        console.error("Failed to restart the stress run.", error);
      });
    // Re-arm the 30s averaging window for the new run.
    resetMetricsWindow(statsRef.current);
    setRunCount((c) => c + 1);
  }, [session, spawnBase]);

  const loadingMessage = !isGameConfigLoaded
    ? "Loading game config..."
    : isLevelConfigLoaded
      ? areModelsReady
        ? "Preparing graphics..."
        : "Loading models..."
      : "Loading stress level...";

  return (
    <div className="fixed inset-0">
      <Canvas
        data-testid="game-canvas"
        style={GAME_CANVAS_STYLE}
        gl={GAME_CANVAS_GL}
      >
        <ShaderReadyGate
          key={
            isGameConfigLoaded && isLevelConfigLoaded && areModelsReady
              ? `stress-${STRESS_LEVEL_ID}`
              : "stress-loading"
          }
          compileKey={
            isGameConfigLoaded && isLevelConfigLoaded && areModelsReady
              ? `stress-${STRESS_LEVEL_ID}`
              : "stress-loading"
          }
          onReadyChange={handleReadyChange}
        />
        <StressStatsCollector
          statsRef={statsRef}
          readyRef={readyRef}
          runValidRef={runValidRef}
        />
        <StressDebugBridge />

        {isGameConfigLoaded && isLevelConfigLoaded && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-40 grid place-items-center text-sm text-gray-300">
                {loadingMessage}
              </div>
            }
          >
            <StressCameraRig />
            {areModelsReady && (
              // WaterClockProvider drives the shared ripple uniform every
              // frame, which is what animates the 500 water bodies; without it
              // `useWaterClock` falls back to a frozen uniform and the water
              // is static.
              <WaterClockProvider>
                <SimulationClockProvider>
                  <GameSessionSystem session={session}>
                    <GameScene
                      placeTower={onPlaceTowerNoop}
                      selectedTower={selectedTower}
                      gameStatus={gameStatus}
                      onSellTower={sellTower}
                      // Hard-lock the camera for the whole baseline run: while
                      // the game is "playing", `shouldStopMovement` is false,
                      // so passing it through would let GameCamera's frame
                      // clamp the height to 20 and pull the rig's (0, 40, 80)
                      // vantage back inside the field, breaking the documented
                      // end-of-map view and the baseline numbers.
                      shouldStopCamera
                    />
                  </GameSessionSystem>
                </SimulationClockProvider>
              </WaterClockProvider>
            )}
            <Stats showPanel={0} className="top-[calc(100%-48px)]!" />
            <Stats
              showPanel={1}
              className="top-[calc(100%-48px)]! bottom-0! left-20!"
            />
            <Stats showPanel={2} className="top-[calc(100%-48px)]! left-40!" />
            <StressAutoDriver startWave={session.startWave} restart={restart} />
          </Suspense>
        )}
      </Canvas>

      <StressOverlay statsRef={statsRef} runCount={runCount} />

      {!areShadersReady && (
        <div className="pointer-events-none fixed bottom-3 right-3 z-50 rounded-md bg-black/70 px-3 py-2 text-[12px] text-gray-300">
          compiling shaders…
        </div>
      )}
    </div>
  );
};

export const StressTestApp = () => (
  <WorldProvider world={world}>
    <EntityIdProvider>
      <StressTestGame />
    </EntityIdProvider>
  </WorldProvider>
);
