import { FC } from "react";

import { GUINextWavePreview } from "../gui/GUINextWavePreview";
import {
  pathWaypointsSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  pathWidthSelector,
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { Portal } from "./Portal";
import { EndBuilding } from "./EndBuilding";

type PathProps = {
  timeUntilNextWave: number | null;
  pathIndex: number;
};

export const Path: FC<PathProps> = ({ timeUntilNextWave, pathIndex }) => {
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathYOffset = useGameStore(pathYOffsetSelector);
  const pathWidth = useGameStore(pathWidthSelector);

  const path = pathWaypoints[pathIndex];
  if (!path) return null;

  return (
    <group>
      {/* Draw path segments (narrower, within tiles) */}
      {path.map((wp, index) => {
        if (index === path.length - 1) return null;
        const nextWp = path[index + 1];
        const dx = nextWp.x - wp.x;
        const dz = nextWp.z - wp.z;
        const length = Math.sqrt(dx * dx + dz * dz);
        const angle = Math.atan2(dz, dx);

        // Calculate the center position for the segment
        const centerX = wp.x + dx / 2;
        const centerZ = wp.z + dz / 2;

        return (
          <group key={`path-${pathIndex}-segment-${index}`}>
            {/* Path line */}
            <mesh
              position={[centerX, wp.y + pathYOffset, centerZ]}
              rotation={[0, angle, 0]}
            >
              <boxGeometry args={[length, 0.02, pathWidth]} />
              <meshStandardMaterial color="#6b7280" />
            </mesh>

            <mesh
              position={[centerX, wp.y + pathYOffset, centerZ]}
              rotation={[0, angle, 0]}
            >
              <boxGeometry args={[length, 0.01, pathWidth + 0.05]} />
              <meshStandardMaterial color="#4b5563" />
            </mesh>
          </group>
        );
      })}
      {/* Draw corner tiles (full tile size at waypoints) */}
      {path.map((wp, index) => (
        <group key={`path-${pathIndex}-corner-${index}`}>
          <mesh position={[wp.x, wp.y + pathYOffset, wp.z]}>
            <boxGeometry args={[tileSize + 0.05, 0.01, tileSize + 0.05]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>

          <mesh position={[wp.x, wp.y + pathYOffset + 0.001, wp.z]}>
            <boxGeometry args={[tileSize, 0.02, tileSize]} />
            <meshStandardMaterial color="#6b7280" />
          </mesh>
        </group>
      ))}
      {/* Portal at start point */}
      <Portal position={[path[0].x, path[0].y + 0.5, path[0].z]} />

      {/* End building at final waypoint */}
      <EndBuilding
        position={[
          path[path.length - 1].x,
          path[path.length - 1].y,
          path[path.length - 1].z,
        ]}
      />

      {/* Next wave preview */}
      <GUINextWavePreview timeUntilNextWave={timeUntilNextWave} />
    </group>
  );
};
