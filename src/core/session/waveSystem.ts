import type { World } from "koota";

import { PORTAL_REVEAL_DURATION_S } from "../../constants/cometReveal";
import { SLOW_MO_BEAT_SECONDS, SLOW_MO_RATE } from "../../constants/slowMo";
import { bossHealthForWave, isBossWave } from "../../utils/bossHp";
import { gameEvents } from "../../utils/eventEmitter";
import {
  applyEnemyUpgradeCounts,
  buildWaveSpawnQueue,
} from "../../utils/waveEnemyCounts";
import { enemyActions } from "../ecs/actions/enemyActions";
import { spawnLevelEnemy } from "../ecs/spawnLevelEnemy";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import { useUpgradeStore } from "../stores/useUpgradeStore";
import { useWaveStore } from "../stores/useWaveStore";
import { GameEvent } from "../types/enums/events";
import type { EnemyType, EnemyUpgradeId } from "../types/game";
import type { SimulationFrame } from "./types";

// How long (simulation seconds) after the comet's impact the spawn portals
// are considered "still settling". The portal rises out of the scorch over
// `PORTAL_REVEAL_DURATION_S` (see `Portal.tsx`'s `ENTRY_DURATION`); wave 1
// must not start while that rise is in progress, so the gate holds for the
// full rise plus a small buffer before the first wave is offered.
const COMET_SETTLE_SECONDS = PORTAL_REVEAL_DURATION_S + 0.3;

// The last-enemy slow-mo beat (wall time, `SLOW_MO_BEAT_SECONDS` at
// `SLOW_MO_RATE` of real time, see `constants/slowMo.ts`) is driven by the
// simulation clock's own dilation. During the beat, simulation time advances
// at `SLOW_MO_RATE`, so the beat adds exactly this much simulation time to
// the completion delay — the upgrade gate opens the moment the beat ends.
const SLOW_MO_COMPLETION_BUDGET_SECONDS = SLOW_MO_BEAT_SECONDS * SLOW_MO_RATE;

type BossSpawnStats = {
  name: string;
  health: number;
  speed: number;
  size: number;
  healthLoss: number;
  reward: number;
};

type SpawnQueueItem = {
  type: EnemyType;
  delaySeconds: number;
  upgrades: EnemyUpgradeId[];
  pathIndex?: number;
  /**
   * Present when this queue item is the level boss. Carries the boss's base
   * stats (already scaled for this appearance) and the `IsBoss` tag; the
   * spawn applies them additively under the wave's upgrade stack.
   */
  boss?: BossSpawnStats;
};

export type WaveSystem = {
  startWave: () => void;
  tick: (frame: SimulationFrame) => void;
  getRemainingEnemiesInWave: () => number;
  reset: () => void;
};

type WaveSystemDependencies = {
  world: World;
  getNextEnemyId: () => number;
  winGame: () => void;
};

export const createWaveSystem = ({
  world,
  getNextEnemyId,
  winGame,
}: WaveSystemDependencies): WaveSystem => {
  let spawnQueue: SpawnQueueItem[] = [];
  let spawnQueueIndex = 0;
  let waveStartedAt: number | null = null;
  let waveClearedAt: number | null = null;
  let waveStarted = false;
  let initializedWave = 0;

  const getRemainingEnemyCount = () =>
    enemyActions(world).getRemainingEnemyCount();

  // A reveal is "settled" (the portals have finished rising onto the ground)
  // when: there is no reveal at all, or the reveal belongs to an earlier run
  // (a stale reveal from a previous level), or the current run's reveal has
  // been `revealed` for at least `COMET_SETTLE_SECONDS` of simulation time.
  // While the comet is still in flight (`armed`) or still rising, it is not
  // settled, so wave 1 must not start.
  const isRevealSettled = (simulationTimeSeconds: number): boolean => {
    const { cometReveal, levelEnterRun } = useLevelStore.getState();
    if (cometReveal === null) return true;
    if (cometReveal.run !== levelEnterRun) return true;
    if (cometReveal.phase === "armed") return false;
    const revealedAt = cometReveal.revealedAt;
    if (revealedAt === undefined) return false;
    return simulationTimeSeconds - revealedAt >= COMET_SETTLE_SECONDS;
  };

  const reset = () => {
    spawnQueue = [];
    spawnQueueIndex = 0;
    waveStartedAt = null;
    waveClearedAt = null;
    waveStarted = false;
    initializedWave = 0;
  };

  const initializeWave = (currentWave: number) => {
    initializedWave = currentWave;
    spawnQueue = [];
    spawnQueueIndex = 0;
    waveStartedAt = null;
    waveClearedAt = null;
    waveStarted = false;

    const { totalWaves, waveConfigs, pathWaypoints, boss } =
      useLevelStore.getState();
    if (currentWave <= 0 || currentWave > totalWaves) return;

    const waveConfig = waveConfigs[currentWave - 1];
    if (!waveConfig) return;

    const waveUpgrades = [...useUpgradeStore.getState().levelEnemyUpgradeStack];
    const availableEnemyTypes = applyEnemyUpgradeCounts(
      waveConfig.enemies,
      waveUpgrades,
      useGameStore.getState().enemyUpgrades,
      waveConfig.totalEnemies
    ).groups;

    spawnQueue = buildWaveSpawnQueue(
      availableEnemyTypes,
      pathWaypoints.length
    ).map((item) => ({
      ...item,
      delaySeconds: item.delay / 1000,
      upgrades: waveUpgrades,
    }));

    // A boss wave: every `everyNthWave`-th wave (4, 8, 12, ...) the level
    // spawns its boss alongside the unchanged regular wave. The boss joins the
    // queue at t=0 (before the regular units) and, like any other enemy,
    // inherits the player's full current upgrade stack. Each later appearance
    // is stronger: its base HP is scaled by `hpGrowthPerAppearance` per
    // appearance, so the boss keeps scaling without a new mechanic.
    if (boss && isBossWave(boss, currentWave)) {
      const { baseStats, name } = boss;
      spawnQueue.unshift({
        type: "tank",
        delaySeconds: 0,
        upgrades: waveUpgrades,
        boss: {
          name,
          health: bossHealthForWave(boss, currentWave),
          speed: baseStats.speed,
          size: baseStats.size,
          healthLoss: baseStats.healthLoss,
          reward: baseStats.reward,
        },
      });
    }
  };

  const syncWave = () => {
    const currentWave = useLevelStore.getState().currentWave;
    if (currentWave !== initializedWave) initializeWave(currentWave);
    return currentWave;
  };

  const startWave = () => {
    const { currentWave, totalWaves, pathWaypoints } = useLevelStore.getState();
    if (currentWave >= totalWaves) return;
    // Hold wave 1 until the comet reveal has settled on the ground. The HUD
    // button is the only start path and it is withheld while `revealSettled`
    // is false (`tick` keeps that in sync with the settle timer every frame),
    // but this early return also guards any programmatic start.
    if (currentWave === 0) {
      const { cometReveal, levelEnterRun } = useLevelStore.getState();
      const currentReveal =
        cometReveal && cometReveal.run === levelEnterRun ? cometReveal : null;
      // `armed` (comet in flight) is always blocked; after the impact, only
      // start once the portals have settled (`revealSettled`, maintained by
      // `tick`). The explicit `armed` check also closes the single frame
      // before the first `tick` in which `revealSettled` is still `true`.
      if (
        currentReveal &&
        (currentReveal.phase === "armed" ||
          !useWaveStore.getState().revealSettled)
      ) {
        return;
      }
    }
    if (currentWave > 0) {
      // A wave that has started but not yet finished its completion delay must
      // not be replaced: doing so would reset `waveStarted` and skip the
      // upgrade gate / win that runs when the delay elapses.
      if (waveStarted) return;
      if (spawnQueueIndex < spawnQueue.length) return;
      if (getRemainingEnemyCount() > 0) return;
    }

    const nextWave = currentWave + 1;
    useWaveStore.getState().setNextWaveReady(false);
    useLevelStore.getState().setCurrentWave(nextWave);
    initializeWave(nextWave);

    const waypoint = pathWaypoints[0]?.[0];
    gameEvents.emit(GameEvent.WAVE_STARTED, {
      waveNumber: nextWave,
      worldPosition: waypoint
        ? { x: waypoint.x, y: waypoint.y, z: waypoint.z }
        : { x: 0, y: 0, z: 0 },
    });
  };

  const tick = (frame: SimulationFrame) => {
    if (!frame.canResolveGameplay) return;
    if (useGameStore.getState().gameStatus !== "playing") return;

    const currentWave = syncWave();
    const { totalWaves } = useLevelStore.getState();
    // A cleared wave is only "ready" for the next one once its completion
    // delay has run (i.e. `waveStarted` has been cleared). While the delay is
    // pending, the player must not be offered the next wave — starting it
    // would skip the upgrade gate / win above.
    const waveCleared =
      spawnQueueIndex >= spawnQueue.length &&
      getRemainingEnemyCount() === 0 &&
      !waveStarted;
    const nextWaveReady =
      currentWave === 0 || (currentWave < totalWaves && waveCleared);
    if (useWaveStore.getState().nextWaveReady !== nextWaveReady) {
      useWaveStore.getState().setNextWaveReady(nextWaveReady);
    }
    // Wave 1 must not start until the comet reveal has settled on the ground
    // (the portals have finished rising out of the scorch). Tracked in the
    // wave store (not folded into `nextWaveReady`) so the "waiting for the
    // next wave" pause-blocking is unchanged while the comet is in flight.
    // Only relevant for the very first wave; once any wave has started the
    // reveal is long done.
    const revealSettled =
      currentWave === 0 ? isRevealSettled(frame.simulationTimeSeconds) : true;
    if (useWaveStore.getState().revealSettled !== revealSettled) {
      useWaveStore.getState().setRevealSettled(revealSettled);
    }

    if (currentWave === 0 || currentWave > totalWaves) return;

    if (spawnQueueIndex >= spawnQueue.length) {
      if (waveStarted && getRemainingEnemyCount() === 0) {
        if (waveClearedAt === null) {
          waveClearedAt = frame.simulationTimeSeconds;
          useWaveStore.getState().bumpWaveClearedPulse();
        }
        // The 0.3s completion delay plus the slow-mo beat's simulation-time
        // budget, measured from the clear: the beat eases the world to
        // `SLOW_MO_RATE` for `SLOW_MO_BEAT_SECONDS`, during which
        // simulation time itself runs that slow, so the gate lands exactly
        // as the beat ends.
        if (
          waveClearedAt !== null &&
          frame.simulationTimeSeconds - waveClearedAt >
            0.3 + SLOW_MO_COMPLETION_BUDGET_SECONDS
        ) {
          waveStarted = false;
          if (currentWave < totalWaves) {
            const enemyUpgrades = useGameStore.getState().enemyUpgrades;
            if (enemyUpgrades && Object.keys(enemyUpgrades).length > 0) {
              // The Unstoppable (slow-resistance) upgrade only counters a slow
              // tower: offer it in the choice only when the player has placed
              // at least one, so a player is never rewarded for countering a
              // tower they never built.
              const hasSlowTower = useLevelStore
                .getState()
                .towers.some((tower) => tower.type === "slow");
              const allUpgradeIds = (
                Object.keys(enemyUpgrades) as EnemyUpgradeId[]
              ).filter((uid) => uid !== "slowResistance" || hasSlowTower);
              if (allUpgradeIds.length > 0) {
                useUpgradeStore.getState().openEnemyUpgradeGate(allUpgradeIds);
              }
            }
          } else {
            winGame();
          }
        }
      }
      return;
    }

    if (waveStartedAt === null) {
      waveStartedAt = frame.simulationTimeSeconds;
      waveStarted = true;
    }

    const nextSpawn = spawnQueue[spawnQueueIndex];
    const timeSinceWaveStart = frame.simulationTimeSeconds - waveStartedAt;
    if (nextSpawn && timeSinceWaveStart >= nextSpawn.delaySeconds) {
      spawnLevelEnemy(
        world,
        getNextEnemyId,
        nextSpawn.type,
        nextSpawn.upgrades,
        nextSpawn.pathIndex,
        nextSpawn.boss
          ? {
              name: nextSpawn.boss.name,
              health: nextSpawn.boss.health,
              speed: nextSpawn.boss.speed,
              size: nextSpawn.boss.size,
              healthLoss: nextSpawn.boss.healthLoss,
              reward: nextSpawn.boss.reward,
              isBoss: true,
            }
          : undefined
      );
      spawnQueueIndex += 1;
    }
  };

  const getRemainingEnemiesInWave = () => {
    const { currentWave, totalWaves } = useLevelStore.getState();
    if (currentWave === 0 || currentWave > totalWaves) return 0;
    return spawnQueue.length - spawnQueueIndex + getRemainingEnemyCount();
  };

  return { startWave, tick, getRemainingEnemiesInWave, reset };
};
