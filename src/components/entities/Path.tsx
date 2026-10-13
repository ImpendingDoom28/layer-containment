import { FC, memo, useMemo } from "react";

import { Quaternion, Vector3 } from "three";

import { getCssColorValue } from "../ui/lib/cssUtils";
import { GUINextWavePreview } from "../gui/GUINextWavePreview";
import {
  gridSizeSelector,
  pathWaypointsSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  pathWidthSelector,
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  flatFieldToSphereSurface,
  flatFieldToSphereTileMeshCenter,
  flatFieldToSphereTilePose,
  getPlanetRadius,
  getQuaternionForPathStrip,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import { getPathRenderSegments } from "../../utils/pathUtils";
import { Portal } from "./Portal";
import { EndBuilding } from "./EndBuilding";

type PathProps = {
  pathIndex: number;
};

type SphereStripMesh = {
  key: string;
  position: Vector3;
  quaternion: Quaternion;
  chunkLength: number;
};

export const Path: FC<PathProps> = memo(({ pathIndex }) => {
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const pathYOffset = useGameStore(pathYOffsetSelector);
  const pathWidth = useGameStore(pathWidthSelector);

  const [path, segments] = useMemo(() => {
    const path = pathWaypoints[pathIndex];
    return [path, path ? getPathRenderSegments(path) : []];
  }, [pathWaypoints, pathIndex]);

  const radius = useMemo(
    () => getPlanetRadius(gridSize, tileSize),
    [gridSize, tileSize]
  );

  const sphereStrips = useMemo((): SphereStripMesh[] => {
    if (!path || segments.length === 0) return [];
    const out: SphereStripMesh[] = [];
    segments.forEach((segment, segIdx) => {
      const safeLen = Math.max(segment.length, 1e-8);
      const steps = Math.max(1, Math.ceil(safeLen / tileSize));
      const subLen = safeLen / steps;
      const dirX = segment.dx / safeLen;
      const dirZ = segment.dz / safeLen;
      for (let j = 0; j < steps; j++) {
        const cx = segment.start.x + dirX * subLen * (j + 0.5);
        const cz = segment.start.z + dirZ * subLen * (j + 0.5);
        const yBase =
          segment.start.y +
          ((segment.end.y - segment.start.y) * (j + 0.5)) / steps;
        const { normal } = flatFieldToSphereSurface(cx, cz, radius);
        const pos = flatFieldToSphereTileMeshCenter(cx, cz, radius, 0.01);
        pos.addScaledVector(normal, yBase + pathYOffset);
        const quat = getQuaternionForPathStrip(
          cx,
          cz,
          segment.dx,
          segment.dz,
          radius
        );
        out.push({
          key: `path-${pathIndex}-seg-${segIdx}-step-${j}`,
          position: pos,
          quaternion: quat,
          chunkLength: subLen,
        });
      }
    });
    return out;
  }, [path, segments, pathIndex, tileSize, radius, pathYOffset]);

  const cornerTiles = useMemo(() => {
    if (!path) return [];
    return path.map((wp, index) => {
      const body = flatFieldToSphereTilePose(
        wp.x,
        wp.z,
        radius,
        wp.y + pathYOffset + 0.01
      );
      const border = flatFieldToSphereTilePose(
        wp.x,
        wp.z,
        radius,
        wp.y + pathYOffset + 0.01
      );
      return {
        key: `path-${pathIndex}-corner-${index}`,
        body: body,
        border: border,
      };
    });
  }, [path, pathIndex, radius, pathYOffset]);

  const portalProps = useMemo(() => {
    if (!path || path.length === 0) return null;
    const wp = path[0];
    const { surfacePoint, normal } = flatFieldToSphereSurface(
      wp.x,
      wp.z,
      radius
    );
    const position = surfacePoint.clone().addScaledVector(normal, wp.y + 0.5);
    const baseQuat = getSurfaceQuaternion(normal);
    const yawQuat = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      (segments[0]?.yaw ?? 0) + Math.PI / 2
    );
    const quaternion = baseQuat.clone().multiply(yawQuat);
    return {
      position: [position.x, position.y, position.z] as [
        number,
        number,
        number,
      ],
      quaternion,
      surfaceNormal: [normal.x, normal.y, normal.z] as [number, number, number],
    };
  }, [path, radius, segments]);

  const endBuildingProps = useMemo(() => {
    if (!path || path.length === 0) return null;
    const last = path[path.length - 1];
    const { surfacePoint, normal } = flatFieldToSphereSurface(
      last.x,
      last.z,
      radius
    );
    const position = surfacePoint.clone().addScaledVector(normal, last.y);
    return {
      position: [position.x, position.y, position.z] as [
        number,
        number,
        number,
      ],
      quaternion: getSurfaceQuaternion(normal),
    };
  }, [path, radius]);

  if (!path) return null;

  return (
    <group name="path">
      {sphereStrips.map((strip) => (
        <group key={strip.key}>
          <mesh position={strip.position} quaternion={strip.quaternion}>
            <boxGeometry args={[strip.chunkLength, 0.02, pathWidth]} />
            <meshStandardMaterial color={getCssColorValue("scene-gray-500")} />
          </mesh>

          <mesh position={strip.position} quaternion={strip.quaternion}>
            <boxGeometry args={[strip.chunkLength, 0.01, pathWidth + 0.05]} />
            <meshStandardMaterial color={getCssColorValue("scene-gray-600")} />
          </mesh>
        </group>
      ))}
      {cornerTiles.map((c) => (
        <group key={c.key}>
          <mesh position={c.body.position} quaternion={c.body.quaternion}>
            <boxGeometry args={[tileSize + 0.05, 0.01, tileSize + 0.05]} />
            <meshStandardMaterial color={getCssColorValue("scene-gray-600")} />
          </mesh>

          <mesh position={c.border.position} quaternion={c.border.quaternion}>
            <boxGeometry args={[tileSize, 0.02, tileSize]} />
            <meshStandardMaterial color={getCssColorValue("scene-gray-500")} />
          </mesh>
        </group>
      ))}
      {portalProps && (
        <Portal
          position={portalProps.position}
          quaternion={portalProps.quaternion}
          surfaceNormal={portalProps.surfaceNormal}
        />
      )}

      {endBuildingProps && (
        <EndBuilding
          position={endBuildingProps.position}
          quaternion={endBuildingProps.quaternion}
        />
      )}

      <GUINextWavePreview pathIndex={pathIndex} />
    </group>
  );
});

Path.displayName = "Path";
