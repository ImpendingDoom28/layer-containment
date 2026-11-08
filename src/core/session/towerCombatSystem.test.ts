import { Object3D } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { gameEvents } from "../../utils/eventEmitter";
import {
  flatCombatPointToWorldPosition,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import { enemyActions } from "../ecs/actions/enemyActions";
import { testWorld } from "../ecs/world";
import { GameEvent } from "../types/enums/events";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import type {
  Building,
  Enemy,
  Projectile,
  Tower,
  TowerConfig,
} from "../types/game";
import {
  TOWER_TURN_LAMBDA,
  createTowerCombatSystem,
  normalizeAngleDelta,
  type TowerCombatSystem,
} from "./towerCombatSystem";

const fireProjectile = vi.fn((params: Omit<Projectile, "id">) => ({
  ...params,
  id: 1,
}));

const basicConfig: TowerConfig = {
  id: "basic",
  name: "Basic",
  cost: 10,
  damage: 10,
  range: 2,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 5,
  color: "#fff",
  description: "",
  model: { url: "assets/models/tower_basic.glb", node: "Tower_Basic_ROOT" },
  muzzle: { turretNode: "Azimuth", muzzle: { x: 0, y: 0.3731, z: 1.071 } },
};

const tower: Tower = {
  ...basicConfig,
  id: 1,
  type: "basic",
  lastFireTime: 0,
  gridX: 0,
  gridZ: 0,
  x: 0,
  z: 0,
};

const makeEnemy = (id: number): Enemy => ({
  id,
  type: "basic",
  name: "E",
  health: 100,
  maxHealth: 100,
  speed: 1,
  reward: 1,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0.5,
  z: 0,
  upgrades: [],
});

let combat: TowerCombatSystem;
const tick = (simulationTimeSeconds: number, canResolveGameplay = true) =>
  combat.tick({
    deltaSeconds: 1,
    simulationTimeSeconds,
    canResolveGameplay,
  });

beforeEach(() => {
  fireProjectile.mockClear();
  enemyActions(testWorld).clearAllEnemies();
  useLevelStore.getState().resetLevelState();
  useLevelStore.setState({
    gridSize: 8,
    pathWaypoints: [],
    towers: [tower],
    isLevelConfigLoaded: true,
  });
  useGameStore.setState({
    gameStatus: "playing",
    isPageVisible: true,
    towerTypes: { basic: basicConfig } as Record<Tower["type"], TowerConfig>,
    tileSize: 1,
    pathWidth: 1,
    towerHeight: 1,
  });
  combat = createTowerCombatSystem(testWorld, fireProjectile);
});

describe("createTowerCombatSystem fire timing", () => {
  it("keeps firing at its fire rate while playing", () => {
    enemyActions(testWorld).spawnEnemy(makeEnemy(1));

    tick(1);
    expect(fireProjectile).toHaveBeenCalledTimes(1);
    tick(2);
    expect(fireProjectile).toHaveBeenCalledTimes(2);
    tick(2.4);
    expect(fireProjectile).toHaveBeenCalledTimes(2);
    tick(3);
    expect(fireProjectile).toHaveBeenCalledTimes(3);
  });

  it("freezes cooldowns while gameplay resolution is stopped", () => {
    enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    tick(1);
    expect(fireProjectile).toHaveBeenCalledTimes(1);

    tick(6, false);
    tick(1);
    expect(fireProjectile).toHaveBeenCalledTimes(1);
    tick(2);
    expect(fireProjectile).toHaveBeenCalledTimes(2);
  });

  it("resets fire and focused-target state between runs", () => {
    useLevelStore.getState().setTowers([{ ...tower, targeting: "focused" }]);
    enemyActions(testWorld).spawnEnemy(makeEnemy(1));
    tick(1);
    combat.reset();

    enemyActions(testWorld).clearAllEnemies();
    enemyActions(testWorld).spawnEnemy({ ...makeEnemy(2), x: 1, z: 1 });
    tick(1.1);
    expect(fireProjectile).toHaveBeenCalledTimes(2);
    expect(fireProjectile.mock.calls[1][0].targetId).toBe(2);
  });
});

describe("createTowerCombatSystem line of sight", () => {
  const makeBuilding = (gridX: number, gridZ: number): Building => ({
    id: 1,
    gridX,
    gridZ,
    x: gridX,
    z: gridZ,
    shape: "box",
    width: 0.4,
    depth: 0.4,
    height: 1,
    color: "#fff",
  });
  const enemyA = (): Enemy => ({ ...makeEnemy(1), x: 1, z: 0 });
  const enemyB = (): Enemy => ({ ...makeEnemy(2), x: 0, z: 1 });

  it("skips a hidden enemy and fires at a visible target", () => {
    useLevelStore.getState().setBuildings([makeBuilding(0.5, 0)]);
    enemyActions(testWorld).spawnEnemy(enemyA());
    enemyActions(testWorld).spawnEnemy(enemyB());
    tick(1);

    expect(fireProjectile).toHaveBeenCalledTimes(1);
    expect(fireProjectile.mock.calls[0][0].targetId).toBe(2);
  });

  it("fires at the nearest enemy when a building is off the sight line", () => {
    useLevelStore.getState().setBuildings([makeBuilding(0, 0.5)]);
    enemyActions(testWorld).spawnEnemy(enemyA());
    enemyActions(testWorld).spawnEnemy(enemyB());
    tick(1);

    expect(fireProjectile.mock.calls[0][0].targetId).toBe(1);
  });

  it("does not fire when every in-range enemy is hidden", () => {
    useLevelStore.getState().setBuildings([makeBuilding(0.5, 0)]);
    enemyActions(testWorld).spawnEnemy(enemyA());
    tick(1);

    expect(fireProjectile).not.toHaveBeenCalled();
  });

  it("checks every building independently", () => {
    useLevelStore
      .getState()
      .setBuildings([makeBuilding(0.5, 0.5), makeBuilding(0.5, 0)]);
    enemyActions(testWorld).spawnEnemy(enemyA());
    enemyActions(testWorld).spawnEnemy(enemyB());
    tick(1);

    expect(fireProjectile.mock.calls[0][0].targetId).toBe(2);
  });
});

describe("createTowerCombatSystem targeting", () => {
  const enemyA = (): Enemy => ({
    ...makeEnemy(1),
    x: 1,
    z: 0,
    health: 10,
    maxHealth: 10,
  });
  const enemyB = (): Enemy => ({
    ...makeEnemy(2),
    x: 1,
    z: 1,
    health: 80,
    maxHealth: 80,
  });

  it.each([
    ["lowest", 1],
    ["highest", 2],
  ] as const)("supports the %s strategy", (targeting, targetId) => {
    useLevelStore.getState().setTowers([{ ...tower, targeting }]);
    enemyActions(testWorld).spawnEnemy(enemyA());
    enemyActions(testWorld).spawnEnemy(enemyB());
    tick(1);

    expect(fireProjectile.mock.calls[0][0].targetId).toBe(targetId);
  });

  it("keeps a focused target and falls back when it dies", () => {
    useLevelStore.getState().setTowers([{ ...tower, targeting: "focused" }]);
    enemyActions(testWorld).spawnEnemy(enemyA());
    enemyActions(testWorld).spawnEnemy(enemyB());

    tick(1);
    expect(fireProjectile.mock.calls[0][0].targetId).toBe(1);
    tick(2);
    expect(fireProjectile.mock.calls[1][0].targetId).toBe(1);

    enemyActions(testWorld).updateEnemy(1, { health: 0 });
    tick(3);
    expect(fireProjectile.mock.calls[2][0].targetId).toBe(2);
  });
});

describe("createTowerCombatSystem turret aim", () => {
  // A frame driven with an explicit per-frame delta, so the turret's eased
  // turn step is exercised at a real per-frame rate instead of the
  // fully-converging delta of 1 the default `tick` uses.
  const tickWithDelta = (deltaSeconds: number, simulationTimeSeconds: number) =>
    combat.tick({ deltaSeconds, simulationTimeSeconds, canResolveGameplay: true });

  // Registers a bare turret node (at the given world position, identity
  // rotation) the same way the model would once it loads, so the sim's aim
  // pass can mirror the yaw onto it and read the muzzle from its matrix.
  const registerTurretNode = (position: [number, number, number] = [
    0,
    0,
    0,
  ]): Object3D => {
    const node = new Object3D();
    node.position.set(position[0], position[1], position[2]);
    combat.registerTurretNode(tower.id, node);
    return node;
  };

  it("holds its aim instead of swinging back to rest when the target leaves", () => {
    const node = registerTurretNode();
    enemyActions(testWorld).spawnEnemy(makeEnemy(1)); // (0.5, 0): 90 deg from rest

    // Fire once: the barrel swings to the enemy and stays there.
    tick(1);
    expect(combat.getTurretYaw(tower.id)).toBeCloseTo(Math.PI / 2, 2);
    expect(node.rotation.y).toBeCloseTo(Math.PI / 2, 2);

    // The enemy dies; with nothing in range the turret holds its last aim
    // (it does not swing back to the rest muzzle).
    enemyActions(testWorld).removeEnemy(1);
    tick(2);
    expect(combat.getTurretYaw(tower.id)).toBeCloseTo(Math.PI / 2, 2);
    expect(node.rotation.y).toBeCloseTo(Math.PI / 2, 2);
  });

  it("reports the picked target for the idle-animation scan", () => {
    // No enemy in range: the idle scan may take over the turret's yaw.
    expect(combat.hasTowerTarget(tower.id)).toBe(false);
    expect(combat.hasTowerTarget(999)).toBe(false);

    enemyActions(testWorld).spawnEnemy(makeEnemy(1)); // (0.5, 0): in range
    tick(1);
    expect(combat.hasTowerTarget(tower.id)).toBe(true);

    // Once the target is gone the sim releases the turret to the idle scan.
    enemyActions(testWorld).removeEnemy(1);
    tick(2);
    expect(combat.hasTowerTarget(tower.id)).toBe(false);
  });

  it("starts a fresh aim from the node's visible yaw when an idle scan has drifted it", () => {
    // The stored logical yaw is 0 (no target yet), but the view layer's idle
    // scan has drifted the visible turret node's yaw in the meantime.
    const node = registerTurretNode();
    node.rotation.y = 0.4;

    enemyActions(testWorld).spawnEnemy(makeEnemy(1)); // (0.5, 0): 90 deg away
    tick(1);

    // The first aim step must start from the visible yaw (0.4), not the
    // stored logical yaw (0) — stepping from 0.4 eases a shorter remaining
    // arc toward the 90 deg target, so the result sits closer to 0.4 than a
    // step from 0 would. The mesh never snaps on target acquisition.
    const expectedFromVisible =
      0.4 +
      normalizeAngleDelta(Math.PI / 2 - 0.4) *
        (1 - Math.exp(-TOWER_TURN_LAMBDA * 1));
    expect(node.rotation.y).toBeCloseTo(expectedFromVisible, 6);
    const expectedFromStored =
      0 + normalizeAngleDelta(Math.PI / 2) * (1 - Math.exp(-TOWER_TURN_LAMBDA * 1));
    expect(Math.abs(node.rotation.y - expectedFromVisible)).toBeLessThan(
      Math.abs(node.rotation.y - expectedFromStored)
    );
    // The fire gate reads the same stepped value, so gate and mesh agree.
    expect(combat.getTurretYaw(tower.id)).toBeCloseTo(node.rotation.y, 6);
  });

  it("eases the turret toward the target across frames", () => {
    const node = registerTurretNode();
    enemyActions(testWorld).spawnEnemy(makeEnemy(1)); // (0.5, 0): 90 deg from rest

    // Five small frames: the swing is the geometric ease 1 - exp(-8 * t).
    for (let i = 1; i <= 5; i += 1) {
      tickWithDelta(0.016, i * 0.016);
    }
    const expectedYaw =
      (Math.PI / 2) * (1 - Math.exp(-TOWER_TURN_LAMBDA * 5 * 0.016));
    expect(combat.getTurretYaw(tower.id)).toBeCloseTo(expectedYaw, 6);
    expect(node.rotation.y).toBeCloseTo(expectedYaw, 6);
  });

  it("does not fire until the barrel is aimed at the target", () => {
    // A fast fire rate (0.01) keeps the cooldown from binding, so the only
    // thing delaying the first shot is the aim tolerance — the barrel must
    // actually swing onto the 90-deg-away enemy before a projectile leaves.
    useLevelStore.getState().setTowers([{ ...tower, fireRate: 0.01 }]);
    enemyActions(testWorld).spawnEnemy(makeEnemy(1)); // (0.5, 0): 90 deg from rest

    // Ten small frames: the swing is still well outside the 15 deg tolerance,
    // so the tower is in range and off cooldown but must not fire.
    for (let i = 1; i <= 10; i += 1) {
      tickWithDelta(0.016, i * 0.016);
    }
    expect(fireProjectile).not.toHaveBeenCalled();

    // Six more frames: the barrel has swung within the tolerance and the
    // first shot goes out at the enemy.
    for (let i = 11; i <= 16; i += 1) {
      tickWithDelta(0.016, i * 0.016);
    }
    expect(fireProjectile).toHaveBeenCalled();
    expect(fireProjectile.mock.calls[0][0].targetId).toBe(1);
  });

  it("spawns the projectile at the barrel tip once the turret node is registered", () => {
    const node = registerTurretNode(); // identity, at the origin
    // Target straight ahead on the rest muzzle axis (+Z), so the barrel does
    // not swing and the node stays at identity — the tip is the rest muzzle.
    enemyActions(testWorld).spawnEnemy({ ...makeEnemy(1), x: 0, z: 0.5 });

    let fireWorld: { x: number; y: number; z: number } | null = null;
    const off = gameEvents.on(GameEvent.TOWER_FIRE, (data) => {
      fireWorld = (data as {
        worldPosition: { x: number; y: number; z: number };
      }).worldPosition;
    });

    try {
      tick(1);
      expect(fireProjectile).toHaveBeenCalledTimes(1);

      const muzzle = basicConfig.muzzle.muzzle!;
      const shot = fireProjectile.mock.calls[0][0];
      // The node is at the origin with identity orientation, so the world
      // barrel tip is the local rest muzzle.
      expect(shot.startX).toBeCloseTo(muzzle.x, 5);
      expect(shot.startY).toBeCloseTo(muzzle.y, 5);
      expect(shot.startZ).toBeCloseTo(muzzle.z, 5);
      // The fire sound uses the same world position as the projectile.
      expect(fireWorld).not.toBeNull();
      expect(fireWorld!.x).toBeCloseTo(muzzle.x, 5);
      expect(fireWorld!.y).toBeCloseTo(muzzle.y, 5);
      expect(fireWorld!.z).toBeCloseTo(muzzle.z, 5);
      // The node mirrors the logical aim (here the rest direction, yaw 0).
      expect(node.rotation.y).toBeCloseTo(0, 5);
    } finally {
      off();
    }
  });

  it("falls back to the tower-centre emitter while the turret node is missing", () => {
    // No `registerTurretNode` call: the model is still "loading", so the shot
    // leaves the old centre emitter (surface + 0.7 * normal), not the barrel.
    enemyActions(testWorld).spawnEnemy(makeEnemy(1)); // (0.5, 0)

    tick(1);
    expect(fireProjectile).toHaveBeenCalledTimes(1);

    const shot = fireProjectile.mock.calls[0][0];
    const expected = flatCombatPointToWorldPosition(
      tower.x,
      tower.z,
      0.7, // towerHeight (1) * 0.7
      getPlanetRadius(8, 1)
    );
    expect(shot.startX).toBeCloseTo(expected.x, 5);
    expect(shot.startY).toBeCloseTo(expected.y, 5);
    expect(shot.startZ).toBeCloseTo(expected.z, 5);
  });
});
