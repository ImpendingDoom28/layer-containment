import type { World } from "koota";
import type { Object3D } from "three";

import type { PlayableLevelId } from "../../constants/playableLevels";
import type { LevelConfigData } from "../configs/levelConfig";
import type { Projectile } from "../types/game";

export type SimulationFrame = {
  deltaSeconds: number;
  simulationTimeSeconds: number;
  canResolveGameplay: boolean;
};

export type GameSession = {
  startRun: (levelId: PlayableLevelId) => Promise<void>;
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
};

export type GameSessionDependencies = {
  world: World;
  getNextTowerId: (reset?: boolean) => number;
  getNextEnemyId: (reset?: boolean) => number;
  ensureEnemyIdAtLeast: (minId: number) => void;
  getNextProjectileId: (reset?: boolean) => number;
  loadLevel?: (levelId: PlayableLevelId) => Promise<LevelConfigData>;
};
