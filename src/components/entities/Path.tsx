import { FC, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  BoxGeometry,
  BufferGeometry,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { freezeSubtree } from "../../utils/freezeSubtree";
import { getCssColorValue } from "../ui/lib/cssUtils";
import { GUINextWavePreview } from "../gui/GUINextWavePreview";
import {
  cometRevealSelector,
  gridSizeSelector,
  levelEnterRunSelector,
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
  levelEnemyUpgradeStackSelector,
  useUpgradeStore,
} from "../../core/stores/useUpgradeStore";
import type { PathWaypoint } from "../../core/types/game";
import { countUpgradePicks } from "../../utils/enemyUpgradeTierEffects";
import {
  flatFieldToSphereSurface,
  flatFieldToSphereTileMeshCenter,
  flatFieldToSphereTilePose,
  getPlanetRadius,
  getQuaternionForPathStrip,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import {
  getEndBuildingYaw,
  getPathRenderSegments,
} from "../../utils/pathUtils";
import { Portal } from "./Portal";
import { EndBuilding } from "./EndBuilding";

const UNIT_SCALE = new Vector3(1, 1, 1);

type PathProps = {
  pathIndex: number;
  /** The board's paths; defaults to the published level. The editor passes its
      draft paths so the rendered strip follows the level being built. */
  pathWaypoints?: PathWaypoint[][];
  /** The board size; defaults to the published level. */
  gridSize?: number;
  /** Whether to render the spawn portal and end building. The game renders
      them; the editor draws its own selectable markers, so it passes false. */
  showEndpoints?: boolean;
};

type SphereStripMesh = {
  position: Vector3;
  quaternion: Quaternion;
  chunkLength: number;
};

type MergedPathMesh = {
  name: string;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
};

export const Path: FC<PathProps> = memo(
  ({
    pathIndex,
    pathWaypoints: pathWaypointsProp,
    gridSize: gridSizeProp,
    showEndpoints = true,
  }) => {
    const storePathWaypoints = useLevelStore(pathWaypointsSelector);
    const storeGridSize = useLevelStore(gridSizeSelector);
    const pathWaypoints = pathWaypointsProp ?? storePathWaypoints;
    const gridSize = gridSizeProp ?? storeGridSize;
    const cometReveal = useLevelStore(cometRevealSelector);
    const levelEnterRun = useLevelStore(levelEnterRunSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const pathWidth = useGameStore(pathWidthSelector);
    const upgradeStack = useUpgradeStore(levelEnemyUpgradeStackSelector);

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
      segments.forEach((segment) => {
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
      return path.map((wp) =>
        flatFieldToSphereTilePose(wp.x, wp.z, radius, wp.y + pathYOffset + 0.01)
      );
    }, [path, pathIndex, radius, pathYOffset]);

    // The Reinforcements tier picked for this run (0-3); the portal warms up
    // and shows one ring per pick so the upgrade is visible at the spawn point.
    const reinforcementsTier = countUpgradePicks(
      upgradeStack,
      "reinforcements"
    );

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
        surfaceNormal: [normal.x, normal.y, normal.z] as [
          number,
          number,
          number,
        ],
      };
    }, [path, radius, segments]);

    const endBuildingProps = useMemo(() => {
      if (!path || path.length === 0) return null;
      const last = path[path.length - 1];
      const previous = path[path.length - 2];
      const { surfacePoint, normal } = flatFieldToSphereSurface(
        last.x,
        last.z,
        radius
      );
      const position = surfacePoint.clone().addScaledVector(normal, last.y);
      const baseQuaternion = getSurfaceQuaternion(normal);
      // Yaw the base so its entrance (local +Z, the gate side) faces the path's
      // approach (last → previous waypoint). Applied about local Y, then
      // composed with the surface tilt: `base * yaw` keeps +Z pointing down the
      // path while the surface quaternion orients the whole base onto the
      // planet. A single-waypoint path has no approach, so it keeps its rest
      // orientation.
      const yaw =
        previous !== undefined
          ? getEndBuildingYaw(previous.x - last.x, previous.z - last.z)
          : 0;
      const quaternion = baseQuaternion.multiply(
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw)
      );
      return {
        position: [position.x, position.y, position.z] as [
          number,
          number,
          number,
        ],
        quaternion,
      };
    }, [path, radius]);

    const pathMaterials = useMemo(
      () => ({
        gray500: new MeshStandardMaterial({
          color: getCssColorValue("scene-gray-500"),
        }),
        gray600: new MeshStandardMaterial({
          color: getCssColorValue("scene-gray-600"),
        }),
      }),
      []
    );

    // The path is static per level, so its ~2,000 scene-graph nodes
    // (group + two meshes per strip step, plus corner tiles) are baked into
    // two merged meshes — one per material color — which the renderer walks
    // once per frame instead of thousands of times.
    const pathMeshes = useMemo((): MergedPathMesh[] => {
      if (!path || (sphereStrips.length === 0 && cornerTiles.length === 0))
        return [];

      const bake = (
        width: number,
        height: number,
        depth: number,
        position: Vector3,
        quaternion: Quaternion
      ): BufferGeometry =>
        new BoxGeometry(width, height, depth).applyMatrix4(
          new Matrix4().compose(position, quaternion, UNIT_SCALE)
        );

      const gray500: BufferGeometry[] = [];
      const gray600: BufferGeometry[] = [];
      for (const strip of sphereStrips) {
        gray500.push(
          bake(
            strip.chunkLength,
            0.02,
            pathWidth,
            strip.position,
            strip.quaternion
          )
        );
        gray600.push(
          bake(
            strip.chunkLength,
            0.01,
            pathWidth + 0.05,
            strip.position,
            strip.quaternion
          )
        );
      }
      for (const corner of cornerTiles) {
        gray600.push(
          bake(
            tileSize + 0.05,
            0.01,
            tileSize + 0.05,
            corner.position,
            corner.quaternion
          )
        );
        gray500.push(
          bake(tileSize, 0.02, tileSize, corner.position, corner.quaternion)
        );
      }

      const merge = (
        name: string,
        list: BufferGeometry[],
        material: MeshStandardMaterial
      ): MergedPathMesh | null => {
        if (list.length === 0) return null;
        const geometry = mergeGeometries(list);
        list.forEach((g) => g.dispose());
        return { name, geometry, material };
      };

      return [
        merge("path-strips", gray500, pathMaterials.gray500),
        merge("path-base", gray600, pathMaterials.gray600),
      ].filter((m): m is MergedPathMesh => m !== null);
    }, [path, sphereStrips, cornerTiles, pathWidth, tileSize, pathMaterials]);

    // Geometries are replaced with the path, so dispose the outgoing ones.
    // The materials are stable (created once) and still in use by the
    // replacement meshes, so they are disposed only on unmount.
    useEffect(
      () => () => {
        pathMeshes.forEach((m) => m.geometry.dispose());
      },
      [pathMeshes]
    );

    useEffect(
      () => () => {
        pathMaterials.gray500.dispose();
        pathMaterials.gray600.dispose();
      },
      [pathMaterials]
    );

    const mergedMeshRefs = useRef<Array<Object3D | null>>([]);
    useLayoutEffect(() => {
      mergedMeshRefs.current.forEach((mesh) => {
        if (mesh) freezeSubtree(mesh);
      });
    }, [pathMeshes]);

    if (!path) return null;

    return (
      <group name="path">
        {pathMeshes.map((m, index) => (
          <mesh
            key={m.name}
            ref={(el) => {
              mergedMeshRefs.current[index] = el;
            }}
            geometry={m.geometry}
            material={m.material}
            receiveShadow
          />
        ))}
        {showEndpoints && portalProps && (
          <Portal
            position={portalProps.position}
            quaternion={portalProps.quaternion}
            surfaceNormal={portalProps.surfaceNormal}
            reinforcementsTier={reinforcementsTier}
            // The comet's reveal for this level load: the portal is hidden
            // while the comet flies (`armed`) and grows out of the scorch once
            // it strikes (`revealed`). The reveal only applies while it belongs
            // to the current load (`run` matches the level's id), so a stale
            // reveal left behind by a previous scene is ignored.
            entry={
              cometReveal !== null && cometReveal.run === levelEnterRun
                ? { run: cometReveal.run, phase: cometReveal.phase }
                : null
            }
          />
        )}

        {showEndpoints && endBuildingProps && (
          <EndBuilding
            position={endBuildingProps.position}
            quaternion={endBuildingProps.quaternion}
          />
        )}

        {/* The preview reads wave state from the game's shared stores, which the
          editor does not reset — a ready wave from a previous run would show at
          the previous level's spawn point, so it renders with the endpoints. */}
        {showEndpoints && <GUINextWavePreview pathIndex={pathIndex} />}
      </group>
    );
  }
);

Path.displayName = "Path";
