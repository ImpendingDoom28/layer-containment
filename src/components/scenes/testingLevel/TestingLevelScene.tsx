import { FC } from "react";
import { useQuery } from "koota/react";

import { LevelSystem } from "../../systems/LevelSystem";
import { Grid } from "../../entities/Grid";
import { Path } from "../../entities/Path";
import { Portal } from "../../entities/Portal";
import { Building } from "../../entities/Building";
import { Water } from "../../entities/Water";
import { Tower } from "../../entities/Tower";
import { Enemy } from "../../entities/Enemy";
import { PlanetTileDecorations } from "../../entities/PlanetTileDecorations";
import { StaticProjectiles } from "../../entities/StaticProjectiles";
import { TestingLevelCamera } from "./TestingLevelCamera";
import { Ground } from "../shared/Ground";
import { Skybox } from "../shared/Skybox";
import { Light } from "../shared/Light";
import {
  buildingsSelector,
  gridSizeSelector,
  gridOffsetSelector,
  pathWaypointsSelector,
  towersSelector,
  useLevelStore,
  watersSelector,
} from "../../../core/stores/useLevelStore";
import {
  pathWidthSelector,
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useTileOccupancyMasks } from "../../../core/hooks/utils/useTileOccupancyMasks";
import { IsEnemy } from "../../../core/ecs/traits/enemy";
import type {
  GetSimulationTime,
  GetTimeScale,
} from "../../../core/hooks/useSimulationClock";

// The tiles are purely visual here (no placement), so stable no-ops keep the
// memoized `Grid` from re-rendering on unrelated store updates.
const noopPlaceTower = () => undefined;
const noopSetHoveredTile = () => undefined;

// The showcase is a frozen snapshot: enemies and towers must not move, fire,
// or animate, so they are fed a clock that is always at zero. This keeps the
// Enemy component's per-frame effects (hit-flash decay, ring rotation, medic
// pulses) static while the bodies still track their (unmoved) ECS positions.
const getFrozenSimulationTime: GetSimulationTime = () => 0;
const getFrozenTimeScale: GetTimeScale = () => 0;

// Reinforcements showcase portals: the level's own `Path` portal always renders
// at tier 0 (no reinforcements picked for the run), so the upgrade's visual is
// shown here instead — one portal per tier (1-3), spaced by one tile on the
// projectile row's right side. They float at the in-game portal height.
const REINFORCEMENT_PORTALS: { tier: number; position: [number, number, number] }[] = [
  { tier: 1, position: [3.5, 0.5, 5.5] },
  { tier: 2, position: [5.5, 0.5, 5.5] },
  { tier: 3, position: [7.5, 0.5, 5.5] },
];

/**
 * Static 3D asset showcase. Loads `level_testing` — every enemy, tower and
 * its projectile, plus buildings, water, the path (spawn portal + end
 * building), and every enemy upgrade across all its tiers (armored, swift,
 * slow-resistance, regenerating on `basic` enemies) plus the reinforcements
 * portal tiers — spaced by one tile so the whole roster is visible at once.
 *
 * It deliberately does NOT mount `EntitiesSystem`, so none of the
 * movement / tower-fire / projectile / death / split systems run. Enemies and
 * towers are spawned by the level config and then simply rendered in place;
 * the level's static projectiles are drawn by `StaticProjectiles` (the live
 * instanced pool only renders projectiles that towers actually fire).
 */
export const TestingLevelScene: FC = () => {
  const buildings = useLevelStore(buildingsSelector);
  const waters = useLevelStore(watersSelector);
  const towers = useLevelStore(towersSelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const gridOffset = useLevelStore(gridOffsetSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathWidth = useGameStore(pathWidthSelector);
  const enemyEntities = useQuery(IsEnemy);

  const occupancy = useTileOccupancyMasks({
    gridSize,
    gridOffset,
    tileSize,
    pathWaypoints,
    pathWidth,
    waters,
  });

  return (
    <>
      <LevelSystem levelName="level_testing" />

      <Skybox />
      <Light />
      <Ground />

      <TestingLevelCamera />

      <Grid
        placeTower={noopPlaceTower}
        hoveredTile={null}
        setHoveredTile={noopSetHoveredTile}
        occupancy={occupancy}
      />

      <PlanetTileDecorations occupancy={occupancy} />

      {pathWaypoints.map((_, index) => (
        <Path key={index} pathIndex={index} />
      ))}

      {buildings.map((building) => (
        <Building key={building.id} building={building} />
      ))}

      {waters.map((water) => (
        <Water key={water.id} water={water} />
      ))}

      {towers.map((tower) => (
        <Tower key={tower.id} tower={tower} />
      ))}

      <group name="enemies">
        {enemyEntities.map((entity) => (
          <Enemy
            key={entity}
            entity={entity}
            getSimulationTime={getFrozenSimulationTime}
            getTimeScale={getFrozenTimeScale}
          />
        ))}
      </group>

      <StaticProjectiles />

      {/* Reinforcements upgrade shown as spawn portals: the in-game portal
          warms from green toward orange and grows one pulsing ring per pick,
          so tiers 1-3 are lined up to the right of the projectile row. */}
      {REINFORCEMENT_PORTALS.map(({ tier, position }) => (
        <Portal key={`reinforcement-${tier}`} position={position} reinforcementsTier={tier} />
      ))}
    </>
  );
};
