import { FC, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  type BufferGeometry,
  DodecahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  type Group,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { CanyonConfig } from "../../core/types/game";
import type { CanyonWorldBBox } from "../../utils/canyonBridges";
import { getPlanetRadius } from "../../utils/planetSurfaceMapping";
import { freezeSubtree } from "../../utils/freezeSubtree";
import { getCssColorValue } from "../ui/lib/cssUtils";
import {
  getCanyonBoulderTilePoses,
  getCanyonTileBoulderLayout,
} from "../../utils/canyonBoulders";

// Shared unit boulder geometry; each boulder scales it to its own radius.
const unitBoulderGeometry = new DodecahedronGeometry(1, 0);

// Reused across the merge instead of allocating per boulder.
const scratchMatrix = new Matrix4();
const scratchScale = new Vector3();
const scratchLocal = new Vector3();

type CanyonBouldersProps = {
  canyons: CanyonConfig[];
  gridSize: number;
  tileSize: number;
  /** The canyon's world bbox (null when the level has no canyons); the
      boulder floor sits at the basin depth derived from it. */
  canyonBBox: CanyonWorldBBox | null;
};

/**
 * All canyon-tile boulders baked into a single mesh: one draw call for the
 * whole scene instead of one per boulder per tile. The per-tile `CanyonTile`
 * stops rendering its own boulders whenever this component is mounted for the
 * same tiles, so both must be mounted/unmounted together by the same parent.
 */
export const CanyonBoulders: FC<CanyonBouldersProps> = memo(
  ({ canyons, gridSize, tileSize, canyonBBox }) => {
    const radius = useMemo(
      () => getPlanetRadius(gridSize, tileSize),
      [gridSize, tileSize]
    );

    const material = useMemo(
      () =>
        new MeshStandardMaterial({
          color: getCssColorValue("scene-regolith-rock"),
          roughness: 0.95,
          metalness: 0.02,
        }),
      []
    );

    const merged = useMemo(() => {
      if (!canyonBBox || canyons.length === 0) return null;

      const parts: BufferGeometry[] = [];
      for (const pose of getCanyonBoulderTilePoses(
        canyons,
        gridSize,
        tileSize,
        radius,
        canyonBBox
      )) {
        for (const boulder of getCanyonTileBoulderLayout(
          pose.gridX,
          pose.gridZ
        )) {
          const geometry = unitBoulderGeometry.clone();
          scratchLocal
            .set(boulder.position[0], boulder.position[1], boulder.position[2])
            .applyQuaternion(pose.quaternion)
            .add(pose.position);
          scratchScale.setScalar(boulder.radius);
          scratchMatrix.compose(scratchLocal, pose.quaternion, scratchScale);
          geometry.applyMatrix4(scratchMatrix);
          parts.push(geometry);
        }
      }
      if (parts.length === 0) return null;

      const merged = mergeGeometries(parts, false);
      if (!merged) throw new Error("Failed to merge canyon boulder geometry");
      for (const part of parts) part.dispose();
      return merged;
    }, [canyons, gridSize, tileSize, radius, canyonBBox]);

    useEffect(
      () => () => {
        material.dispose();
      },
      [material]
    );

    useEffect(() => {
      return () => {
        merged?.dispose();
      };
    }, [merged]);

    const rootRef = useRef<Group>(null);
    useLayoutEffect(() => {
      if (rootRef.current) freezeSubtree(rootRef.current);
    }, [merged]);

    if (!merged) return null;

    return (
      <group ref={rootRef} name="canyon-boulders">
        <mesh
          geometry={merged}
          material={material}
          castShadow
          receiveShadow
          raycast={() => null}
        />
      </group>
    );
  }
);

CanyonBoulders.displayName = "CanyonBoulders";
