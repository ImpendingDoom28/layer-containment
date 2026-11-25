import type { World } from "koota";
import type { Object3D } from "three";

import type { AnyPlayableLevelId } from "../../constants/playableLevels";
import type { LevelConfigData } from "../configs/levelConfig";
import type { Projectile } from "../types/game";

export type SimulationFrame = {
  deltaSeconds: number;
  /**
   * The session's own simulation clock. Normally identical to the scene's
   * (view) clock; under the e2e fast-forward (`SIM_SPEED` > 1) it advances
   * faster than wall time so simulation-time-bound tests finish quickly.
   */
  simulationTimeSeconds: number;
  /**
   * The scene's view (wall) clock, in seconds — for gates whose timestamps
   * are stamped on the view clock rather than the simulation clock. The
   * comet reveal's `revealedAt` (see `CometStrikeFX`) is the one such value:
   * under fast-forward the simulation clock outruns it, so the wave-1
   * "reveal has settled" gate must compare against the view clock or it
   * would open while the comet is still in flight. Absent means the two
   * clocks coincide (production), so callers fall back to
   * `simulationTimeSeconds`.
   */
  viewTimeSeconds?: number;
  canResolveGameplay: boolean;
};

export type GameSession = {
  startRun: (levelId: AnyPlayableLevelId) => Promise<void>;
  restartRun: () => Promise<void>;
  endRun: () => void;
  tick: (frame: SimulationFrame) => void;
  startWave: () => void;
  getRemainingEnemiesInWave: () => number;
  /** True while a run start (including its level load) is in flight. */
  isRunStarting: boolean;
  /** Invalidates every in-flight run start. */
  dispose: () => void;
};

export type GameSessionRuntime = {
  fireProjectile: (projectile: Omit<Projectile, "id">) => Projectile;
  updateProjectiles: (frame: SimulationFrame) => void;
  clearProjectiles: () => void;
};

export type GameSessionController = GameSession & {
  connectRuntime: (runtime: GameSessionRuntime) => () => void;
  /** The render layer registers each turret's model node so the sim can mirror
   *  the logical aim onto it and read the muzzle from its world matrix. */
  registerTurretNode: (towerId: number, node: Object3D | null) => void;
  /** True while the tower has a live target (the sim is driving its turret
   *  node's yaw), so idle-animation passes leave the yaw alone. */
  hasTowerTarget: (towerId: number) => boolean;
  /** Marks a tower while its placement drop is still in flight (the sim keeps
   *  it from firing mid-deploy); `deploying` false clears it when settled. */
  markTowerDeploying: (towerId: number, deploying: boolean) => void;
};

export type GameSessionDependencies = {
  world: World;
  getNextTowerId: (reset?: boolean) => number;
  ensureTowerIdAtLeast: (minId: number) => void;
  getNextEnemyId: (reset?: boolean) => number;
  ensureEnemyIdAtLeast: (minId: number) => void;
  getNextProjectileId: (reset?: boolean) => number;
  ensureProjectileIdAtLeast: (minId: number) => void;
  loadLevel?: (levelId: AnyPlayableLevelId) => Promise<LevelConfigData>;
};
