import { FC, memo, useMemo } from "react";

import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  projectilesSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import type { Projectile as ProjectileInstance } from "../../core/types/game";

// Shared unit geometries, scaled per instance: a unit sphere (single/aoe
// projectiles), a unit cylinder (beam/chain bolts) and a unit ring (aoe blast
// radius, 0.85 inner radius — the constant ratio the ring used to bake in).
const unitSphere = new SphereGeometry(1, 16, 16);
const unitCylinder = new CylinderGeometry(1, 1, 1, 8);
const unitRing = new RingGeometry(0.85, 1, 32);

// Shared rocket body (body + nose + two fins, authored along +Y), matching the
// in-game rocket pool, so a static showcase rocket reads as a rocket.
const buildStaticRocketGeometry = (): BufferGeometry => {
  const body = new CylinderGeometry(0.05, 0.05, 0.18, 8);
  body.translate(0, 0.09, 0);
  const nose = new ConeGeometry(0.05, 0.12, 8);
  nose.translate(0, 0.24, 0);
  const finL = new BoxGeometry(0.012, 0.1, 0.07);
  finL.translate(-0.062, 0.09, 0);
  const finR = finL.clone().translate(0.124, 0, 0);
  const merged = mergeGeometries([body, nose, finL, finR], false);
  if (!merged) throw new Error("Failed to merge static rocket geometry");
  return merged;
};
const rocketGeometry = buildStaticRocketGeometry();

const UP = new Vector3(0, 1, 0);

// One material per (shape kind, colour) instead of one per projectile mesh;
// the kinds differ only in emissive strength and transparency, so the cache
// key is the kind plus the colour. Never disposed (same lifetime as the
// shared unit geometries).
type MaterialKind = "beam" | "chain" | "rocket" | "sphere" | "ring";

const materialCache = new Map<string, MeshStandardMaterial | MeshBasicMaterial>();
const getStaticProjectileMaterial = (
  kind: MaterialKind,
  color: string
): MeshStandardMaterial | MeshBasicMaterial => {
  const key = `${kind}|${color}`;
  const entry = materialCache.get(key);
  if (entry) return entry;

  let material: MeshStandardMaterial | MeshBasicMaterial;
  if (kind === "ring") {
    material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.3,
      side: 2,
      depthWrite: false,
    });
  } else {
    const isBolt = kind === "beam" || kind === "chain";
    const emissiveIntensity =
      kind === "beam" ? 1.5 : kind === "chain" || kind === "rocket" ? 2 : 0.8;
    material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      transparent: isBolt,
      opacity: isBolt ? 0.9 : 1,
      toneMapped: false,
      depthWrite: !isBolt,
    });
  }

  materialCache.set(key, material);
  return material;
};

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

    const renderRing = (aoeRadius: number) => (
      <mesh
        position={[start.x, 0.02, start.z]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={aoeRadius}
        geometry={unitRing}
        material={getStaticProjectileMaterial("ring", projectile.color)}
        raycast={() => null}
      />
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

      return (
        <mesh
          position={midpoint}
          quaternion={quaternion}
          scale={[radius, length, radius]}
          geometry={unitCylinder}
          material={getStaticProjectileMaterial(
            projectile.projectileType,
            projectile.color
          )}
          raycast={() => null}
        />
      );
    }

    // The BRL rocket rests at the launch tube as a small rocket body, with the
    // blast radius marked on the ground just like the aoe shot.
    if (projectile.projectileType === "rocket") {
      return (
        <>
          <mesh
            position={start}
            geometry={rocketGeometry}
            material={getStaticProjectileMaterial("rocket", projectile.color)}
            castShadow
            receiveShadow
            raycast={() => null}
          />
          {projectile.aoeRadius !== undefined &&
            renderRing(projectile.aoeRadius)}
        </>
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
          material={getStaticProjectileMaterial("sphere", projectile.color)}
          castShadow
          receiveShadow
          raycast={() => null}
        />
        {/* AoE shots mark their blast radius with a ring on the ground. */}
        {projectile.projectileType === "aoe" &&
          projectile.aoeRadius !== undefined &&
          renderRing(projectile.aoeRadius)}
      </>
    );
  }
);

StaticProjectile.displayName = "StaticProjectile";
