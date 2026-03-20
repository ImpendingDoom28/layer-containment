import { FC, memo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";

type InstancedProjectilesProps = {
  sphereMeshRef: React.RefObject<THREE.InstancedMesh>;
  beamMeshRef: React.RefObject<THREE.InstancedMesh>;
  maxProjectiles: number;
  maxBeams: number;
  projectileSize: number;
  defaultColor: string;
  emissiveIntensity: number;
  beamEmissiveIntensity: number;
  initializePools: () => void;
  updateProjectilesFrame: (elapsedTime: number, delta: number) => void;
};

export const InstancedProjectiles: FC<InstancedProjectilesProps> = memo(
  ({
    sphereMeshRef,
    beamMeshRef,
    maxProjectiles,
    maxBeams,
    projectileSize,
    defaultColor,
    emissiveIntensity,
    beamEmissiveIntensity,
    initializePools,
    updateProjectilesFrame,
  }) => {
    useEffect(() => {
      initializePools();
    }, [initializePools]);

    useFrame((state, delta) => {
      updateProjectilesFrame(state.clock.elapsedTime, delta);
    });

    return (
      <>
        <instancedMesh
          ref={sphereMeshRef}
          args={[undefined, undefined, maxProjectiles]}
          frustumCulled={false}
        >
          <sphereGeometry args={[projectileSize, 8, 8]} />
          <meshStandardMaterial
            color={defaultColor}
            emissive={defaultColor}
            emissiveIntensity={emissiveIntensity}
            toneMapped={false}
          />
        </instancedMesh>

        <instancedMesh
          ref={beamMeshRef}
          args={[undefined, undefined, maxBeams]}
          frustumCulled={false}
        >
          <cylinderGeometry args={[0.05, 0.05, 1, 8]} />
          <meshStandardMaterial
            color={defaultColor}
            emissive={defaultColor}
            emissiveIntensity={beamEmissiveIntensity}
            transparent
            opacity={0.9}
            toneMapped={false}
          />
        </instancedMesh>
      </>
    );
  }
);

InstancedProjectiles.displayName = "InstancedProjectiles";
