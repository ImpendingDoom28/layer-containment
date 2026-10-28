import { FC, memo, useMemo } from "react";

import { CylinderGeometry, Quaternion, SphereGeometry, Vector3 } from "three";

import {
  projectilesSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type { Projectile as ProjectileInstance } from "../../core/types/game";

// Shared unit geometries, scaled per instance: a unit sphere (single/aoe
// projectiles) and a unit cylinder (beam/chain bolts), so the four static
// showcase projectiles allocate no per-instance geometry.
const unitSphere = new SphereGeometry(1, 16, 16);
const unitCylinder = new CylinderGeometry(1, 1, 1, 8);

const UP = new Vector3(0, 1, 0);

type StaticProjectilesProps = {
  /** Floor height the showcase projectiles float just above. */
  yOffset?: number;
};

/**
 * Renders the level's static (non-fired) projectiles as frozen visuals.
 *
 * The live instanced-pool only draws projectiles towers actually fire, so the
 * testing level's showcase row of projectiles would otherwise be invisible.
 * Each entry is drawn in the shape the in-game pool uses for its type: a
 * sphere for single/aoe, an oriented cylinder for beam (laser) and chain
 * bolts, with an aoe-radius ring for aoe shots.
 */
export const StaticProjectiles: FC<StaticProjectilesProps> = memo(
  ({ yOffset = 0.5 }) => {
    const projectiles = useLevelStore(projectilesSelector);

    return (
      <group name="static-projectiles">
        {projectiles.map((projectile) => (
          <StaticProjectile
            key={projectile.id}
            projectile={projectile}
            yOffset={yOffset}
          />
        ))}
      </group>
    );
  }
);

StaticProjectiles.displayName = "StaticProjectiles";

type StaticProjectileProps = {
  projectile: ProjectileInstance;
  yOffset: number;
};

const StaticProjectile: FC<StaticProjectileProps> = memo(
  ({ projectile, yOffset }) => {
    const start = useMemo(
      () => new Vector3(projectile.startX, projectile.startY + yOffset, projectile.startZ),
      [projectile.startX, projectile.startY, projectile.startZ, yOffset]
    );

    if (projectile.projectileType === "beam" || projectile.projectileType === "chain") {
      const target = new Vector3(
        projectile.targetX,
        projectile.targetY + yOffset,
        projectile.targetZ
      );
      const direction = target.clone().sub(start);
      const length = direction.length();
      if (length < 1e-6) return null;
      direction.normalize();

      const quaternion = new Quaternion().setFromUnitVectors(UP, direction);
      const midpoint = start.clone().add(target).multiplyScalar(0.5);

      // Beam (laser) is a chunkier, more transparent column; chain is a thin
      // bright bolt — matching the in-game pool radii.
      const radius = projectile.projectileType === "beam" ? 0.06 : 0.03;
      const emissiveIntensity = projectile.projectileType === "beam" ? 1.5 : 2;

      return (
        <mesh
          position={midpoint}
          quaternion={quaternion}
          scale={[radius, length, radius]}
          geometry={unitCylinder}
          raycast={() => null}
        >
          <meshStandardMaterial
            color={projectile.color}
            emissive={projectile.color}
            emissiveIntensity={emissiveIntensity}
            transparent
            opacity={0.9}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      );
    }

    // Sphere projectiles (single / aoe) rest at the start point.
    const radius = projectile.projectileType === "aoe" ? 0.2 : 0.15;
    return (
      <>
        <mesh
          position={start}
          scale={radius}
          geometry={unitSphere}
          raycast={() => null}
        >
          <meshStandardMaterial
            color={projectile.color}
            emissive={projectile.color}
            emissiveIntensity={0.8}
            toneMapped={false}
          />
        </mesh>
        {/* AoE shots mark their blast radius with a ring on the ground. */}
        {projectile.projectileType === "aoe" &&
          projectile.aoeRadius !== undefined && (
            <mesh
              position={[start.x, 0.02, start.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={() => null}
            >
              <ringGeometry
                args={[projectile.aoeRadius * 0.85, projectile.aoeRadius, 32]}
              />
              <meshBasicMaterial
                color={projectile.color}
                transparent
                opacity={0.3}
                side={2}
                depthWrite={false}
              />
            </mesh>
          )}
      </>
    );
  }
);

StaticProjectile.displayName = "StaticProjectile";
