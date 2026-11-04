import { FC, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useWorld } from "koota/react";
import { Vector3 } from "three";
import type { Object3D } from "three";

import {
  findEnemiesInLine,
  getRayObstacleClipDistance,
  segmentCrossesObstacles,
  type LineOfSightObstacle,
} from "../../utils/mathUtils";
import { isTargetStale, pickTowerTarget } from "../../utils/towerTargeting";
import { computeChainAdditionalHits } from "../../core/chainLightning";
import { getEffectiveTowerCombatStats } from "../../core/relayBuffs";
import { gameEvents } from "../../utils/eventEmitter";
import type {
  Tower as TowerInstance,
  Projectile as ProjectileInstance,
  TowerType,
  Enemy,
} from "../../core/types/game";
import { Tower } from "../entities/Tower";
import { GUITowerInfoPanel } from "../gui/GUITowerInfoPanel";
import { TileData } from "../../core/types/utils";
import {
  tileSizeSelector,
  towerHeightSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  buildingsSelector,
  gridSizeSelector,
  isLevelConfigLoadedSelector,
  pathWaypointsSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { getLivingEnemyList } from "../../core/ecs/selectors/enemySnapshots";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import {
  flatCombatPointToWorldPosition,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import { getPositionAlongMultiplePaths } from "../../utils/pathUtils";
import { GameEvent } from "../../core/types/enums/events";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { useSimulationClock } from "../../core/contexts/SimulationClockContext";

// The base (`EndBuilding`) sits on a round platform of radius 0.4, so its
// ground footprint half-extent is 0.4.
const BASE_FOOTPRINT_HALF = 0.4;

// A tower only fires once its barrel is within this angle (the shortest arc)
// of the target, so a projectile never arcs sideways off a tower still
// swinging around. 15 degrees.
export const TOWER_AIM_TOLERANCE = Math.PI / 12;

// Per-frame eased swing rate for the turret turning toward its target (the same
// exponential ease the enemies use to turn their facing): `1 - exp(-lambda*dt)`
// of the remaining arc per frame, so the swing decelerates as it converges.
export const TOWER_TURN_LAMBDA = 8;

// A tower re-runs its full target selection (the range + line-of-sight scan
// over every enemy) at most once per this interval, and immediately whenever
// the cached target dies, leaves the range, or loses line of sight. The
// per-frame pass reuses the cached target in between, so the turret keeps
// swinging at the same enemy while the scan budget is spent once per tower
// instead of once per frame. 0.15s: ~7x cheaper than every frame, yet a
// target can traverse at most speed * 0.15 ≈ 0.37 world units between re-picks
// — well inside the aim tolerance and the enemy size, so a cached pick is
// never visibly wrong.
export const TOWER_TARGET_REPICK_INTERVAL = 0.15;

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
export const yawToward = (
  towerX: number,
  towerZ: number,
  x: number,
  z: number
): number => Math.atan2(x - towerX, z - towerZ);

// Eased turn of `from` toward `to` with rate TOWER_TURN_LAMBDA (the same ease
// the enemies use for their facing): `1 - exp(-8 * dt)` of the remaining arc
// per frame, so the swing decelerates as it converges.
const stepYaw = (from: number, to: number, dt: number): number =>
  from +
  normalizeAngleDelta(to - from) * (1 - Math.exp(-TOWER_TURN_LAMBDA * dt));

// Scratch state for the per-frame turret aim pass (towers are a handful at a
// time; the vectors are reused and are not per-frame allocations).
const _muzzleLocal = new Vector3();
const _muzzleWorld = new Vector3();

// Scratch membership set of the living enemy objects for the current frame
// (the pooled registry hands out one stable object per live entity, so a
// reference check tells whether a cached target still exists — an enemy
// removed at the base keeps its health, so health alone cannot prove it is
// gone). Re-filled each frame; reused across frames, no per-frame allocation.
const _livingEnemies = new Set<Enemy>();

type TowerSystemProps = {
  fireProjectile: (
    projectile: Omit<ProjectileInstance, "id">
  ) => ProjectileInstance;
  selectedTower: TowerInstance | null;
  onTowerClick: ((tower: TowerInstance) => void) | null;
  onSellTower: ((towerId: number) => void) | null;
  hoveredTile: TileData | null;
  hoveredTilePlacementState: TilePlacementState | null;
  selectedTowerType: TowerType | null;
};

export const TowerSystem: FC<TowerSystemProps> = memo(
  ({
    fireProjectile,
    selectedTower,
    onTowerClick,
    onSellTower,
    hoveredTile,
    selectedTowerType,
    hoveredTilePlacementState,
  }) => {
    const { shouldStopMovement, getSimulationTime, getTimeScale } =
      useSimulationClock();

    // Fire timing is a pure simulation concern, so it lives in a ref instead
    // of the zustand `towers` array: updating `lastFireTime` no longer
    // re-renders the 150-tower list and the O(towers^2) combat-stats memo on
    // every shot. The towers array reference still changes on place/sell, so
    // a shot after a placement naturally reads the fresh array.
    const fireTimesRef = useRef(new Map<number, number>());

    // The focused-targeting "which enemy was I shooting last" memory, kept in
    // a ref for the same reason as fireTimesRef: recording a shot must not
    // re-render the towers list.
    const lastTargetsRef = useRef(new Map<number, number>());

    // Per-turret aiming state, also kept in refs (never re-renders): the
    // logical yaw every turret has eased toward so far (so a shot is only
    // allowed once the barrel is actually on target), and the live model
    // node each turret swings (registered by `Tower`; missing while a model
    // loads or on the primitive fallback, where the logical yaw still gates
    // firing).
    const turretYawsRef = useRef(new Map<number, number>());
    const turretNodesRef = useRef(new Map<number, Object3D>());

    // Throttled target selection: the enemy each tower last picked, plus the
    // simulation time of that pick. Both are refs (never re-render); the
    // per-frame pass reuses the cached enemy between re-picks and only runs
    // the full scan on the re-pick interval or when the cached target dies,
    // leaves range, or loses line of sight.
    const cachedTargetsRef = useRef(new Map<number, Enemy | null>());
    const repickTimesRef = useRef(new Map<number, number>());

    const onTurretNode = useCallback(
      (towerId: number, node: Object3D | null) => {
        const nodes = turretNodesRef.current;
        if (node) {
          nodes.set(towerId, node);
        } else {
          nodes.delete(towerId);
        }
      },
      []
    );

    const towerTypes = useGameStore(towerTypesSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const towerHeight = useGameStore(towerHeightSelector);

    const gridSize = useLevelStore(gridSizeSelector);
    const pathWaypoints = useLevelStore(pathWaypointsSelector);
    const towers = useLevelStore(towersSelector);
    const buildings = useLevelStore(buildingsSelector);
    const isLevelConfigLoaded = useLevelStore(isLevelConfigLoadedSelector);

    const towerIds = useMemo(() => new Set(towers.map((t) => t.id)), [towers]);

    // Static objects that block a tower's line of sight: buildings plus the
    // base of every path (each path ends in its own base). Footprints are in
    // flat ground-plane coordinates; a cylinder is approximated by its
    // circumscribing square. Towers do not block each other.
    const lineOfSightObstacles = useMemo<LineOfSightObstacle[]>(() => {
      const obstacles = buildings.map((b) => ({
        x: b.x,
        z: b.z,
        halfWidth: b.width / 2,
        halfDepth: b.depth / 2,
      }));
      for (const path of pathWaypoints) {
        const base = path?.[path.length - 1];
        if (!base) continue;
        obstacles.push({
          x: base.x,
          z: base.z,
          halfWidth: BASE_FOOTPRINT_HALF,
          halfDepth: BASE_FOOTPRINT_HALF,
        });
      }
      return obstacles;
    }, [buildings, pathWaypoints]);

    // Tower ids are re-issued from 1 when a level (re)loads, so a reused id
    // would otherwise carry the previous level's fire timestamp, focused
    // target, or aim yaw. Clear the refs when the level (re)loads; the
    // per-frame prune below only drops ids that no longer exist, which a
    // reused id does not. The node map is deliberately not cleared here:
    // the `Tower`s of the new level register theirs in this same commit
    // (child effects run before this one), so a clear would drop freshly
    // registered nodes; a tower leaving the level unregisters its node via
    // the `null` callback on unmount instead.
    useEffect(() => {
      if (isLevelConfigLoaded) {
        fireTimesRef.current.clear();
        lastTargetsRef.current.clear();
        turretYawsRef.current.clear();
        cachedTargetsRef.current.clear();
        repickTimesRef.current.clear();
      }
    }, [isLevelConfigLoaded]);

    const world = useWorld();

    const combatStatsByTowerId = useMemo(() => {
      const map = new Map<number, { damage: number; range: number }>();
      if (!towerTypes) return map;
      for (const t of towers) {
        map.set(t.id, getEffectiveTowerCombatStats(t, towers, towerTypes));
      }
      return map;
    }, [towers, towerTypes]);

    const previewTower = useMemo(() => {
      if (!selectedTowerType || !hoveredTile) return null;

      const towerConfig = towerTypes?.[selectedTowerType];
      if (!towerConfig) return null;

      if (!hoveredTilePlacementState || hoveredTilePlacementState.isBlocked) {
        return null;
      }

      const worldX = tileToWorldCoordinate(
        hoveredTile.gridX,
        gridSize,
        tileSize
      );
      const worldZ = tileToWorldCoordinate(
        hoveredTile.gridZ,
        gridSize,
        tileSize
      );

      const preview: TowerInstance = {
        ...towerConfig,
        id: -1,
        type: selectedTowerType,
        gridX: hoveredTile.gridX,
        gridZ: hoveredTile.gridZ,
        x: worldX,
        z: worldZ,
        lastFireTime: 0,
      };

      return preview;
    }, [
      selectedTowerType,
      hoveredTile,
      towerTypes,
      hoveredTilePlacementState,
      gridSize,
      tileSize,
    ]);

    useFrame((state, delta) => {
      const { gameStatus } = useGameStore.getState();
      if (shouldStopMovement) return;
      if (gameStatus !== "playing" && gameStatus !== "menu") return;

      // Fire timing runs on the pause-adjusted simulation clock, so a
      // tower's cooldown does not keep counting down while the game is
      // paused (the raw clock keeps advancing, which let towers fire the
      // instant the pause was lifted).
      const currentTime = getSimulationTime(state.clock.elapsedTime);
      // The per-frame turn step is scaled by the time dilation so a swing
      // eases to stillness on pause, like the enemy facing does.
      const turnStep = delta * getTimeScale();
      const enemies = getLivingEnemyList(world);
      // Rebuild the living-enemy object set so the cached-target reuse below
      // can tell whether a target still exists (an enemy removed at the base
      // keeps its health, so health alone cannot prove it is gone).
      _livingEnemies.clear();
      for (const enemy of enemies) {
        _livingEnemies.add(enemy);
      }
      const fireTimes = fireTimesRef.current;
      const lastTargets = lastTargetsRef.current;
      const turretYaws = turretYawsRef.current;
      const turretNodes = turretNodesRef.current;
      const cachedTargets = cachedTargetsRef.current;
      const repickTimes = repickTimesRef.current;
      // Prune entries for towers that no longer exist (sold / level restart)
      // so the maps stay the size of the current level.
      for (const id of fireTimes.keys()) {
        if (!towerIds.has(id)) fireTimes.delete(id);
      }
      for (const id of lastTargets.keys()) {
        if (!towerIds.has(id)) lastTargets.delete(id);
      }
      for (const id of turretYaws.keys()) {
        if (!towerIds.has(id)) turretYaws.delete(id);
      }
      for (const id of cachedTargets.keys()) {
        if (!towerIds.has(id)) cachedTargets.delete(id);
      }
      for (const id of repickTimes.keys()) {
        if (!towerIds.has(id)) repickTimes.delete(id);
      }

      towers.forEach((tower) => {
        if (tower.type === "relay") return;

        // Turret aim: every firing tower swings at the enemy it would shoot
        // (picked on the same rules as the shot, before the cooldown, so the
        // barrel keeps tracking a target it is on cooldown from). With no
        // target in range the turret holds its last aim instead of swinging
        // back to rest. The logical yaw in the map is the source of truth for
        // the fire gate below; when the model has registered its turret node
        // the yaw is mirrored onto it so the mesh matches the gate.
        const towerConfig = towerTypes?.[tower.type];
        // Reuse the render-time combat stats (relay adjacency buffs). It is
        // memoized on the tower list, so reading it here is a cheap map lookup
        // even though the turret re-evaluates its target every frame (to
        // track the enemy while on cooldown).
        const eff = combatStatsByTowerId.get(tower.id) ?? {
          damage: tower.damage,
          range: tower.range,
        };

        // A tower can only shoot at enemies it has line of sight on: an
        // enemy behind a static building or the base is skipped so the tower
        // falls back to the next-best candidate it can actually hit. Towers
        // do not block each other's shots.
        const isVisible = (enemy: Enemy) =>
          !segmentCrossesObstacles(
            tower.x,
            tower.z,
            enemy.x,
            enemy.z,
            lineOfSightObstacles
          );

        // Target selection is throttled: the full range + line-of-sight scan
        // over every enemy runs at most once per TOWER_TARGET_REPICK_INTERVAL
        // (on the pause-adjusted simulation clock, so a slow-motion stretch
        // does not burn the budget faster), or immediately when the cached
        // target is no longer usable — dead, removed at the base (the entity
        // is destroyed without zeroing its health, so the object must be
        // checked against this frame's living list), out of range, or behind
        // an obstacle. In between, the aim pass below reuses the cached
        // enemy, so the turret keeps swinging every frame while the scan cost
        // drops from per-frame to per-interval.
        const lastRepick = repickTimes.get(tower.id);
        const shouldRepick =
          lastRepick === undefined ||
          currentTime - lastRepick >= TOWER_TARGET_REPICK_INTERVAL;
        let pickedTarget: Enemy | null = cachedTargets.get(tower.id) ?? null;
        if (
          shouldRepick ||
          (pickedTarget &&
            (!_livingEnemies.has(pickedTarget) ||
              isTargetStale(
                pickedTarget,
                tower.x,
                tower.z,
                eff.range,
                isVisible
              )))
        ) {
          pickedTarget = towerConfig
            ? pickTowerTarget(
                enemies,
                tower.targeting,
                {
                  x: tower.x,
                  z: tower.z,
                  range: eff.range,
                  lastTargetId: lastTargets.get(tower.id),
                },
                isVisible
              )
            : null;
          cachedTargets.set(tower.id, pickedTarget);
          repickTimes.set(tower.id, currentTime);
        }

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
          steppedYaw = stepYaw(currentYaw, desiredYaw, turnStep);
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
        const timeSinceLastFire = currentTime - lastFireTime;
        if (timeSinceLastFire < tower.fireRate) return;

        if (!towerConfig || !pickedTarget) return;

        // A piercing laser re-aims at the furthest enemy in the beam, so the
        // projectile (and the focused tower's memory) follow that re-aim.
        let firedTarget = pickedTarget;

        let pierceEnemyIds: number[] | undefined;
        let chainAdditionalHits:
          Array<{ enemyId: number; damage: number }> | undefined;

        if (tower.type === "chain") {
          const maxHops = tower.maxChainHops ?? 3;
          const mult = tower.chainDamageMultiplierPerHop ?? 0.85;
          chainAdditionalHits = computeChainAdditionalHits(
            tower,
            enemies,
            pickedTarget,
            eff.damage,
            eff.range,
            maxHops,
            mult,
            lineOfSightObstacles
          );
        }

        if (tower.type === "laser" && tower.maxPierce) {
          const dx = pickedTarget.x - tower.x;
          const dz = pickedTarget.z - tower.z;
          const distToTarget = Math.hypot(dx, dz);

          if (distToTarget > 0) {
            const extendFactor = 1.5;
            const dirX = dx / distToTarget;
            const dirZ = dz / distToTarget;

            // The beam extends slightly past the target to catch enemies in
            // line, but stops at the first building (or the base) it hits so
            // nothing behind the obstacle is pierced.
            const beamLength = Math.min(
              distToTarget * extendFactor,
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
            pierceEnemyIds = enemiesInLine.map((e) => e.id);
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
        // centre emitter. The result is a module scratch vector, read into the
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

        const projectileData: Omit<ProjectileInstance, "id"> = {
          towerId: tower.id,
          towerType: tower.type,
          startX: startWorld.x,
          startY: startWorld.y,
          startZ: startWorld.z,
          damage: eff.damage,
          speed: tower.projectileSpeed,
          range: eff.range,
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
          pierceEnemyIds: pierceEnemyIds,
          chainAdditionalHits,
        };

        const fired = fireProjectile(projectileData);
        if (fired.id <= 0) return;

        // Remember the shot target so a focused tower keeps firing it next
        // volley while it stays in range and visible.
        lastTargets.set(tower.id, firedTarget.id);

        gameEvents.emit(GameEvent.TOWER_FIRE, {
          towerId: tower.id,
          towerType: tower.type,
          worldPosition: {
            x: startWorld.x,
            y: startWorld.y,
            z: startWorld.z,
          },
        });

        fireTimes.set(tower.id, currentTime);
      });
    });

    return (
      <>
        <group name="towers">
          {towers.map((tower) => {
            const eff = combatStatsByTowerId.get(tower.id) ?? {
              damage: tower.damage,
              range: tower.range,
            };
            return (
              <Tower
                key={tower.id}
                tower={tower}
                effectiveRange={eff.range}
                isSelected={selectedTower?.id === tower.id}
                onClick={() => onTowerClick?.(tower)}
                onTurretNode={onTurretNode}
              />
            );
          })}
        </group>

        {previewTower && towerTypes && (
          <Tower
            key="preview"
            tower={previewTower}
            effectiveRange={
              getEffectiveTowerCombatStats(
                previewTower,
                [...towers, previewTower],
                towerTypes
              ).range
            }
            isPreview={true}
            isInvalidPlacement={hoveredTilePlacementState?.isOnPath ?? false}
          />
        )}

        {selectedTower && (
          <GUITowerInfoPanel
            tower={selectedTower}
            onSell={() => onSellTower?.(selectedTower.id)}
          />
        )}
      </>
    );
  }
);

TowerSystem.displayName = "TowerSystem";
