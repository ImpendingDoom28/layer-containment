import type { World } from "koota";
import type { Object3D } from "three";
import { Vector3 } from "three";

import { computeChainAdditionalHits } from "../chainLightning";
import { getLivingEnemyList } from "../ecs/selectors/enemySnapshots";
import { getEffectiveTowerCombatStats } from "../relayBuffs";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import type { Projectile, Tower } from "../types/game";
import { GameEvent } from "../types/enums/events";
import { gameEvents } from "../../utils/eventEmitter";
import {
  findEnemiesInLine,
  getRayObstacleClipDistance,
  segmentCrossesObstacles,
  type LineOfSightObstacle,
} from "../../utils/mathUtils";
import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import {
  flatCombatPointToWorldPosition,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import { pickTowerTarget } from "../../utils/towerTargeting";
import type { SimulationFrame } from "./types";

const BASE_FOOTPRINT_HALF = 0.4;

// A tower only fires once its barrel is within this angle (the shortest arc)
// of the target, so a projectile never arcs sideways off a tower still
// swinging around. 15 degrees.
export const TOWER_AIM_TOLERANCE = Math.PI / 12;

// Per-frame eased swing rate for the turret turning toward its target (the same
// exponential ease the enemies use to turn their facing): `1 - exp(-lambda*dt)`
// of the remaining arc per frame, so the swing decelerates as it converges.
export const TOWER_TURN_LAMBDA = 8;

// Wrap a yaw difference to the shortest arc in (-PI, PI], so comparing
// e.g. -170 deg against +170 deg reads as a 20 deg turn, not 340.
export const normalizeAngleDelta = (delta: number): number => {
  let d = delta % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// Yaw (about Y) pointing the turret's rest muzzle (local +Z) at a flat
// (x, z) direction from the tower: yaw = atan2(dx, dz).
export const yawToward = (towerX: number, towerZ: number, x: number, z: number): number =>
  Math.atan2(x - towerX, z - towerZ);

// Eased turn of `from` toward `to` with rate TOWER_TURN_LAMBDA (the same ease
// the enemies use for their facing): `1 - exp(-8 * dt)` of the remaining arc
// per frame, so the swing decelerates as it converges.
export const stepYaw = (from: number, to: number, dt: number): number =>
  from + normalizeAngleDelta(to - from) * (1 - Math.exp(-TOWER_TURN_LAMBDA * dt));

type FireProjectile = (projectile: Omit<Projectile, "id">) => Projectile;

export type TowerCombatSystem = {
  tick: (frame: SimulationFrame) => void;
  reset: () => void;
  /** The logical yaw a turret has eased toward so far (0 before the first swing). */
  getTurretYaw: (towerId: number) => number;
  /** The render layer registers each turret's model node so the muzzle origin can
   *  be read from its world matrix; `null` unregisters (unmount / fallback). */
  registerTurretNode: (towerId: number, node: Object3D | null) => void;
};

export const createTowerCombatSystem = (
  world: World,
  fireProjectile: FireProjectile
): TowerCombatSystem => {
  const fireTimes = new Map<number, number>();
  const lastTargets = new Map<number, number>();
  const turretYaws = new Map<number, number>();
  const turretNodes = new Map<number, Object3D>();
  const _muzzleLocal = new Vector3();
  const _muzzleWorld = new Vector3();
  let cachedTowers: Tower[] | null = null;
  let towerIds = new Set<number>();
  let cachedBuildings:
    ReturnType<typeof useLevelStore.getState>["buildings"] | null = null;
  let cachedPaths:
    ReturnType<typeof useLevelStore.getState>["pathWaypoints"] | null = null;
  let lineOfSightObstacles: LineOfSightObstacle[] = [];

  const reset = () => {
    fireTimes.clear();
    lastTargets.clear();
    turretYaws.clear();
    turretNodes.clear();
    cachedTowers = null;
    cachedBuildings = null;
    cachedPaths = null;
  };

  const getTurretYaw = (towerId: number): number =>
    turretYaws.get(towerId) ?? 0;

  const registerTurretNode = (towerId: number, node: Object3D | null) => {
    if (node) {
      turretNodes.set(towerId, node);
    } else {
      turretNodes.delete(towerId);
    }
  };

  const tick = (frame: SimulationFrame) => {
    if (!frame.canResolveGameplay) return;

    const { gameStatus, towerTypes, tileSize, towerHeight } =
      useGameStore.getState();
    if (gameStatus !== "playing" && gameStatus !== "menu") return;

    const { towers, buildings, pathWaypoints, gridSize } =
      useLevelStore.getState();
    if (cachedTowers !== towers) {
      cachedTowers = towers;
      towerIds = new Set(towers.map((tower) => tower.id));
    }

    for (const id of fireTimes.keys()) {
      if (!towerIds.has(id)) fireTimes.delete(id);
    }
    for (const id of lastTargets.keys()) {
      if (!towerIds.has(id)) lastTargets.delete(id);
    }
    for (const id of turretYaws.keys()) {
      if (!towerIds.has(id)) turretYaws.delete(id);
    }

    if (cachedBuildings !== buildings || cachedPaths !== pathWaypoints) {
      cachedBuildings = buildings;
      cachedPaths = pathWaypoints;
      lineOfSightObstacles = buildings.map((building) => ({
        x: building.x,
        z: building.z,
        halfWidth: building.width / 2,
        halfDepth: building.depth / 2,
      }));
      for (const path of pathWaypoints) {
        const base = path[path.length - 1];
        if (!base) continue;
        lineOfSightObstacles.push({
          x: base.x,
          z: base.z,
          halfWidth: BASE_FOOTPRINT_HALF,
          halfDepth: BASE_FOOTPRINT_HALF,
        });
      }
    }

    const enemies = getLivingEnemyList(world);
    const currentTime = frame.simulationTimeSeconds;

    towers.forEach((tower) => {
      if (tower.type === "relay") return;

      const towerConfig = towerTypes?.[tower.type];
      if (!towerConfig) return;

      const effectiveStats = getEffectiveTowerCombatStats(
        tower,
        towers,
        towerTypes ?? {}
      );

      // Turret aim: every firing tower swings at the enemy it would shoot
      // (picked on the same rules as the shot, before the cooldown, so the
      // barrel keeps tracking a target it is on cooldown from). With no
      // target in range the turret holds its last aim instead of swinging
      // back to rest. The logical yaw in the map is the source of truth for
      // the fire gate below; when the render layer has registered the turret
      // node, the same yaw is mirrored onto it so the mesh matches the gate.
      const pickedTarget = pickTowerTarget(
        enemies,
        tower.targeting,
        {
          x: tower.x,
          z: tower.z,
          range: effectiveStats.range,
          lastTargetId: lastTargets.get(tower.id),
        },
        (enemy) =>
          !segmentCrossesObstacles(
            tower.x,
            tower.z,
            enemy.x,
            enemy.z,
            lineOfSightObstacles
          )
      );

      const currentYaw = turretYaws.get(tower.id) ?? 0;
      let desiredYaw = currentYaw;
      let steppedYaw = currentYaw;
      if (pickedTarget) {
        desiredYaw = yawToward(
          tower.x,
          tower.z,
          pickedTarget.x,
          pickedTarget.z
        );
        steppedYaw = stepYaw(currentYaw, desiredYaw, frame.deltaSeconds);
        turretYaws.set(tower.id, steppedYaw);
        const node = turretNodes.get(tower.id);
        if (node) {
          node.rotation.y = steppedYaw;
        }
      }

      // A shot only leaves the barrel once it actually points at the enemy:
      // while the turret is still swinging (outside the tolerance arc) the
      // tower waits, so a projectile never arcs sideways off a tower that
      // has not finished turning.
      if (
        pickedTarget &&
        Math.abs(normalizeAngleDelta(desiredYaw - steppedYaw)) >
          TOWER_AIM_TOLERANCE
      ) {
        return;
      }

      const lastFireTime = fireTimes.get(tower.id) ?? 0;
      if (currentTime - lastFireTime < tower.fireRate) return;

      if (!pickedTarget) return;

      let firedTarget = pickedTarget;
      let pierceEnemyIds: number[] | undefined;
      let chainAdditionalHits:
        Array<{ enemyId: number; damage: number }> | undefined;

      if (tower.type === "chain") {
        chainAdditionalHits = computeChainAdditionalHits(
          tower,
          enemies,
          pickedTarget,
          effectiveStats.damage,
          effectiveStats.range,
          tower.maxChainHops ?? 3,
          tower.chainDamageMultiplierPerHop ?? 0.85,
          lineOfSightObstacles
        );
      }

      if (tower.type === "laser" && tower.maxPierce) {
        const dx = pickedTarget.x - tower.x;
        const dz = pickedTarget.z - tower.z;
        const distToTarget = Math.hypot(dx, dz);

        if (distToTarget > 0) {
          const dirX = dx / distToTarget;
          const dirZ = dz / distToTarget;
          const beamLength = Math.min(
            distToTarget * 1.5,
            getRayObstacleClipDistance(
              tower.x,
              tower.z,
              dirX,
              dirZ,
              lineOfSightObstacles
            )
          );
          const extendedX = tower.x + dirX * beamLength;
          const extendedZ = tower.z + dirZ * beamLength;
          const enemiesInLine = findEnemiesInLine(
            enemies,
            tower.x,
            tower.z,
            extendedX,
            extendedZ,
            tower.maxPierce
          );

          if (enemiesInLine.length === 0) return;
          firedTarget = enemiesInLine[enemiesInLine.length - 1];
          pierceEnemyIds = enemiesInLine.map((enemy) => enemy.id);
        }
      }

      const planetRadius = getPlanetRadius(gridSize, tileSize);
      const targetPathPos = getPositionAlongMultiplePaths(
        pathWaypoints,
        firedTarget.pathIndex,
        firedTarget.pathProgress
      );

      // The shot (and the laser beam, and the fire sound) leave the barrel
      // tip, not the tower centre, so the muzzle is transformed from the
      // turret node's rest position by the node's live world matrix — which
      // already carries the model fit scale, base recentering, planet
      // curvature, and the turret's current aim. Without a registered node
      // (model still loading / primitive fallback) fall back to the old
      // centre emitter. The result is a scratch vector, read into the
      // projectile and the fire event before the next tower reuses it.
      const startWorld = _muzzleWorld;
      const muzzleSpec = tower.muzzle?.muzzle;
      const muzzleNode = turretNodes.get(tower.id);
      if (muzzleSpec && muzzleNode) {
        // `localToWorld` refreshes the node's world matrix from its current
        // rotation (set by the aim pass this frame) plus its parents', so the
        // muzzle reads this frame's aim, not last frame's.
        _muzzleLocal.set(muzzleSpec.x, muzzleSpec.y, muzzleSpec.z);
        muzzleNode.localToWorld(_muzzleLocal);
        startWorld.copy(_muzzleLocal);
      } else {
        const emitterAlongNormal =
          tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7;
        flatCombatPointToWorldPosition(
          tower.x,
          tower.z,
          emitterAlongNormal,
          planetRadius,
          startWorld
        );
      }
      const targetWorld = flatCombatPointToWorldPosition(
        firedTarget.x,
        firedTarget.z,
        targetPathPos.y + firedTarget.size,
        planetRadius
      );

      const fired = fireProjectile({
        towerId: tower.id,
        towerType: tower.type,
        startX: startWorld.x,
        startY: startWorld.y,
        startZ: startWorld.z,
        damage: effectiveStats.damage,
        speed: tower.projectileSpeed,
        range: effectiveStats.range,
        color: tower.color,
        slowAmount: tower.slowAmount,
        slowDuration: tower.slowDuration,
        aoeRadius: tower.aoeRadius,
        maxPierce: tower.maxPierce,
        projectileType: tower.projectileType,
        targetX: targetWorld.x,
        targetY: targetWorld.y,
        targetZ: targetWorld.z,
        targetId: firedTarget.id,
        pierceEnemyIds,
        chainAdditionalHits,
      });
      if (fired.id <= 0) return;

      lastTargets.set(tower.id, firedTarget.id);
      fireTimes.set(tower.id, currentTime);
      gameEvents.emit(GameEvent.TOWER_FIRE, {
        towerId: tower.id,
        towerType: tower.type,
        worldPosition: {
          x: startWorld.x,
          y: startWorld.y,
          z: startWorld.z,
        },
      });
    });
  };

  return { tick, reset, getTurretYaw, registerTurretNode };
};
