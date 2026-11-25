import { useActions } from "koota/react";
import { useEffect, useRef } from "react";

import { enemyActions } from "../../../../core/ecs/actions/enemyActions";
import { useGameStore } from "../../../../core/stores/useGameStore";
import { useLevelStore } from "../../../../core/stores/useLevelStore";
import { useUpgradeStore } from "../../../../core/stores/useUpgradeStore";
import { world } from "../../../../core/ecs/world";
import { isBase } from "../../../../core/ecs/traits/base";
import { HealthInfo } from "../../../../core/ecs/traits/health";
import type { FrameStats } from "../types/frameStats";
import { METRICS_WINDOW_SECONDS } from "../constants/metrics";

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
 * DOM overlay showing live stress metrics. Reads stores and the shared stats
 * ref inside a rAF loop and writes plain text (no React re-renders per frame).
 */
export const StressOverlay = ({
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
