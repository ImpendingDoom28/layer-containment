import { FC, memo, useCallback, useLayoutEffect, useRef } from "react";
import type { Group, Mesh, Object3D, Quaternion } from "three";

import { BASE_MODEL } from "../../constants/models";
import { freezeSubtree } from "../../utils/freezeSubtree";
import { getCssColorValue } from "../ui/lib/cssUtils";
import { ModelLoader } from "./ModelLoader";

type EndBuildingProps = {
  position: [number, number, number];
  quaternion?: Quaternion;
  /**
   * Flat (editor) scene only: yaw (about Y) pointing the base's entrance at
   * the path. Ignored when `quaternion` is set (the game scene already bakes
   * the yaw into the surface quaternion).
   */
  pathYaw?: number;
};

// The base is scaled to this fraction of its baked size (1.8 × 1.6 × 1.75 at
// rest) so it reads as a structure on the tile without dwarfing the towers and
// paths around it. Uniform, applied at the root — the clone is grounded at
// y = 0 and centered on x/z, so the scale shrinks it in place.
const BASE_MODEL_SCALE = 0.75;

// `Player_Base_ROOT` is grounded at y = 0 and centered on x/z, so no fit math
// is needed — the clone only gets the display scale and shadow flags (they are
// not part of the GLTF and would otherwise stay at three's defaults).
const prepareBaseModel = (source: Object3D): Object3D => {
  const clone = source.clone();
  clone.scale.setScalar(BASE_MODEL_SCALE);
  clone.traverse((child) => {
    if ((child as Partial<Mesh>).isMesh) {
      (child as Mesh).castShadow = true;
      (child as Mesh).receiveShadow = true;
    }
  });
  return clone;
};

// The old primitive building, kept solely as the model's load-failure
// fallback so a missing GLB degrades to the plain house rather than an empty
// path end.
const PrimitiveBuilding: FC = () => {
  const buildingColor = getCssColorValue("scene-white");
  const buildingAccent = getCssColorValue("scene-gray-200");
  const roofColor = getCssColorValue("scene-gray-300");

  return (
    <>
      {/* Main building base */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.8, 0.6]} />
        <meshStandardMaterial
          color={buildingColor}
          emissive={buildingAccent}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Building top section */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.3, 0.5]} />
        <meshStandardMaterial
          color={buildingAccent}
          emissive={buildingAccent}
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Roof */}
      <mesh position={[0, 1.15, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.35, 0.2, 8]} />
        <meshStandardMaterial
          color={roofColor}
          emissive={roofColor}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Decorative corner pillars */}
      {[
        [-0.25, 0.5, -0.25],
        [0.25, 0.5, -0.25],
        [-0.25, 0.5, 0.25],
        [0.25, 0.5, 0.25],
      ].map(([x, y, z], index) => (
        <mesh
          key={`pillar-${index}`}
          position={[x, y, z]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
          <meshStandardMaterial
            color={buildingAccent}
            emissive={buildingAccent}
            emissiveIntensity={0.1}
          />
        </mesh>
      ))}

      {/* Base platform */}
      <mesh
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.4, 0.4, 0.1, 16]} />
        <meshStandardMaterial
          color={getCssColorValue("scene-gray-700")}
          emissive={getCssColorValue("scene-gray-800")}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Warning light on top */}
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color={getCssColorValue("scene-building-warning")}
          emissive={getCssColorValue("scene-building-warning")}
          emissiveIntensity={0.8}
        />
      </mesh>
    </>
  );
};

/**
 * The player base at the end of every path, rendered as the `Player_Base` 3D
 * model (shared cached parse, one clone per base; geometry/materials shared).
 * The model is scaled to `BASE_MODEL_SCALE` so it reads as a structure rather
 * than a landmark, and its entrance (local +Z, the gate/front-buttress side)
 * is yawed toward the path's approach — either baked into `quaternion` (game
 * scene) or via `pathYaw` (flat editor). While the GLB loads — and permanently
 * if it fails — the old primitive house stands in, so the path end is never
 * empty.
 */
export const EndBuilding: FC<EndBuildingProps> = memo(
  ({ position, quaternion, pathYaw = 0 }) => {
    const groupRef = useRef<Group>(null);
    const freezeGroup = useCallback(() => {
      if (groupRef.current) freezeSubtree(groupRef.current);
    }, []);

    // Freeze the whole subtree (group + model, or group + primitive fallback)
    // so its nodes skip the per-frame matrix work — the base is static per
    // level. Re-bake whenever the group's own transform changes (a level
    // switch moves it), otherwise the frozen children would keep their stale
    // world matrices.
    useLayoutEffect(() => {
      freezeGroup();
    }, [position, quaternion, pathYaw, freezeGroup]);

    // The Suspense swap (fallback → model) happens after mount without a
    // position/quaternion change, so re-bake once the model lands too.
    const onModelReady = useCallback(
      (object: Object3D | null) => {
        if (object) freezeGroup();
      },
      [freezeGroup],
    );

    // The game scene passes a `quaternion` (the yaw is baked in); the flat
    // editor passes `pathYaw`. The latter is applied about local Y so the
    // model's local +Z (the entrance) faces the path.
    const rotation: [number, number, number] | undefined = quaternion
      ? undefined
      : [0, pathYaw, 0];

    return (
      <group
        ref={groupRef}
        position={position}
        {...(quaternion ? { quaternion } : {})}
        {...(rotation ? { rotation } : {})}
      >
        <ModelLoader
          url={BASE_MODEL.url}
          node={BASE_MODEL.node}
          prepare={prepareBaseModel}
          fallback={<PrimitiveBuilding />}
          onObjectReady={onModelReady}
        />
      </group>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.position[0] === nextProps.position[0] &&
      prevProps.position[1] === nextProps.position[1] &&
      prevProps.position[2] === nextProps.position[2] &&
      prevProps.quaternion === nextProps.quaternion &&
      (prevProps.pathYaw ?? 0) === (nextProps.pathYaw ?? 0)
    );
  }
);

EndBuilding.displayName = "EndBuilding";
