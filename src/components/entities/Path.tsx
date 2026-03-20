import { FC } from "react";

import { getCssColorValue } from "../ui/lib/cssUtils";
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
import { getPathRenderSegments } from "../../utils/pathUtils";
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

  const segments = getPathRenderSegments(path ?? []);

  return (
    <group>
      {/* Draw path segments (narrower, within tiles) */}
      {segments.map((segment) => {
        const segmentKey = [
          segment.start.x,
          segment.start.z,
          segment.end.x,
          segment.end.z,
        ].join(":");

        return (
          <group key={`path-${pathIndex}-segment-${segmentKey}`}>
            {/* Path line */}
            <mesh
              position={[
                segment.centerX,
                segment.start.y + pathYOffset,
                segment.centerZ,
              ]}
              rotation={[0, segment.yaw, 0]}
            >
              <boxGeometry args={[segment.length, 0.02, pathWidth]} />
              <meshStandardMaterial color={getCssColorValue("scene-gray-500")} />
            </mesh>

            <mesh
              position={[
                segment.centerX,
                segment.start.y + pathYOffset,
                segment.centerZ,
              ]}
              rotation={[0, segment.yaw, 0]}
            >
              <boxGeometry args={[segment.length, 0.01, pathWidth + 0.05]} />
              <meshStandardMaterial color={getCssColorValue("scene-gray-600")} />
            </mesh>
          </group>
        );
      })}
      {/* Draw corner tiles (full tile size at waypoints) */}
      {path.map((wp, index) => (
        <group key={`path-${pathIndex}-corner-${index}`}>
          <mesh position={[wp.x, wp.y + pathYOffset, wp.z]}>
            <boxGeometry args={[tileSize + 0.05, 0.01, tileSize + 0.05]} />
            <meshStandardMaterial color={getCssColorValue("scene-gray-600")} />
          </mesh>

          <mesh position={[wp.x, wp.y + pathYOffset + 0.001, wp.z]}>
            <boxGeometry args={[tileSize, 0.02, tileSize]} />
            <meshStandardMaterial color={getCssColorValue("scene-gray-500")} />
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
      <GUINextWavePreview
        timeUntilNextWave={timeUntilNextWave}
        pathIndex={pathIndex}
      />
    </group>
  );
};
