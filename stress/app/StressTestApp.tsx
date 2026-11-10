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
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { useActions, useWorld, WorldProvider } from "koota/react";

import { GameScene } from "../../src/components/scenes/game/GameScene";
import { ShaderReadyGate } from "../../src/components/systems/ShaderReadyGate";
import { GameSessionSystem } from "../../src/components/systems/GameSessionSystem";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../src/constants/canvas";
import { getAreModelsLoaded } from "../../src/constants/models";
import { worldBaseActions } from "../../src/core/ecs/actions/baseActions";
import { isBase } from "../../src/core/ecs/traits/base";
import { HealthInfo } from "../../src/core/ecs/traits/health";
import { enemyActions } from "../../src/core/ecs/actions/enemyActions";
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
import { useUpgradeStore } from "../../src/core/stores/useUpgradeStore";

import { settleModelStatuses } from "./modelSettlement";

const STRESS_LEVEL_ID = "stress" as const;
const STRESS_BASE_HEALTH = 1_000_000;
/** How long (seconds) the average-metrics window stays open per run. */
const METRICS_WINDOW_SECONDS = 30;
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

type FrameStats = {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  /** Rolling counters used to average FPS every ~0.25s. */
  frameCount: number;
  frameTime: number;
  /** Windowed averages, measured from when the scene became ready. */
  windowFps: number;
  windowFrameMs: number;
  windowDrawCalls: number;
  windowTriangles: number;
  windowPrograms: number;
  windowElapsed: number;
  /** Frames accumulated since the window opened. */
  windowFrames: number;
  windowTime: number;
  windowCallSum: number;
  windowTriSum: number;
  windowProgSum: number;
  /** True once the 30s window has elapsed; freezes the averages until restart. */
  windowDone: boolean;
  /**
   * True once every required 3D model has *settled* (loaded or failed) after
   * the shared load promise resolved. Until then the run is still "loading"
   * and must not be reported as valid or measured.
   */
  modelsSettled: boolean;
  /**
   * True only when every model settled to a loaded parse (the 15s cap on the
   * shared promise absorbs failures, so it is checked separately). A run that
   * settles on primitive fallbacks is not a valid baseline and its average
   * window is skipped. Both are exposed on the overlay for the tests.
   */
  runValid: boolean;
};

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

/** JS heap in MB, when the browser exposes it (Chromium); "-" otherwise. */
const heapLabel = (): string => {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number };
    }
  ).memory;
  if (memory && typeof memory.usedJSHeapSize === "number") {
    const used = memory.usedJSHeapSize / 1024 / 1024;
    const total =
      typeof memory.totalJSHeapSize === "number"
        ? memory.totalJSHeapSize / 1024 / 1024
        : used;
    return `${used.toFixed(0)}/${total.toFixed(0)} MB`;
  }
  return "-";
};

/**
 * Collects per-frame renderer stats into a plain mutable ref so the DOM
 * overlay can read them without triggering React re-reads. While the scene is
 * actually rendering (`readyRef`), the models have settled, and the run is
 * valid, it also accumulates averages over a fixed METRICS_WINDOW_SECONDS
 * window for baseline metrics.
 */
const StressStatsCollector = ({
  statsRef,
  readyRef,
  runValidRef,
}: {
  statsRef: { current: FrameStats };
  readyRef: { current: boolean };
  runValidRef: { current: boolean };
}) => {
  useFrame((state, delta) => {
    const s = statsRef.current;
    s.frameMs = delta * 1000;
    s.frameCount += 1;
    s.frameTime += delta;
    if (s.frameTime >= 0.25) {
      s.fps = s.frameCount / s.frameTime;
      s.frameCount = 0;
      s.frameTime = 0;
    }
    s.drawCalls = state.gl.info.render.calls;
    s.triangles = state.gl.info.render.triangles;
    s.programs = state.gl.info.programs?.length ?? 0;

    // The average window opens only once the models have settled (the scene is
    // mounted) and the run is valid; a run on placeholder fallbacks is not a
    // valid baseline, and a run whose models are still loading is not a
    // settled workload, so neither is measured.
    if (
      statsRef.current.modelsSettled &&
      runValidRef.current &&
      readyRef.current &&
      !s.windowDone
    ) {
      s.windowFrames += 1;
      s.windowTime += delta;
      s.windowCallSum += s.drawCalls;
      s.windowTriSum += s.triangles;
      s.windowProgSum += s.programs;
      s.windowElapsed = s.windowTime;
      if (s.windowTime >= METRICS_WINDOW_SECONDS) {
        s.windowDone = true;
      }
      if (s.windowFrames > 0 && s.windowTime > 0) {
        s.windowFps = s.windowFrames / s.windowTime;
        s.windowFrameMs = (s.windowTime / s.windowFrames) * 1000;
        s.windowDrawCalls = s.windowCallSum / s.windowFrames;
        s.windowTriangles = s.windowTriSum / s.windowFrames;
        s.windowPrograms = s.windowProgSum / s.windowFrames;
      }
    }
  });
  return null;
};

/**
 * Exposes the three scene and renderer on `window` so external profiling
 * scripts (Playwright/CDP) can toggle named scene roots and read gl.info
 * without React. Stress-entry only.
 */
const SceneDebugBridge = () => {
  const { scene, gl } = useThree();
  const { getLivingEnemyCount } = useActions(enemyActions);
  // The default directional shadow camera only covers a ~10x10-unit patch at
  // the origin of this ~32-unit planet, so the shadow pass costs a full extra
  // render of every scene mesh for almost no visible effect. Stress run only:
  // disable it once the light has mounted.
  const shadowDisabledRef = useRef(false);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__stressScene = scene;
    w.__stressGl = gl;
    w.__stressGameStore = useGameStore;
    w.__stressLevelStore = useLevelStore;
    w.__stressUpgradeStore = useUpgradeStore;
    w.__stressLivingCount = getLivingEnemyCount;
  }, [scene, gl, getLivingEnemyCount]);
  useFrame(() => {
    if (shadowDisabledRef.current) return;
    const light = scene.getObjectByName("shadow-light");
    if (light) {
      (light as unknown as { castShadow: boolean }).castShadow = false;
      shadowDisabledRef.current = true;
    }
  });
  return null;
};

/**
 * Unattended driver: auto-picks upgrade gates, auto-starts waves, and
 * restarts the run forever after a win (or a defeat, just in case).
 */
const StressAutoDriver = ({
  startWave,
  restart,
}: {
  startWave: () => void;
  restart: () => void;
}) => {
  useFrame(() => {
    const gameStatus = useGameStore.getState().gameStatus;

    if (gameStatus === "won" || gameStatus === "gameOver") {
      restart();
      return;
    }
    if (gameStatus !== "playing") {
      return;
    }

    const { pendingEnemyUpgradeGate, upgradeChoiceOptions } =
      useUpgradeStore.getState();
    if (pendingEnemyUpgradeGate && upgradeChoiceOptions.length > 0) {
      useUpgradeStore
        .getState()
        .confirmEnemyUpgradePick(upgradeChoiceOptions[0]);
      return;
    }
    if (pendingEnemyUpgradeGate) {
      // Gate is open but has no options; unblock it defensively.
      useUpgradeStore.getState().resetLevelEnemyUpgrades();
      return;
    }

    // startWave() is a no-op unless the wave is actually ready to start,
    // so it is safe to call every frame.
    startWave();
  });
  return null;
};

/**
 * DOM overlay showing live stress metrics. Reads stores and the shared stats
 * ref inside a rAF loop and writes plain text (no React re-renders per frame).
 */
const StressOverlay = ({
  statsRef,
  runCount,
}: {
  statsRef: { current: FrameStats };
  runCount: number;
}) => {
  const textRef = useRef<HTMLPreElement>(null);
  const { getLivingEnemyCount } = useActions(enemyActions);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = statsRef.current;
      const gameStatus = useGameStore.getState().gameStatus;
      const level = useLevelStore.getState();
      const upgrade = useUpgradeStore.getState();
      const enemiesAlive = getLivingEnemyCount();
      const base = world.queryFirst(isBase);
      const baseHealth = base ? base.get(HealthInfo) : undefined;

      const lines = [
        `STATUS       ${gameStatus}`,
        `RUN          ${runCount + 1}`,
        `WAVE         ${level.currentWave}/${level.totalWaves}`,
        `ENEMIES      ${enemiesAlive} alive`,
        `KILLED       ${level.enemiesKilled}`,
        `TOWERS       ${level.towers.length}`,
        `PROJECTILES  ${level.projectiles.length}`,
        `BASE HP      ${
          baseHealth
            ? `${baseHealth.currentHealth}/${baseHealth.maxHealth}`
            : "-"
        }`,
        `UPGRADE GATE ${upgrade.pendingEnemyUpgradeGate ? "open" : "-"}`,
        // Model settlement state: "loading" until every model has settled
        // (loaded or failed), then "valid" (all loaded) or "invalid" (some
        // settled on their primitive fallback, so the average window is
        // skipped). Exposed for the stress e2e tests.
        `MODELS       ${
          s.modelsSettled ? (s.runValid ? "valid" : "invalid") : "loading"
        }`,
        `FPS          ${s.fps.toFixed(1)}`,
        `FRAME        ${s.frameMs.toFixed(2)} ms`,
        `DRAW CALLS   ${s.drawCalls}`,
        `TRIANGLES    ${s.triangles}`,
        `PROGRAMS     ${s.programs}`,
        `JS HEAP      ${heapLabel()}`,
        ...(s.windowDone
          ? [
              `--- AVG (last 30s) ---`,
              `AVG FPS      ${s.windowFps.toFixed(1)}`,
              `AVG FRAME    ${s.windowFrameMs.toFixed(2)} ms`,
              `AVG DRAW     ${s.windowDrawCalls.toFixed(1)}`,
              `AVG TRI      ${Math.round(s.windowTriangles).toLocaleString(
                "en-US"
              )}`,
              `AVG PROGRAMS ${Math.round(s.windowPrograms)}`,
            ]
          : [
              `AVG WINDOW   ${Math.min(
                s.windowElapsed,
                METRICS_WINDOW_SECONDS
              ).toFixed(0)}/${METRICS_WINDOW_SECONDS}s`,
            ]),
      ];
      if (textRef.current) {
        textRef.current.textContent = lines.join("\n");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLivingEnemyCount, runCount, statsRef]);

  return (
    <pre
      ref={textRef}
      data-testid="stress-stats-overlay"
      className="pointer-events-none fixed left-3 top-3 z-50 m-0 select-none font-mono text-[11px] leading-tight text-gray-200 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
    />
  );
};

/**
 * Pins the camera at the far end of the map for the whole run by re-setting
 * its position and aim every frame. The vantage (0, 40, 80) sits past the
 * board's +z end, looks back at the center, and is far enough (~89 units)
 * that the entire 64x64 board fits on screen at the 40-degree fov — the whole
 * map renders in one frame (maximum stressing) — while staying well inside
 * the skybox (radius 100). The camera is also locked (`shouldStopCamera`),
 * so GameCamera's movement frame never clamps it back inside the field.
 */
const STRESS_CAMERA_POSITION: [number, number, number] = [0, 40, 80];

const StressCameraRig = () => {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.set(...STRESS_CAMERA_POSITION);
    camera.lookAt(0, 0, 0);
  });
  return null;
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
        <SceneDebugBridge />

        {isGameConfigLoaded && isLevelConfigLoaded && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-40 grid place-items-center text-sm text-gray-300">
                {loadingMessage}
              </div>
            }
          >
            {areModelsReady && (
              // WaterClockProvider drives the shared ripple uniform every
              // frame, which is what animates the 500 water bodies; without it
              // `useWaterClock` falls back to a frozen uniform and the water
              // is static.
              <WaterClockProvider>
                {/* Holds the camera at the map's far end so the whole 64x64
                    board renders in one frame. The camera is locked
                    (shouldStopCamera) so GameCamera's movement frame never
                    clamps it back inside the field — the rig owns the view. */}
                <StressCameraRig />
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
