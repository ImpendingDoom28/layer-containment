/**
 * Dedicated performance stress-test harness for LAYER CONTAINMENT.
 *
 * This entry (served via `stress/index.stress.html` /
 * `stress/vite.config.ts`) boots
 * the full game scene on the generated "stress" level:
 *
 *   - 64x64 grid (4096 shader-compiled tiles)
 *   - ~2080-tile serpentine path
 *   - 150 pre-placed towers of all 6 types (incl. relay / chain / laser)
 *   - 20 waves, ~2330 enemies total (all 4 enemy types)
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
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stats } from "@react-three/drei";
import { useActions, WorldProvider } from "koota/react";

import { GameScene } from "../../src/components/scenes/game/GameScene";
import { ShaderReadyGate } from "../../src/components/systems/ShaderReadyGate";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../src/constants/canvas";
import { worldBaseActions } from "../../src/core/ecs/actions/baseActions";
import { isBase } from "../../src/core/ecs/traits/base";
import { HealthInfo } from "../../src/core/ecs/traits/health";
import { enemyActions } from "../../src/core/ecs/actions/enemyActions";
import { EntityIdProvider } from "../../src/core/contexts/EntityIdContext";
import { world } from "../../src/core/ecs/world";
import { useEnemyActions } from "../../src/core/hooks/useEnemyActions";
import { useGameSystem } from "../../src/core/hooks/useGameSystem";
import { useLevelSystem } from "../../src/core/hooks/useLevelSystem";
import { useProjectileSystem } from "../../src/core/hooks/useProjectileSystem";
import { useWaveSystem } from "../../src/core/hooks/useWaveSystem";
import { startNewRunSelector, useGameStore } from "../../src/core/stores/useGameStore";
import { useLevelStore } from "../../src/core/stores/useLevelStore";
import {
  resetLevelEnemyUpgradesSelector,
  useUpgradeStore,
} from "../../src/core/stores/useUpgradeStore";

const STRESS_LEVEL_ID = "stress" as const;
const STRESS_BASE_HEALTH = 1_000_000;
/** How long (seconds) the average-metrics window stays open per run. */
const METRICS_WINDOW_SECONDS = 30;

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
 * overlay can read them without triggering React re-reads. While `readyRef`
 * is set (the heavy scene is actually rendering), it also accumulates
 * averages over a fixed METRICS_WINDOW_SECONDS window for baseline metrics.
 */
const StressStatsCollector = ({
  statsRef,
  readyRef,
}: {
  statsRef: { current: FrameStats };
  readyRef: { current: boolean };
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

    if (readyRef.current && !s.windowDone) {
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
  }, [statsRef, runCount, getLivingEnemyCount]);

  return (
    <pre
      data-testid="stress-stats-overlay"
      ref={textRef}
      className="pointer-events-none fixed left-3 top-3 z-50 m-0 select-none rounded-md bg-black/70 p-3 text-[13px] leading-5 text-emerald-300"
    />
  );
};

const StressTestGame = () => {
  const [runCount, setRunCount] = useState(0);
  const [areShadersReady, setAreShadersReady] = useState(false);
  const statsRef = useRef<FrameStats>(createFrameStats());
  const startedRef = useRef(false);
  // Mirrors areShadersReady in a ref so the frame loop (collector) can tell
  // when the heavy scene is actually rendering and start averaging.
  const readyRef = useRef(false);

  const handleReadyChange = useCallback((ready: boolean) => {
    readyRef.current = ready;
    setAreShadersReady(ready);
  }, []);

  const gameSystem = useGameSystem();
  const levelSystem = useLevelSystem();

  const enemyActions = useEnemyActions();
  const projectileSystem = useProjectileSystem(enemyActions);
  const waveSystem = useWaveSystem(gameSystem);

  const { spawnBase } = useActions(worldBaseActions);
  const startNewRun = useGameStore(startNewRunSelector);

  // The stress level is fully pre-built and placement is disabled, so this is
  // a stable no-op. It must be referentially stable: StressTestGame re-renders
  // on every enemy kill/spawn (money / activeEffects subscriptions), and an
  // inline `() => {}` here would give `Grid` a new prop each time, defeating
  // its memo and re-rendering all 4096 tile meshes per kill.
  const onPlaceTowerNoop = useCallback(
    () => {
      /* stress level is fully pre-built; placement is disabled */
    },
    []
  );
  const resetLevelEnemyUpgrades = useUpgradeStore(
    resetLevelEnemyUpgradesSelector
  );

  const {
    gameStatus,
    isGameConfigLoaded,
    selectedTower,
    activeEffects,
    shouldDisableControls,
    shouldStopMovement,
    onSpawnEffect,
    onEndEffect,
    onEffectComplete,
  } = gameSystem;

  const {
    money,
    sellTower,
    resetState: resetLevelState,
    isLevelConfigLoaded,
  } = levelSystem;

  const { onEnemyReachEnd } = enemyActions;
  const { onProjectileHit, onProjectileRemove } = projectileSystem;
  const { startWave } = waveSystem;

  const beginRun = useCallback(() => {
    startNewRun();
    spawnBase(STRESS_BASE_HEALTH);
  }, [startNewRun, spawnBase]);

  // Start the unattended run once the game config is loaded.
  useEffect(() => {
    if (!isGameConfigLoaded || startedRef.current) return;
    startedRef.current = true;
    beginRun();
  }, [isGameConfigLoaded, beginRun]);

  const restart = useCallback(() => {
    resetLevelEnemyUpgrades();
    resetLevelState();
    beginRun();
    // Re-arm the 30s averaging window for the new run.
    resetMetricsWindow(statsRef.current);
    setRunCount((c) => c + 1);
  }, [resetLevelEnemyUpgrades, resetLevelState, beginRun]);

  const loadingMessage = !isGameConfigLoaded
    ? "Loading game config..."
    : isLevelConfigLoaded
      ? "Preparing graphics..."
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
            isGameConfigLoaded && isLevelConfigLoaded
              ? `stress-${STRESS_LEVEL_ID}`
              : "stress-loading"
          }
          compileKey={
            isGameConfigLoaded && isLevelConfigLoaded
              ? `stress-${STRESS_LEVEL_ID}`
              : "stress-loading"
          }
          onReadyChange={handleReadyChange}
        />
        <StressStatsCollector statsRef={statsRef} readyRef={readyRef} />
        <SceneDebugBridge />

        {isGameConfigLoaded && (
          <Suspense
            fallback={
              <div className="fixed inset-0 z-40 grid place-items-center text-sm text-gray-300">
                {loadingMessage}
              </div>
            }
          >
            <GameScene
              placeTower={onPlaceTowerNoop}
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
              playableLevelId={STRESS_LEVEL_ID}
            />
            <Stats showPanel={0} className="top-[calc(100%-48px)]!" />
            <Stats
              showPanel={1}
              className="top-[calc(100%-48px)]! bottom-0! left-20!"
            />
            <Stats showPanel={2} className="top-[calc(100%-48px)]! left-40!" />
            <StressAutoDriver startWave={startWave} restart={restart} />
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
